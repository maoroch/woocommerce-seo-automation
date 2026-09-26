export type TaskStatus =
  | "idle"
  | "pending"
  | "processing"
  | "done"
  | "approved"
  | "rejected";

export interface SeoScore {
  total: number;
  title: number;
  meta_desc: number;
  keyword: number;
  content: number;
  images: number;
  updated_at?: string;
}

export interface FieldChange {
  field: string;
  old_value: any;
  new_value: any;
}

export interface HistoryEntry {
  _id: string;
  action: "sync" | "ai_enhance" | "import" | "rollback" | "manual";
  changes: FieldChange[];
  seo_score_before?: number;
  seo_score_after?: number;
  source_file?: string;
  note?: string;
  created_at: string;
}

export interface AiSuggestion {
  meta_title?: string;
  meta_description?: string;
  focus_keyword?: string;
  description?: string;
  short_description?: string;
  name?: string;
  mode?: string;
  generated_at?: string;
}

export interface ProductDoc {
  _id: string;
  wc_id: number;
  sku?: string;
  slug?: string;
  name: string;
  title?: string;
  meta_title?: string;
  meta_description?: string;
  focus_keyword?: string;
  description?: string;
  short_description?: string;
  images: { id?: number; src: string; alt?: string; title?: string }[];
  categories: { id: number; name: string; slug: string }[];
  seo_score: SeoScore;
  task_status: TaskStatus;
  ai_suggestion?: AiSuggestion | null;
  history: HistoryEntry[];
  wc_synced_at?: string;
  imported_at?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface OverviewStats {
  total: number;
  avgScore: number;
  minScore: number;
  maxScore: number;
  below50: number;
  above70: number;
  lastSync: string | null;
  statusCounts: Record<TaskStatus, number>;
}
