"use client";

import React, { memo, useEffect, useState } from "react";
import katex from "katex";
import { Image as ImageIcon, Maximize2 } from "lucide-react";
import type { ContentBlock, InlineCell } from "@/features/questions/domain/question-schema";
import { cn } from "@/lib/utils";
import { ImageLightbox } from "./image-lightbox";
import { XYCoordinateChart } from "./xy-coordinate-chart";
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

function cleanLatex(raw: string): string {
  if (!raw) return "";
  let s = raw.trim();
  // Strip any leading/trailing dollar signs
  s = s.replace(/^\$+|\$+$/g, "").trim();
  // Replace multiplication asterisk * with \times, preserving superscripts like x^* or A^*
  s = s.replace(/(?<!\^)\s*\*\s*/g, " \\times ");
  // Replace Persian digits in math with standard English digits
  s = s
    .replace(/[\u06F0\u0660]/g, "0")
    .replace(/[\u06F1\u0661]/g, "1")
    .replace(/[\u06F2\u0662]/g, "2")
    .replace(/[\u06F3\u0663]/g, "3")
    .replace(/[\u06F4\u0664]/g, "4")
    .replace(/[\u06F5\u0665]/g, "5")
    .replace(/[\u06F6\u0666]/g, "6")
    .replace(/[\u06F7\u0667]/g, "7")
    .replace(/[\u06F8\u0668]/g, "8")
    .replace(/[\u06F9\u0669]/g, "9");
  return s;
}

function renderFormula(latex: string, display: boolean, key: string | number) {
  const cleaned = cleanLatex(latex);
  if (!cleaned) return null;

  try {
    const html = katex.renderToString(cleaned, {
      displayMode: display,
      throwOnError: false,
      trust: true,
      strict: "ignore",
    });

    // Check if KaTeX generated an error span
    if (html.includes("katex-error")) {
      return (
        <bdi
          key={key}
          dir="ltr"
          className={
            display
              ? "formula-block block my-3 py-1.5 text-center overflow-x-auto overflow-y-hidden max-w-full font-mono text-xs sm:text-sm text-[var(--ink)] bg-[var(--surface-2)]/60 rounded-xl p-2 border border-[var(--line)] no-scrollbar select-text"
              : "inline-formula inline-block font-mono text-xs sm:text-sm text-[var(--ink)] bg-[var(--surface-2)]/60 px-1.5 py-0.5 rounded border border-[var(--line)] align-middle select-text"
          }
          style={{ unicodeBidi: "isolate" }}
        >
          {cleaned}
        </bdi>
      );
    }

    if (display) {
      return (
        <div
          key={key}
          dir="ltr"
          className="formula-block my-3.5 py-1 text-center overflow-x-auto overflow-y-hidden max-w-full no-scrollbar select-text"
          style={{ unicodeBidi: "isolate" }}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      );
    }

    return (
      <bdi
        key={key}
        dir="ltr"
        className="inline-formula inline-block align-middle overflow-visible select-text"
        style={{ unicodeBidi: "isolate" }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  } catch {
    return (
      <bdi
        key={key}
        dir="ltr"
        className="inline-formula inline-block font-mono text-xs sm:text-sm text-[var(--ink)] bg-[var(--surface-2)]/60 px-1.5 py-0.5 rounded border border-[var(--line)] align-middle select-text"
        style={{ unicodeBidi: "isolate" }}
      >
        {cleaned}
      </bdi>
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
 * Pre-processes text to:
 * 1. Clean stray/orphaned dollars, empty math symbols.
 * 2. Handle standalone negative numbers (e.g. -3, -1/3, -۳, 3-) so minus sign is strictly on the left.
 * 3. Auto-heal bare LaTeX commands (\frac, \sqrt) and environments outside math mode.
 * 4. Auto-heal negative numbers and fractions in prose outside math mode.
 * 5. Auto-heal multiplication asterisks (*) in prose between numbers.
 */
function sanitizeTextForMath(raw: string): string {
  if (!raw) return "";

  let text = raw;

  // 0. Remove AI citation artifacts: [cite: 2], [cite: 1, 2], (cite: 1), [citation: 1], etc.
  text = text.replace(/\[\s*(?:cite|citation)\s*:[^\]]+\]/gi, "");
  text = text.replace(/\(\s*(?:cite|citation)\s*:[^\)]+\)/gi, "");

  // 1. Remove empty dollar patterns: ($) or ($ ) or $ $ or $$ $$
  text = text.replace(/\(\s*\$\s*\)/g, "");
  text = text.replace(/\$[ \t]+\$/g, "");
  text = text.replace(/\$\$[ \t]+\$\$/g, "");

  // 2. Normalize \[ ... \] to $$ ... $$ and \( ... \) to $ ... $
  text = text.replace(/\\\[([\s\S]+?)\\\]/g, (_, math) => `$$${math.trim()}$$`);
  text = text.replace(/\\\(([\s\S]+?)\\\)/g, (_, math) => `$${math.trim()}$`);

  // 3. Normalize display math erroneously placed inside parentheses: ($$formula$$) -> ($formula$)
  text = text.replace(/\(\s*\$\$([^\$\n]+?)\$\$\s*\)/g, (_, math) => `($${math.trim()}$)`);

  // 4. Clean extra spaces inside formula-parentheses: ( $x=2$ ) -> ($x=2$)
  text = text.replace(/\(\s*(\$+[^\$]+?\$+)\s*\)/g, "($1)");

  // 5. Standalone negative number or fraction in options / cells (e.g. "-3", "- 3", "-۳", "3-", "۳-", "-1/3", "-۱/۳", "1/3-")
  const trimmed = text.trim();
  const standaloneNeg = trimmed.match(/^([-−]\s*([0-9\u06F0-\u06F9]+(?:[./٫][0-9\u06F0-\u06F9]+)?)|([0-9\u06F0-\u06F9]+(?:[./٫][0-9\u06F0-\u06F9]+)?)[-−])$/);
  if (standaloneNeg) {
    const rawNum = standaloneNeg[2] || standaloneNeg[3];
    const cleanNum = cleanLatex(rawNum).replace(/[٫]/g, ".");
    return `$-${cleanNum}$`;
  }
  const standaloneFrac = trimmed.match(/^([-−]\s*([0-9\u06F0-\u06F9]+)\s*\/\s*([0-9\u06F0-\u06F9]+)|([0-9\u06F0-\u06F9]+)\s*\/\s*([0-9\u06F0-\u06F9]+)[-−])$/);
  if (standaloneFrac) {
    const num = cleanLatex(standaloneFrac[2] || standaloneFrac[4]);
    const den = cleanLatex(standaloneFrac[3] || standaloneFrac[5]);
    return `$-\\frac{${num}}{${den}}$`;
  }

  // 6. Pull trailing Persian punctuation out of math mode and anchor with \u200F (RLM):
  // e.g. $x=2،$ -> $x=2$،\u200F or $x=2:$ -> $x=2$:\u200F
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)([،؛؟])\$/g, (_, math, punc) => {
    let cleanMath = math.trim();
    if (cleanMath.endsWith("\\")) cleanMath += " ";
    return `$${cleanMath}$${punc}\u200F`;
  });
  text = text.replace(/(?<!\\)\$([^\$\n]+?)(?<!\\)(:)\$/g, (_, math, punc) => {
    let cleanMath = math.trim();
    if (cleanMath.endsWith("\\")) cleanMath += " ";
    return `$${cleanMath}$${punc}\u200F`;
  });
  text = text.replace(/(?<!\\)\$([^\$\n]+?(?<!\d))\.\$/g, (_, math) => {
    let cleanMath = math.trim();
    if (cleanMath.endsWith("\\")) cleanMath += " ";
    return `$${cleanMath}$.\u200F`;
  });
  text = text.replace(/(?<!\\)\$([^\$\n]+?)\$([،؛:\!\?؟])(?!\u200F)/g, (_, math, punc) => `$${math.trim()}$${punc}\u200F`);

  // 7. Pull leading punctuation out of math mode if typed erroneously: e.g. $:x=2$ -> :$x=2$
  text = text.replace(/\$([،؛:\.\!\?؟])([^\$\n]+?)\$/g, (_, punc, math) => `${punc}$${math.trim()}$`);

  // 8. Normalize multiple dollars (3 or more) to exactly 2:
  text = text.replace(/\${3,}/g, () => "$$");

  // Helper function to check if a string offset is currently inside math mode ($ or $$)
  const isInsideMath = (offset: number, str: string): boolean => {
    let inInline = false;
    let inDisplay = false;
    let i = 0;
    while (i < offset && i < str.length) {
      if (str[i] === "\\" && i + 1 < str.length) {
        i += 2;
        continue;
      }
      if (str.slice(i, i + 2) === "$$") {
        inDisplay = !inDisplay;
        i += 2;
        continue;
      }
      if (str[i] === "$" && !inDisplay) {
        inInline = !inInline;
        i++;
        continue;
      }
      i++;
    }
    return inInline || inDisplay;
  };

  // 9. Auto-heal bare LaTeX environments (matrix, bmatrix, aligned, etc.) outside math mode
  const envs = "matrix|pmatrix|bmatrix|vmatrix|Vmatrix|aligned|cases|array|gather|equation";
  const envRegex = new RegExp(`\\\\begin\\{(${envs})\\}[\\s\\S]+?\\\\end\\{\\1\\}`, "g");
  text = text.replace(envRegex, (match, _, offset, fullStr) => {
    if (isInsideMath(offset, fullStr)) return match;
    return `$$${match}$$`;
  });

  // 10. Auto-heal bare \frac, \dfrac, \sqrt outside math mode (prevents raw syntax leaks)
  const bareFracRegex = /[-−]?\s*\\(?:d?frac\s*\{[^{}]*\}\s*\{[^{}]*\}|sqrt(?:\[[^\]]*\])?\{[^{}]*\})/g;
  text = text.replace(bareFracRegex, (match, offset, fullStr) => {
    if (isInsideMath(offset, fullStr)) return match;
    return `$${match.trim()}$`;
  });

  // 11. Auto-heal bare negative fractions in running text outside math mode: e.g. "شیب -1/2 شد"
  const textNegFrac = /(?<=^|[\s(،؛:])([-−]\s*[0-9\u06F0-\u06F9]+\s*\/\s*[0-9\u06F0-\u06F9]+|[0-9\u06F0-\u06F9]+\s*\/\s*[0-9\u06F0-\u06F9]+[-−])(?=[\s)؛،:!?؟]|$)/g;
  text = text.replace(textNegFrac, (match, _, offset, fullStr) => {
    if (isInsideMath(offset, fullStr)) return match;
    const clean = cleanLatex(match.replace(/[-−]/g, ""));
    const parts = clean.split("/").map((p) => p.trim());
    if (parts.length === 2 && parts[0] && parts[1]) {
      return `$-\\frac{${parts[0]}}{${parts[1]}}$`;
    }
    return match;
  });

  // 12. Auto-heal bare negative numbers in running text outside math mode: e.g. "حاصل -3 است" or backwards "3- است"
  const textNegNum = /(?<=^|[\s(،؛:])([-−]\s*[0-9\u06F0-\u06F9]+(?:\.[0-9\u06F0-\u06F9]+)?|[0-9\u06F0-\u06F9]+(?:\.[0-9\u06F0-\u06F9]+)?[-−])(?=[\s)؛،:!?؟]|$)/g;
  text = text.replace(textNegNum, (match, _, offset, fullStr) => {
    if (isInsideMath(offset, fullStr)) return match;
    const clean = cleanLatex(match.replace(/[-−]/g, ""));
    return `$-${clean}$`;
  });

  // 13. Auto-heal multiplication * between digits in prose outside math mode (e.g. 2 * 3 -> 2 \times 3)
  const textMult = /(?<=[0-9\u06F0-\u06F9])\s*\*\s*(?=[0-9\u06F0-\u06F9])/g;
  text = text.replace(textMult, (match, offset, fullStr) => {
    if (isInsideMath(offset, fullStr)) return match;
    return ` $\\times$ `;
  });

  // 14. Detect and fix unmatched odd dollars so one stray dollar doesn't break the whole text
  const nonEscapedDollars = (text.match(/(?<!\\)\$/g) || []).length;
  if (nonEscapedDollars % 2 !== 0) {
    // Check if there is a stray lone dollar surrounded by spaces or punctuation
    const loneMatch = text.match(/(^|\s)\$(\s|[،؛:\.\?\!؟]|$)/);
    if (loneMatch && loneMatch.index !== undefined) {
      const idx = loneMatch.index + (loneMatch[1]?.length || 0);
      text = text.slice(0, idx) + text.slice(idx + 1);
    } else {
      // Remove the last unmatched dollar
      const lastIdx = text.lastIndexOf("$");
      if (lastIdx !== -1) {
        text = text.slice(0, lastIdx) + text.slice(lastIdx + 1);
      }
    }
  }

  // 15. Clean redundant inner dollars: e.g. "$$ $x=2$ $$" -> "$$x=2$$"
  text = text.replace(/\$\$\s*\$([^\$]+)\$\s*\$\$/g, (_, inner) => `$$${inner.trim()}$$`);

  return text;
}

/**
 * Resolves the natural text direction for mixed Persian/Math content:
 * - Explicit direction ("ltr" | "rtl") is always honored.
 * - If text contains any Persian/Arabic characters -> "rtl".
 * - If text stripped of math contains English prose words -> "ltr".
 * - Default for numbers, formulas, and math expressions in Testino -> "rtl"
 *   so option numbers, badges, and formulas stay cleanly on the right side.
 */
function determineBlockDirection(block: Extract<ContentBlock, { type: "text" }>): "rtl" | "ltr" {
  if (block.direction === "ltr" || block.direction === "rtl") {
    return block.direction;
  }
  const raw = block.value || "";
  if (/[\u0600-\u06FF]/.test(raw)) {
    return "rtl";
  }
  // Strip math expressions ($...$ and $$...$$) to examine prose
  const prose = raw.replace(/\$\$[\s\S]+?\$\$|\$[^\$]{1,500}\$/g, "").trim();
  // If prose contains English words (2+ Latin characters), treat as English paragraph
  if (/[a-zA-Z]{2,}/.test(prose)) {
    return "ltr";
  }
  return "rtl";
}

/**
 * Parses mixed text, inline rich text formatting, and math expressions.
 * Strictly isolates math formula directionality with <bdi dir="ltr"> to prevent
 * BiDi inversion of Persian punctuation and sentence flow.
 */
function parseTextWithMath(rawText: string, baseKey: string | number): React.ReactNode {
  if (!rawText) return null;

  const text = sanitizeTextForMath(rawText);

  // 1. Extract all math blocks into a dictionary of placeholders so inline markdown (like **bold**, *italic*, <u>underline</u>)
  // that wraps formulas can parse cleanly without being fragmented by math symbols.
  const mathStore: { [placeholder: string]: { math: string; display: boolean } } = {};
  let mathCounter = 0;

  const mathRegex = /(\$\$[\s\S]+?\$\$|\$[^\$]{1,500}\$)/g;
  const textWithPlaceholders = text.replace(mathRegex, (match) => {
    const isDisplay = match.startsWith("$$") && match.endsWith("$$") && match.length >= 4;
    const inner = isDisplay ? match.slice(2, -2) : match.slice(1, -1);
    const placeholder = `@@TMATH_${mathCounter++}@@`;
    mathStore[placeholder] = { math: inner, display: isDisplay };
    return placeholder;
  });

  // Helper to recursively rehydrate math placeholders back into KaTeX components
  const rehydrateMath = (node: React.ReactNode, keyPrefix: string): React.ReactNode => {
    if (!node) return node;

    if (Array.isArray(node)) {
      return node.map((child, idx) => rehydrateMath(child, `${keyPrefix}-a-${idx}`));
    }

    if (typeof node === "string") {
      if (!node.includes("@@TMATH_")) return node;
      const parts = node.split(/(@@TMATH_\d+@@)/g);
      return parts.map((part, idx) => {
        const match = mathStore[part];
        if (match) {
          return renderFormula(match.math, match.display, `${keyPrefix}-m-${idx}`);
        }
        return part;
      });
    }

    if (React.isValidElement(node)) {
      const elementProps = node.props as { children?: React.ReactNode };
      if (elementProps && elementProps.children !== undefined) {
        const newChildren = rehydrateMath(elementProps.children, `${keyPrefix}-c`);
        return React.cloneElement(node, {
          key: node.key || keyPrefix,
          children: newChildren,
        } as React.Attributes & { children?: React.ReactNode });
      }
    }

    return node;
  };

  // 2. Process line by line to support Markdown headings (###, ##, #) and preserve line breaks
  const lines = textWithPlaceholders.split("\n");
  const renderedLines: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineKey = `${baseKey}-L-${i}`;

    // Detect Markdown Headings: ### Heading or ## Heading or # Heading
    const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const headingText = headingMatch[2].trim();
      const formatted = parseInlineFormatting(headingText, `${lineKey}-h`);
      const rehydrated = rehydrateMath(formatted, `${lineKey}-h`);

      renderedLines.push(
        <div
          key={lineKey}
          className={cn(
            "font-black text-indigo-950 dark:text-indigo-200 mt-3 mb-1.5 flex items-center gap-2",
            level <= 2
              ? "text-xs sm:text-sm border-b border-indigo-200/50 dark:border-indigo-800/50 pb-1"
              : "text-xs font-bold"
          )}
        >
          <span className="w-1.5 h-3.5 bg-indigo-500 rounded-full shrink-0" />
          <span>{rehydrated}</span>
        </div>
      );
      continue;
    }

    const formatted = parseInlineFormatting(line, lineKey);
    const rehydrated = rehydrateMath(formatted, lineKey);

    renderedLines.push(
      <React.Fragment key={lineKey}>
        {i > 0 && <br />}
        {rehydrated}
      </React.Fragment>
    );
  }

  return renderedLines;
}

function renderInlineCell(cell: InlineCell, key: string | number) {
  if (cell.type === "text") {
    return <span key={key}>{parseTextWithMath(cell.value, key)}</span>;
  }
  return renderFormula(cell.latex, false, key);
}

/**
 * Automatically parses Markdown tables found within text blocks into native table blocks
 * so simplex tables, payoff matrices, and economic data grids render with full
 * interactive table UI and KaTeX math formatting instead of plain text.
 */
function parseMarkdownTable(text: string): ContentBlock[] {
  if (!text || !text.includes("|")) {
    return [{ type: "text", value: text }];
  }

  const lines = text.split("\n");
  const blocks: ContentBlock[] = [];
  let textBuffer: string[] = [];
  let i = 0;

  const isTableRow = (l: string) => {
    const t = l.trim();
    return t.startsWith("|") && t.endsWith("|") && t.indexOf("|", 1) < t.length - 1;
  };

  const isTableDivider = (l: string) => {
    const t = l.trim();
    if (!t.startsWith("|") || !t.endsWith("|")) return false;
    const parts = t.slice(1, -1).split("|");
    return parts.length >= 1 && parts.every((p) => /^[\s:-]+$/.test(p) && p.includes("-"));
  };

  while (i < lines.length) {
    if (isTableRow(lines[i]) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      if (textBuffer.length > 0) {
        const val = textBuffer.join("\n").trim();
        if (val) blocks.push({ type: "text", value: val });
        textBuffer = [];
      }

      const rawHeaders = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
      i += 2; // skip header and divider

      const rawRows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) {
        const rowCells = lines[i].trim().slice(1, -1).split("|").map((c) => c.trim());
        rawRows.push(rowCells);
        i++;
      }

      if (rawHeaders.length > 0 && rawRows.length > 0) {
        blocks.push({
          type: "table",
          headers: rawHeaders.map((h) => ({ type: "text", value: h })),
          rows: rawRows.map((row) =>
            rawHeaders.map((_, idx) => ({ type: "text", value: row[idx] || "" }))
          ),
        } as Extract<ContentBlock, { type: "table" }>);
      }
      continue;
    }

    textBuffer.push(lines[i]);
    i++;
  }

  if (textBuffer.length > 0) {
    const val = textBuffer.join("\n").trim();
    if (val) blocks.push({ type: "text", value: val });
  }

  return blocks.length > 0 ? blocks : [{ type: "text", value: text }];
}

/**
 * Memoized: the exam player's 2-second elapsed timer re-renders SessionPlayer
 * every tick — without memo, every tick re-ran KaTeX rendering for EVERY
 * formula on the page (visible jank during exams, worst on Android WebView).
 * ContentRenderer re-renders now only when its blocks actually change.
 */
export const ContentRenderer = memo(function ContentRenderer({
  blocks,
}: {
  blocks: ContentBlock[] | string;
}) {
  const [lightboxImg, setLightboxImg] = useState<{ url: string; alt: string } | null>(null);

  if (!blocks) return null;

  const rawBlocks: (ContentBlock | string)[] = Array.isArray(blocks)
    ? blocks
    : typeof blocks === "string"
    ? [blocks]
    : [];

  const normalizedBlocks: ContentBlock[] = [];
  for (const b of rawBlocks) {
    if (typeof b === "string") {
      normalizedBlocks.push(...parseMarkdownTable(b));
    } else if (b.type === "text") {
      normalizedBlocks.push(...parseMarkdownTable(b.value));
    } else {
      normalizedBlocks.push(b);
    }
  }

  if (!normalizedBlocks.length) return null;

  const handleOpenLightbox = (url: string, alt: string) => {
    setLightboxImg({ url, alt });
  };

  const handleCloseLightbox = () => {
    setLightboxImg(null);
  };

  return (
    <div className="rich-content space-y-3">
      {normalizedBlocks.map((block, index) => {
        if (block.type === "text") {
          let contentNode: React.ReactNode = parseTextWithMath(block.value, index);
          if (block.emphasis === "strong") {
            contentNode = <strong>{contentNode}</strong>;
          } else if (block.emphasis === "underline") {
            contentNode = <u>{contentNode}</u>;
          }

          const dir = determineBlockDirection(block);

          return (
            <div
              key={index}
              dir={dir}
              className={`text-block leading-relaxed whitespace-pre-line ${
                dir === "rtl" ? "text-right" : "text-left"
              }`}
            >
              {contentNode}
            </div>
          );
        }

        if (block.type === "formula") {
          return renderFormula(block.latex, !!block.display, index);
        }

        if (block.type === "table") {
          return (
            <div key={index} dir="rtl" className="table-container my-4 overflow-x-auto border-2 border-[var(--line)] rounded-2xl bg-[var(--surface)] shadow-[3px_3px_0px_var(--neo-shadow)]">
              <table className="w-full text-xs sm:text-sm text-center border-collapse">
                {block.caption && (
                  <caption className="p-2.5 text-xs text-[var(--muted)] font-bold caption-bottom">
                    {block.caption}
                  </caption>
                )}
                <thead className="bg-[var(--surface-2)] border-b-2 border-[var(--line)]">
                  <tr>
                    {block.headers.map((header, hIdx) => (
                      <th key={hIdx} className="p-2.5 sm:p-3 font-black text-[var(--ink)] border-x border-[var(--line)]/50 first:border-r-0 last:border-l-0">
                        {renderInlineCell(header, hIdx)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line)]">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="even:bg-[var(--surface-2)]/40 hover:bg-[var(--surface-2)]/80 transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="p-2.5 sm:p-3 text-[var(--ink)] font-medium border-x border-[var(--line)]/40 first:border-r-0 last:border-l-0">
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
          if (block.chartType === "xy" || block.chartType === "coordinate" || block.lines || block.regions || block.points) {
            return (
              <div key={index} className="my-4">
                <XYCoordinateChart
                  xRange={block.xRange as [number, number] | undefined}
                  yRange={block.yRange as [number, number] | undefined}
                  xLabel={block.xLabel}
                  yLabel={block.yLabel}
                  lines={block.lines}
                  regions={block.regions}
                  points={block.points}
                  arrows={block.arrows}
                  caption={block.caption}
                />
              </div>
            );
          }

          return (
            <div key={index} className="chart-block my-4 p-4 border border-[var(--line)] rounded-2xl bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              {block.caption && <p className="font-bold text-sm mb-3 text-[var(--ink)]">{block.caption}</p>}
              <div className="chart-preview flex items-end gap-2 h-44 pt-6 pb-2 px-2 border-b border-[var(--line)]">
                {(block.labels || []).map((label, lIdx) => {
                  const val = block.series?.[0]?.values?.[lIdx] ?? 0;
                  const maxVal = Math.max(...(block.series?.[0]?.values || [1]), 1);
                  const heightPercent = Math.max(5, Math.round((val / maxVal) * 100));
                  return (
                    <div key={lIdx} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                      <span className="text-[10px] font-mono text-[var(--muted)]">{val}</span>
                      <div
                        className="w-full bg-[var(--testino-orange)] rounded-t-lg transition-all shadow-sm"
                        style={{ height: `${heightPercent}%` }}
                        title={`${block.series?.[0]?.name || ""}: ${val}`}
                      />
                      <span className="text-[10px] truncate max-w-[60px] text-[var(--muted)] font-medium" title={label}>
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
