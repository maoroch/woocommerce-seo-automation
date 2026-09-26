// src/commands/import.js
import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { updateProduct, getProducts, updateProductSlug } from '../lib/woocommerce.js';
import { ImportDataSchema } from '../schemas/import.schema.js';
import { createBackup } from '../services/backup.js';
import readline from 'readline';
import { validateHtmlAdvanced } from '../lib/html-validator.js';

// MongoDB — опционально (только если MONGODB_URI задан)
async function mongoRecordImport(productId, changes, sourceFile) {
  if (!process.env.MONGODB_URI) return;
  try {
    const { connectDB } = await import('../db/connection.js');
    const { Product } = await import('../db/product.model.js');
    await connectDB();
    const doc = await Product.findOne({ wc_id: productId });
    if (!doc) return;
    const historyChanges = Object.entries(changes).map(([field, val]) => ({
      field,
      old_value: val.old,
      new_value: val.new,
    }));
    const oldScore = doc.seo_score?.total ?? 0;
    doc.addHistory('import', historyChanges, {
      seo_score_before: oldScore,
      source_file: path.basename(sourceFile),
    });
    doc.task_status = 'approved';
    doc.imported_at = new Date();
    // Обновляем поля в Mongo чтобы отражали WC
    for (const [field, val] of Object.entries(changes)) {
      if (field in doc) doc[field] = val.new;
    }
    await doc.save();
  } catch (err) {
    // Не прерываем импорт из-за Mongo
    console.warn(chalk.yellow(`  ⚠️  MongoDB update skipped for ${productId}: ${err.message}`));
  }
}

// ============================================================
// 1. Улучшенная работа с Elementor (рекурсивная замена + создание)
// ============================================================

/**
 * Рекурсивно обходит элементы Elementor и заменяет содержимое ТОЛЬКО текстовых виджетов
 * @param {Array|Object} elements - массив элементов Elementor
 * @param {string} newHtml - новый HTML для вставки
 * @param {Object} options - опции (verbose, replaceAll)
 * @returns {Object} { updated, replacedCount, elements }
 */
function replaceTextInElementorElements(elements, newHtml, options = {}) {
  let replacedCount = 0;
  const verbose = options.verbose || false;

  function traverse(node) {
    if (!node) return;
    // Если это виджет текстового редактора
    if (node.widgetType === 'text-editor' && node.settings && node.settings.editor !== undefined) {
      if (verbose) console.log(`   Найден text-editor виджет, заменяем содержимое`);
      node.settings.editor = newHtml;
      replacedCount++;
      return;
    }
    // Рекурсивно обходим вложенные элементы
    if (Array.isArray(node.elements)) {
      for (const child of node.elements) {
        if (options.replaceAll || replacedCount === 0) {
          traverse(child);
        }
        if (!options.replaceAll && replacedCount > 0) break;
      }
    }
  }

  const elementsArray = Array.isArray(elements) ? elements : [elements];
  for (const el of elementsArray) {
    if (options.replaceAll || replacedCount === 0) {
      traverse(el);
    }
    if (!options.replaceAll && replacedCount > 0) break;
  }
  return { updated: replacedCount > 0, replacedCount, elements: elementsArray };
}

/**
 * Создаёт новый текстовый виджет для Elementor (если не найден существующий)
 * @param {Object} oldProduct - текущий продукт (для получения структуры)
 * @param {string} newHtml - новый HTML
 * @returns {string} обновлённый JSON _elementor_data
 */
function createNewTextWidgetElementorData(oldProduct, newHtml) {
  // Берём существующую структуру или создаём базовую
  let elementorJson;
  const oldElementorMeta = oldProduct.meta_data?.find(m => m.key === '_elementor_data');
  if (oldElementorMeta && oldElementorMeta.value) {
    try {
      elementorJson = JSON.parse(oldElementorMeta.value);
    } catch (e) {
      elementorJson = [];
    }
  } else {
    // Создаём минимальную структуру: секция -> колонка -> виджет
    elementorJson = [
      {
        id: `section_${Date.now()}`,
        elType: 'section',
        elements: [
          {
            id: `column_${Date.now()}`,
            elType: 'column',
            elements: []
          }
        ]
      }
    ];
  }

  // Находим первую колонку (или any element, куда можно добавить виджет)
  let targetElement = null;
  function findContainer(elements) {
    if (!elements) return;
    for (const el of elements) {
      if (el.elType === 'column' && Array.isArray(el.elements)) {
        targetElement = el;
        return;
      }
      if (Array.isArray(el.elements)) findContainer(el.elements);
      if (targetElement) return;
    }
  }
  findContainer(elementorJson);

  if (!targetElement) {
    // Если нет колонки, добавим в первый элемент
    targetElement = elementorJson[0];
  }

  // Создаём новый текстовый виджет
  const newWidget = {
    id: `text_${Date.now()}`,
    elType: 'widget',
    widgetType: 'text-editor',
    settings: { editor: newHtml },
    elements: []
  };
  targetElement.elements = targetElement.elements || [];
  targetElement.elements.push(newWidget);

  return JSON.stringify(elementorJson);
}

/**
 * Обновляет _elementor_data товара новым HTML-контентом.
 * Сначала пытается найти существующий текстовый виджет и заменить его.
 * Если не находит – создаёт новый.
 * @param {number} productId - ID товара
 * @param {Object} oldProduct - текущий продукт (с meta_data)
 * @param {string} newDescriptionHtml - новый HTML
 * @param {Object} options - { verbose }
 * @returns {Promise<Object|null>}
 */
async function updateElementorContent(productId, oldProduct, newDescriptionHtml, options = {}) {
  const verbose = options.verbose || false;

  const oldElementorMeta = oldProduct.meta_data?.find(m => m.key === '_elementor_data');
  if (!oldElementorMeta || !oldElementorMeta.value) {
    console.warn(chalk.yellow(`⚠️ Товар ${productId} не имеет _elementor_data. Создаём новую структуру.`));
    const newElementorJson = createNewTextWidgetElementorData(oldProduct, newDescriptionHtml);
    const updateData = {
      meta_data: [
        { key: '_elementor_data', value: newElementorJson },
        { key: '_elementor_edit_mode', value: 'builder' }
      ]
    };
    return await updateProduct(productId, updateData);
  }

  let elementorJson;
  try {
    elementorJson = JSON.parse(oldElementorMeta.value);
  } catch (e) {
    console.error(chalk.red(`❌ Ошибка парсинга _elementor_data для товара ${productId}: ${e.message}`));
    return null;
  }

  // Пытаемся заменить в существующей структуре
  const { updated, replacedCount, elements } = replaceTextInElementorElements(elementorJson, newDescriptionHtml, { verbose });
  if (!updated) {
    console.warn(chalk.yellow(`⚠️ Текст-виджет не найден в товаре ${productId}. Создаём новый виджет.`));
    const newElementorJson = createNewTextWidgetElementorData(oldProduct, newDescriptionHtml);
    const updateData = {
      meta_data: [
        { key: '_elementor_data', value: newElementorJson },
        { key: '_elementor_edit_mode', value: 'builder' }
      ]
    };
    return await updateProduct(productId, updateData);
  }

  // Обновляем мета-поле
  const updateData = {
    meta_data: [
      { key: '_elementor_data', value: JSON.stringify(elements) },
      { key: '_elementor_edit_mode', value: 'builder' }
    ]
  };
  return await updateProduct(productId, updateData);
}

// ============================================================
// 2. Вспомогательные функции сравнения (без изменений)
// ============================================================

function getChangedFields(oldProduct, newProduct) {
  const changes = {};

  const directFields = ['name', 'description', 'short_description'];
  for (const field of directFields) {
    const oldVal = oldProduct[field] || '';
    const newVal = newProduct[field];
    if (newVal !== undefined && oldVal !== newVal) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  if (newProduct.slug !== undefined && oldProduct.slug !== newProduct.slug) {
    changes.slug = { old: oldProduct.slug, new: newProduct.slug };
  }

  const oldMeta = oldProduct.meta_data || [];
  const oldMetaMap = new Map(oldMeta.map(m => [m.key, m.value]));
  const newTitle = newProduct.meta_title;
  const newDesc = newProduct.meta_description;
  const newFocus = newProduct.focus_keyword;

  if (newTitle !== undefined && oldMetaMap.get('rank_math_title') !== newTitle) {
    changes.meta_title = { old: oldMetaMap.get('rank_math_title') || '', new: newTitle };
  }
  if (newDesc !== undefined && oldMetaMap.get('rank_math_description') !== newDesc) {
    changes.meta_description = { old: oldMetaMap.get('rank_math_description') || '', new: newDesc };
  }
  if (newFocus !== undefined && oldMetaMap.get('rank_math_focus_keyword') !== newFocus) {
    changes.focus_keyword = { old: oldMetaMap.get('rank_math_focus_keyword') || '', new: newFocus };
  }

  const oldImages = oldProduct.images || [];
  const newImages = newProduct.images || [];
  if (newImages.length > 0) {
    const imageChanges = [];
    for (const newImg of newImages) {
      const oldImg = oldImages.find(i => i.id === newImg.id);
      if (oldImg) {
        if ((newImg.alt !== undefined && oldImg.alt !== newImg.alt) ||
            (newImg.title !== undefined && oldImg.title !== newImg.title)) {
          imageChanges.push({
            id: newImg.id,
            oldAlt: oldImg.alt,
            newAlt: newImg.alt,
            oldTitle: oldImg.title,
            newTitle: newImg.title,
          });
        }
      }
    }
    if (imageChanges.length) changes.images = imageChanges;
  }

  return changes;
}

function buildUpdateData(changes, oldProduct) {
  const updateData = {};

  if (changes.name) updateData.name = changes.name.new;
  if (changes.description) updateData.description = changes.description.new;
  if (changes.short_description) updateData.short_description = changes.short_description.new;

  if (changes.meta_title || changes.meta_description || changes.focus_keyword) {
    const oldMeta = oldProduct.meta_data || [];
    const metaMap = new Map(oldMeta.map(m => [m.key, m.value]));
    if (changes.meta_title) metaMap.set('rank_math_title', changes.meta_title.new);
    if (changes.meta_description) metaMap.set('rank_math_description', changes.meta_description.new);
    if (changes.focus_keyword) metaMap.set('rank_math_focus_keyword', changes.focus_keyword.new);
    updateData.meta_data = Array.from(metaMap, ([key, value]) => ({ key, value }));
  }

  if (changes.images && changes.images.length) {
    const oldImages = oldProduct.images || [];
    const newImages = oldImages.map(oldImg => {
      const imgChange = changes.images.find(c => c.id === oldImg.id);
      if (imgChange) {
        return {
          id: oldImg.id,
          src: oldImg.src,
          alt: imgChange.newAlt !== undefined ? imgChange.newAlt : oldImg.alt,
          title: imgChange.newTitle !== undefined ? imgChange.newTitle : oldImg.title,
        };
      }
      return oldImg;
    });
    updateData.images = newImages;
  }

  return updateData;
}

// ============================================================
// 3. Основная функция импорта
// ============================================================
export async function importCommand(filePath, options = {}) {
  const { autoConfirm = false, skipHtmlValidation = false, updateElementor = false, verbose = false } = options;

  console.log(`🔍 Reading import file: ${filePath}`);
  let importProducts;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    importProducts = JSON.parse(raw);
  } catch (err) {
    console.error(`❌ Failed to read/parse JSON: ${err.message}`);
    return;
  }

  if (!Array.isArray(importProducts) && typeof importProducts === 'object' && importProducts !== null && importProducts.id) {
    console.log('📦 Single product detected, wrapping in array');
    importProducts = [importProducts];
  }

  const validation = ImportDataSchema.safeParse(importProducts);
  if (!validation.success) {
    console.error('❌ Validation errors:');
    for (const issue of validation.error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    return;
  }
  const validatedProducts = validation.data;
  console.log(`✅ Validated ${validatedProducts.length} products`);

  // HTML validation
  if (!skipHtmlValidation) {
    let hasHtmlErrors = false;
    const htmlFields = ['description', 'short_description'];
    for (const product of validatedProducts) {
      for (const field of htmlFields) {
        const html = product[field];
        if (html && typeof html === 'string') {
          const errors = validateHtmlAdvanced(html, field, product.id);
          if (errors.length) {
            hasHtmlErrors = true;
            console.error(chalk.red(`\n❌ HTML errors in product ${product.id}, field "${field}":`));
            for (const err of errors) {
              console.error(chalk.red(`   - ${err.message}`));
              if (err.snippet) {
                console.error(chalk.yellow(`     Fragment: ${err.snippet}`));
              }
            }
          }
        }
      }
    }
    if (hasHtmlErrors) {
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const answer = await new Promise(resolve => rl.question(chalk.yellow('⚠️ Critical HTML issues found. Continue import? (y/N): '), resolve));
      rl.close();
      if (answer.toLowerCase() !== 'y') {
        console.log(chalk.red('❌ Import cancelled due to HTML errors.'));
        return;
      }
    }
  }

  const ids = validatedProducts.map(p => p.id);
  console.log(`📡 Fetching current data for ${ids.length} products...`);
  const currentProducts = await getProducts(ids);
  const currentMap = new Map(currentProducts.map(p => [p.id, p]));

  const allChanges = [];
  for (const newProduct of validatedProducts) {
    const oldProduct = currentMap.get(newProduct.id);
    if (!oldProduct) {
      console.warn(`⚠️ Product ID ${newProduct.id} not found in store, skipping`);
      continue;
    }
    const changes = getChangedFields(oldProduct, newProduct);
    if (Object.keys(changes).length === 0) continue;
    allChanges.push({
      id: newProduct.id,
      name: oldProduct.name,
      changes,
      oldProduct,
    });
  }

  if (allChanges.length === 0) {
    console.log('✅ No changes detected. Import aborted.');
    return;
  }

  console.log('\n📋 Preview of changes:\n');
  for (const item of allChanges) {
    console.log(`🆔 Product ${item.id} — ${item.name}`);
    const ch = item.changes;
    if (ch.name) console.log(`   • name: "${ch.name.old}" → "${ch.name.new}"`);
    if (ch.slug) console.log(`   • slug: "${ch.slug.old}" → "${ch.slug.new}"`);
    if (ch.description) console.log(`   • description: (length ${ch.description.old.length} → ${ch.description.new.length})`);
    if (ch.short_description) console.log(`   • short_description: (length ${ch.short_description.old.length} → ${ch.short_description.new.length})`);
    if (ch.meta_title) console.log(`   • meta_title: "${ch.meta_title.old}" → "${ch.meta_title.new}"`);
    if (ch.meta_description) console.log(`   • meta_description: "${ch.meta_description.old}" → "${ch.meta_description.new}"`);
    if (ch.focus_keyword) console.log(`   • focus_keyword: "${ch.focus_keyword.old}" → "${ch.focus_keyword.new}"`);
    if (ch.images) {
      console.log(`   • images:`);
      ch.images.forEach(img => {
        console.log(`       - id ${img.id}: alt "${img.oldAlt || ''}" → "${img.newAlt || ''}", title "${img.oldTitle || ''}" → "${img.newTitle || ''}"`);
      });
    }
    console.log('');
  }

  if (!autoConfirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise(resolve => rl.question('⚠️ Apply these changes? (y/N): ', resolve));
    rl.close();
    if (answer.toLowerCase() !== 'y') {
      console.log('❌ Import cancelled.');
      return;
    }
  }

  const backupProducts = allChanges.map(item => item.oldProduct);
  const backupPath = await createBackup(backupProducts);
  console.log(`📦 Backup saved to ${backupPath}`);

  let successCount = 0;
  let failCount = 0;
  for (const item of allChanges) {
    try {
      const updateData = buildUpdateData(item.changes, item.oldProduct);
      let productUpdated = false;
      if (Object.keys(updateData).length > 0) {
        await updateProduct(item.id, updateData);
        productUpdated = true;
      }
      let slugUpdated = false;
      if (item.changes.slug) {
        await updateProductSlug(item.id, item.changes.slug.new);
        slugUpdated = true;
      }
      let elementorUpdated = false;
      if (updateElementor && item.changes.description) {
        if (verbose) console.log(`   🔧 Обновляем Elementor контент для товара ${item.id}...`);
        const result = await updateElementorContent(item.id, item.oldProduct, item.changes.description.new, { verbose });
        if (result) elementorUpdated = true;
      }
      if (productUpdated || slugUpdated || elementorUpdated) {
        console.log(`✅ Updated product ${item.id} — ${item.name}`);
        if (slugUpdated) console.log(`   🔗 Slug changed to: ${item.changes.slug.new}`);
        if (elementorUpdated) console.log(`   ✏️ Elementor content updated`);
        successCount++;
        // Пишем в MongoDB историю импорта
        await mongoRecordImport(item.id, item.changes, filePath);
      } else {
        console.log(`⚠️ No changes applied for product ${item.id}`);
      }
    } catch (err) {
      console.error(`❌ Failed to update product ${item.id}: ${err.message}`);
      failCount++;
    }
  }

  console.log(`\n🎉 Import finished: ${successCount} updated, ${failCount} failed.`);
}

// ---- CLI entry point ----
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const fileFlag = args.find(arg => arg.startsWith('--file='));
  const yesFlag = args.includes('--yes');
  const skipHtmlFlag = args.includes('--skip-html-validation');
  const updateElementorFlag = args.includes('--update-elementor');
  const verboseFlag = args.includes('--verbose');
  if (!fileFlag) {
    console.error('Usage: node import.js --file=path/to/file.json [--yes] [--skip-html-validation] [--update-elementor] [--verbose]');
    process.exit(1);
  }
  const filePath = fileFlag.split('=')[1];
  importCommand(filePath, {
    autoConfirm: yesFlag,
    skipHtmlValidation: skipHtmlFlag,
    updateElementor: updateElementorFlag,
    verbose: verboseFlag
  }).catch(console.error);
}