"use client";

import { useEffect, useState, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import ScoreStamp from "@/components/ScoreStamp";
import StatusBadge from "@/components/StatusBadge";
import type { ProductDoc, TaskStatus } from "@/lib/types";
import { Search, ChevronLeft, ChevronRight, X, ListPlus, Check, RotateCcw, Loader2, Download } from "lucide-react";
import { formatDate } from "@/lib/format";

interface ApiResponse {
  items: Partial<ProductDoc>[];
  total: number;
  page: number;
  totalPages: number;
}

interface CategoryOption {
  wc_id: number;
  name: string;
  slug: string;
  count: number;
}

const STATUS_OPTIONS: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "idle", label: "Idle" },
  { value: "pending", label: "Queued" },
  { value: "processing", label: "Processing" },
  { value: "done", label: "Needs review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];

const SCORE_OPTIONS = [
  { value: "", label: "All scores" },
  { value: "below50", label: "Below 50 — needs work" },
  { value: "above70", label: "70+ — cleared" },
];

const SORT_OPTIONS = [
  { value: "score_asc", label: "Score: low to high" },
  { value: "score_desc", label: "Score: high to low" },
  { value: "name_asc", label: "Name: A–Z" },
  { value: "synced_desc", label: "Recently synced" },
];

function ProductsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [searchInput, setSearchInput] = useState(searchParams.get("search") || "");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkRunning, setBulkRunning] = useState(false);

  const search = searchParams.get("search") || "";
  const status = searchParams.get("status") || "";
  const score = searchParams.get("score") || "";
  const category = searchParams.get("category") || "";
  const sort = searchParams.get("sort") || "score_asc";
  const page = parseInt(searchParams.get("page") || "1");

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value) params.set(key, value);
      else params.delete(key);
      if (key !== "page") params.delete("page");
      router.push(`/products?${params.toString()}`);
    },
    [router, searchParams]
  );

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setCategories(d.categories || []));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (status) params.set("status", status);
    if (score) params.set("score", score);
    if (category) params.set("category", category);
    if (sort) params.set("sort", sort);
    params.set("page", String(page));
    params.set("limit", "25");

    fetch(`/api/products?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setSelected(new Set());
      })
      .finally(() => setLoading(false));
  }, [search, status, score, category, sort, page]);

  async function runBulkAction(action: "queue" | "approve" | "reject" | "reset") {
    if (selected.size === 0) return;
    setBulkRunning(true);
    try {
      await fetch("/api/products/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected), action }),
      });
      // Перезагружаем текущую страницу
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (status) params.set("status", status);
      if (score) params.set("score", score);
      if (category) params.set("category", category);
      if (sort) params.set("sort", sort);
      params.set("page", String(page));
      params.set("limit", "25");
      const res = await fetch(`/api/products?${params.toString()}`);
      const d = await res.json();
      setData(d);
      setSelected(new Set());
    } finally {
      setBulkRunning(false);
    }
  }

  function toggleSelected(wcId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(wcId)) next.delete(wcId);
      else next.add(wcId);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!data) return;
    setSelected((prev) => {
      const allIds = data.items.map((p) => p.wc_id!).filter(Boolean);
      const allSelected = allIds.every((id) => prev.has(id));
      if (allSelected) return new Set();
      return new Set(allIds);
    });
  }

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== search) updateParam("search", searchInput);
    }, 350);
    return () => clearTimeout(t);
  }, [searchInput]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasFilters = search || status || score || category;

  return (
    <div className="p-10 max-w-6xl">
      <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--proof)" }}>
        02 — Products
      </p>
      <h1 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
        Catalog mirror
      </h1>
      <p className="mt-2 text-sm max-w-xl" style={{ color: "var(--text-on-ink-muted)" }}>
        Every product synced from WooCommerce, with its latest SEO score and review status.
        Open a row to see its full change history.
      </p>

      {/* Filters */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2"
            style={{ color: "var(--text-faint)" }}
          />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, SKU, or ID..."
            className="w-full pl-9 pr-3 py-2 rounded-md text-sm paper placeholder:text-[var(--text-faint)] focus:outline-none"
            style={{ border: "1px solid var(--paper-border)" }}
          />
        </div>

        <select
          value={status}
          onChange={(e) => updateParam("status", e.target.value)}
          className="px-3 py-2 rounded-md text-sm paper focus:outline-none"
          style={{ border: "1px solid var(--paper-border)" }}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={score}
          onChange={(e) => updateParam("score", e.target.value)}
          className="px-3 py-2 rounded-md text-sm paper focus:outline-none"
          style={{ border: "1px solid var(--paper-border)" }}
        >
          {SCORE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={category}
          onChange={(e) => updateParam("category", e.target.value)}
          className="px-3 py-2 rounded-md text-sm paper focus:outline-none"
          style={{ border: "1px solid var(--paper-border)" }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c.wc_id} value={c.wc_id}>
              {c.name} ({c.count})
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(e) => updateParam("sort", e.target.value)}
          className="px-3 py-2 rounded-md text-sm paper focus:outline-none"
          style={{ border: "1px solid var(--paper-border)" }}
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        {hasFilters && (
          <button
            onClick={() => {
              setSearchInput("");
              router.push("/products");
            }}
            className="flex items-center gap-1 text-xs px-2.5 py-2 rounded-md transition-colors"
            style={{ color: "var(--text-on-ink-muted)" }}
          >
            <X size={13} /> Clear
          </button>
        )}

        <a
          href={(() => {
            const params = new URLSearchParams();
            if (search) params.set("search", search);
            if (status) params.set("status", status);
            if (score) params.set("score", score);
            if (category) params.set("category", category);
            return `/api/products/export?${params.toString()}`;
          })()}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-2 rounded-md transition-colors"
          style={{ background: "var(--ink-soft)", color: "var(--text-on-ink-muted)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <Download size={13} /> Export CSV
        </a>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div
          className="mt-4 flex items-center gap-3 px-4 py-2.5 rounded-md flex-wrap"
          style={{ background: "var(--ink-soft)", border: "1px solid rgba(255,92,40,0.25)" }}
        >
          <span className="text-sm font-medium">
            {selected.size} selected
          </span>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => runBulkAction("queue")}
              disabled={bulkRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--proof)", color: "#15191e" }}
            >
              <ListPlus size={13} /> Queue for AI
            </button>
            <button
              onClick={() => runBulkAction("approve")}
              disabled={bulkRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--approved)", color: "#0e2818" }}
            >
              <Check size={13} /> Approve
            </button>
            <button
              onClick={() => runBulkAction("reject")}
              disabled={bulkRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-on-ink-muted)" }}
            >
              <X size={13} /> Reject
            </button>
            <button
              onClick={() => runBulkAction("reset")}
              disabled={bulkRunning}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-40"
              style={{ background: "rgba(255,255,255,0.08)", color: "var(--text-on-ink-muted)" }}
            >
              <RotateCcw size={13} /> Reset
            </button>
            {bulkRunning && <Loader2 size={14} className="animate-spin" style={{ color: "var(--text-on-ink-muted)" }} />}
          </div>
          <span className="text-[0.7rem]" style={{ color: "var(--text-faint)" }}>
            &quot;Queue for AI&quot; marks products as pending — run{" "}
            <code className="font-mono">node src/queue/worker.js</code> to process them.
          </span>
        </div>
      )}

      {/* Table */}
      <div className="mt-6 paper rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ borderBottom: "1px solid var(--paper-border)" }}>
              <th className="py-3 px-3 w-8">
                <input
                  type="checkbox"
                  checked={!!data?.items.length && data.items.every((p) => selected.has(p.wc_id!))}
                  onChange={toggleSelectAll}
                  className="cursor-pointer"
                />
              </th>
              <th className="text-left py-3 px-5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                Product
              </th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase tracking-wider w-24" style={{ color: "var(--text-muted)" }}>
                SKU
              </th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase tracking-wider w-24" style={{ color: "var(--text-muted)" }}>
                Score
              </th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase tracking-wider w-36" style={{ color: "var(--text-muted)" }}>
                Category
              </th>
              <th className="text-left py-3 px-4 font-medium text-xs uppercase tracking-wider w-36" style={{ color: "var(--text-muted)" }}>
                Status
              </th>
              <th className="text-left py-3 px-5 font-medium text-xs uppercase tracking-wider w-28" style={{ color: "var(--text-muted)" }}>
                Synced
              </th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                  Loading...
                </td>
              </tr>
            )}
            {!loading && data?.items.length === 0 && (
              <tr>
                <td colSpan={7} className="py-10 text-center text-sm" style={{ color: "var(--text-faint)" }}>
                  No products match these filters.
                </td>
              </tr>
            )}
            {!loading &&
              data?.items.map((p) => (
                <tr
                  key={p.wc_id}
                  onClick={() => router.push(`/products/${p.wc_id}`)}
                  className="cursor-pointer transition-colors hover:bg-[var(--paper-dim)]"
                  style={{ borderTop: "1px solid var(--paper-border)" }}
                >
                  <td className="py-3 px-3" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(p.wc_id!)}
                      onChange={() => toggleSelected(p.wc_id!)}
                      className="cursor-pointer"
                    />
                  </td>
                  <td className="py-3 px-5">
                    <div className="flex items-center gap-2">
                      <span className="truncate max-w-md">{p.name}</span>
                      <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-faint)" }}>
                        #{p.wc_id}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 font-mono text-xs" style={{ color: "var(--text-muted)" }}>
                    {p.sku || "—"}
                  </td>
                  <td className="py-3 px-4">
                    <ScoreStamp score={p.seo_score?.total ?? 0} size="sm" />
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex flex-wrap gap-1">
                      {(p.categories ?? []).slice(0, 2).map((c: any) => (
                        <span
                          key={c.id}
                          className="text-[0.7rem] px-1.5 py-0.5 rounded"
                          style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
                        >
                          {c.name}
                        </span>
                      ))}
                      {(p.categories ?? []).length === 0 && (
                        <span style={{ color: "var(--text-faint)" }}>—</span>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <StatusBadge status={(p.task_status ?? "idle") as TaskStatus} />
                  </td>
                  <td className="py-3 px-5 text-xs font-mono" style={{ color: "var(--text-faint)" }}>
                    {p.wc_synced_at ? formatDate(p.wc_synced_at) : "—"}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-xs" style={{ color: "var(--text-on-ink-muted)" }}>
            {data.total} products &middot; page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => updateParam("page", String(page - 1))}
              className="p-1.5 rounded-md disabled:opacity-30 transition-colors"
              style={{ background: "var(--ink-soft)" }}
            >
              <ChevronLeft size={15} />
            </button>
            <button
              disabled={page >= data.totalPages}
              onClick={() => updateParam("page", String(page + 1))}
              className="p-1.5 rounded-md disabled:opacity-30 transition-colors"
              style={{ background: "var(--ink-soft)" }}
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProductsPage() {
  return (
    <Suspense fallback={<div className="p-10 text-sm" style={{ color: "var(--text-on-ink-muted)" }}>Loading...</div>}>
      <ProductsContent />
    </Suspense>
  );
}
