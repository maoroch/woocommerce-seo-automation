/**
 * push.service.js
 *
 * Прямая запись SEO/контент-полей в WooCommerce из дашборда ("Save & Push").
 *
 * В отличие от import.js (который работает с пачкой JSON-файлов и
 * интерактивным подтверждением), эта функция:
 *  - применяется к ОДНОМУ товару,
 *  - всегда делает бэкап текущего состояния перед записью,
 *  - валидирует HTML (description / short_description) перед отправкой,
 *  - пишет результат и diff в историю MongoDB,
 *  - обновляет SEO score после записи.
 *
 * HITL сохраняется на уровне UI: пользователь явно нажимает "Save & Push"
 * после редактирования — это not автоматический процесс.
 */

import { getProducts, updateProduct, updateProductSlug } from '../lib/woocommerce.js';
import { createBackup } from '../services/backup.js';
import { validateHtmlAdvanced } from '../lib/html-validator.js';
import { analyzeProduct } from '../services/seo-analyzer.js';
import { Product } from './product.model.js';

const RANK_MATH_KEYS = {
  meta_title: 'rank_math_title',
  meta_description: 'rank_math_description',
  focus_keyword: 'rank_math_focus_keyword',
};

/**
 * Допустимые поля для редактирования из дашборда.
 * Системные поля (price, sku, permalink и т.д.) сюда НЕ входят — как и в Zod-схеме import.
 */
const EDITABLE_FIELDS = [
  'name',
  'meta_title',
  'meta_description',
  'focus_keyword',
  'description',
  'short_description',
];

/**
 * Применяет правки одного товара к WooCommerce.
 *
 * @param {number} wcId
 * @param {Object} edits  — { name?, meta_title?, meta_description?, focus_keyword?, description?, short_description?, slug? }
 * @returns {Object} { success, changes, validationErrors, seoScoreBefore, seoScoreAfter, backupFile }
 */
export async function pushProductEdits(wcId, edits) {
  // 1. Получаем текущий продукт из WC (свежий, не из Mongo — WC это истина)
  const [oldProduct] = await getProducts([wcId]);
  if (!oldProduct) {
    throw new Error(`Product ${wcId} not found in WooCommerce`);
  }

  // 2. Валидация HTML перед записью
  const validationErrors = [];
  if (edits.description !== undefined) {
    const errs = validateHtmlAdvanced(edits.description, 'description', wcId);
    if (errs?.length) validationErrors.push(...errs);
  }
  if (edits.short_description !== undefined) {
    const errs = validateHtmlAdvanced(edits.short_description, 'short_description', wcId);
    if (errs?.length) validationErrors.push(...errs);
  }

  if (validationErrors.length > 0) {
    return {
      success: false,
      validationErrors,
      changes: {},
    };
  }

  // 3. Бэкап текущего состояния (как в import.js)
  const backupFile = await createBackup([oldProduct]);

  // 4. Считаем diff и формируем payload для WC
  const oldMetaMap = new Map((oldProduct.meta_data || []).map(m => [m.key, m.value]));
  const changes = {};
  const updateData = {};
  const metaUpdates = new Map(oldMetaMap);

  for (const field of EDITABLE_FIELDS) {
    if (edits[field] === undefined) continue;

    if (field in RANK_MATH_KEYS) {
      const metaKey = RANK_MATH_KEYS[field];
      const oldVal = oldMetaMap.get(metaKey) || '';
      const newVal = edits[field];
      if (oldVal !== newVal) {
        changes[field] = { old: oldVal, new: newVal };
        metaUpdates.set(metaKey, newVal);
      }
    } else {
      const oldVal = oldProduct[field] || '';
      const newVal = edits[field];
      if (oldVal !== newVal) {
        changes[field] = { old: oldVal, new: newVal };
        updateData[field] = newVal;
      }
    }
  }

  if (Object.keys(changes).some(k => k in RANK_MATH_KEYS)) {
    updateData.meta_data = Array.from(metaUpdates, ([key, value]) => ({ key, value }));
  }

  // Slug — через WordPress REST API (отдельный вызов)
  let slugUpdated = false;
  if (edits.slug !== undefined && edits.slug !== oldProduct.slug) {
    changes.slug = { old: oldProduct.slug, new: edits.slug };
  }

  // 5. Если ничего не изменилось — выходим рано
  if (Object.keys(changes).length === 0) {
    return { success: true, changes: {}, noop: true, backupFile };
  }

  // 6. Запись в WooCommerce
  if (Object.keys(updateData).length > 0) {
    await updateProduct(wcId, updateData);
  }
  if (changes.slug) {
    await updateProductSlug(wcId, changes.slug.new);
    slugUpdated = true;
  }

  // 7. Пересчитываем SEO score на основе обновлённых данных
  const updatedProduct = {
    ...oldProduct,
    ...updateData,
    slug: changes.slug ? changes.slug.new : oldProduct.slug,
  };
  const scoreResult = analyzeProduct(updatedProduct);
  const seoScoreAfter = {
    total: scoreResult.score,
    title: scoreResult.details?.titleScore?.score ?? 0,
    meta_desc: scoreResult.details?.metaDescScore?.score ?? 0,
    keyword: scoreResult.details?.focusExistsScore?.score ?? 0,
    content: scoreResult.details?.descLengthScore?.score ?? 0,
    images: scoreResult.details?.imageAltScore?.score ?? 0,
    updated_at: new Date(),
  };

  // 8. Обновляем MongoDB: поля + history + score
  const doc = await Product.findOne({ wc_id: wcId });
  if (doc) {
    const seoScoreBefore = doc.seo_score?.total ?? 0;

    const historyChanges = Object.entries(changes).map(([field, val]) => ({
      field,
      old_value: val.old,
      new_value: val.new,
    }));

    doc.addHistory('manual', historyChanges, {
      seo_score_before: seoScoreBefore,
      seo_score_after: seoScoreAfter.total,
      source_file: backupFile.split('/').pop(),
      note: 'Edited and pushed to WooCommerce from dashboard',
    });

    // Применяем изменения к зеркалу
    for (const [field, val] of Object.entries(changes)) {
      if (field in doc) doc[field] = val.new;
    }
    doc.seo_score = seoScoreAfter;
    doc.task_status = 'approved';
    doc.imported_at = new Date();
    if (doc.ai_suggestion) doc.ai_suggestion = null; // правка вручную закрывает AI-предложение

    await doc.save();

    return {
      success: true,
      changes,
      slugUpdated,
      seoScoreBefore,
      seoScoreAfter: seoScoreAfter.total,
      backupFile,
    };
  }

  return {
    success: true,
    changes,
    slugUpdated,
    seoScoreAfter: seoScoreAfter.total,
    backupFile,
  };
}
