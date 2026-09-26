import { connectDB } from "@/lib/db";
import { Product } from "@/lib/models/Product";
import { notFound } from "next/navigation";
import Link from "next/link";
import ScoreStamp from "@/components/ScoreStamp";
import StatusBadge from "@/components/StatusBadge";
import SeoEditor from "@/components/SeoEditor";
import AiEnhancePanel from "@/components/AiEnhancePanel";
import HistoryTimeline from "@/components/HistoryTimeline";
import { ArrowLeft } from "lucide-react";
import type { HistoryEntry, TaskStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(s: string, n = 140) {
  const t = stripHtml(s);
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await connectDB();
  const doc = await Product.findOne({ wc_id: Number(id) }).lean();

  if (!doc) notFound();
  const p = doc as any;

  const history: HistoryEntry[] = JSON.parse(JSON.stringify([...(p.history || [])].reverse()));

  return (
    <div className="p-10 max-w-4xl">
      <Link
        href="/products"
        className="inline-flex items-center gap-1.5 text-xs"
        style={{ color: "var(--text-on-ink-muted)" }}
      >
        <ArrowLeft size={13} /> Back to products
      </Link>

      <div className="mt-4 flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--proof)" }}>
            #{p.wc_id} {p.sku ? `· ${p.sku}` : ""}
          </p>
          <h1 className="mt-2 text-2xl font-bold leading-tight" style={{ fontFamily: "var(--font-display)" }}>
            {p.name}
          </h1>
          <div className="mt-3 flex items-center gap-3">
            <StatusBadge status={(p.task_status ?? "idle") as TaskStatus} />
            {p.slug && (
              <span className="text-xs font-mono" style={{ color: "var(--text-on-ink-muted)" }}>
                /{p.slug}
              </span>
            )}
          </div>
        </div>
        <ScoreStamp score={p.seo_score?.total ?? 0} size="lg" />
      </div>

      {/* Score breakdown */}
      <div className="mt-8 paper rounded-lg p-5">
        <h2 className="text-xs uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
          SEO score breakdown
        </h2>
        <div className="grid grid-cols-5 gap-2">
          {[
            ["Title", p.seo_score?.title],
            ["Meta", p.seo_score?.meta_desc],
            ["Keyword", p.seo_score?.keyword],
            ["Content", p.seo_score?.content],
            ["Images", p.seo_score?.images],
          ].map(([label, val]) => (
            <div key={label as string} className="text-center">
              <p className="text-base font-mono font-bold" style={{ color: scoreColor(val as number) }}>
                {val ?? 0}
              </p>
              <p className="text-[0.65rem] uppercase tracking-wider mt-0.5" style={{ color: "var(--text-faint)" }}>
                {label}
              </p>
            </div>
          ))}
        </div>
        {p.categories?.length > 0 && (
          <div className="mt-4 pt-4 flex flex-wrap gap-1.5" style={{ borderTop: "1px solid var(--paper-border)" }}>
            {p.categories.map((c: any) => (
              <span
                key={c.id}
                className="text-[0.7rem] px-2 py-0.5 rounded"
                style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
              >
                {c.name}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* SEO Editor */}
      <div className="mt-6">
        <SeoEditor
          wcId={p.wc_id}
          initial={{
            name: p.name || "",
            slug: p.slug || "",
            meta_title: p.meta_title || "",
            meta_description: p.meta_description || "",
            focus_keyword: p.focus_keyword || "",
            short_description: p.short_description || "",
            description: p.description || "",
          }}
          images={JSON.parse(JSON.stringify(p.images || []))}
        />
      </div>

      {/* AI Enhance trigger */}
      <div className="mt-6">
        <AiEnhancePanel wcId={p.wc_id} hasSuggestion={!!p.ai_suggestion} />
      </div>

      {/* AI suggestion */}
      {p.ai_suggestion && (
        <div className="mt-6 rounded-lg p-5" style={{ background: "var(--ink-soft)", border: "1px solid rgba(255,92,40,0.3)" }}>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--proof)" }}>
              AI suggestion — pending review
            </h2>
            <span className="text-xs font-mono" style={{ color: "var(--text-on-ink-muted)" }}>
              mode: {p.ai_suggestion.mode || "all"}
            </span>
          </div>
          <dl className="space-y-3 text-sm">
            <DiffField label="Meta title" oldVal={p.meta_title} newVal={p.ai_suggestion.meta_title} />
            <DiffField label="Meta description" oldVal={p.meta_description} newVal={p.ai_suggestion.meta_description} />
            <DiffField label="Focus keyword" oldVal={p.focus_keyword} newVal={p.ai_suggestion.focus_keyword} />
            {p.ai_suggestion.short_description && (
              <DiffField
                label="Short description"
                oldVal={p.short_description ? truncate(p.short_description, 200) : ""}
                newVal={truncate(p.ai_suggestion.short_description, 200)}
              />
            )}
            {p.ai_suggestion.description && (
              <DiffField
                label="Description"
                oldVal={p.description ? truncate(p.description, 200) : ""}
                newVal={truncate(p.ai_suggestion.description, 200)}
              />
            )}
          </dl>
          <p className="mt-4 text-xs leading-relaxed" style={{ color: "var(--text-on-ink-muted)" }}>
            Review and act on this from the{" "}
            <Link href="/queue" className="underline" style={{ color: "var(--proof)" }}>
              Queue page
            </Link>
            . Approving here only updates the review status — actual import to WooCommerce
            runs via <code className="font-mono">import.js</code> with its diff &amp; backup safeguards.
          </p>
        </div>
      )}

      {/* History */}
      <HistoryTimeline history={history} />
    </div>
  );
}

function scoreColor(score: number) {
  if (score >= 70) return "var(--approved)";
  if (score >= 40) return "var(--warn)";
  return "var(--proof)";
}

function DiffField({ label, oldVal, newVal }: { label: string; oldVal?: string; newVal?: string }) {
  if (!newVal) return null;
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider" style={{ color: "var(--text-on-ink-muted)" }}>
        {label}
      </dt>
      <dd className="mt-1 flex flex-col gap-1">
        <span className="text-sm" style={{ color: "rgba(255,92,40,0.7)", textDecoration: "line-through" }}>
          {oldVal || "(empty)"}
        </span>
        <span className="text-sm" style={{ color: "var(--approved)" }}>
          {newVal}
        </span>
      </dd>
    </div>
  );
}
