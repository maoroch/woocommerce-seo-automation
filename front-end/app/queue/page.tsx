"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ScoreStamp from "@/components/ScoreStamp";
import { Check, X, RotateCcw, ExternalLink, Loader2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

interface QueueItem {
  wc_id: number;
  sku?: string;
  name: string;
  seo_score: { total: number };
  task_status: string;
  ai_suggestion?: {
    meta_title?: string;
    meta_description?: string;
    focus_keyword?: string;
    short_description?: string;
    mode?: string;
    generated_at?: string;
  } | null;
  updatedAt: string;
}

interface Counts {
  idle: number;
  pending: number;
  processing: number;
  done: number;
  approved: number;
  rejected: number;
}

interface FailedJob {
  id: string;
  productId: number;
  mode: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
}

const TABS = [
  { key: "done", label: "Needs review", color: "var(--proof)" },
  { key: "pending", label: "Queued", color: "#cbd5e1" },
  { key: "processing", label: "Processing", color: "#7dd3fc" },
  { key: "approved", label: "Approved", color: "var(--approved)" },
  { key: "rejected", label: "Rejected", color: "var(--text-faint)" },
  { key: "failed", label: "Failed", color: "var(--proof)" },
] as const;

function stripHtml(s: string) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function truncate(s: string, n = 160) {
  const t = stripHtml(s);
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function QueuePage() {
  const [tab, setTab] = useState<string>("done");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [failedJobs, setFailedJobs] = useState<FailedJob[]>([]);
  const [failedError, setFailedError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<number | string | null>(null);

  const loadCounts = useCallback(() => {
    fetch("/api/queue")
      .then((r) => r.json())
      .then(setCounts);
  }, []);

  const loadItems = useCallback((status: string) => {
    setLoading(true);
    fetch(`/api/queue?status=${status}`)
      .then((r) => r.json())
      .then((d) => setItems(d.items))
      .finally(() => setLoading(false));
  }, []);

  const loadFailed = useCallback(() => {
    setLoading(true);
    fetch("/api/queue/failed")
      .then((r) => r.json())
      .then((d) => {
        setFailedJobs(d.jobs || []);
        setFailedError(d.ok === false ? d.error : null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadCounts();
  }, [loadCounts]);

  useEffect(() => {
    if (tab === "failed") {
      loadFailed();
    } else {
      loadItems(tab);
    }
  }, [tab, loadItems, loadFailed]);

  async function actFailed(jobId: string, action: "retry" | "remove") {
    setActingId(jobId);
    try {
      await fetch("/api/queue/failed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action }),
      });
      setFailedJobs((prev) => prev.filter((j) => j.id !== jobId));
    } finally {
      setActingId(null);
    }
  }

  async function act(wc_id: number, action: "approve" | "reject" | "reset") {
    setActingId(wc_id);
    try {
      await fetch(`/api/products/${wc_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      setItems((prev) => prev.filter((i) => i.wc_id !== wc_id));
      loadCounts();
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="p-10 max-w-5xl">
      <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--proof)" }}>
        03 — Queue
      </p>
      <h1 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
        Review desk
      </h1>
      <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--text-on-ink-muted)" }}>
        AI-generated suggestions wait here for sign-off. Approving marks a product ready
        for import — the actual write to WooCommerce still runs through{" "}
        <code className="font-mono">import.js</code>, with its diff preview and automatic backup.
      </p>

      {/* Tabs */}
      <div className="mt-6 flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className="flex items-center gap-2 px-3.5 py-2 rounded-md text-sm font-medium transition-colors"
            style={{
              background: tab === t.key ? "var(--paper)" : "var(--ink-soft)",
              color: tab === t.key ? "var(--text-strong)" : "var(--text-on-ink-muted)",
              border: `1px solid ${tab === t.key ? "var(--paper-border)" : "rgba(255,255,255,0.06)"}`,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
            {t.label}
            <span className="font-mono text-xs tabular-nums" style={{ color: "var(--text-faint)" }}>
              {t.key === "failed"
                ? (failedJobs.length || (failedError ? "—" : 0))
                : counts ? counts[t.key as keyof Counts] : "—"}
            </span>
          </button>
        ))}
      </div>

      {/* Items */}
      <div className="mt-6">
        {loading && (
          <div className="flex items-center gap-2 text-sm py-10 justify-center" style={{ color: "var(--text-faint)" }}>
            <Loader2 size={15} className="animate-spin" /> Loading...
          </div>
        )}

        {tab === "failed" ? (
          <>
            {!loading && failedError && (
              <div className="paper rounded-lg p-10 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Couldn&apos;t reach the AI queue (Redis): {failedError}
                </p>
              </div>
            )}
            {!loading && !failedError && failedJobs.length === 0 && (
              <div className="paper rounded-lg p-10 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  No failed jobs.
                </p>
              </div>
            )}
            <div className="space-y-3">
              {failedJobs.map((job) => (
                <div key={job.id} className="paper rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <Link
                        href={`/products/${job.productId}`}
                        className="text-sm font-medium hover:underline inline-flex items-center gap-1"
                      >
                        Product #{job.productId} <ExternalLink size={11} style={{ color: "var(--text-faint)" }} />
                      </Link>
                      <p className="text-xs mt-1" style={{ color: "var(--proof)" }}>
                        {job.failedReason}
                      </p>
                      <p className="text-[0.7rem] mt-1 font-mono" style={{ color: "var(--text-faint)" }}>
                        mode: {job.mode} · attempts: {job.attemptsMade} · {formatDateTime(job.timestamp)}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => actFailed(job.id, "remove")}
                        disabled={actingId === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                        style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
                      >
                        <X size={13} /> Dismiss
                      </button>
                      <button
                        onClick={() => actFailed(job.id, "retry")}
                        disabled={actingId === job.id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                        style={{ background: "var(--approved)", color: "#0e2818" }}
                      >
                        <RotateCcw size={13} /> Retry
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {!loading && items.length === 0 && (
              <div className="paper rounded-lg p-10 text-center">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {tab === "done"
                    ? "Nothing waiting for review. Run the worker to generate suggestions."
                    : `No products with status "${TABS.find((t) => t.key === tab)?.label}".`}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {items.map((item) => (
                <div key={item.wc_id} className="paper rounded-lg p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <ScoreStamp score={item.seo_score?.total ?? 0} size="sm" />
                      <div className="min-w-0">
                        <Link
                          href={`/products/${item.wc_id}`}
                          className="text-sm font-medium hover:underline inline-flex items-center gap-1"
                        >
                          {item.name} <ExternalLink size={11} style={{ color: "var(--text-faint)" }} />
                        </Link>
                        <p className="text-xs font-mono mt-0.5" style={{ color: "var(--text-faint)" }}>
                          #{item.wc_id} {item.sku ? `· ${item.sku}` : ""}
                          {item.ai_suggestion?.mode ? ` · mode: ${item.ai_suggestion.mode}` : ""}
                        </p>
                      </div>
                    </div>

                    {tab === "done" && (
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => act(item.wc_id, "reject")}
                          disabled={actingId === item.wc_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                          style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
                        >
                          <X size={13} /> Reject
                        </button>
                        <button
                          onClick={() => act(item.wc_id, "approve")}
                          disabled={actingId === item.wc_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors"
                          style={{ background: "var(--approved)", color: "#0e2818" }}
                        >
                          <Check size={13} /> Approve
                        </button>
                      </div>
                    )}

                    {(tab === "approved" || tab === "rejected") && (
                      <button
                        onClick={() => act(item.wc_id, "reset")}
                        disabled={actingId === item.wc_id}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0"
                        style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
                      >
                        <RotateCcw size={13} /> Reset
                      </button>
                    )}
                  </div>

                  {item.ai_suggestion && (
                    <div className="mt-4 pt-4 grid sm:grid-cols-2 gap-4 text-xs" style={{ borderTop: "1px solid var(--paper-border)" }}>
                      {item.ai_suggestion.meta_title && (
                        <div>
                          <p className="uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                            Meta title
                          </p>
                          <p style={{ color: "var(--approved)" }}>{item.ai_suggestion.meta_title}</p>
                        </div>
                      )}
                      {item.ai_suggestion.meta_description && (
                        <div>
                          <p className="uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                            Meta description
                          </p>
                          <p style={{ color: "var(--approved)" }}>{item.ai_suggestion.meta_description}</p>
                        </div>
                      )}
                      {item.ai_suggestion.focus_keyword && (
                        <div>
                          <p className="uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                            Focus keyword
                          </p>
                          <p style={{ color: "var(--approved)" }}>{item.ai_suggestion.focus_keyword}</p>
                        </div>
                      )}
                      {item.ai_suggestion.short_description && (
                        <div className="sm:col-span-2">
                          <p className="uppercase tracking-wider mb-1" style={{ color: "var(--text-faint)" }}>
                            Short description
                          </p>
                          <p style={{ color: "var(--approved)" }}>
                            {truncate(item.ai_suggestion.short_description, 220)}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
