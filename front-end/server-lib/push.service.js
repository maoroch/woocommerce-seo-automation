/**
 * push.service.js
 *
 * Прямая запись SEO/контент-полей в WooCommerce из дашборда ("Save & Push").
 *
 *  - применяется к ОДНОМУ товару,
 *  - всегда делает бэкап текущего состояния перед записью (server-lib/services/backup.js),
 *  - валидирует HTML (description / short_description) перед отправкой,
 *  - пишет diff в историю MongoDB (тот же массив history, что видит CLI),
 *  - обновляет SEO score после записи.
 *
 * HITL сохраняется на уровне UI: пользователь явно нажимает "Save & Push".
 */

import { getProducts, updateProduct, updateProductSlug } from "./lib/woocommerce.js";
import { createBackup } from "./services/backup.js";
import { validateHtmlAdvanced } from "./lib/html-validator.js";
import { analyzeProduct } from "./services/seo-analyzer.js";

const RANK_MATH_KEYS = {
  meta_title: "rank_math_title",
  meta_description: "rank_math_description",
  focus_keyword: "rank_math_focus_keyword",
};

/** Поля, которые можно редактировать из дашборда (без системных полей: price, sku, ...) */
const EDITABLE_FIELDS = [
  "name",
  "meta_title",
  "meta_description",
  "focus_keyword",
  "description",
  "short_description",
];

/**
 * @param {number} wcId
 * @param {object} edits - { name?, meta_title?, meta_description?, focus_keyword?, description?, short_description?, slug? }
 * @param {object} ProductModel - mongoose Product model (passed in to avoid import cycle issues)
 */
export async function pushProductEdits(wcId, edits, ProductModel) {
  // 1. Текущий продукт из WC — источник истины
  const [oldProduct] = await getProducts([wcId]);
  if (!oldProduct) {
    throw new Error(`Product ${wcId} not found in WooCommerce`);
  }

  // 2. Валидация HTML
  const validationErrors = [];
  if (edits.description !== undefined) {
    const errs = validateHtmlAdvanced(edits.description, "description", wcId);
    if (errs?.length) validationErrors.push(...errs);
  }
  if (edits.short_description !== undefined) {
    const errs = validateHtmlAdvanced(edits.short_description, "short_description", wcId);
    if (errs?.length) validationErrors.push(...errs);
  }

  if (validationErrors.length > 0) {
    return { success: false, validationErrors, changes: {} };
  }

  // 3. Бэкап
  const backupFile = await createBackup([oldProduct]);

  // 4. Diff + payload
  const oldMetaMap = new Map((oldProduct.meta_data || []).map((m) => [m.key, m.value]));
  const changes = {};
  const updateData = {};
  const metaUpdates = new Map(oldMetaMap);

  for (const field of EDITABLE_FIELDS) {
    if (edits[field] === undefined) continue;

    if (field in RANK_MATH_KEYS) {
      const metaKey = RANK_MATH_KEYS[field];
      const oldVal = oldMetaMap.get(metaKey) || "";
      const newVal = edits[field];
      if (oldVal !== newVal) {
        changes[field] = { old: oldVal, new: newVal };
        metaUpdates.set(metaKey, newVal);
      }
    } else {
      const oldVal = oldProduct[field] || "";
      const newVal = edits[field];
      if (oldVal !== newVal) {
        changes[field] = { old: oldVal, new: newVal };
        updateData[field] = newVal;
      }
    }
  }

  if (Object.keys(changes).some((k) => k in RANK_MATH_KEYS)) {
    updateData.meta_data = Array.from(metaUpdates, ([key, value]) => ({ key, value }));
  }

  let slugUpdated = false;
  if (edits.slug !== undefined && edits.slug !== oldProduct.slug) {
    changes.slug = { old: oldProduct.slug, new: edits.slug };
  }

  if (Object.keys(changes).length === 0) {
    return { success: true, changes: {}, noop: true, backupFile };
  }

  // 5. Запись в WooCommerce
  if (Object.keys(updateData).length > 0) {
    await updateProduct(wcId, updateData);
  }
  if (changes.slug) {
    await updateProductSlug(wcId, changes.slug.new);
    slugUpdated = true;
  }

  // 6. Пересчёт SEO score
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

  // 7. Обновляем MongoDB зеркало + history
  const doc = await ProductModel.findOne({ wc_id: wcId });
  let seoScoreBefore = null;

  if (doc) {
    seoScoreBefore = doc.seo_score?.total ?? 0;

    const historyChanges = Object.entries(changes).map(([field, val]) => ({
      field,
      old_value: val.old,
      new_value: val.new,
    }));

    doc.history.push({
      action: "manual",
      changes: historyChanges,
      seo_score_before: seoScoreBefore,
      seo_score_after: seoScoreAfter.total,
      source_file: backupFile.split(/[\\/]/).pop(),
      note: "Edited and pushed to WooCommerce from dashboard",
      created_at: new Date(),
    });

    for (const [field, val] of Object.entries(changes)) {
      if (field in doc) doc[field] = val.new;
    }
    doc.seo_score = seoScoreAfter;
    doc.task_status = "approved";
    doc.imported_at = new Date();
    doc.ai_suggestion = null;

    await doc.save();
  }

  return {
    success: true,
    changes,
    slugUpdated,
    seoScoreBefore,
    seoScoreAfter: seoScoreAfter.total,
    backupFile,
  };
}
