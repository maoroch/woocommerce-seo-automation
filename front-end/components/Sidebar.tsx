"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, PackageSearch, ListChecks, Stamp } from "lucide-react";

const NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, num: "01" },
  { href: "/products", label: "Products", icon: PackageSearch, num: "02" },
  { href: "/queue", label: "Queue", icon: ListChecks, num: "03" },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-60 shrink-0 border-r border-white/10 flex flex-col">
      <div className="px-6 pt-8 pb-6 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <Stamp size={22} style={{ color: "var(--proof)" }} strokeWidth={2.5} />
          <span
            className="text-[1.05rem] font-bold tracking-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Proof Desk
          </span>
        </div>
        <p className="mt-1.5 text-xs leading-snug" style={{ color: "var(--text-on-ink-muted)" }}>
          WooCommerce SEO operations
        </p>
      </div>

      <nav className="flex-1 px-3 py-5 flex flex-col gap-1">
        {NAV.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="group flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors"
              style={{
                background: active ? "var(--proof)" : "transparent",
                color: active ? "#15191e" : "var(--text-on-ink-muted)",
                fontWeight: active ? 600 : 500,
              }}
            >
              <span
                className="text-[0.65rem] font-mono tabular-nums"
                style={{
                  color: active ? "rgba(21,25,30,0.55)" : "var(--text-faint)",
                }}
              >
                {item.num}
              </span>
              <Icon size={16} strokeWidth={2} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-6 py-5 border-t border-white/10">
        <p className="text-[0.7rem] leading-relaxed" style={{ color: "var(--text-faint)" }}>
          WooCommerce stays the source of truth.
          <br />
          Mongo mirrors it, Claude reads it, you sign off.
        </p>
      </div>
    </aside>
  );
}
