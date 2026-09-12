import {
  importEnvelopeSchema,
  importGroupSchema,
  type ImportEnvelope,
  type ImportGroup,
  type ImportQuestion,
} from "./question-schema";
import { computeQuestionFingerprint } from "./fingerprint";
import { canonicalizeSubject } from "./subject-registry";

export interface ImportIssue {
  rowIndex: number;
  externalKey?: string;
  path: string;
  message: string;
  isWarning?: boolean;
}

export interface ParsedGroupResult {
  group: ImportGroup;
  status: "complete" | "incomplete";
  missingKeys: string[];
}

export interface ParsedImport {
  envelope: ImportEnvelope;
  valid: ImportQuestion[];
  groups: ParsedGroupResult[];
  issues: ImportIssue[];
  fingerprints: Map<string, string>; // questionKey -> fingerprint
}

export function parseImportJson(source: string): ParsedImport {
  let raw: unknown;
  try {
    raw = JSON.parse(source);
  } catch {
    throw new Error("فایل JSON معتبر نیست و هیچ سؤالی ذخیره نشد.");
  }

  if (typeof raw !== "object" || raw === null) {
    throw new Error("ساختار اصلی فایل یا نسخهٔ آن معتبر نیست.");
  }

  const rawObj = raw as Record<string, unknown>;
  const header = importEnvelopeSchema.omit({ questions: true, groups: true }).safeParse(rawObj);
  if (!header.success || !Array.isArray(rawObj.questions)) {
    throw new Error("ساختار اصلی فایل یا نسخهٔ آن معتبر نیست.");
  }

  const questions = rawObj.questions as unknown[];
  if (questions.length === 0 || questions.length > 10_000) {
    throw new Error("تعداد سؤال‌ها باید بین ۱ و ۱۰٬۰۰۰ باشد.");
  }

  const valid: ImportQuestion[] = [];
  const issues: ImportIssue[] = [];
  const fingerprints = new Map<string, string>();
  const validKeys = new Set<string>();
  const canonicalDefaults = {
    ...header.data.defaults,
    subject: canonicalizeSubject(header.data.defaults.subject),
  };

function slugify(text: string): string {
  return (
    text
      .trim()
      .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "item"
  );
}

function normalizeRawQuestion(
  rawQ: unknown,
  index: number,
  defaults: {
    subject: string;
    chapter?: string | null;
    topic?: string | null;
    source?: { year?: number; title?: string; kind?: string };
  }
): unknown {
  if (typeof rawQ !== "object" || rawQ === null) return rawQ;
  const q = { ...(rawQ as Record<string, unknown>) };

  // 1. Subject inheritance
  if (!q.subject || typeof q.subject !== "string" || !q.subject.trim()) {
    q.subject = defaults.subject;
  } else {
    q.subject = canonicalizeSubject(q.subject);
  }

  // 2. Chapter / Topic inheritance
  if (q.chapter === undefined && defaults.chapter) {
    q.chapter = defaults.chapter;
  }
  if (q.topic === undefined && defaults.topic) {
    q.topic = defaults.topic;
  }

  // 3. Source Number resolution
  const sNum =
    q.sourceNumber !== undefined && q.sourceNumber !== null
      ? String(q.sourceNumber).trim()
      : String(index + 1);
  if (!q.sourceNumber) {
    q.sourceNumber = sNum;
  }

  // 4. Auto-generate system key if omitted by AI
  if (!q.key || typeof q.key !== "string" || !q.key.trim()) {
    const subjSlug = slugify(String(q.subject || defaults.subject || "q"));
    const yr = defaults.source?.year || "exam";
    q.key = `${subjSlug}-${yr}-q${sNum}`;
  }

  // 5. Normalize content if provided as plain string
  if (typeof q.content === "string") {
    q.content = [{ type: "text", value: q.content.trim() }];
  }

  // 6. Normalize explanation if provided as plain string or empty
  if (typeof q.explanation === "string") {
    q.explanation = [{ type: "text", value: q.explanation.trim() }];
  } else if (!q.explanation) {
    q.explanation = [];
  }

  // 7. Normalize options
  if (Array.isArray(q.options)) {
    q.options = q.options.map((opt: unknown, optIdx: number) => {
      const defaultKey = String(optIdx + 1);

      // Case A: Option is just a string: "گزینه اول"
      if (typeof opt === "string") {
        return {
          key: defaultKey,
          content: [{ type: "text", value: opt.trim() }],
        };
      }

      // Case B: Option is formula shorthand: { type: "formula", latex: "..." }
      if (
        typeof opt === "object" &&
        opt !== null &&
        "type" in opt &&
        (opt as Record<string, unknown>).type === "formula"
      ) {
        const formulaOption = opt as Record<string, unknown>;
        return {
          key: formulaOption.key ? String(formulaOption.key) : defaultKey,
          content: [opt],
        };
      }

      // Case C: Standard Option object: { key?: "1", content: string | block[] }
      if (typeof opt === "object" && opt !== null) {
        const o = { ...(opt as Record<string, unknown>) };
        if (!o.key) o.key = defaultKey;
        else o.key = String(o.key).trim();

        if (typeof o.content === "string") {
          o.content = [{ type: "text", value: o.content.trim() }];
        }
        return o;
      }

      return opt;
    });
  }

  // 8. Normalize correctOptionKey to string if given as number
  if (q.correctOptionKey !== undefined && q.correctOptionKey !== null) {
    q.correctOptionKey = String(q.correctOptionKey).trim();
  }

  // 9. Default shuffleSafe
  if (q.shuffleSafe === undefined) {
    q.shuffleSafe = false;
  }

  return q;
}

  questions.forEach((rawQuestion, index) => {
    const normalized = normalizeRawQuestion(rawQuestion, index, canonicalDefaults);
    const parsed = importEnvelopeSchema.shape.questions.element.safeParse(normalized);
    if (parsed.success) {
      valid.push(parsed.data);
      validKeys.add(parsed.data.key);
      const fp = computeQuestionFingerprint(parsed.data, canonicalDefaults.subject);
      fingerprints.set(parsed.data.key, fp);
    } else {
      for (const issue of parsed.error.issues) {
        issues.push({
          rowIndex: index + 1,
          externalKey:
            typeof normalized === "object" && normalized && "key" in normalized
              ? String((normalized as Record<string, unknown>).key)
              : undefined,
          path: issue.path.join("."),
          message: issue.message,
        });
      }
    }
  });

  // Process groups if present
  const parsedGroups: ParsedGroupResult[] = [];
  if (Array.isArray(rawObj.groups)) {
    for (const [gIdx, rawGroup] of rawObj.groups.entries()) {
      let groupQuestionKeys = Array.isArray((rawGroup as Record<string, unknown>)?.questionKeys)
        ? ((rawGroup as Record<string, unknown>).questionKeys as string[])
        : [];

      if (
        groupQuestionKeys.length === 0 &&
        rawGroup &&
        typeof rawGroup === "object" &&
        "key" in rawGroup &&
        Array.isArray(rawObj.questions)
      ) {
        const groupKey = String((rawGroup as Record<string, unknown>).key);
        const discovered = (rawObj.questions as Array<Record<string, unknown>>)
          .filter((q) => q && typeof q === "object" && String(q.groupKey || "") === groupKey)
          .map((q) => String(q.key || ""))
          .filter(Boolean);
        if (discovered.length > 0) {
          groupQuestionKeys = discovered;
        }
      }

      const normalizedGroup = typeof rawGroup === "object" && rawGroup !== null
        ? {
            ...(rawGroup as Record<string, unknown>),
            subject: canonicalizeSubject(String((rawGroup as Record<string, unknown>).subject || canonicalDefaults.subject)),
            questionKeys: groupQuestionKeys,
          }
        : rawGroup;
      const gParsed = importGroupSchema.safeParse(normalizedGroup);
      if (gParsed.success) {
        const group = gParsed.data;
        const missingKeys = group.questionKeys.filter((k) => !validKeys.has(k));
        const status = missingKeys.length === 0 ? "complete" : "incomplete";

        if (missingKeys.length > 0) {
          issues.push({
            rowIndex: gIdx + 1,
            externalKey: group.key,
            path: "groups",
            message: `گروه «${group.key}» ناقص است؛ سؤال‌های [${missingKeys.join(", ")}] هنوز وارد یا تأیید نشده‌اند. تا زمان تکمیل، گروه وارد آزمون نخواهد شد.`,
            isWarning: true,
          });
        }

        parsedGroups.push({ group, status, missingKeys });
      } else {
        for (const issue of gParsed.error.issues) {
          issues.push({
            rowIndex: gIdx + 1,
            externalKey: typeof rawGroup === "object" && rawGroup && "key" in rawGroup ? String((rawGroup as Record<string, unknown>).key) : undefined,
            path: `groups.${issue.path.join(".")}`,
            message: issue.message,
          });
        }
      }
    }
  }

  return {
    envelope: {
      ...header.data,
      defaults: canonicalDefaults,
      questions: valid,
      groups: parsedGroups.map((g) => g.group),
    },
    valid,
    groups: parsedGroups,
    issues,
    fingerprints,
  };
}
