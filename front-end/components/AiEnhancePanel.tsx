"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, AlertTriangle, BookOpen, ChevronDown } from "lucide-react";

interface Props {
  wcId: number;
  hasSuggestion: boolean;
}

interface ProviderStatus {
  default: string;
  openrouter: { ok: boolean; error?: string; defaultModel?: string; models?: string[] };
  ollama: { ok: boolean; error?: string; defaultModel?: string; models?: string[]; baseUrl?: string };
}

interface ObsidianNote {
  id: string;
  title: string;
  path: string;
  size: number;
}

const MODE_OPTIONS = [
  { value: "all", label: "Everything (SEO + content)" },
  { value: "seo", label: "SEO fields only" },
  { value: "content", label: "Content only" },
];

export default function AiEnhancePanel({ wcId, hasSuggestion }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<ProviderStatus | null>(null);
  const [provider, setProvider] = useState<string>("openrouter");
  const [mode, setMode] = useState("all");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<ObsidianNote[]>([]);
  const [selectedNotes, setSelectedNotes] = useState<Set<string>>(new Set());
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    fetch("/api/ai-status")
      .then((r) => r.json())
      .then((d: ProviderStatus) => {
        setStatus(d);
        setProvider(d.default);
      })
      .catch(() => {});

    fetch("/api/obsidian/notes")
      .then((r) => r.json())
      .then((d) => setNotes(d.notes || []))
      .catch(() => {});
  }, []);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/products/${wcId}/ai-enhance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, provider, obsidianNotes: Array.from(selectedNotes) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "AI enhancement failed");
        return;
      }
      router.refresh();
    } catch (err: any) {
      setError(err.message || "Network error");
    } finally {
      setRunning(false);
    }
  }

  const providerOk = status?.[provider as "openrouter" | "ollama"]?.ok;

  function toggleNote(id: string) {
    setSelectedNotes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="rounded-lg p-5" style={{ background: "var(--ink-soft)", border: "1px dashed rgba(255,255,255,0.15)" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs uppercase tracking-widest flex items-center gap-1.5" style={{ color: "var(--text-on-ink-muted)" }}>
          <Sparkles size={13} /> Generate AI suggestion
        </h2>
        {hasSuggestion && (
          <span className="text-[0.7rem] px-2 py-0.5 rounded" style={{ background: "rgba(63,166,107,0.15)", color: "var(--approved)" }}>
            Suggestion ready below
          </span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="px-3 py-2 rounded-md text-sm paper focus:outline-none"
          style={{ border: "1px solid var(--paper-border)" }}
        >
          {MODE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>

        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="px-3 py-2 rounded-md text-sm paper focus:outline-none"
          style={{ border: "1px solid var(--paper-border)" }}
        >
          <option value="openrouter">
            OpenRouter {status && !status.openrouter.ok ? "(unavailable)" : ""}
          </option>
          <option value="ollama">
            Ollama (local) {status && !status.ollama.ok ? "(unavailable)" : ""}
          </option>
        </select>

        <button
          onClick={run}
          disabled={running || (status ? !providerOk : false)}
          className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors disabled:opacity-40"
          style={{ background: "var(--proof)", color: "#15191e" }}
        >
          {running ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {running ? "Generating..." : "Generate"}
        </button>
      </div>

      {notes.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setNotesOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs"
            style={{ color: "var(--text-on-ink-muted)" }}
          >
            <BookOpen size={13} />
            Obsidian context
            {selectedNotes.size > 0 && (
              <span
                className="px-1.5 py-0.5 rounded text-[0.65rem] font-mono"
                style={{ background: "rgba(255,92,40,0.15)", color: "var(--proof)" }}
              >
                {selectedNotes.size} selected
              </span>
            )}
            <ChevronDown size={13} style={{ transform: notesOpen ? "rotate(180deg)" : "none" }} />
          </button>

          {notesOpen && (
            <div className="mt-2 paper rounded-md p-2 max-h-48 overflow-y-auto">
              {notes.map((note) => (
                <label
                  key={note.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs cursor-pointer hover:bg-[var(--paper-dim)]"
                >
                  <input
                    type="checkbox"
                    checked={selectedNotes.has(note.id)}
                    onChange={() => toggleNote(note.id)}
                  />
                  <span style={{ color: "var(--text-strong)" }}>{note.title}</span>
                  <span className="font-mono ml-auto" style={{ color: "var(--text-faint)" }}>
                    {note.path}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {status && !providerOk && (
        <p className="mt-2 text-xs flex items-start gap-1.5" style={{ color: "var(--warn)" }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {provider === "ollama"
            ? `Ollama not reachable at ${status.ollama.baseUrl}. Is it running?`
            : `OpenRouter not configured (${status.openrouter.error}).`}
        </p>
      )}

      {error && (
        <p className="mt-2 text-xs flex items-start gap-1.5" style={{ color: "var(--proof)" }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <p className="mt-3 text-[0.7rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
        This calls the AI directly (no queue) and overwrites any existing suggestion for this
        product. Review it below, then Approve in the Queue or edit fields manually.
      </p>
    </div>
  );
}
