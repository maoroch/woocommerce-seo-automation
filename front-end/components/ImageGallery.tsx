"use client";

import { useState } from "react";
import { ImageIcon } from "lucide-react";

interface ProductImage {
  id?: number;
  src: string;
  alt?: string;
  title?: string;
}

interface Props {
  images: ProductImage[];
  edits: Record<number, string>; // imageId -> new alt
  onChange: (imageId: number, alt: string) => void;
}

export default function ImageGallery({ images, edits, onChange }: Props) {
  const [openId, setOpenId] = useState<number | null>(null);

  if (!images?.length) {
    return (
      <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-faint)" }}>
        <ImageIcon size={13} /> No images
      </p>
    );
  }

  const [cover, ...rest] = images;

  return (
    <div className="space-y-3">
      {[{ img: cover, label: "Cover" }, ...rest.map((img) => ({ img, label: "Gallery" }))].map(
        ({ img, label }, idx) => {
          const id = img.id ?? -idx;
          const currentAlt = edits[id] !== undefined ? edits[id] : img.alt || "";
          const dirty = edits[id] !== undefined && edits[id] !== (img.alt || "");
          const isOpen = openId === id;

          return (
            <div
              key={id}
              className="flex gap-3 items-start rounded-md p-2"
              style={{ background: "var(--paper-dim)" }}
            >
              <button
                onClick={() => setOpenId(isOpen ? null : id)}
                className="shrink-0 w-16 h-16 rounded-md overflow-hidden border"
                style={{ borderColor: "var(--paper-border)" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={img.src} alt={img.alt || ""} className="w-full h-full object-cover" />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[0.65rem] uppercase tracking-wider px-1.5 py-0.5 rounded"
                    style={{
                      background: idx === 0 ? "var(--proof)" : "var(--paper-border)",
                      color: idx === 0 ? "#15191e" : "var(--text-muted)",
                    }}
                  >
                    {label}
                  </span>
                  <span className="text-[0.7rem] font-mono" style={{ color: "var(--text-faint)" }}>
                    id: {img.id ?? "—"}
                  </span>
                  {dirty && (
                    <span
                      className="text-[0.65rem] px-1.5 py-0.5 rounded"
                      style={{ background: "rgba(255,92,40,0.15)", color: "var(--proof)" }}
                    >
                      edited
                    </span>
                  )}
                </div>
                <input
                  value={currentAlt}
                  onChange={(e) => img.id !== undefined && onChange(img.id, e.target.value)}
                  placeholder="Alt text (empty — bad for SEO/accessibility)"
                  disabled={img.id === undefined}
                  className="w-full px-2 py-1.5 rounded-md text-xs paper focus:outline-none disabled:opacity-50"
                  style={{ border: "1px solid var(--paper-border)" }}
                />
                {!currentAlt && (
                  <p className="text-[0.65rem] mt-1" style={{ color: "var(--proof)" }}>
                    Missing alt text
                  </p>
                )}
              </div>

              {isOpen && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center p-8"
                  style={{ background: "rgba(0,0,0,0.6)" }}
                  onClick={() => setOpenId(null)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.src}
                    alt={img.alt || ""}
                    className="max-w-full max-h-full rounded-lg"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              )}
            </div>
          );
        }
      )}
    </div>
  );
}
