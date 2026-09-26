import mongoose, { Schema } from "mongoose";

const CategorySchema = new Schema(
  {
    wc_id: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    slug: { type: String, required: true, index: true },
    parent: { type: Number, default: 0 },
    count: { type: Number, default: 0 },
    synced_at: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Category =
  mongoose.models.Category || mongoose.model("Category", CategorySchema);
