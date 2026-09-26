import mongoose, { Schema } from "mongoose";

const ImageSchema = new Schema(
  {
    id: { type: Number },
    src: { type: String },
    alt: { type: String, default: "" },
    title: { type: String, default: "" },
  },
  { _id: false }
);

const FieldChangeSchema = new Schema(
  {
    field: { type: String, required: true },
    old_value: { type: Schema.Types.Mixed },
    new_value: { type: Schema.Types.Mixed },
  },
  { _id: false }
);

const HistoryEntrySchema = new Schema(
  {
    action: {
      type: String,
      enum: ["sync", "ai_enhance", "import", "rollback", "manual"],
      required: true,
    },
    changes: { type: [FieldChangeSchema], default: [] },
    seo_score_before: { type: Number },
    seo_score_after: { type: Number },
    source_file: { type: String },
    note: { type: String },
    created_at: { type: Date, default: Date.now },
  },
  { _id: true }
);

const SeoScoreSchema = new Schema(
  {
    total: { type: Number, default: 0 },
    title: { type: Number, default: 0 },
    meta_desc: { type: Number, default: 0 },
    keyword: { type: Number, default: 0 },
    content: { type: Number, default: 0 },
    images: { type: Number, default: 0 },
    updated_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ProductSchema = new Schema(
  {
    wc_id: { type: Number, required: true, unique: true, index: true },
    sku: { type: String, index: true },
    slug: { type: String },
    name: { type: String },
    title: { type: String },
    meta_title: { type: String },
    meta_description: { type: String },
    focus_keyword: { type: String },
    description: { type: String },
    short_description: { type: String },
    images: { type: [ImageSchema], default: [] },
    categories: { type: [Schema.Types.Mixed], default: [] },

    seo_score: { type: SeoScoreSchema, default: () => ({}) },

    task_status: {
      type: String,
      enum: ["idle", "pending", "processing", "done", "approved", "rejected"],
      default: "idle",
      index: true,
    },

    ai_suggestion: { type: Schema.Types.Mixed, default: null },
    history: { type: [HistoryEntrySchema], default: [] },

    wc_synced_at: { type: Date },
    imported_at: { type: Date },
  },
  { timestamps: true, minimize: false }
);

export const Product =
  mongoose.models.Product || mongoose.model("Product", ProductSchema);
