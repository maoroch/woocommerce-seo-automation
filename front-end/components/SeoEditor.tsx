"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Save, Loader2, AlertTriangle, CheckCircle2, Code, Eye } from "lucide-react";
import ImageGallery from "@/components/ImageGallery";

interface ProductImage {
  id?: number;
  src: string;
  alt?: string;
  title?: string;
}

interface Props {
  wcId: number;
  initial: {
    name: string;
    slug: string;
    meta_title: string;
    meta_description: string;
    focus_keyword: string;
    short_description: string;
    description: string;
  };
  images: ProductImage[];
}

interface ValidationError {
  field?: string;
  message?: string;
  [key: string]: any;
}

type PushResult =
  | { ok: true; changesCount: number; scoreBefore: number | null; scoreAfter: number }
  | { ok: false; message: string; validationErrors?: ValidationError[] };

function stripHtml(s: string) {
  return (s || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

const PAYLOAD_LABELS: Record<string, string> = {
  name: "Title",
  slug: "Slug",
  meta_title: "Meta title",
  meta_description: "Meta description",
  focus_keyword: "Focus keyword",
  short_description: "Short description",
  description: "Description",
  images: "Image alt text",
};

export default function SeoEditor({ wcId, initial, images }: Props) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [imageEdits, setImageEdits] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<PushResult | null>(null);

  const fieldsDirty =
    form.name !== initial.name ||
    form.slug !== initial.slug ||
    form.meta_title !== initial.meta_title ||
    form.meta_description !== initial.meta_description ||
    form.focus_keyword !== initial.focus_keyword ||
    form.short_description !== initial.short_description ||
    form.description !== initial.description;

  const imagesDirty = Object.entries(imageEdits).some(([id, alt]) => {
    const img = images.find((i) => i.id === Number(id));
    return alt !== (img?.alt || "");
  });

  const dirty = fieldsDirty || imagesDirty;

  function update<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setConfirming(false);
  }

  function updateImageAlt(imageId: number, alt: string) {
    setImageEdits((prev) => ({ ...prev, [imageId]: alt }));
    setConfirming(false);
  }

  function buildPayload(): Record<string, any> {
    const payload: Record<string, any> = {};
    if (form.name !== initial.name) payload.name = form.name;
    if (form.slug !== initial.slug) payload.slug = form.slug;
    if (form.meta_title !== initial.meta_title) payload.meta_title = form.meta_title;
    if (form.meta_description !== initial.meta_description)
      payload.meta_description = form.meta_description;
    if (form.focus_keyword !== initial.focus_keyword) payload.focus_keyword = form.focus_keyword;
    if (form.short_description !== initial.short_description)
      payload.short_description = form.short_description;
    if (form.description !== initial.description) payload.description = form.description;

    const changedImages = Object.entries(imageEdits)
      .filter(([id, alt]) => {
        const img = images.find((i) => i.id === Number(id));
        return alt !== (img?.alt || "");
      })
      .map(([id, alt]) => ({ id: Number(id), alt }));

    if (changedImages.length > 0) payload.images = changedImages;

    return payload;
  }

  async function confirmAndPush() {
    setSaving(true);
    setResult(null);
    try {
      const payload = buildPayload();

      const res = await fetch(`/api/products/${wcId}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) {
        setResult({
          ok: false,
          message: data.error || "Push failed",
          validationErrors: data.validationErrors,
        });
        return;
      }

      if (data.noop) {
        setResult({ ok: true, changesCount: 0, scoreBefore: null, scoreAfter: 0 });
        return;
      }

      setResult({
        ok: true,
        changesCount: Object.keys(data.changes || {}).length,
        scoreBefore: data.seoScoreBefore,
        scoreAfter: data.seoScoreAfter,
      });

      router.refresh();
    } catch (err: any) {
      setResult({ ok: false, message: err.message || "Network error" });
    } finally {
      setSaving(false);
      setConfirming(false);
    }
  }

  const titleLen = form.meta_title.length;
  const descLen = form.meta_description.length;
  const payload = buildPayload();

  return (
    <div className="rounded-lg p-5" style={{ background: "var(--ink-soft)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-widest" style={{ color: "var(--text-on-ink-muted)" }}>
          Edit product fields
        </h2>
        {dirty && (
          <span className="text-[0.7rem] px-2 py-0.5 rounded" style={{ background: "rgba(255,92,40,0.15)", color: "var(--proof)" }}>
            Unsaved changes
          </span>
        )}
      </div>

      <div className="space-y-4">
        <FieldInput label="Product title" value={form.name} onChange={(v) => update("name", v)} />

        <FieldInput
          label="Slug"
          value={form.slug}
          onChange={(v) => update("slug", v)}
          hint="Changing this updates the product URL — old links will 404 unless redirected"
          mono
        />

        <FieldInput
          label="Meta title (Rank Math)"
          value={form.meta_title}
          onChange={(v) => update("meta_title", v)}
          hint={`${titleLen} chars · ideal 50–60`}
          warn={titleLen > 0 && (titleLen < 50 || titleLen > 60)}
        />

        <FieldTextarea
          label="Meta description (Rank Math)"
          value={form.meta_description}
          onChange={(v) => update("meta_description", v)}
          hint={`${descLen} chars · ideal 120–160`}
          warn={descLen > 0 && (descLen < 120 || descLen > 160)}
          rows={3}
        />

        <FieldInput
          label="Focus keyword (Rank Math)"
          value={form.focus_keyword}
          onChange={(v) => update("focus_keyword", v)}
        />

        <HtmlFieldEditor
          label="Short description"
          value={form.short_description}
          onChange={(v) => update("short_description", v)}
          rows={4}
        />

        <HtmlFieldEditor
          label="Description"
          value={form.description}
          onChange={(v) => update("description", v)}
          rows={10}
        />

        <div>
          <label className="text-xs uppercase tracking-wider mb-2 block" style={{ color: "var(--text-on-ink-muted)" }}>
            Images
          </label>
          <ImageGallery images={images} edits={imageEdits} onChange={updateImageAlt} />
        </div>
      </div>

      {/* Diff preview */}
      {confirming && dirty && (
        <div className="mt-5 rounded-md p-4" style={{ background: "var(--ink)", border: "1px solid rgba(255,92,40,0.3)" }}>
          <p className="text-xs uppercase tracking-widest mb-3" style={{ color: "var(--proof)" }}>
            Review before pushing to WooCommerce
          </p>
          <div className="space-y-3">
            {Object.entries(payload).map(([field, newVal]) => {
              if (field === "images") {
                return (
                  <div key={field} className="text-xs">
                    <p className="uppercase tracking-wider mb-1" style={{ color: "var(--text-on-ink-muted)" }}>
                      {PAYLOAD_LABELS[field]}
                    </p>
                    {(newVal as { id: number; alt: string }[]).map((img) => {
                      const original = images.find((i) => i.id === img.id);
                      return (
                        <div key={img.id} className="mb-1">
                          <span className="font-mono" style={{ color: "var(--text-faint)" }}>
                            #{img.id}:{" "}
                          </span>
                          <span style={{ color: "rgba(255,92,40,0.7)", textDecoration: "line-through" }}>
                            {original?.alt || "(empty)"}
                          </span>{" "}
                          <span style={{ color: "var(--approved)" }}>→ {img.alt || "(empty)"}</span>
                        </div>
                      );
                    })}
                  </div>
                );
              }

              const isHtml = field === "description" || field === "short_description";
              const oldVal = (initial as any)[field] ?? "";
              return (
                <div key={field} className="text-xs">
                  <p className="uppercase tracking-wider mb-1" style={{ color: "var(--text-on-ink-muted)" }}>
                    {PAYLOAD_LABELS[field] ?? field}
                  </p>
                  <p style={{ color: "rgba(255,92,40,0.7)", textDecoration: "line-through" }}>
                    {isHtml ? stripHtml(oldVal) : oldVal || "(empty)"}
                  </p>
                  <p style={{ color: "var(--approved)" }}>
                    {isHtml ? stripHtml(String(newVal)) : String(newVal) || "(empty)"}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-5 flex items-center gap-3">
        {!confirming ? (
          <button
            onClick={() => setConfirming(true)}
            disabled={!dirty || saving}
            className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
            style={{ background: "var(--proof)", color: "#15191e" }}
          >
            <Save size={14} />
            Save &amp; Push to WooCommerce
          </button>
        ) : (
          <>
            <button
              onClick={confirmAndPush}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--proof)", color: "#15191e" }}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Confirm push
            </button>
            <button
              onClick={() => setConfirming(false)}
              disabled={saving}
              className="px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
              style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
            >
              Cancel
            </button>
          </>
        )}

        {!dirty && !result && (
          <span className="text-xs" style={{ color: "var(--text-faint)" }}>
            No changes yet
          </span>
        )}
      </div>

      {result && (
        <div className="mt-4">
          {result.ok ? (
            result.changesCount === 0 ? (
              <Notice icon={<CheckCircle2 size={14} />} color="var(--text-on-ink-muted)">
                Nothing to update — values already match WooCommerce.
              </Notice>
            ) : (
              <Notice icon={<CheckCircle2 size={14} />} color="var(--approved)">
                Pushed {result.changesCount} field{result.changesCount > 1 ? "s" : ""} to
                WooCommerce. Backup created.
                {result.scoreBefore != null && (
                  <> SEO score: {result.scoreBefore} → {result.scoreAfter}.</>
                )}
              </Notice>
            )
          ) : (
            <div>
              <Notice icon={<AlertTriangle size={14} />} color="var(--proof)">
                {result.message}
              </Notice>
              {result.validationErrors?.length ? (
                <ul className="mt-2 space-y-1 pl-1">
                  {result.validationErrors.map((e, i) => (
                    <li key={i} className="text-xs" style={{ color: "var(--proof)" }}>
                      {e.message || JSON.stringify(e)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Notice({
  icon,
  color,
  children,
}: {
  icon: React.ReactNode;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-xs leading-relaxed" style={{ color }}>
      <span className="mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  hint,
  warn,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  warn?: boolean;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <label className="text-xs uppercase tracking-wider" style={{ color: "var(--text-on-ink-muted)" }}>
          {label}
        </label>
        {hint && (
          <span
            className="text-[0.7rem] font-mono text-right"
            style={{ color: warn ? "var(--proof)" : "var(--text-faint)" }}
          >
            {hint}
          </span>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full px-3 py-2 rounded-md text-sm paper focus:outline-none"
        style={{ border: "1px solid var(--paper-border)", fontFamily: mono ? "var(--font-mono)" : undefined }}
      />
    </div>
  );
}

function FieldTextarea({
  label,
  value,
  onChange,
  hint,
  warn,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  warn?: boolean;
  rows?: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-xs uppercase tracking-wider" style={{ color: "var(--text-on-ink-muted)" }}>
          {label}
        </label>
        {hint && (
          <span className="text-[0.7rem] font-mono" style={{ color: warn ? "var(--proof)" : "var(--text-faint)" }}>
            {hint}
          </span>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        className="mt-1.5 w-full px-3 py-2 rounded-md text-sm paper focus:outline-none resize-none"
        style={{ border: "1px solid var(--paper-border)" }}
      />
    </div>
  );
}

/**
 * HTML field editor — toggle between editing raw HTML and viewing a
 * rendered preview (using the .html-preview typography).
 */
function HtmlFieldEditor({
  label,
  value,
  onChange,
  rows = 6,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  const [mode, setMode] = useState<"code" | "preview">("code");

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs uppercase tracking-wider" style={{ color: "var(--text-on-ink-muted)" }}>
          {label}
        </label>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setMode("code")}
            className="flex items-center gap-1 text-[0.7rem] px-2 py-1 rounded-md transition-colors"
            style={{
              background: mode === "code" ? "var(--paper-dim)" : "transparent",
              color: mode === "code" ? "var(--text-strong)" : "var(--text-on-ink-muted)",
            }}
          >
            <Code size={12} /> HTML
          </button>
          <button
            onClick={() => setMode("preview")}
            className="flex items-center gap-1 text-[0.7rem] px-2 py-1 rounded-md transition-colors"
            style={{
              background: mode === "preview" ? "var(--paper-dim)" : "transparent",
              color: mode === "preview" ? "var(--text-strong)" : "var(--text-on-ink-muted)",
            }}
          >
            <Eye size={12} /> Preview
          </button>
        </div>
      </div>

      {mode === "code" ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={rows}
          className="w-full px-3 py-2 rounded-md text-xs font-mono paper focus:outline-none resize-none"
          style={{ border: "1px solid var(--paper-border)" }}
          spellCheck={false}
        />
      ) : (
        <div
          className="paper rounded-md p-3 overflow-y-auto"
          style={{ border: "1px solid var(--paper-border)", maxHeight: rows * 28 + 40 }}
        >
          {value?.trim() ? (
            <div className="html-preview text-sm" dangerouslySetInnerHTML={{ __html: value }} />
          ) : (
            <p className="text-xs" style={{ color: "var(--text-faint)" }}>
              Empty
            </p>
          )}
        </div>
      )}
    </div>
  );
}
