/**
 * Category Model
 *
 * Зеркало WooCommerce product categories. Обновляется при полной синхронизации.
 * Позволяет фильтровать товары по категориям в дашборде без похода в WC API.
 */

import mongoose from 'mongoose';

const { Schema } = mongoose;

const CategorySchema = new Schema(
  {
    wc_id:   { type: Number, required: true, unique: true, index: true },
    name:    { type: String, required: true },
    slug:    { type: String, required: true, index: true },
    parent:  { type: Number, default: 0 },
    count:   { type: Number, default: 0 },  // кол-во товаров (из WC)
    synced_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Category = mongoose.model('Category', CategorySchema);
