"use client";

import React, { memo, useEffect, useState } from "react";
import katex from "katex";
import { Image as ImageIcon, Maximize2 } from "lucide-react";
import type { ContentBlock, InlineCell } from "@/features/questions/domain/question-schema";
import { ImageLightbox } from "./image-lightbox";
import { useDatabase } from "@/providers/database-provider";
import { MediaService } from "@/features/media/domain/media-service";
import { SupabaseTransport } from "@/sync/supabase-transport";

function CachedQuestionImage({
  block,
  onOpen,
}: {
  block: Extract<ContentBlock, { type: "image" }>;
  onOpen: (url: string, alt: string) => void;
}) {
  const database = useDatabase();
  const inlineSource = block.url || block.dataUrl || (block.mediaKey?.startsWith("data:") ? block.mediaKey : null);
  const [resolvedSource, setResolvedSource] = useState<string | null>(inlineSource);
  const altText = block.alt || "تصویر پیوست سؤال";

  useEffect(() => {
    if (inlineSource || !block.mediaId || database.status !== "ready") return;
    let active = true;
    let objectUrl: string | null = null;
    void (async () => {
      const db = database.db.getClient();
      const media = new MediaService(db);
      let bytes = await media.get(block.mediaId!);
      if (!bytes && typeof navigator !== "undefined" && navigator.onLine) {
        const rows = await db.query<{ id: string; remote_path: string | null; mime: string; sha256: string }>(
          "SELECT id, remote_path, mime, sha256 FROM media_files WHERE id=? LIMIT 1",
          [block.mediaId!]
        );
        const row = rows[0];
        if (row?.remote_path) {
          const transport = new SupabaseTransport();
          if (transport.isConfigured() && (await transport.isAuthenticated())) {
            const downloaded = await transport.downloadMedia(row.remote_path);
            const saved = await media.ingest(downloaded, "content", { declaredMime: row.mime });
            if (saved.sha256 !== row.sha256) throw new Error("هش رسانهٔ دریافتی معتبر نیست.");
            await db.execute(
              "UPDATE media_files SET availability='both', local_path=? WHERE id=?",
              [`media/${row.sha256}.${row.mime === "image/jpeg" ? "jpg" : row.mime.split("/")[1]}`, row.id]
            );
            bytes = downloaded;
          }
        }
      }
      if (!active || !bytes || typeof URL === "undefined") return;
      const [metadata] = await db.query<{ mime: string }>("SELECT mime FROM media_files WHERE id=? LIMIT 1", [block.mediaId!]);
      const blobBytes = new Uint8Array(bytes.byteLength);
      blobBytes.set(bytes);
      objectUrl = URL.createObjectURL(
        new Blob([blobBytes], { type: metadata?.mime || "image/webp" })
      );
      setResolvedSource(objectUrl);
    })().catch(() => {
      // Missing/offline media has an explicit placeholder below; question text remains usable.
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [block.mediaId, database.db, database.status, inlineSource]);

  return (
    <div className="image-block my-3 text-center">
      {resolvedSource ? (
        <div
          className="inline-block relative group max-w-full cursor-zoom-in"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(resolvedSource, altText);
          }}
          title="برای مشاهده بزرگ‌نمایی و زوم کلیک کنید"
        >
          <img
            src={resolvedSource}
            alt={altText}
            className="max-h-80 max-w-full rounded-2xl mx-auto object-contain border-2 border-[var(--line)] shadow-[3px_3px_0px_var(--neo-shadow)] bg-white group-hover:border-[var(--testino-orange)] transition-all"
          />
          <div className="absolute top-2.5 left-2.5 p-1.5 rounded-xl bg-black/60 backdrop-blur-sm text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-black pointer-events-none">
            <Maximize2 size={13} />
            <span>مشاهده بزرگ‌تر</span>
          </div>
          {altText !== "تصویر سوال" && <span className="block text-[11px] font-bold text-[var(--muted)] mt-1.5 text-center">{altText}</span>}
        </div>
      ) : (
        <div className="inline-block p-4 border border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg text-sm text-neutral-500 bg-neutral-50 dark:bg-neutral-900">
          <span className="inline-flex items-center gap-1.5"><ImageIcon className="w-4 h-4 text-neutral-400" /><span>{altText}</span></span>
          <small className="block text-xs mt-1 text-neutral-400">رسانه در این دستگاه موجود نیست</small>
        </div>
      )}
    </div>
  );
}

function renderFormula(latex: string, display: boolean, key: string | number) {
  try {
    const html = katex.renderToString(latex, {
      displayMode: display,
      throwOnError: false,
      trust: true,
      strict: "ignore",
    });
    return (
      <span
        key={key}
        dir="ltr"
        className={
          display
            ? "block my-2 overflow-x-auto overflow-y-hidden text-center no-scrollbar"
            : "inline-formula inline-block px-1 align-middle overflow-visible"
        }
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <code
        key={key}
        dir="ltr"
        className="formula-error font-mono text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950 px-1.5 py-0.5 rounded border border-rose-200 dark:border-rose-800"
        title="فرمول نیاز به اصلاح دارد"
      >
        {latex}
      </code>
    );
  }
}

/**
 * Parses inline rich text tokens:
 * - Underline: <u>...</u>, <ins>...</ins>
 * - Mark / Highlight: <mark>...</mark>, ==...==
 * - Bold: <strong>...</strong>, <b>...</b>, **...**
 * - Italic: <em>...</em>, <i>...</i>, *...*
 * - Inline Code: <code>...</code>, `...`
 */
function parseInlineFormatting(text: string, baseKey: string | number): React.ReactNode {
  if (!text) return null;

  const inlineRegex = /(<span\b[^>]*>[\s\S]*?<\/span>|<u\b[^>]*>[\s\S]*?<\/u>|<ins\b[^>]*>[\s\S]*?<\/ins>|<mark\b[^>]*>[\s\S]*?<\/mark>|==[\s\S]+?==|<strong\b[^>]*>[\s\S]*?<\/strong>|<b\b[^>]*>[\s\S]*?<\/b>|\*\*[^\*\n]+?\*\*|<em\b[^>]*>[\s\S]*?<\/em>|<i\b[^>]*>[\s\S]*?<\/i>|(?<!\w)\*[^\*\n]+?\*(?!\w)|<code\b[^>]*>[\s\S]*?<\/code>|`[^`\n]+?`)/gi;

  const parts = text.split(inlineRegex);
  if (parts.length === 1) {
    return text;
  }

  return parts.map((part, idx) => {
    if (!part) return null;
    const key = `${baseKey}-inline-${idx}`;

    // Span: <span class="...">...</span>
    const spanMatch = part.match(/^<span\b(?:[^>]*class=["']([^"']*)["'])?[^>]*>([\s\S]*?)<\/span>$/i);
    if (spanMatch) {
      return (
        <span key={key} className={spanMatch[1] || ""}>
          {parseInlineFormatting(spanMatch[2], `${key}-span`)}
        </span>
      );
    }

    // Underline: <u>...</u> or <ins>...</ins>
    const uMatch = part.match(/^<(?:u|ins)\b[^>]*>([\s\S]*?)<\/(?:u|ins)>$/i);
    if (uMatch) {
      return (
        <u
          key={key}
          className="underline decoration-2 decoration-amber-500 font-bold underline-offset-4 bg-amber-500/10 px-1 py-0.5 rounded"
        >
          {parseInlineFormatting(uMatch[1], `${key}-u`)}
        </u>
      );
    }

    // Mark / Highlight: <mark>...</mark> or ==...==
    const markMatch = part.match(/^<mark\b[^>]*>([\s\S]*?)<\/mark>$/i) || part.match(/^==([\s\S]+?)==$/);
    if (markMatch) {
      return (
        <mark
          key={key}
          className="bg-amber-300/80 dark:bg-amber-900/60 text-[var(--ink)] px-1 py-0.5 rounded font-bold"
        >
          {parseInlineFormatting(markMatch[1], `${key}-mark`)}
        </mark>
      );
    }

    // Bold: <strong>...</strong> or <b>...</b> or **...**
    const boldMatch = part.match(/^<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>$/i) || part.match(/^\*\*([^\*\n]+?)\*\*$/);
    if (boldMatch) {
      return (
        <strong key={key} className="font-bold">
          {parseInlineFormatting(boldMatch[1], `${key}-strong`)}
        </strong>
      );
    }

    // Italic: <em>...</em> or <i>...</i> or *...*
    const italicMatch = part.match(/^<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>$/i) || part.match(/^\*([^\*\n]+?)\*$/);
    if (italicMatch) {
      return (
        <em key={key} className="italic">
          {parseInlineFormatting(italicMatch[1], `${key}-em`)}
        </em>
      );
    }

    // Code: <code>...</code> or `...`
    const codeMatch = part.match(/^<code\b[^>]*>([\s\S]*?)<\/code>$/i) || part.match(/^`([^`\n]+?)`$/);
    if (codeMatch) {
      return (
        <code
          key={key}
          className="font-mono text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded border border-[var(--line)]"
        >
          {codeMatch[1]}
        </code>
      );
    }

    return part;
  });
}

/**
 * Parses mixed text, inline rich text formatting, and math expressions.
 * Supports:
 * - $$display math$$
 * - \[display math\]
 * - $inline math$
 * - \(inline math\)
 * - Inline HTML (<u>, <ins>, <mark>, <strong>, <b>, <em>, <i>, <code>)
 * - Markdown (**bold**, ==highlight==, `code`)
 */
function parseTextWithMath(text: string, baseKey: string | number): React.ReactNode {
  if (!text) return null;
  const mathRegex = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^\$\n]+?\$|\\\([^\n]+?\\\))/g;
  const parts = text.split(mathRegex);

  if (parts.length === 1) {
    return parseInlineFormatting(text, baseKey);
  }

  return parts.map((part, idx) => {
    if (!part) return null;
    const key = `${baseKey}-math-${idx}`;

    if (part.startsWith("$$") && part.endsWith("$$") && part.length >= 4) {
      const inner = part.slice(2, -2).trim();
      return renderFormula(inner, true, key);
    }
    if (part.startsWith("\\[") && part.endsWith("\\]") && part.length >= 4) {
      const inner = part.slice(2, -2).trim();
      return renderFormula(inner, true, key);
    }
    if (part.startsWith("$") && part.endsWith("$") && part.length >= 2) {
      const inner = part.slice(1, -1).trim();
      return renderFormula(inner, false, key);
    }
    if (part.startsWith("\\(") && part.endsWith("\\)") && part.length >= 4) {
      const inner = part.slice(2, -2).trim();
      return renderFormula(inner, false, key);
    }

    return <span key={key}>{parseInlineFormatting(part, key)}</span>;
  });
}

function renderInlineCell(cell: InlineCell, key: string | number) {
  if (cell.type === "text") {
    return <span key={key}>{parseTextWithMath(cell.value, key)}</span>;
  }
  return renderFormula(cell.latex, false, key);
}

/**
 * Memoized: the exam player's 2-second elapsed timer re-renders SessionPlayer
 * every tick — without memo, every tick re-ran KaTeX rendering for EVERY
 * formula on the page (visible jank during exams, worst on Android WebView).
 * ContentRenderer re-renders now only when its blocks actually change.
 */
export const ContentRenderer = memo(function ContentRenderer({ blocks }: { blocks: ContentBlock[] }) {
  const [lightboxImg, setLightboxImg] = useState<{ url: string; alt: string } | null>(null);

  if (!blocks || !blocks.length) return null;

  const handleOpenLightbox = (url: string, alt: string) => {
    setLightboxImg({ url, alt });
  };

  const handleCloseLightbox = () => {
    setLightboxImg(null);
  };

  return (
    <div className="rich-content space-y-3">
      {blocks.map((block, index) => {
        if (block.type === "text") {
          let contentNode: React.ReactNode = parseTextWithMath(block.value, index);
          if (block.emphasis === "strong") {
            contentNode = <strong>{contentNode}</strong>;
          } else if (block.emphasis === "underline") {
            contentNode = <u>{contentNode}</u>;
          }
          return (
            <div key={index} dir={block.direction || "auto"} className="text-block leading-relaxed whitespace-pre-line">
              {contentNode}
            </div>
          );
        }

        if (block.type === "formula") {
          if (!block.display) {
            return (
              <span key={index} className="formula-inline inline-block align-middle px-1 overflow-visible" dir="ltr">
                {renderFormula(block.latex, false, index)}
              </span>
            );
          }
          return (
            <div key={index} className="formula-block my-3.5 py-1 text-center overflow-x-auto overflow-y-hidden max-w-full no-scrollbar" dir="ltr">
              {renderFormula(block.latex, true, index)}
            </div>
          );
        }

        if (block.type === "table") {
          return (
            <div key={index} className="table-container my-3 overflow-x-auto border-2 border-[var(--line)] rounded-2xl bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              <table className="w-full text-xs sm:text-sm text-right border-collapse">
                {block.caption && (
                  <caption className="p-2 text-xs text-[var(--muted)] font-bold caption-bottom">
                    {block.caption}
                  </caption>
                )}
                <thead className="bg-[var(--surface-2)] border-b-2 border-[var(--line)]">
                  <tr>
                    {block.headers.map((header, hIdx) => (
                      <th key={hIdx} className="p-2.5 sm:p-3 font-black text-[var(--ink)]">
                        {renderInlineCell(header, hIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 sm:p-3 text-[var(--ink-soft)] font-medium">
                          {renderInlineCell(cell, cIdx)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === "chart") {
          return (
            <div key={index} className="chart-block my-4 p-4 border border-neutral-200 dark:border-neutral-800 rounded-lg bg-[var(--surface)] dark:bg-neutral-950">
              {block.caption && <p className="font-bold text-sm mb-3">{block.caption}</p>}
              <div className="chart-preview flex items-end gap-2 h-40 pt-6 pb-2 px-2 border-b border-neutral-300 dark:border-neutral-700">
                {block.labels.map((label, lIdx) => {
                  const val = block.series[0]?.values[lIdx] ?? 0;
                  const maxVal = Math.max(...(block.series[0]?.values || [1]), 1);
                  const heightPercent = Math.max(5, Math.round((val / maxVal) * 100));
                  return (
                    <div key={lIdx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[10px] text-neutral-500">{val}</span>
                      <div
                        className="w-full bg-blue-600 dark:bg-blue-500 rounded-t transition-all"
                        style={{ height: `${heightPercent}%` }}
                        title={`${block.series[0]?.name || ""}: ${val}`}
                      />
                      <span className="text-[10px] truncate max-w-[60px] text-neutral-600 dark:text-neutral-400" title={label}>
                        {label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        }

        if (block.type === "image") {
          return <CachedQuestionImage key={index} block={block} onOpen={handleOpenLightbox} />;
        }

        return null;
      })}

      {/* Lightbox / Zoom Modal */}
      {lightboxImg && (
        <ImageLightbox
          src={lightboxImg.url}
          alt={lightboxImg.alt}
          onClose={handleCloseLightbox}
        />
      )}
    </div>
  );
});
