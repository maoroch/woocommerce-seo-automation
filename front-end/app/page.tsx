import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";
import type { OverviewStats, TaskStatus } from "@/lib/types";
import ScoreStamp from "@/components/ScoreStamp";
import StatusBadge from "@/components/StatusBadge";
import Link from "next/link";
import { ArrowUpRight, Database, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

async function getOverview(): Promise<OverviewStats> {
  await connectDB();
  const total = await Product.countDocuments();

  if (total === 0) {
    return {
      total: 0, avgScore: 0, minScore: 0, maxScore: 0, below50: 0, above70: 0,
      lastSync: null,
      statusCounts: { idle: 0, pending: 0, processing: 0, done: 0, approved: 0, rejected: 0 },
    };
  }

  const [scoreAgg, statusAgg, lastSyncDoc] = await Promise.all([
    Product.aggregate([
      { $group: { _id: null, avg: { $avg: "$seo_score.total" }, min: { $min: "$seo_score.total" }, max: { $max: "$seo_score.total" },
        below50: { $sum: { $cond: [{ $lt: ["$seo_score.total", 50] }, 1, 0] } },
        above70: { $sum: { $cond: [{ $gte: ["$seo_score.total", 70] }, 1, 0] } } } },
    ]),
    Product.aggregate([{ $group: { _id: "$task_status", count: { $sum: 1 } } }]),
    Product.findOne({}, { wc_synced_at: 1 }).sort({ wc_synced_at: -1 }),
  ]);

  const score = scoreAgg[0] || {};
  const statusCounts: Record<TaskStatus, number> = { idle: 0, pending: 0, processing: 0, done: 0, approved: 0, rejected: 0 };
  for (const s of statusAgg) if (s._id in statusCounts) statusCounts[s._id as TaskStatus] = s.count;

  return {
    total,
    avgScore: Math.round(score.avg ?? 0),
    minScore: score.min ?? 0,
    maxScore: score.max ?? 0,
    below50: score.below50 ?? 0,
    above70: score.above70 ?? 0,
    lastSync: lastSyncDoc?.wc_synced_at ? new Date(lastSyncDoc.wc_synced_at).toISOString() : null,
    statusCounts,
  };
}

async function getRecentHistory() {
  await connectDB();
  const docs = await Product.find({ "history.0": { $exists: true } })
    .select("wc_id name history")
    .lean();

  const entries: any[] = [];
  for (const d of docs as any[]) {
    for (const h of d.history) {
      entries.push({ wc_id: d.wc_id, name: d.name, ...h });
    }
  }
  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return entries.slice(0, 8);
}

async function getCategoryScores() {
  await connectDB();
  const results = await Product.aggregate([
    { $unwind: "$categories" },
    {
      $group: {
        _id: { id: "$categories.id", name: "$categories.name" },
        avgScore: { $avg: "$seo_score.total" },
        count: { $sum: 1 },
        below50: { $sum: { $cond: [{ $lt: ["$seo_score.total", 50] }, 1, 0] } },
      },
    },
    { $sort: { avgScore: 1 } },
    { $limit: 8 },
  ]);

  return results.map((r) => ({
    id: r._id.id,
    name: r._id.name,
    avgScore: Math.round(r.avgScore ?? 0),
    count: r.count,
    below50: r.below50,
  }));
}

function formatRelative(iso: string | null) {
  if (!iso) return "Never synced";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const ACTION_LABEL: Record<string, string> = {
  sync: "Synced",
  ai_enhance: "AI enhanced",
  import: "Imported",
  rollback: "Rolled back",
  manual: "Manual",
};

export default async function DashboardPage() {
  const [stats, recent, categoryScores] = await Promise.all([
    getOverview(),
    getRecentHistory(),
    getCategoryScores(),
  ]);

  if (stats.total === 0) {
    return (
      <div className="p-10 max-w-2xl">
        <Eyebrow />
        <h1 className="mt-3 text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          The desk is empty.
        </h1>
        <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--text-on-ink-muted)" }}>
          No products have been synced from WooCommerce yet. Run the sync command from the
          server to mirror your catalog into MongoDB:
        </p>
        <pre className="mt-4 p-4 rounded-md text-xs font-mono paper overflow-x-auto">
          node src/commands/sync.js --category="Логгеры"
        </pre>
      </div>
    );
  }

  const needsWork = stats.below50;
  const goodShare = Math.round((stats.above70 / stats.total) * 100);

  return (
    <div className="p-10 max-w-6xl">
      <Eyebrow />
      <div className="flex items-end justify-between flex-wrap gap-4 mt-3">
        <h1 className="text-3xl font-bold" style={{ fontFamily: "var(--font-display)" }}>
          {stats.total} products on file
        </h1>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-on-ink-muted)" }}>
          <RefreshCw size={13} />
          Last sync: {formatRelative(stats.lastSync)}
        </div>
      </div>

      {/* Signature: score stamps row */}
      <div className="mt-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="paper rounded-lg p-5 flex items-center gap-4 md:col-span-1">
          <ScoreStamp score={stats.avgScore} size="lg" />
          <div>
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
              Average score
            </p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Range {stats.minScore}&ndash;{stats.maxScore}
            </p>
          </div>
        </div>

        <Link
          href="/products?score=below50"
          className="rounded-lg p-5 flex flex-col justify-between transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--ink-soft)", border: "1px solid rgba(255,92,40,0.25)" }}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--proof)" }}>
              Needs work
            </p>
            <ArrowUpRight size={15} style={{ color: "var(--proof)" }} />
          </div>
          <p className="text-3xl font-bold font-mono mt-2">{needsWork}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-on-ink-muted)" }}>
            Score under 50
          </p>
        </Link>

        <Link
          href="/products?score=above70"
          className="rounded-lg p-5 flex flex-col justify-between transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--ink-soft)", border: "1px solid rgba(63,166,107,0.25)" }}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--approved)" }}>
              Cleared
            </p>
            <ArrowUpRight size={15} style={{ color: "var(--approved)" }} />
          </div>
          <p className="text-3xl font-bold font-mono mt-2">{stats.above70}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-on-ink-muted)" }}>
            {goodShare}% of catalog scores 70+
          </p>
        </Link>

        <Link
          href="/queue"
          className="rounded-lg p-5 flex flex-col justify-between transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--ink-soft)", border: "1px solid rgba(255,255,255,0.08)" }}
        >
          <div className="flex items-start justify-between">
            <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-on-ink-muted)" }}>
              Awaiting review
            </p>
            <ArrowUpRight size={15} style={{ color: "var(--text-on-ink-muted)" }} />
          </div>
          <p className="text-3xl font-bold font-mono mt-2">{stats.statusCounts.done}</p>
          <p className="text-xs mt-1" style={{ color: "var(--text-on-ink-muted)" }}>
            {stats.statusCounts.pending} queued, {stats.statusCounts.processing} processing
          </p>
        </Link>
      </div>

      {/* Status ledger */}
      <div className="mt-10">
        <h2
          className="text-xs uppercase tracking-widest mb-3 flex items-center gap-2"
          style={{ color: "var(--text-on-ink-muted)" }}
        >
          <Database size={13} /> Task status ledger
        </h2>
        <div className="paper rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {(Object.keys(stats.statusCounts) as TaskStatus[]).map((status, i) => (
                <tr key={status} style={{ borderTop: i === 0 ? "none" : "1px solid var(--paper-border)" }}>
                  <td className="py-2.5 px-5 w-40">
                    <StatusBadge status={status} />
                  </td>
                  <td className="py-2.5 px-5 font-mono tabular-nums" style={{ color: "var(--text-strong)" }}>
                    {stats.statusCounts[status]}
                  </td>
                  <td className="py-2.5 px-5 w-full">
                    <div className="h-1.5 rounded-full bg-[var(--paper-dim)] overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.max((stats.statusCounts[status] / stats.total) * 100, stats.statusCounts[status] > 0 ? 2 : 0)}%`,
                          background: "var(--proof)",
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Category breakdown */}
      {categoryScores.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-on-ink-muted)" }}>
            Score by category
          </h2>
          <div className="paper rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: "1px solid var(--paper-border)" }}>
                  <th className="text-left py-2.5 px-5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    Category
                  </th>
                  <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wider w-20" style={{ color: "var(--text-muted)" }}>
                    Avg
                  </th>
                  <th className="text-left py-2.5 px-4 font-medium text-xs uppercase tracking-wider w-24" style={{ color: "var(--text-muted)" }}>
                    Products
                  </th>
                  <th className="text-left py-2.5 px-5 font-medium text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                    &lt; 50
                  </th>
                </tr>
              </thead>
              <tbody>
                {categoryScores.map((c, i) => (
                  <tr key={c.id} style={{ borderTop: i === 0 ? "none" : "1px solid var(--paper-border)" }}>
                    <td className="py-2.5 px-5">
                      <Link href={`/products?category=${c.id}`} className="hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="py-2.5 px-4">
                      <span
                        className="font-mono font-bold text-sm"
                        style={{ color: c.avgScore >= 70 ? "var(--approved)" : c.avgScore >= 40 ? "var(--warn)" : "var(--proof)" }}
                      >
                        {c.avgScore}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums" style={{ color: "var(--text-muted)" }}>
                      {c.count}
                    </td>
                    <td className="py-2.5 px-5 font-mono tabular-nums" style={{ color: c.below50 > 0 ? "var(--proof)" : "var(--text-faint)" }}>
                      {c.below50}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent activity */}
      <div className="mt-10">
        <h2 className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--text-on-ink-muted)" }}>
          Recent activity
        </h2>
        {recent.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-on-ink-muted)" }}>
            No history yet — sync or run an import to populate the log.
          </p>
        ) : (
          <div className="paper rounded-lg divide-y" style={{ borderColor: "var(--paper-border)" }}>
            {recent.map((entry, i) => (
              <Link
                key={i}
                href={`/products/${entry.wc_id}`}
                className="flex items-center justify-between px-5 py-3 hover:bg-[var(--paper-dim)] transition-colors"
                style={{ borderColor: "var(--paper-border)" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className="text-[0.65rem] font-mono shrink-0 px-1.5 py-0.5 rounded"
                    style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
                  >
                    {ACTION_LABEL[entry.action] ?? entry.action}
                  </span>
                  <span className="text-sm truncate">{entry.name}</span>
                  <span className="text-xs font-mono shrink-0" style={{ color: "var(--text-faint)" }}>
                    #{entry.wc_id}
                  </span>
                </div>
                <span className="text-xs shrink-0 ml-4" style={{ color: "var(--text-faint)" }}>
                  {formatRelative(entry.created_at)}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Eyebrow() {
  return (
    <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--proof)" }}>
      01 — Dashboard
    </p>
  );
}
