// src/services/ai-enhancer.js
//
// Улучшение SEO/контента ОДНОГО товара через AI (OpenRouter или Ollama).
// Используется и Worker'ом (BullMQ), и дашбордом (прямой вызов из UI).
//
// В отличие от ai.js (батчевая обработка массива из JSON-файла), здесь —
// одна функция на один товар, без батчинга, с тем же качеством промптов.

import { callAI, extractJsonFromResponse } from '../lib/ai-provider.js';

// ==============================================
// Системные промпты (взяты из commands/ai.js)
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

ОТВЕТ: ТОЛЬКО JSON-объект с полями meta_title, meta_description, focus_keyword.
Никаких пояснений, только JSON.`;

const CONTENT_SYSTEM_PROMPT = `Ты — API, который возвращает только JSON для e-commerce копирайтинга. Верни ТОЛЬКО JSON-объект.

Задача: улучшить description и short_description товара.
Правила:
- Сохраняй HTML-теги, меняй только текст внутри.
- Заменяй h6/h5 на h2/h3, где уместно.
- Делай текст информативнее, добавляй ключевые слова.
- Не выдумывай несуществующие характеристики.

Пример ответа:
{
  "description": "<p>Улучшенное описание...</p>",
  "short_description": "<p>Улучшенное краткое описание...</p>"
}

Никаких пояснений, только JSON. Если поля не меняются, верни их как есть.`;

const ALL_SYSTEM_PROMPT = `Ты — эксперт по SEO и копирайтингу для интернет-магазинов. Верни ТОЛЬКО JSON-объект со всеми полями ниже.

ПРАВИЛА:
1. meta_title: 50-70 символов, начни с ключевого слова, добавь бренд если уместно. Без keyword stuffing.
2. meta_description: 120-160 символов, польза + призыв к действию.
3. focus_keyword: то же ключевое слово что в meta_title, не более 5 слов, без бренда.
4. description: сохраняй HTML-теги, делай текст информативнее, h6/h5 → h2/h3 где уместно.
5. short_description: сохраняй HTML-теги, кратко и информативно.
6. Не выдумывай характеристики, которых нет в исходных данных.
7. Если поле уже хорошее — оставь как есть.

Пример ответа:
{
  "meta_title": "...",
  "meta_description": "...",
  "focus_keyword": "...",
  "description": "<p>...</p>",
  "short_description": "<p>...</p>"
}

Никаких пояснений, только JSON.`;

// ==============================================
// Постобработка SEO (из ai.js)
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

function postprocessSeo(fields) {
  const fixed = { ...fields };

  if (fixed.meta_title) {
    fixed.meta_title = removeKeywordStuffing(fixed.meta_title);
    fixed.meta_title = clampString(fixed.meta_title, 50, 70, fixed.meta_title);
  }
  if (fixed.meta_description) {
    fixed.meta_description = removeKeywordStuffing(fixed.meta_description);
    fixed.meta_description = clampString(fixed.meta_description, 120, 160, fixed.meta_description);
  }
  if (fixed.focus_keyword && typeof fixed.focus_keyword === 'string') {
    const words = fixed.focus_keyword.trim().split(/\s+/);
    if (words.length > 5) {
      fixed.focus_keyword = words.slice(0, 5).join(' ');
    }
  }

  return fixed;
}

// ==============================================
// Построение промптов
// ==============================================

function buildUserPrompt(product, mode) {
  const base = {
    id: product.id,
    name: product.name ? product.name.slice(0, 500) : '',
  };

  if (mode === 'seo') {
    return `Улучши SEO-поля для следующего товара:\n${JSON.stringify({
      ...base,
      meta_title: product.meta_title,
      meta_description: product.meta_description,
      focus_keyword: product.focus_keyword,
    }, null, 2)}`;
  }

  if (mode === 'content') {
    return `Улучши description и short_description. Верни ТОЛЬКО JSON-объект.\n\nДанные:\n${JSON.stringify({
      ...base,
      description: product.description ? product.description.slice(0, 1500) : '',
      short_description: product.short_description,
    }, null, 2)}`;
  }

  // mode === 'all'
  return `Улучши SEO и контент для следующего товара. Верни ТОЛЬКО JSON-объект.\n\nДанные:\n${JSON.stringify({
    ...base,
    meta_title: product.meta_title,
    meta_description: product.meta_description,
    focus_keyword: product.focus_keyword,
    description: product.description ? product.description.slice(0, 1500) : '',
    short_description: product.short_description,
  }, null, 2)}`;
}

function getSystemPrompt(mode) {
  if (mode === 'seo') return SEO_SYSTEM_PROMPT;
  if (mode === 'content') return CONTENT_SYSTEM_PROMPT;
  return ALL_SYSTEM_PROMPT;
}

/**
 * Добавляет few-shot примеры к системному промпту.
 * @param {string} systemPrompt
 * @param {Array<{original, improved}>} examples
 * @param {string} extraContext — дополнительный контекст (например из Obsidian)
 */
function withExamplesAndContext(systemPrompt, examples = [], extraContext = '') {
  let result = systemPrompt;

  if (examples?.length) {
    result += '\n\nВот примеры желаемого стиля:\n';
    for (const ex of examples) {
      result += `Оригинал: ${JSON.stringify(ex.original)}\nУлучшенный: ${JSON.stringify(ex.improved)}\n\n`;
    }
    result += 'Используй эти примеры.';
  }

  if (extraContext?.trim()) {
    result += `\n\nДополнительный контекст и стиль бренда (используй для тона и терминологии):\n${extraContext.trim()}`;
  }

  return result;
}

/**
 * Улучшает один товар через AI.
 *
 * @param {Object} product — { id, name, meta_title, meta_description, focus_keyword, description, short_description }
 * @param {{mode?: 'seo'|'content'|'all', examples?: any[], context?: string, provider?: 'openrouter'|'ollama', model?: string}} [options]
 * @returns {Promise<any>} { meta_title?, meta_description?, focus_keyword?, description?, short_description?, _meta: { provider, model, usage } }
 */
export async function enhanceProductWithAI(product, options = {}) {
  const { mode = 'all', examples = [], context = '', provider, model } = options;

  const systemPrompt = withExamplesAndContext(getSystemPrompt(mode), examples, context);
  const userPrompt = buildUserPrompt(product, mode);

  const result = await callAI(systemPrompt, userPrompt, {
    provider,
    model,
    maxTokens: 4000,
  });

  let parsed;
  try {
    parsed = extractJsonFromResponse(result.content);
  } catch (err) {
    throw new Error(`AI вернул невалидный JSON: ${err.message}`);
  }

  // На случай если модель вернула массив с одним элементом
  if (Array.isArray(parsed)) {
    parsed = parsed[0] || {};
  }

  const fields = {};
  if (mode === 'seo' || mode === 'all') {
    if (parsed.meta_title !== undefined) fields.meta_title = parsed.meta_title;
    if (parsed.meta_description !== undefined) fields.meta_description = parsed.meta_description;
    if (parsed.focus_keyword !== undefined) fields.focus_keyword = parsed.focus_keyword;
  }
  if (mode === 'content' || mode === 'all') {
    if (parsed.description !== undefined) fields.description = parsed.description;
    if (parsed.short_description !== undefined) fields.short_description = parsed.short_description;
  }

  const postprocessed = postprocessSeo(fields);

  return {
    ...postprocessed,
    _meta: {
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    },
  };
}
