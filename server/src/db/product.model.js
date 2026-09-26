/**
 * Product Model
 *
 * WooCommerce (MySQL) — источник истины.
 * MongoDB — рабочая копия + мета-данные: история правок, SEO score, статус задачи.
 *
 * Схема намеренно гибкая (minimize: false) чтобы хранить любые WC-поля без миграций.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

// ---------- Вложенные схемы ----------

const ImageSchema = new Schema({
  id:    { type: Number },
  src:   { type: String },
  alt:   { type: String, default: '' },
  title: { type: String, default: '' },
}, { _id: false });

// Одна запись в истории изменений поля
const FieldChangeSchema = new Schema({
  field:      { type: String, required: true },  // 'meta_title', 'description', ...
  old_value:  { type: Schema.Types.Mixed },
  new_value:  { type: Schema.Types.Mixed },
}, { _id: false });

// Одна запись в истории импорта (один import-прогон = один элемент)
const HistoryEntrySchema = new Schema({
  action:     {
    type: String,
    enum: ['sync', 'ai_enhance', 'import', 'rollback', 'manual'],
    required: true,
  },
  changes:    { type: [FieldChangeSchema], default: [] },
  seo_score_before: { type: Number },
  seo_score_after:  { type: Number },
  source_file:      { type: String },   // имя JSON-файла, если применимо
  note:             { type: String },   // произвольный комментарий
  created_at:       { type: Date, default: Date.now },
}, { _id: true });

// SEO-оценка (последняя)
const SeoScoreSchema = new Schema({
  total:       { type: Number, default: 0 },
  title:       { type: Number, default: 0 },
  meta_desc:   { type: Number, default: 0 },
  keyword:     { type: Number, default: 0 },
  content:     { type: Number, default: 0 },
  images:      { type: Number, default: 0 },
  updated_at:  { type: Date, default: Date.now },
}, { _id: false });

// ---------- Основная схема ----------

const ProductSchema = new Schema(
  {
    // --- WooCommerce поля (синхронизируются из WC) ---
    wc_id:             { type: Number, required: true, unique: true, index: true },
    sku:               { type: String, index: true },
    slug:              { type: String },
    name:              { type: String },
    title:             { type: String },  // алиас name для совместимости
    meta_title:        { type: String },
    meta_description:  { type: String },
    focus_keyword:     { type: String },
    description:       { type: String },
    short_description: { type: String },
    images:            { type: [ImageSchema], default: [] },
    categories:        { type: [Schema.Types.Mixed], default: [] },

    // --- Мета-данные (только MongoDB, не идут в WC) ---
    seo_score:         { type: SeoScoreSchema, default: () => ({}) },

    // Статус задачи для AI-очереди:
    // 'idle'     — ничего не запланировано
    // 'pending'  — стоит в очереди BullMQ
    // 'processing' — сейчас обрабатывается
    // 'done'     — AI улучшил, ждёт review
    // 'approved' — одобрен, импортирован в WC
    // 'rejected' — отклонён
    task_status: {
      type: String,
      enum: ['idle', 'pending', 'processing', 'done', 'approved', 'rejected'],
      default: 'idle',
      index: true,
    },

    // Данные предложенные AI (до ревью / импорта)
    ai_suggestion: { type: Schema.Types.Mixed, default: null },

    // Полная история всех действий с товаром
    history: { type: [HistoryEntrySchema], default: [] },

    // Временные метки синхронизации
    wc_synced_at:  { type: Date },   // когда последний раз тянули из WC
    imported_at:   { type: Date },   // когда последний раз импортировали в WC
  },
  {
    timestamps: true,  // createdAt, updatedAt
    minimize: false,   // хранить пустые объекты (нужно для seo_score)
  }
);

// ---------- Индексы ----------
ProductSchema.index({ task_status: 1, wc_synced_at: -1 });
ProductSchema.index({ 'seo_score.total': 1 });
ProductSchema.index({ 'categories.id': 1 });

// ---------- Методы экземпляра ----------

/**
 * Добавить запись в историю.
 * @param {string} action
 * @param {Array}  changes  — массив { field, old_value, new_value }
 * @param {Object} extra    — { seo_score_before, seo_score_after, source_file, note }
 */
ProductSchema.methods.addHistory = function (action, changes = [], extra = {}) {
  this.history.push({
    action,
    changes,
    seo_score_before: extra.seo_score_before,
    seo_score_after:  extra.seo_score_after,
    source_file:      extra.source_file,
    note:             extra.note,
    created_at:       new Date(),
  });
};

/**
 * Обновить SEO-score и записать в историю (если передан старый score).
 */
ProductSchema.methods.updateSeoScore = function (newScore, oldScore = null) {
  this.seo_score = { ...newScore, updated_at: new Date() };
  return { before: oldScore, after: newScore };
};

// ---------- Статические методы ----------

/**
 * Найти или создать документ по wc_id.
 */
ProductSchema.statics.findOrCreate = async function (wc_id) {
  let doc = await this.findOne({ wc_id });
  if (!doc) {
    doc = new this({ wc_id });
  }
  return doc;
};

/**
 * Получить продукты требующие SEO-улучшения (score ниже порога).
 */
ProductSchema.statics.findLowScore = function (threshold = 50, limit = 50) {
  return this.find({ 'seo_score.total': { $lt: threshold } })
    .sort({ 'seo_score.total': 1 })
    .limit(limit);
};

export const Product = mongoose.model('Product', ProductSchema);
