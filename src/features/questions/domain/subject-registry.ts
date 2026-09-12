/**
 * Canonical Subject Registry for Iranian Master's in Management (کنکور کارشناسی ارشد مدیریت)
 * Provides application-level canonical naming, reviewed alias mapping, normalization,
 * and seamless integration between Profile, Goals, Prompt Builder, Question Bank, and Analytics.
 */

import {
  SUBJECT_CONFIGS,
  type SubjectPromptConfig,
} from "@/features/prompts/domain/prompt-templates";

export interface CanonicalSubjectEntry {
  id: string; // e.g. "ENG", "ISL", "MATH", "STAT", "MGT", "MICRO", "MACRO", "OR", "PROD", "MKT", "FIN"
  canonicalName: string;
  titleFa: string;
  abbreviation: string;
  defaultCoefficient: number;
  aliases: string[];
}

export const CANONICAL_MANAGEMENT_SUBJECTS: CanonicalSubjectEntry[] = [
  {
    id: "ENG",
    canonicalName: "زبان عمومی و تخصصی",
    titleFa: "زبان عمومی و تخصصی",
    abbreviation: "ENG",
    defaultCoefficient: 3,
    aliases: [
      "زبان",
      "زبان انگلیسی",
      "زبان عمومی",
      "زبان تخصصی",
      "زبان عمومی و تخصصی",
      "زبان عمومی و تخصصی مدیریت",
      "زبان عمومی و متون تخصصی",
      "متون تخصصی زبان",
      "english",
      "general and specialized english",
    ],
  },
  {
    id: "ISL",
    canonicalName: "مدیریت از دیدگاه اسلام",
    titleFa: "مدیریت از دیدگاه اسلام",
    abbreviation: "ISL",
    defaultCoefficient: 2,
    aliases: [
      "اسلام",
      "مدیریت اسلام",
      "مدیریت اسلامی",
      "مدیریت از دیدگاه اسلام",
      "اصول و مبانی مدیریت از دیدگاه اسلام",
      "مبانی مدیریت از دیدگاه اسلام",
      "اخلاق و مدیریت اسلامی",
      "islamic management",
    ],
  },
  {
    id: "MATH",
    canonicalName: "ریاضی عمومی",
    titleFa: "ریاضی عمومی",
    abbreviation: "MATH",
    defaultCoefficient: 2,
    aliases: [
      "ریاضی",
      "ریاضیات",
      "ریاضی عمومی",
      "ریاضیات عمومی",
      "ریاضی عمومی مدیریت",
      "ریاضی و آمار",
      "ریاضیات و کاربرد آن در مدیریت",
      "math",
      "mathematics",
    ],
  },
  {
    id: "STAT",
    canonicalName: "آمار و احتمالات",
    titleFa: "آمار و احتمالات",
    abbreviation: "STAT",
    defaultCoefficient: 2,
    aliases: [
      "آمار",
      "امار",
      "آمار و احتمالات",
      "آمار و کاربرد آن در مدیریت",
      "آمار و کاربرد آن",
      "احتمالات",
      "آمار مدیریت",
      "statistics",
    ],
  },
  {
    id: "MGT",
    canonicalName: "تئوری‌های مدیریت",
    titleFa: "تئوری‌های مدیریت",
    abbreviation: "MGT",
    defaultCoefficient: 3,
    aliases: [
      "تئوری مدیریت",
      "تئوریهای مدیریت",
      "تئوری های مدیریت",
      "تئوری‌های مدیریت",
      "تئوری‌های سازمان و مدیریت",
      "تئوری های مدیریت و رفتار سازمانی",
      "مبانی سازمان و مدیریت",
      "اصول مدیریت",
      "رفتار سازمانی",
      "management theories",
    ],
  },
  {
    id: "MICRO",
    canonicalName: "اقتصاد خرد",
    titleFa: "اقتصاد خرد",
    abbreviation: "MICRO",
    defaultCoefficient: 2,
    aliases: [
      "خرد",
      "اقتصاد خرد",
      "اقتصاد خرد مدیریت",
      "میکرو",
      "microeconomics",
      "micro",
    ],
  },
  {
    id: "MACRO",
    canonicalName: "اقتصاد کلان",
    titleFa: "اقتصاد کلان",
    abbreviation: "MACRO",
    defaultCoefficient: 2,
    aliases: [
      "کلان",
      "اقتصاد کلان",
      "اقتصاد کلان مدیریت",
      "ماکرو",
      "macroeconomics",
      "macro",
    ],
  },
  {
    id: "OR",
    canonicalName: "تحقیق در عملیات",
    titleFa: "تحقیق در عملیات",
    abbreviation: "OR",
    defaultCoefficient: 2,
    aliases: [
      "تحقیق در عملیات",
      "تحقیق عملیات",
      "پژوهش عملیاتی",
      "علم مدیریت",
      "روش های مقداری در مدیریت",
      "روش‌های مقداری در مدیریت",
      "operations research",
      "or",
    ],
  },
  {
    id: "PROD",
    canonicalName: "مدیریت تولید",
    titleFa: "مدیریت تولید",
    abbreviation: "PROD",
    defaultCoefficient: 2,
    aliases: [
      "تولید",
      "مدیریت تولید",
      "مدیریت تولید و عملیات",
      "تولید و عملیات",
      "مدیریت عملیات",
      "production management",
      "operations management",
    ],
  },
  {
    id: "MKT",
    canonicalName: "مدیریت بازاریابی",
    titleFa: "مدیریت بازاریابی",
    abbreviation: "MKT",
    defaultCoefficient: 3,
    aliases: [
      "بازاریابی",
      "مدیریت بازاریابی",
      "اصول بازاریابی",
      "بازاریابی و مدیریت بازار",
      "مدیریت بازار",
      "marketing",
      "marketing management",
    ],
  },
  {
    id: "FIN",
    canonicalName: "مدیریت مالی",
    titleFa: "مدیریت مالی",
    abbreviation: "FIN",
    defaultCoefficient: 3,
    aliases: [
      "مالی",
      "مدیریت مالی",
      "مدیریت مالی ۱ و ۲",
      "اصول مدیریت مالی",
      "financial management",
      "finance",
    ],
  },
];

/**
 * Standard text normalizer for Persian text:
 * Converts Arabic yeh/kaf to Persian, removes zwnj/invisible characters, trims and collapses spaces.
 */
export function normalizeSubjectName(raw: string): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/ة/g, "ه")
    .replace(/[\u200C\u200B\uFEFF\u00A0]/g, " ") // replace zero-width and non-breaking spaces with space
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, " ") // replace punctuation with space
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

// Precomputed Map of normalized alias -> CanonicalSubjectEntry
const ALIAS_MAP = new Map<string, CanonicalSubjectEntry>();
for (const entry of CANONICAL_MANAGEMENT_SUBJECTS) {
  // Add ID
  ALIAS_MAP.set(normalizeSubjectName(entry.id), entry);
  // Add abbreviation
  ALIAS_MAP.set(normalizeSubjectName(entry.abbreviation), entry);
  // Add canonical name
  ALIAS_MAP.set(normalizeSubjectName(entry.canonicalName), entry);
  // Add titleFa
  ALIAS_MAP.set(normalizeSubjectName(entry.titleFa), entry);
  // Add all aliases
  for (const alias of entry.aliases) {
    ALIAS_MAP.set(normalizeSubjectName(alias), entry);
  }
}

/**
 * Resolves any reviewed subject name or alias to its CanonicalSubjectEntry.
 * Returns null if the subject is completely custom (not in the standard Konkur catalog).
 */
export function getCanonicalSubjectEntry(nameOrId: string): CanonicalSubjectEntry | null {
  if (!nameOrId || typeof nameOrId !== "string") return null;
  const normalized = normalizeSubjectName(nameOrId);
  if (!normalized) return null;

  // Direct map lookup
  if (ALIAS_MAP.has(normalized)) {
    return ALIAS_MAP.get(normalized)!;
  }

  // Substring matching is intentionally forbidden. A short token such as
  // «آمار» inside a custom course must not silently reclassify that course.
  // Reviewed variants belong in the explicit alias list above.
  return null;
}

/**
 * Returns the standard canonical Persian name for any subject.
 * If not recognized in the standard Konkur catalog, returns the cleaned original name.
 */
export function canonicalizeSubject(nameOrId: string): string {
  const entry = getCanonicalSubjectEntry(nameOrId);
  if (entry) return entry.canonicalName;
  const cleaned = nameOrId
    ?.replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200C\u200B\uFEFF\u00A0]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "درس عمومی";
}

export function canonicalSubjectKey(nameOrId: string): string {
  const entry = getCanonicalSubjectEntry(nameOrId);
  return entry ? `known:${entry.id}` : `custom:${normalizeSubjectName(nameOrId)}`;
}

export function canonicalizeSubjectList(names: string[]): string[] {
  const unique = new Map<string, string>();
  for (const name of names) {
    const canonical = canonicalizeSubject(name);
    const key = canonicalSubjectKey(canonical);
    if (!unique.has(key)) unique.set(key, canonical);
  }
  return [...unique.values()];
}

export function subjectNamesForMatching(nameOrId: string): string[] {
  const entry = getCanonicalSubjectEntry(nameOrId);
  return entry
    ? [...new Set([entry.canonicalName, entry.titleFa, ...entry.aliases])]
    : [canonicalizeSubject(nameOrId)];
}

export function canonicalizeSubjectRecords<T extends { name: string }>(records: T[]): T[] {
  const unique = new Map<string, T>();
  for (const record of records) {
    const canonical = canonicalizeSubject(record.name);
    const key = canonicalSubjectKey(canonical);
    const normalizedOriginal = normalizeSubjectName(record.name);
    const normalizedCanonical = normalizeSubjectName(canonical);
    const current = unique.get(key);
    const normalizedRecord = { ...record, name: canonical };

    if (!current || normalizedOriginal === normalizedCanonical) {
      unique.set(key, normalizedRecord);
    }
  }
  return [...unique.values()];
}

/**
 * Determines whether two subject names refer to the same subject.
 * Handles different spellings, with/without "مدیریت", with/without zwnj, etc.
 *
 * Example:
 *   isSameSubject("بازاریابی", "مدیریت بازاریابی") === true
 *   isSameSubject("تئوری های مدیریت", "تئوری‌های مدیریت") === true
 *   isSameSubject("ریاضی", "ریاضی عمومی") === true
 */
export function isSameSubject(nameA: string, nameB: string): boolean {
  if (!nameA || !nameB) return false;
  const normA = normalizeSubjectName(nameA);
  const normB = normalizeSubjectName(nameB);
  if (normA === normB) return true;

  const entryA = getCanonicalSubjectEntry(nameA);
  const entryB = getCanonicalSubjectEntry(nameB);

  if (entryA && entryB) {
    return entryA.id === entryB.id;
  }

  return false;
}

/**
 * Resolves a subject to its matching SubjectPromptConfig for AI extraction.
 * If the subject is a custom subject, dynamically creates a custom configuration
 * based on the universal master template so custom subjects are never broken.
 */
export function findSubjectPromptConfig(nameOrId: string, customTitle?: string): SubjectPromptConfig {
  const entry = getCanonicalSubjectEntry(nameOrId);
  if (entry && SUBJECT_CONFIGS[entry.id]) {
    return SUBJECT_CONFIGS[entry.id];
  }

  if (SUBJECT_CONFIGS[nameOrId]) {
    return SUBJECT_CONFIGS[nameOrId];
  }

  // Fallback: Dynamic config based on universal prompt with custom subject title
  const effectiveTitle = customTitle?.trim() || nameOrId?.trim() || "درس سفارشی";
  return {
    ...SUBJECT_CONFIGS.universal,
    id: `custom_${normalizeSubjectName(effectiveTitle).replace(/\s+/g, "_")}`,
    titleFa: effectiveTitle,
    titleEn: effectiveTitle,
    abbreviation: "SUBJ",
    defaultChapter: "کلیات و مبانی",
    defaultTopic: `مباحث ${effectiveTitle}`,
    descriptionFa: `پرامپت اختصاصی و بهینه‌سازی‌شده برای درس ${effectiveTitle}.`,
  };
}
