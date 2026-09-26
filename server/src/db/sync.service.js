/**
 * sync.service.js
 *
 * Синхронизирует продукты из WooCommerce (MySQL) → MongoDB.
 * WooCommerce всегда истина. MongoDB — рабочая копия + история.
 *
 * Использование:
 *   import { syncProducts } from './sync.service.js';
 *   await syncProducts({ ids: [123, 456] });
 *   await syncProducts({ categoryId: 84 });
 *   await syncProducts();  // первые 50
 */

import chalk from 'chalk';
import {
  getProducts,
  getProductsByCategory,
  getAllCategories,
  getAllProducts,
} from '../lib/woocommerce.js';
import { Product } from './product.model.js';
import { Category } from './category.model.js';
import { analyzeProduct } from '../services/seo-analyzer.js';

/**
 * Преобразует WC-продукт в плоский объект для MongoDB.
 */
function mapWcProduct(p) {
  return {
    wc_id:             p.id,
    sku:               p.sku || '',
    slug:              p.slug || '',
    name:              p.name || '',
    title:             p.name || '',
    meta_title:        p.meta_data?.find(m => m.key === 'rank_math_title')?.value || '',
    meta_description:  p.meta_data?.find(m => m.key === 'rank_math_description')?.value || '',
    focus_keyword:     p.meta_data?.find(m => m.key === 'rank_math_focus_keyword')?.value || '',
    description:       p.description || '',
    short_description: p.short_description || '',
    images:            (p.images || []).map(img => ({
      id:    img.id,
      src:   img.src,
      alt:   img.alt || '',
      title: img.title || '',
    })),
    categories: (p.categories || []).map(c => ({ id: c.id, name: c.name, slug: c.slug })),
  };
}

/**
 * Вычисляет список изменённых полей между старым (MongoDB) и новым (WC) продуктом.
 * Возвращает массив { field, old_value, new_value }.
 */
function diffFields(oldDoc, newData) {
  const TRACKED = [
    'name', 'slug', 'meta_title', 'meta_description',
    'focus_keyword', 'description', 'short_description',
  ];
  const changes = [];
  for (const field of TRACKED) {
    const oldVal = oldDoc[field] ?? '';
    const newVal = newData[field] ?? '';
    if (oldVal !== newVal) {
      changes.push({ field, old_value: oldVal, new_value: newVal });
    }
  }
  return changes;
}

/**
 * Синхронизирует один продукт WC → MongoDB.
 * Записывает историю если данные изменились.
 * @param {Object} wcProduct  — сырой объект из WC API
 * @param {Object} options
 * @param {boolean} options.verbose
 * @returns {Object} { created: bool, updated: bool, unchanged: bool }
 */
export async function syncOneProduct(wcProduct, options = {}) {
  const { verbose = false } = options;
  const mapped = mapWcProduct(wcProduct);

  // Считаем SEO score на основе актуальных данных
  const scoreResult = analyzeProduct(wcProduct);
  const seoScore = {
    total:      scoreResult.score,
    title:      scoreResult.details?.titleScore?.score ?? 0,
    meta_desc:  scoreResult.details?.metaDescScore?.score ?? 0,
    keyword:    scoreResult.details?.focusExistsScore?.score ?? 0,
    content:    scoreResult.details?.descLengthScore?.score ?? 0,
    images:     scoreResult.details?.imageAltScore?.score ?? 0,
    updated_at: new Date(),
  };

  let doc = await Product.findOne({ wc_id: mapped.wc_id });
  const isNew = !doc;

  if (isNew) {
    doc = new Product({ ...mapped, seo_score: seoScore, wc_synced_at: new Date() });
    doc.addHistory('sync', [], { note: 'Initial sync from WooCommerce' });
    await doc.save();
    if (verbose) console.log(chalk.green(`  ➕ Created  [${mapped.wc_id}] ${mapped.name}`));
    return { created: true, updated: false, unchanged: false };
  }

  // Уже существует — ищем изменения
  const changes = diffFields(doc, mapped);
  const oldScore = doc.seo_score?.total ?? 0;

  // Обновляем поля
  Object.assign(doc, mapped);
  doc.seo_score = seoScore;
  doc.wc_synced_at = new Date();

  if (changes.length > 0) {
    doc.addHistory('sync', changes, {
      seo_score_before: oldScore,
      seo_score_after:  seoScore.total,
      note: `Sync detected ${changes.length} changed field(s)`,
    });
    await doc.save();
    if (verbose) console.log(chalk.yellow(`  🔄 Updated  [${mapped.wc_id}] ${mapped.name} (${changes.length} changes)`));
    return { created: false, updated: true, unchanged: false };
  }

  // Сохраняем даже без изменений, чтобы обновить wc_synced_at и seo_score
  await doc.save();
  if (verbose) console.log(chalk.gray(`  ✓ Unchanged [${mapped.wc_id}] ${mapped.name}`));
  return { created: false, updated: false, unchanged: true };
}

/**
 * Основная функция синхронизации.
 *
 * @param {Object} options
 * @param {string}  options.ids        — '123,456' или массив
 * @param {string}  options.category   — имя/slug категории
 * @param {number}  options.catId      — ID категории
 * @param {boolean} options.verbose
 * @returns {Object} { total, created, updated, unchanged, failed }
 */
export async function syncProducts(options = {}) {
  const { ids: idsArg, category: categoryName, catId, verbose = false } = options;

  let wcProducts = [];

  if (catId) {
    console.log(chalk.blue(`📡 Fetching WC products for category ID ${catId}...`));
    wcProducts = await getProductsByCategory(catId);
  } else if (categoryName) {
    console.log(chalk.blue(`🔍 Looking up category: "${categoryName}"...`));
    const allCats = await getAllCategories();
    const matched = allCats.find(
      c => c.name.toLowerCase() === categoryName.toLowerCase() ||
           c.slug.toLowerCase() === categoryName.toLowerCase()
    );
    if (!matched) {
      throw new Error(`Category "${categoryName}" not found`);
    }
    console.log(chalk.blue(`📡 Fetching WC products from category "${matched.name}" (ID: ${matched.id})...`));
    wcProducts = await getProductsByCategory(matched.id);
  } else if (idsArg) {
    const ids = (Array.isArray(idsArg) ? idsArg : idsArg.split(','))
      .map(id => parseInt(id))
      .filter(id => !isNaN(id));
    console.log(chalk.blue(`📡 Fetching WC products: ${ids.join(', ')}...`));
    wcProducts = await getProducts(ids);
  } else {
    console.log(chalk.blue('📡 Fetching first 50 WC products...'));
    wcProducts = await getProducts();
  }

  console.log(chalk.blue(`🔄 Syncing ${wcProducts.length} products to MongoDB...`));

  const stats = { total: wcProducts.length, created: 0, updated: 0, unchanged: 0, failed: 0 };

  for (const wcp of wcProducts) {
    try {
      const result = await syncOneProduct(wcp, { verbose });
      if (result.created)   stats.created++;
      if (result.updated)   stats.updated++;
      if (result.unchanged) stats.unchanged++;
    } catch (err) {
      stats.failed++;
      console.error(chalk.red(`  ❌ Failed to sync product ${wcp.id}: ${err.message}`));
    }
  }

  console.log(
    chalk.green(`\n✅ Sync complete: `) +
    chalk.white(`${stats.total} total | `) +
    chalk.green(`${stats.created} created | `) +
    chalk.yellow(`${stats.updated} updated | `) +
    chalk.gray(`${stats.unchanged} unchanged`) +
    (stats.failed ? chalk.red(` | ${stats.failed} failed`) : '')
  );

  return stats;
}

/**
 * Синхронизирует категории WC -> MongoDB (отдельная коллекция).
 * Вызывается автоматически из syncAllProducts, но доступна отдельно.
 */
export async function syncCategories() {
  const wcCategories = await getAllCategories();

  let created = 0;
  let updated = 0;

  for (const c of wcCategories) {
    const result = await Category.updateOne(
      { wc_id: c.id },
      {
        $set: {
          name: c.name,
          slug: c.slug,
          parent: c.parent || 0,
          count: c.count || 0,
          synced_at: new Date(),
        },
      },
      { upsert: true }
    );
    if (result.upsertedCount > 0) created++;
    else if (result.modifiedCount > 0) updated++;
  }

  console.log(
    chalk.cyan(`Categories: ${wcCategories.length} total | ${created} created | ${updated} updated`)
  );

  return { total: wcCategories.length, created, updated };
}

/**
 * ПОЛНАЯ синхронизация всего каталога WooCommerce -> MongoDB.
 *
 * - Тянет товары постранично (per_page=100), пишет в Mongo по мере получения страниц
 * - Синхронизирует категории (имя/slug/parent) в отдельную коллекцию
 * - Каждый товар получает заполненный массив categories с {id, name, slug}
 *
 * @param {Object} options
 * @param {boolean} options.verbose
 * @param {function} options.onProgress - callback({ page, pageCount, totalSoFar }) для прогресса
 * @returns {Object} { total, created, updated, unchanged, failed, categories }
 */
export async function syncAllProducts(options = {}) {
  const { verbose = false, onProgress } = options;

  console.log(chalk.blue('Syncing categories first...'));
  const categoryStats = await syncCategories();

  console.log(chalk.blue('\nFetching full product catalog from WooCommerce (paginated)...'));

  const stats = { total: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };

  await getAllProducts({
    perPage: 100,
    onPage: async (pageProducts, pageNum) => {
      console.log(chalk.gray(`\n  --- Page ${pageNum} (${pageProducts.length} products) ---`));

      for (const wcp of pageProducts) {
        try {
          const result = await syncOneProduct(wcp, { verbose });
          stats.total++;
          if (result.created)   stats.created++;
          if (result.updated)   stats.updated++;
          if (result.unchanged) stats.unchanged++;
        } catch (err) {
          stats.failed++;
          console.error(chalk.red(`  Failed to sync product ${wcp.id}: ${err.message}`));
        }
      }

      if (onProgress) {
        onProgress({ page: pageNum, pageCount: pageProducts.length, totalSoFar: stats.total });
      }
    },
  });

  console.log(
    chalk.green(`\nFull sync complete: `) +
    chalk.white(`${stats.total} total | `) +
    chalk.green(`${stats.created} created | `) +
    chalk.yellow(`${stats.updated} updated | `) +
    chalk.gray(`${stats.unchanged} unchanged`) +
    (stats.failed ? chalk.red(` | ${stats.failed} failed`) : '')
  );

  return { ...stats, categories: categoryStats };
}
