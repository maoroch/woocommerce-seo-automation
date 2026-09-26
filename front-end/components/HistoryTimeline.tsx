"use client";

import { useState } from "react";
import type { HistoryEntry } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

const ACTION_LABEL: Record<string, string> = {
  sync: "Synced from WooCommerce",
  ai_enhance: "AI enhancement generated",
  import: "Imported to WooCommerce",
  rollback: "Rolled back from backup",
  manual: "Manual action",
};

const FIELD_LABEL: Record<string, string> = {
  name: "Title",
  slug: "Slug",
  meta_title: "Meta title",
  meta_description: "Meta description",
  focus_keyword: "Focus keyword",
  description: "Description",
  short_description: "Short description",
};

const FILTER_OPTIONS = [
  { value: "", label: "All actions" },
  { value: "sync", label: "Synced" },
  { value: "ai_enhance", label: "AI enhanced" },
  { value: "import", label: "Imported" },
  { value: "manual", label: "Manual" },
  { value: "rollback", label: "Rolled back" },
];

function truncate(s: string, n = 100) {
  const t = (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function HistoryTimeline({ history }: { history: HistoryEntry[] }) {
  const [filter, setFilter] = useState("");

  const filtered = filter ? history.filter((h) => h.action === filter) : history;

  // Какие типы действий реально присутствуют — не показываем пустые опции
  const presentActions = new Set(history.map((h) => h.action));
  const options = FILTER_OPTIONS.filter((o) => o.value === "" || presentActions.has(o.value as any));

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
        <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--text-on-ink-muted)" }}>
          Change history
        </h2>
        {options.length > 2 && (
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="px-2 py-1 rounded-md text-xs paper focus:outline-none"
            style={{ border: "1px solid var(--paper-border)" }}
          >
            {options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-on-ink-muted)" }}>
          {history.length === 0 ? "No history recorded yet." : "No entries match this filter."}
        </p>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-[5px] top-2 bottom-2 w-px" style={{ background: "rgba(255,255,255,0.12)" }} />
          <div className="space-y-6">
            {filtered.map((entry) => (
              <div key={entry._id} className="relative">
                <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full" style={{ background: "var(--proof)" }} />
                <div className="flex items-baseline justify-between gap-4 flex-wrap">
                  <p className="text-sm font-medium">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                  <p className="text-xs font-mono" style={{ color: "var(--text-faint)" }}>
                    {formatDateTime(entry.created_at)}
                  </p>
                </div>

                {(entry.seo_score_before != null || entry.seo_score_after != null) && (
                  <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-on-ink-muted)" }}>
                    SEO score: {entry.seo_score_before ?? "—"} → {entry.seo_score_after ?? "—"}
                  </p>
                )}

                {entry.note && (
                  <p className="text-xs mt-1" style={{ color: "var(--text-on-ink-muted)" }}>
                    {entry.note}
                  </p>
                )}

                {entry.source_file && (
                  <p className="text-xs mt-1 font-mono" style={{ color: "var(--text-faint)" }}>
                    {entry.source_file}
                  </p>
                )}

                {entry.changes?.length > 0 && (
                  <div className="mt-2 space-y-1.5">
                    {entry.changes.map((ch, i) => (
                      <div key={i} className="text-xs paper rounded-md px-3 py-2">
                        <span className="font-medium" style={{ color: "var(--text-strong)" }}>
                          {FIELD_LABEL[ch.field] ?? ch.field}
                        </span>
                        <div className="mt-1 flex flex-col gap-0.5">
                          <span style={{ color: "var(--proof)", textDecoration: "line-through" }}>
                            {truncate(String(ch.old_value ?? ""), 100) || "(empty)"}
                          </span>
                          <span style={{ color: "var(--approved)" }}>
                            {truncate(String(ch.new_value ?? ""), 100) || "(empty)"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
