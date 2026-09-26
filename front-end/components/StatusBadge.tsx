import type { TaskStatus } from "@/lib/types";

const CONFIG: Record<TaskStatus, { label: string; bg: string; fg: string }> = {
  idle: { label: "Idle", bg: "rgba(255,255,255,0.06)", fg: "var(--text-on-ink-muted)" },
  pending: { label: "Queued", bg: "rgba(255,255,255,0.08)", fg: "#cbd5e1" },
  processing: { label: "Processing", bg: "#1c3a4d", fg: "#7dd3fc" },
  done: { label: "Needs review", bg: "var(--proof)", fg: "#15191e" },
  approved: { label: "Approved", bg: "var(--approved)", fg: "#0e2818" },
  rejected: { label: "Rejected", bg: "rgba(255,255,255,0.06)", fg: "var(--text-faint)" },
};

export default function StatusBadge({ status }: { status: TaskStatus }) {
  const c = CONFIG[status] ?? CONFIG.idle;
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[0.7rem] font-medium tracking-wide whitespace-nowrap"
      style={{ background: c.bg, color: c.fg }}
    >
      {c.label}
    </span>
  );
}
