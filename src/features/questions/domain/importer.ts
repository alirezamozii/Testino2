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

export function sanitizeAndRepairJson(source: string): unknown {
  if (typeof source !== "string") {
    throw new Error("داده ورودی باید رشته متنی باشد.");
  }

  let text = source.trim();

  // 1. Direct parse attempt
  try {
    return JSON.parse(text);
  } catch {
    // proceed to repair
  }

  // 2. Strip Markdown code fences if present (```json ... ``` or ``` ...)
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenceMatch) {
    const inner = fenceMatch[1].trim();
    try {
      return JSON.parse(inner);
    } catch {
      text = inner;
    }
  }

  // 3. Extract JSON substring between outermost '{' and '}' or '[' and ']'
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  const firstBracket = text.indexOf("[");
  const lastBracket = text.lastIndexOf("]");

  if (firstBrace !== -1 && lastBrace > firstBrace && (firstBracket === -1 || firstBrace < firstBracket)) {
    text = text.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(text);
    } catch {
      // continue
    }
  } else if (firstBracket !== -1 && lastBracket > firstBracket) {
    text = text.slice(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(text);
    } catch {
      // continue
    }
  }

  // 4. Normalize curly/smart quotes to standard double quotes
  text = text.replace(/[\u201C\u201D\u201E\u201F\u00AB\u00BB]/g, '"');
  text = text.replace(/[\u2018\u2019\u201A\u201B]/g, "'");

  // 5. Remove trailing commas in objects and arrays: , } -> } and , ] -> ]
  text = text.replace(/,\s*([\}\]])/g, "$1");

  try {
    return JSON.parse(text);
  } catch {
    // proceed
  }

  // 6. Handle unescaped control chars
  text = text.replace(/(?<!\\)\t/g, "\\t");

  // 7. Remove single-line JS-style comments: // ...
  text = text.replace(/(^|[^\\])\/\/.*$/gm, "$1");

  // Try again after comment strip and trailing comma cleanup
  try {
    text = text.replace(/,\s*([\}\]])/g, "$1");
    return JSON.parse(text);
  } catch {
    throw new Error("فایل JSON معتبر نیست و هیچ سؤالی ذخیره نشد.");
  }
}

function toEnglishDigits(str: string): string {
  return str
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
}

function slugify(text: string): string {
  return (
    text
      .trim()
      .replace(/[^\u0600-\u06FFa-zA-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "item"
  );
}

function normalizeOptionKey(key: unknown, defaultKey: string): string {
  if (key === undefined || key === null) return defaultKey;
  const s = toEnglishDigits(String(key).trim());

  // Persian letter keys
  if (s === "الف") return "1";
  if (s === "ب") return "2";
  if (s === "ج") return "3";
  if (s === "د") return "4";

  // English letters
  const upper = s.toUpperCase();
  if (upper === "A") return "1";
  if (upper === "B") return "2";
  if (upper === "C") return "3";
  if (upper === "D") return "4";

  return s || defaultKey;
}

function normalizeRawQuestion(
  rawQ: unknown,
  index: number,
  defaults: {
    subject: string;
    chapter?: string | null;
    topic?: string | null;
    source?: { year?: number; title?: string; kind?: string; number?: string };
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
      ? toEnglishDigits(String(q.sourceNumber).trim())
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

function normalizeContentBlock(rawBlock: unknown): unknown {
  if (typeof rawBlock === "string") {
    return { type: "text", value: rawBlock.trim() };
  }
  if (typeof rawBlock !== "object" || rawBlock === null) {
    return rawBlock;
  }
  const b = { ...(rawBlock as Record<string, unknown>) };

  // Normalize table block headers and rows if provided as plain strings/numbers
  if (b.type === "table") {
    if (Array.isArray(b.headers)) {
      b.headers = b.headers.map((h: unknown) => {
        if (typeof h === "string" || typeof h === "number") {
          return { type: "text", value: String(h).trim() };
        }
        return h;
      });
    }
    if (Array.isArray(b.rows)) {
      b.rows = b.rows.map((row: unknown) => {
        if (Array.isArray(row)) {
          return row.map((cell: unknown) => {
            if (typeof cell === "string" || typeof cell === "number") {
              return { type: "text", value: String(cell).trim() };
            }
            return cell;
          });
        }
        return row;
      });
    }
  }

  // Normalize chart block if chartType is coordinate -> xy
  if (b.type === "chart" && b.chartType === "coordinate") {
    b.chartType = "xy";
  }

  return b;
}

function normalizeContentBlocks(blocks: unknown): unknown {
  if (typeof blocks === "string") {
    return [{ type: "text", value: blocks.trim() }];
  }
  if (Array.isArray(blocks)) {
    return blocks.map(normalizeContentBlock);
  }
  return blocks;
}

  // 5. Normalize content if provided as plain string or containing raw table/chart cells
  q.content = normalizeContentBlocks(q.content);

  // 6. Normalize explanation if provided as plain string, empty or containing raw table/chart cells
  q.explanation = normalizeContentBlocks(q.explanation || []);

  // 7. Normalize options
  if (Array.isArray(q.options)) {
    q.options = q.options.map((opt: unknown, optIdx: number) => {
      const defaultKey = String(optIdx + 1);

      // Case A: Option is just a string: "گزینه اول"
      if (typeof opt === "string") {
        let cleanText = opt.trim();
        cleanText = cleanText.replace(/^(?:[1-4]|[۱-۴]|الف|ب|ج|د|[A-Da-d])[\s\.\-\)\:]+\s*/, "");
        return {
          key: defaultKey,
          content: [{ type: "text", value: cleanText || opt.trim() }],
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
          key: normalizeOptionKey(formulaOption.key, defaultKey),
          content: [opt],
        };
      }

      // Case C: Standard Option object: { key?: "1", content: string | block[] }
      if (typeof opt === "object" && opt !== null) {
        const o = { ...(opt as Record<string, unknown>) };
        o.key = normalizeOptionKey(o.key, defaultKey);

        if (typeof o.content === "string") {
          let cleanText = o.content.trim();
          cleanText = cleanText.replace(/^(?:[1-4]|[۱-۴]|الف|ب|ج|د|[A-Da-d])[\s\.\-\)\:]+\s*/, "");
          o.content = [{ type: "text", value: cleanText || o.content.trim() }];
        } else if (Array.isArray(o.content)) {
          o.content = normalizeContentBlocks(o.content);
        }
        return o;
      }

      return opt;
    });
  }

  // 8. Normalize correctOptionKey to string with option key mapping
  if (q.correctOptionKey !== undefined && q.correctOptionKey !== null) {
    q.correctOptionKey = normalizeOptionKey(q.correctOptionKey, "");
  }

  // 9. Smart shuffleSafe detection:
  // If any option contains order-dependent phrases (e.g., "گزینه ۱ و ۲", "همه موارد", "هیچ‌کدام"), force shuffleSafe = false!
  const hasOrderDependency = Array.isArray(q.options) && q.options.some((opt: unknown) => {
    let txt = "";
    if (typeof opt === "string") {
      txt = opt;
    } else if (opt && typeof opt === "object" && "content" in opt && Array.isArray((opt as { content: unknown[] }).content)) {
      txt = (opt as { content: Array<{ value?: string }> }).content.map((c) => c?.value || "").join(" ");
    }
    return /(?:گزینه|مورد|موارد|الف|ب|ج|د)\s*(?:[1-4]|[۱-۴]|الف|ب|ج|د)?\s*(?:و|یا|,)\s*(?:[1-4]|[۱-۴]|الف|ب|ج|د)|(?:همه|تمام|هر\s*سه|هر\s*چهار)\s*موارد|هیچ[\s‌]*کدام|all\s+of\s+the\s+above|none\s+of\s+the\s+above/i.test(txt);
  });

  if (hasOrderDependency) {
    q.shuffleSafe = false;
  } else if (q.shuffleSafe === undefined) {
    q.shuffleSafe = true;
  } else {
    q.shuffleSafe = Boolean(q.shuffleSafe);
  }

  // 10. Ensure question source includes number
  const srcObj = typeof q.source === "object" && q.source !== null ? { ...(q.source as Record<string, unknown>) } : { ...(defaults.source || { kind: "PERSONAL" }) };
  if (!srcObj.number && q.sourceNumber) {
    srcObj.number = String(q.sourceNumber);
  }
  q.source = srcObj;

  return q;
}

function findQuestionByRef(ref: string, questions: ImportQuestion[]): ImportQuestion | undefined {
  const cleanRef = toEnglishDigits(String(ref).trim());
  if (!cleanRef) return undefined;

  // 1. Direct match on key
  let match = questions.find((q) => q.key === cleanRef || toEnglishDigits(q.key) === cleanRef);
  if (match) return match;

  // 2. Direct match on sourceNumber (e.g. ref="8", q.sourceNumber="8")
  match = questions.find((q) => q.sourceNumber && toEnglishDigits(String(q.sourceNumber).trim()) === cleanRef);
  if (match) return match;

  // 3. Direct match on source.number
  match = questions.find((q) => {
    const s = q.source as Record<string, unknown> | undefined;
    return s && s.number !== undefined && toEnglishDigits(String(s.number).trim()) === cleanRef;
  });
  if (match) return match;

  // 4. Normalized "q" or "question" prefix, e.g. "q8" -> "8" or "question-8" -> "8"
  const strippedDigits = cleanRef.replace(/^(?:question|q)[-_]?/i, "").trim();
  if (strippedDigits && strippedDigits !== cleanRef) {
    match = questions.find(
      (q) =>
        (q.sourceNumber && toEnglishDigits(String(q.sourceNumber).trim()) === strippedDigits) ||
        (q.source && typeof q.source === "object" && "number" in q.source && (q.source as { number?: unknown }).number !== undefined && toEnglishDigits(String((q.source as { number?: unknown }).number).trim()) === strippedDigits) ||
        q.key === strippedDigits
    );
    if (match) return match;
  }

  // 5. Match key suffix, e.g. key is "zban-omomy-o-tkhssy-1405-q8" and ref is "8" or "q8"
  const numToMatch = strippedDigits || cleanRef;
  match = questions.find(
    (q) =>
      q.key.endsWith(`-q${numToMatch}`) ||
      q.key.endsWith(`_q${numToMatch}`) ||
      q.key.endsWith(`-q0${numToMatch}`) ||
      q.key.endsWith(`-${numToMatch}`) ||
      q.key.endsWith(`_${numToMatch}`)
  );
  if (match) return match;

  return undefined;
}

export function splitMultipleJsonObjects(source: string): string[] {
  let text = source.trim();
  if (!text) return [];

  // Strip markdown code fences if wrapped entirely in them
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();

  // If text is a valid JSON array or object directly
  try {
    const direct = JSON.parse(text);
    if (Array.isArray(direct)) {
      if (
        direct.length > 0 &&
        typeof direct[0] === "object" &&
        direct[0] !== null &&
        ("defaults" in direct[0] || "questions" in direct[0] || "schemaVersion" in direct[0])
      ) {
        return direct.map((item) => JSON.stringify(item));
      }
    }
    return [text];
  } catch {
    // Proceed to bracket scanner
  }

  const chunks: string[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let objStart = -1;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === "{") {
      if (depth === 0) {
        objStart = i;
      }
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && objStart !== -1) {
        chunks.push(text.slice(objStart, i + 1));
        objStart = -1;
      }
    }
  }

  if (chunks.length >= 2) {
    return chunks;
  }

  return [text];
}

type EnvelopeHeader = Omit<ImportEnvelope, "questions" | "groups">;

function parseSingleEnvelope(
  rawObj: Record<string, unknown>
): {
  header: EnvelopeHeader;
  canonicalDefaults: ImportEnvelope["defaults"];
  valid: ImportQuestion[];
  parsedGroups: ParsedGroupResult[];
  issues: ImportIssue[];
  fingerprints: Map<string, string>;
} {
  // Auto-fill missing envelope defaults if AI omitted them
  if (!rawObj.schemaVersion) rawObj.schemaVersion = "1.0";
  if (!rawObj.defaults || typeof rawObj.defaults !== "object") {
    rawObj.defaults = { subject: "عمومی" };
  } else {
    const d = { ...(rawObj.defaults as Record<string, unknown>) };
    if (!d.subject || typeof d.subject !== "string" || !d.subject.trim()) {
      d.subject = "عمومی";
    }
    rawObj.defaults = d;
  }

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
      const gObj = typeof rawGroup === "object" && rawGroup !== null ? (rawGroup as Record<string, unknown>) : {};
      const groupKey = String(gObj.key || `group-${gIdx + 1}`);

      const rawGroupQuestionKeys = Array.isArray(gObj.questionKeys)
        ? (gObj.questionKeys as unknown[]).map((k) => String(k).trim()).filter(Boolean)
        : [];

      const finalQuestionKeys: string[] = [];
      const missingKeys: string[] = [];

      // 1. Resolve every key/number declared in questionKeys to actual question key in valid
      for (const ref of rawGroupQuestionKeys) {
        const matchedQ = findQuestionByRef(ref, valid);
        if (matchedQ) {
          if (!finalQuestionKeys.includes(matchedQ.key)) {
            finalQuestionKeys.push(matchedQ.key);
          }
          matchedQ.groupKey = groupKey;
        } else {
          // If ref is already a valid key in validKeys (direct key match)
          if (validKeys.has(ref)) {
            if (!finalQuestionKeys.includes(ref)) {
              finalQuestionKeys.push(ref);
            }
          } else {
            // Keep unresolved ref in finalQuestionKeys so the group remembers it expects this key
            if (!finalQuestionKeys.includes(ref)) {
              finalQuestionKeys.push(ref);
            }
            missingKeys.push(ref);
          }
        }
      }

      // 2. Also include any questions in valid that explicitly declare groupKey === groupKey
      const explicitlyLinkedQuestions = valid.filter((q) => q.groupKey === groupKey);
      for (const eq of explicitlyLinkedQuestions) {
        if (!finalQuestionKeys.includes(eq.key)) {
          finalQuestionKeys.push(eq.key);
        }
      }

      // 3. Smart auto-linking for Cloze if nothing linked and kind === "cloze"
      if (finalQuestionKeys.length === 0 && rawGroupQuestionKeys.length === 0) {
        if (gObj.kind === "cloze") {
          const clozeQuestions = valid.filter((q) => !q.groupKey && q.chapter?.toLowerCase().includes("cloze"));
          for (const cq of clozeQuestions) {
            cq.groupKey = groupKey;
            finalQuestionKeys.push(cq.key);
          }
        }
      }

      // 4. Set groupPosition on member questions in order
      finalQuestionKeys.forEach((key, pos) => {
        const q = valid.find((item) => item.key === key);
        if (q && q.groupPosition === undefined) {
          q.groupPosition = pos;
        }
      });

      // Normalize group content if provided as a string
      let groupContent = gObj.content;
      if (typeof groupContent === "string") {
        const isEnglish = /[a-zA-Z]/.test(groupContent);
        groupContent = [
          {
            type: "text",
            value: groupContent.trim(),
            direction: isEnglish ? "ltr" : "rtl",
          },
        ];
      }

      const normalizedGroup = typeof rawGroup === "object" && rawGroup !== null
        ? {
            ...gObj,
            key: groupKey,
            subject: canonicalizeSubject(String(gObj.subject || canonicalDefaults.subject)),
            content: groupContent,
            questionKeys: finalQuestionKeys,
          }
        : rawGroup;
      const gParsed = importGroupSchema.safeParse(normalizedGroup);
      if (gParsed.success) {
        const group = gParsed.data;
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
    header: header.data,
    canonicalDefaults,
    valid,
    parsedGroups,
    issues,
    fingerprints,
  };
}

export function parseImportJson(source: string): ParsedImport {
  const chunks = splitMultipleJsonObjects(source);
  if (chunks.length === 0) {
    throw new Error("فایل JSON معتبر نیست و هیچ سؤالی ذخیره نشد.");
  }

  if (chunks.length === 1) {
    let raw: unknown;
    try {
      raw = sanitizeAndRepairJson(chunks[0]);
    } catch {
      throw new Error("فایل JSON معتبر نیست و هیچ سؤالی ذخیره نشد.");
    }

    if (typeof raw !== "object" || raw === null) {
      throw new Error("ساختار اصلی فایل یا نسخهٔ آن معتبر نیست.");
    }

    let rawObj: Record<string, unknown>;
    if (Array.isArray(raw)) {
      rawObj = {
        schemaVersion: "1.0",
        defaults: { subject: "عمومی" },
        questions: raw,
      };
    } else {
      rawObj = { ...(raw as Record<string, unknown>) };
      if (!Array.isArray(rawObj.questions) && rawObj.data && typeof rawObj.data === "object") {
        const nested = rawObj.data as Record<string, unknown>;
        if (Array.isArray(nested.questions)) {
          rawObj = { ...rawObj, ...nested };
        }
      }
    }

    const singleResult = parseSingleEnvelope(rawObj);
    return {
      envelope: {
        ...singleResult.header,
        defaults: singleResult.canonicalDefaults,
        questions: singleResult.valid,
        groups: singleResult.parsedGroups.map((g) => g.group),
      },
      valid: singleResult.valid,
      groups: singleResult.parsedGroups,
      issues: singleResult.issues,
      fingerprints: singleResult.fingerprints,
    };
  }

  // Multiple envelopes detected! (e.g. user pasted 1405 and 1404 together)
  const allValid: ImportQuestion[] = [];
  const allGroups: ParsedGroupResult[] = [];
  const allIssues: ImportIssue[] = [];
  const allFingerprints = new Map<string, string>();
  let firstHeader: EnvelopeHeader | null = null;
  let firstCanonicalDefaults: ImportEnvelope["defaults"] | null = null;
  const seenGroupKeys = new Set<string>();

  for (let envIdx = 0; envIdx < chunks.length; envIdx++) {
    let raw: unknown;
    try {
      raw = sanitizeAndRepairJson(chunks[envIdx]);
    } catch {
      continue;
    }

    if (typeof raw !== "object" || raw === null) continue;
    let rawObj: Record<string, unknown>;
    if (Array.isArray(raw)) {
      rawObj = {
        schemaVersion: "1.0",
        defaults: { subject: "عمومی" },
        questions: raw,
      };
    } else {
      rawObj = { ...(raw as Record<string, unknown>) };
      if (!Array.isArray(rawObj.questions) && rawObj.data && typeof rawObj.data === "object") {
        const nested = rawObj.data as Record<string, unknown>;
        if (Array.isArray(nested.questions)) {
          rawObj = { ...rawObj, ...nested };
        }
      }
    }

    try {
      const parsedChunk = parseSingleEnvelope(rawObj);
      if (!firstHeader) {
        firstHeader = parsedChunk.header;
        firstCanonicalDefaults = parsedChunk.canonicalDefaults;
      }

      // Disambiguate duplicate group keys across multiple envelopes
      for (const gr of parsedChunk.parsedGroups) {
        let uniqueKey = gr.group.key;
        if (seenGroupKeys.has(uniqueKey)) {
          const defaultsObj = rawObj.defaults as { source?: { year?: number } } | undefined;
          const yr = defaultsObj?.source?.year || (envIdx + 1);
          uniqueKey = `${gr.group.key}-${yr}`;
          const oldKey = gr.group.key;
          gr.group.key = uniqueKey;
          for (const q of parsedChunk.valid) {
            if (q.groupKey === oldKey) {
              q.groupKey = uniqueKey;
            }
          }
        }
        seenGroupKeys.add(uniqueKey);
        allGroups.push(gr);
      }

      allValid.push(...parsedChunk.valid);
      allIssues.push(...parsedChunk.issues);
      for (const [k, fp] of parsedChunk.fingerprints.entries()) {
        allFingerprints.set(k, fp);
      }
    } catch {
      // ignore empty or invalid sub-chunks
    }
  }

  if (allValid.length === 0) {
    throw new Error("فایل JSON معتبر نیست و هیچ سؤالی ذخیره نشد.");
  }

  return {
    envelope: {
      ...(firstHeader || { schemaVersion: "1.0", taxonomy: [], media: [] }),
      defaults: firstCanonicalDefaults || { subject: "عمومی" },
      questions: allValid,
      groups: allGroups.map((g) => g.group),
    },
    valid: allValid,
    groups: allGroups,
    issues: allIssues,
    fingerprints: allFingerprints,
  };
}
