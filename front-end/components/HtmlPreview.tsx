"use client";

import { useState } from "react";
import { Code, Eye } from "lucide-react";

interface Props {
  html: string;
}

/**
 * Показывает HTML-контент либо как сырой код (с подсветкой через <pre>),
 * либо отрендеренным — как он будет выглядеть на сайте.
 *
 * Рендер ограничен типографикой темы (.html-preview ниже), чтобы таблицы,
 * списки и заголовки из описания товара выглядели разборчиво внутри
 * "бумажной" карточки дашборда.
 */
export default function HtmlPreview({ html }: Props) {
  const [mode, setMode] = useState<"preview" | "code">("preview");

  if (!html?.trim()) {
    return (
      <p className="text-xs" style={{ color: "var(--text-faint)" }}>
        Empty
      </p>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-1 mb-2">
        <button
          onClick={() => setMode("preview")}
          className="flex items-center gap-1 text-[0.7rem] px-2 py-1 rounded-md transition-colors"
          style={{
            background: mode === "preview" ? "var(--paper-dim)" : "transparent",
            color: mode === "preview" ? "var(--text-strong)" : "var(--text-faint)",
          }}
        >
          <Eye size={12} /> Preview
        </button>
        <button
          onClick={() => setMode("code")}
          className="flex items-center gap-1 text-[0.7rem] px-2 py-1 rounded-md transition-colors"
          style={{
            background: mode === "code" ? "var(--paper-dim)" : "transparent",
            color: mode === "code" ? "var(--text-strong)" : "var(--text-faint)",
          }}
        >
          <Code size={12} /> HTML
        </button>
      </div>

      {mode === "preview" ? (
        <div className="html-preview text-sm" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <pre
          className="text-xs font-mono overflow-x-auto p-3 rounded-md whitespace-pre-wrap"
          style={{ background: "var(--paper-dim)", color: "var(--text-muted)" }}
        >
          {html}
        </pre>
      )}
    </div>
  );
}
