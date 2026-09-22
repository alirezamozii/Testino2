import type { ContentBlock, ImportQuestion } from "./question-schema";

function normalizeText(text: string): string {
  return text
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200C\u200B]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalBlocks(blocks: ContentBlock[]): string {
  return blocks
    .map((b) => {
      if (b.type === "text") return `T:${normalizeText(b.value)}`;
      if (b.type === "formula") return `F:${b.latex.trim()}`;
      if (b.type === "image") return `I:${b.mediaId || b.mediaKey || ""}`;
      if (b.type === "table") {
        const rowsStr = b.rows.map((r) => r.map((c) => (c.type === "text" ? normalizeText(c.value) : c.latex.trim())).join(",")).join(";");
        return `TB:${rowsStr}`;
      }
      if (b.type === "chart") {
        const chartId =
          b.chartType === "xy" || b.chartType === "coordinate"
            ? `XY:${b.lines?.length || 0}-${b.regions?.length || 0}-${b.points?.length || 0}`
            : (b.labels || []).join(",");
        return `C:${b.chartType}:${chartId}`;
      }
      return "";
    })
    .join("|");
}

export function computeQuestionFingerprint(question: ImportQuestion, defaultSubject = ""): string {
  const subject = normalizeText(question.subject || defaultSubject);
  const contentCanonical = canonicalBlocks(question.content);

  let optionsList = question.options.map((opt) => ({
    key: opt.key,
    canonical: canonicalBlocks(opt.content),
  }));

  if (question.shuffleSafe) {
    optionsList = optionsList.sort((a, b) => a.canonical.localeCompare(b.canonical));
  }

  const optionsCanonical = optionsList.map((o) => o.canonical).join("||");
  const rawKey = `${subject}:::${contentCanonical}:::${optionsCanonical}`;

  // Simple deterministic 64-character hex hash representation
  let hash = 0;
  for (let i = 0; i < rawKey.length; i++) {
    hash = (hash << 5) - hash + rawKey.charCodeAt(i);
    hash |= 0;
  }
  const hex = Math.abs(hash).toString(16).padStart(16, "0");
  return `${hex}${hex}${hex}${hex}`;
}

export async function computeContentHash(input: {
  content: ContentBlock[];
  options: Array<{ key: string; content: ContentBlock[] }>;
  subject: string;
  shuffleSafe?: boolean;
}): Promise<string> {
  return computeQuestionFingerprint(
    {
      key: "temp",
      content: input.content,
      options: input.options,
      subject: input.subject,
      shuffleSafe: input.shuffleSafe ?? false,
      explanation: [],
    },
    input.subject
  );
}

