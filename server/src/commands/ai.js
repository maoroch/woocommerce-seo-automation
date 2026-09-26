// src/commands/ai.js
import fs from 'fs/promises';
import path from 'path';
import { callOpenRouter, extractJsonFromResponse } from '../lib/openrouter.js';
import { getTokenLimiter } from '../lib/token-limiter.js';

// ==============================================
// 1. Системные промпты
// ==============================================
const SEO_SYSTEM_PROMPT = `Ты — эксперт по SEO для интернет-магазинов. Твоя задача — генерировать ТОЛЬКО meta_title, meta_description и focus_keyword.

ЖЁСТКИЕ ПРАВИЛА (нарушение недопустимо):

1. ДЛИНА:
   - meta_title: от 50 до 70 символов включительно.
   - meta_description: от 120 до 160 символов включительно.
   - focus_keyword: не более 5 слов.

2. ЗАПРЕЩЕНО:
   - keyword stuffing (повтор одного и того же ключа 3+ раз).
   - общие фразы без конкретики.
   - HTML-теги.

3. ТРЕБОВАНИЯ:
   - meta_title: начни с ключевого слова, добавь бренд.
   - meta_description: раскрой пользу, призыв к действию.
   - focus_keyword: то же ключевое слово, что в meta_title, без бренда.

4. ЕСЛИ ПОЛЯ УЖЕ ХОРОШИ — оставь их.

ОТВЕТ: ТОЛЬКО JSON-массив с полями id, meta_title, meta_description, focus_keyword.
Никаких пояснений, только JSON.`;

const CONTENT_SYSTEM_PROMPT = `Ты — API, который возвращает только JSON для e-commerce копирайтинга. Верни ТОЛЬКО JSON-массив.

Задача: улучшить description и short_description товара.
Правила:
- Сохраняй HTML-теги, меняй только текст внутри.
- Заменяй h6/h5 на h2/h3, где уместно.
- Делай текст информативнее, добавляй ключевые слова.
- Не выдумывай несуществующие характеристики.

Пример ответа:
[
  {
    "id": 12345,
    "description": "<p>Улучшенное описание...</p>",
    "short_description": "<p>Улучшенное краткое описание...</p>"
  }
]

Никаких пояснений, только JSON. Если поля не меняются, верни их как есть.`;

// ==============================================
// 2. Пост-обработка SEO
// ==============================================
function clampString(str, minLen, maxLen, placeholder = '') {
  if (!str) return placeholder;
  let trimmed = str.trim();
  if (trimmed.length < minLen) return trimmed;
  if (trimmed.length > maxLen) {
    trimmed = trimmed.slice(0, maxLen - 3).trim() + '…';
  }
  return trimmed;
}

function removeKeywordStuffing(text, maxRepetitions = 2) {
  const words = text.split(/\s+/);
  const result = [];
  let lastWord = '';
  let repeatCount = 0;
  for (const w of words) {
    if (w.toLowerCase() === lastWord.toLowerCase()) {
      repeatCount++;
      if (repeatCount >= maxRepetitions) continue;
    } else {
      repeatCount = 0;
      lastWord = w;
    }
    result.push(w);
  }
  return result.join(' ');
}

function postprocessSeoResponse(seoItem, productId) {
  let fixed = { ...seoItem };
  let changed = false;

  if (fixed.meta_title) {
    let newTitle = removeKeywordStuffing(fixed.meta_title);
    if (newTitle !== fixed.meta_title) {
      fixed.meta_title = newTitle;
      changed = true;
    }
    const clamped = clampString(fixed.meta_title, 50, 70, fixed.meta_title);
    if (clamped !== fixed.meta_title) {
      fixed.meta_title = clamped;
      changed = true;
    }
  }
  if (fixed.meta_description) {
    let newDesc = removeKeywordStuffing(fixed.meta_description);
    if (newDesc !== fixed.meta_description) {
      fixed.meta_description = newDesc;
      changed = true;
    }
    const clamped = clampString(fixed.meta_description, 120, 160, fixed.meta_description);
    if (clamped !== fixed.meta_description) {
      fixed.meta_description = clamped;
      changed = true;
    }
  }
  if (fixed.focus_keyword && typeof fixed.focus_keyword === 'string') {
    let kw = fixed.focus_keyword.trim();
    const words = kw.split(/\s+/);
    if (words.length > 5) {
      fixed.focus_keyword = words.slice(0, 5).join(' ');
      changed = true;
    }
  }
  if (changed) {
    console.warn(`⚠️ Автокоррекция SEO для товара ${productId}`);
  }
  return fixed;
}

// ==============================================
// 3. Построение запросов (с обрезкой длинных полей)
// ==============================================
function buildUserPromptForSeo(products) {
  const data = products.map(p => ({
    id: p.id,
    name: p.name ? p.name.slice(0, 500) : '',
    meta_title: p.meta_title,
    meta_description: p.meta_description,
    focus_keyword: p.focus_keyword,
  }));
  return `Улучши SEO-поля для следующих товаров:\n${JSON.stringify(data, null, 2)}`;
}

function buildUserPromptForContent(products) {
  const data = products.map(p => ({
    id: p.id,
    description: p.description ? p.description.slice(0, 1500) : '',
    short_description: p.short_description,
  }));
  return `Улучши description и short_description. Верни ТОЛЬКО JSON-массив. Никаких пояснений.\n\nДанные:\n${JSON.stringify(data, null, 2)}`;
}

// ==============================================
// 4. Проверка оптимизированности
// ==============================================
function isSeoOptimized(product) {
  const title = product.meta_title;
  const desc = product.meta_description;
  const keyword = product.focus_keyword;
  if (!title || title.length < 40 || title.length > 70) return false;
  if (!desc || desc.length < 100 || desc.length > 160) return false;
  if (!keyword || keyword.trim().length < 3) return false;
  return true;
}

function isContentOptimized(product) {
  const desc = product.description;
  const short = product.short_description;
  if (!desc || desc.length < 500) return false;
  if (!short || short.length < 50) return false;
  return true;
}

// ==============================================
// 5. Основная функция запроса к OpenRouter с батчингом и рекурсивным разбиением
// ==============================================
async function enhanceWithOpenRouter(products, systemPrompt, userPromptBuilder, mode, examples = [], batchSize = 5) {
  const allResults = [];
  const limiter = getTokenLimiter(10000, 10 * 60 * 1000);
  const totalBatches = Math.ceil(products.length / batchSize);
  
  for (let i = 0; i < products.length; i += batchSize) {
    const batch = products.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    console.log(`📦 Батч ${batchNum}/${totalBatches} (${batch.length} товаров)`);
    
    let finalSystemPrompt = systemPrompt;
    if (examples.length) {
      finalSystemPrompt += '\n\nВот примеры желаемого стиля:\n';
      for (const ex of examples) {
        finalSystemPrompt += `Оригинал: ${JSON.stringify(ex.original)}\nУлучшенный: ${JSON.stringify(ex.improved)}\n\n`;
      }
      finalSystemPrompt += 'Используй эти примеры.';
    }
    const userPrompt = userPromptBuilder(batch);
    const maxTokens = 8000;
    const estimatedTokens = (userPrompt.length / 4) + (maxTokens / 2);
    await limiter.waitForTokens(Math.ceil(estimatedTokens));
    
    let success = false;
    let retries = 3;
    while (retries > 0 && !success) {
      try {
        const response = await callOpenRouter(finalSystemPrompt, userPrompt, { maxTokens });
        if (!response || response.trim() === '') throw new Error('Пустой ответ');
        const json = extractJsonFromResponse(response);
        if (!Array.isArray(json) || json.length !== batch.length) {
          throw new Error(`Несоответствие длины: ожидалось ${batch.length}, получено ${json?.length}`);
        }
        allResults.push(...json);
        success = true;
      } catch (err) {
        console.error(`❌ Ошибка в батче ${batchNum}: ${err.message}`);
        // Если ошибка JSON или длины, или лимит токенов, и размер батча > 1 – разбиваем рекурсивно
        if (batch.length > 1 && (err.message.includes('Невалидный JSON') || err.message.includes('Несоответствие длины') || err.message.includes('лимит токенов'))) {
          const mid = Math.ceil(batch.length / 2);
          const left = batch.slice(0, mid);
          const right = batch.slice(mid);
          console.log(`🔄 Разбиваем батч на две части (${left.length} и ${right.length}) и обрабатываем рекурсивно`);
          const leftResult = await enhanceWithOpenRouter(left, systemPrompt, userPromptBuilder, mode, examples, batchSize);
          const rightResult = await enhanceWithOpenRouter(right, systemPrompt, userPromptBuilder, mode, examples, batchSize);
          allResults.push(...leftResult, ...rightResult);
          success = true;
          break;
        }
        retries--;
        if (retries === 0) throw err;
        console.log(`🔄 Повторная попытка (осталось ${retries})...`);
      }
    }
  }
  return allResults;
}

// ==============================================
// 6. CLI команда
// ==============================================
export async function aiCommand(inputFile, outputFile, options = {}) {
  let { enhanceMode = 'all', verbose = false, examplesFile = null, batchSize = 5, force = false } = options;

  let products;
  try {
    const raw = await fs.readFile(inputFile, 'utf8');
    products = JSON.parse(raw);
    if (!Array.isArray(products)) products = [products];
  } catch (err) {
    console.error(`❌ Ошибка чтения ${inputFile}:`, err.message);
    return;
  }

  // Фильтрация уже оптимизированных товаров
  let productsToProcess = products;
  if (!force) {
    if (enhanceMode === 'seo') {
      productsToProcess = products.filter(p => !isSeoOptimized(p));
      const skipped = products.length - productsToProcess.length;
      if (skipped > 0) console.log(`ℹ️ Пропускаем ${skipped} товаров, уже оптимизированных для SEO. Используйте --force для принудительной обработки.`);
    } else if (enhanceMode === 'content') {
      productsToProcess = products.filter(p => !isContentOptimized(p));
      const skipped = products.length - productsToProcess.length;
      if (skipped > 0) console.log(`ℹ️ Пропускаем ${skipped} товаров, уже оптимизированных для контента. Используйте --force для принудительной обработки.`);
    } else if (enhanceMode === 'all') {
      productsToProcess = products.filter(p => !isSeoOptimized(p) || !isContentOptimized(p));
      const skipped = products.length - productsToProcess.length;
      if (skipped > 0) console.log(`ℹ️ Пропускаем ${skipped} товаров, уже полностью оптимизированных. Используйте --force для принудительной обработки.`);
    }
  }

  if (productsToProcess.length === 0) {
    console.log('✅ Все товары уже оптимизированы. Сохраняем исходные данные без изменений.');
    const outPath = outputFile || inputFile.replace(/\.json$/, `_${enhanceMode}_enhanced.json`);
    await fs.writeFile(outPath, JSON.stringify(products, null, 2));
    console.log(`✅ Сохранено в ${outPath}`);
    console.log('💡 Запустите импорт: node src/commands/import.js --file=' + outPath);
    return;
  }

  // Устанавливаем эффективный размер батча для контента
  let effectiveBatchSize = batchSize;
  if (enhanceMode === 'content' && batchSize === 5) {
    effectiveBatchSize = 3;
    console.log(`ℹ️ Для контента установлен размер батча ${effectiveBatchSize} (можно изменить через --batch-size)`);
  }

  let examples = [];
  if (examplesFile) {
    try {
      const exRaw = await fs.readFile(examplesFile, 'utf8');
      examples = JSON.parse(exRaw);
      console.log(`📚 Загружено ${examples.length} примеров few-shot`);
    } catch (err) {
      console.warn(`⚠️ Не удалось загрузить примеры: ${err.message}`);
    }
  }

  console.log(`📦 Обрабатывается товаров: ${productsToProcess.length} из ${products.length}`);
  if (verbose) console.log(`Режим: ${enhanceMode}, размер батча: ${effectiveBatchSize}`);

  let enhancedProducts = [...products];

  if (enhanceMode === 'seo') {
    const seoJson = await enhanceWithOpenRouter(productsToProcess, SEO_SYSTEM_PROMPT, buildUserPromptForSeo, 'seo', examples, effectiveBatchSize);
    const processedMap = new Map();
    for (let i = 0; i < productsToProcess.length; i++) {
      processedMap.set(productsToProcess[i].id, seoJson[i]);
    }
    for (let i = 0; i < enhancedProducts.length; i++) {
      const update = processedMap.get(enhancedProducts[i].id);
      if (update) {
        const corrected = postprocessSeoResponse(update, enhancedProducts[i].id);
        enhancedProducts[i] = { ...enhancedProducts[i], ...corrected };
      }
    }
  } else if (enhanceMode === 'content') {
    const contentJson = await enhanceWithOpenRouter(productsToProcess, CONTENT_SYSTEM_PROMPT, buildUserPromptForContent, 'content', examples, effectiveBatchSize);
    const processedMap = new Map();
    for (let i = 0; i < productsToProcess.length; i++) {
      processedMap.set(productsToProcess[i].id, contentJson[i]);
    }
    for (let i = 0; i < enhancedProducts.length; i++) {
      const update = processedMap.get(enhancedProducts[i].id);
      if (update) {
        if (update.description) enhancedProducts[i].description = update.description;
        if (update.short_description) enhancedProducts[i].short_description = update.short_description;
      }
    }
  } else if (enhanceMode === 'all') {
    // Сначала SEO
    const seoJson = await enhanceWithOpenRouter(productsToProcess, SEO_SYSTEM_PROMPT, buildUserPromptForSeo, 'seo', examples, effectiveBatchSize);
    let tempProducts = [...products];
    const seoMap = new Map();
    for (let i = 0; i < productsToProcess.length; i++) {
      seoMap.set(productsToProcess[i].id, seoJson[i]);
    }
    for (let i = 0; i < tempProducts.length; i++) {
      const update = seoMap.get(tempProducts[i].id);
      if (update) {
        const corrected = postprocessSeoResponse(update, tempProducts[i].id);
        tempProducts[i] = { ...tempProducts[i], ...corrected };
      }
    }
    // Затем контент
    const contentJson = await enhanceWithOpenRouter(productsToProcess, CONTENT_SYSTEM_PROMPT, buildUserPromptForContent, 'content', examples, effectiveBatchSize);
    const contentMap = new Map();
    for (let i = 0; i < productsToProcess.length; i++) {
      contentMap.set(productsToProcess[i].id, contentJson[i]);
    }
    for (let i = 0; i < tempProducts.length; i++) {
      const update = contentMap.get(tempProducts[i].id);
      if (update) {
        if (update.description) tempProducts[i].description = update.description;
        if (update.short_description) tempProducts[i].short_description = update.short_description;
      }
    }
    enhancedProducts = tempProducts;
  }

  const outPath = outputFile || inputFile.replace(/\.json$/, `_${enhanceMode}_enhanced.json`);
  await fs.writeFile(outPath, JSON.stringify(enhancedProducts, null, 2));
  console.log(`✅ Сохранено в ${outPath}`);
  console.log('💡 Запустите импорт: node src/commands/import.js --file=' + outPath);
}

// CLI парсинг
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const inputFlag = args.find(a => a.startsWith('--input='));
  const outputFlag = args.find(a => a.startsWith('--output='));
  const enhanceFlag = args.find(a => a.startsWith('--enhance='));
  const verboseFlag = args.includes('--verbose');
  const examplesFlag = args.find(a => a.startsWith('--examples='));
  const batchSizeFlag = args.find(a => a.startsWith('--batch-size='));
  const forceFlag = args.includes('--force');
  
  if (!inputFlag) {
    console.error('Usage: node ai.js --input=file.json [--output=out.json] [--enhance=seo|content|all] [--verbose] [--examples=examples.json] [--batch-size=5] [--force]');
    process.exit(1);
  }

  const inputFile = inputFlag.split('=')[1];
  const outputFile = outputFlag ? outputFlag.split('=')[1] : null;
  const enhanceMode = enhanceFlag ? enhanceFlag.split('=')[1] : 'all';
  const examplesFile = examplesFlag ? examplesFlag.split('=')[1] : null;
  const batchSize = batchSizeFlag ? parseInt(batchSizeFlag.split('=')[1]) : 5;

  aiCommand(inputFile, outputFile, { enhanceMode, verbose: verboseFlag, examplesFile, batchSize, force: forceFlag }).catch(console.error);
}