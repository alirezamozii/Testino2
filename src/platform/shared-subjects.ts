/**
 * Shared Subjects Catalog — Supabase-backed autocomplete & community registry.
 *
 * - searchSubjectDetails(query): fuzzy search returning full suggestions with recommended metrics.
 * - searchSubjects(query): fuzzy search returning list of subject names.
 * - registerSubject(name): upsert a new subject into shared registry in Supabase & local cache.
 * - getPopularSubjects(limit): top suggested subjects.
 */

import { getSupabaseClient } from "@/platform/auth/supabase-client";
import {
  CANONICAL_MANAGEMENT_SUBJECTS,
  canonicalizeSubject,
  canonicalizeSubjectList,
  normalizeSubjectName,
} from "@/features/questions/domain/subject-registry";

export interface SubjectSuggestion {
  name: string;
  recommendedCoefficient?: number;
  recommendedQuestions?: number;
  category?: string;
  source: "canonical" | "community" | "custom";
}

// Extensive catalog covering popular fields in Iran (National Concour, Master's, General)
export const BROAD_CANONICAL_CATALOG: SubjectSuggestion[] = [
  // Management Master's (Built-in canonical)
  ...CANONICAL_MANAGEMENT_SUBJECTS.map((s) => ({
    name: s.canonicalName,
    recommendedCoefficient: s.defaultCoefficient,
    recommendedQuestions: s.canonicalName.includes("ریاضی") || s.canonicalName.includes("آمار") || s.canonicalName.includes("اقتصاد") ? 20 : 25,
    category: "ارشد مدیریت",
    source: "canonical" as const,
  })),

  // کنکور تجربی
  { name: "زیست‌شناسی", recommendedCoefficient: 12, recommendedQuestions: 45, category: "علوم تجربی", source: "canonical" },
  { name: "شیمی", recommendedCoefficient: 9, recommendedQuestions: 35, category: "علوم تجربی / ریاضی", source: "canonical" },
  { name: "فیزیک", recommendedCoefficient: 7, recommendedQuestions: 30, category: "علوم تجربی / ریاضی", source: "canonical" },
  { name: "زمین‌شناسی", recommendedCoefficient: 1, recommendedQuestions: 15, category: "علوم تجربی", source: "canonical" },

  // کنکور ریاضی
  { name: "حسابان و ریاضیات پایه", recommendedCoefficient: 12, recommendedQuestions: 40, category: "ریاضی و فیزیک", source: "canonical" },
  { name: "هندسه", recommendedCoefficient: 4, recommendedQuestions: 18, category: "ریاضی و فیزیک", source: "canonical" },
  { name: "ریاضیات گسسته و آمار", recommendedCoefficient: 4, recommendedQuestions: 15, category: "ریاضی و فیزیک", source: "canonical" },

  // کنکور انسانی
  { name: "علوم و فنون ادبی", recommendedCoefficient: 8, recommendedQuestions: 30, category: "علوم انسانی", source: "canonical" },
  { name: "عربی تخصصی", recommendedCoefficient: 5, recommendedQuestions: 20, category: "علوم انسانی", source: "canonical" },
  { name: "فلسفه و منطق", recommendedCoefficient: 5, recommendedQuestions: 20, category: "علوم انسانی", source: "canonical" },
  { name: "جامعه‌شناسی", recommendedCoefficient: 5, recommendedQuestions: 20, category: "علوم انسانی", source: "canonical" },
  { name: "روانشناسی", recommendedCoefficient: 3, recommendedQuestions: 20, category: "علوم انسانی", source: "canonical" },
  { name: "تاریخ و جغرافیا", recommendedCoefficient: 5, recommendedQuestions: 30, category: "علوم انسانی", source: "canonical" },

  // کنکور عمومی / زبان
  { name: "ادبیات فارسی", recommendedCoefficient: 4, recommendedQuestions: 25, category: "عمومی", source: "canonical" },
  { name: "دین و زندگی", recommendedCoefficient: 3, recommendedQuestions: 25, category: "عمومی", source: "canonical" },
  { name: "زبان انگلیسی عمومی", recommendedCoefficient: 2, recommendedQuestions: 25, category: "عمومی", source: "canonical" },
  { name: "زبان تخصصی انگلیسی", recommendedCoefficient: 4, recommendedQuestions: 70, category: "زبان‌های خارجی", source: "canonical" },

  // ارشد حسابداری و اقتصاد
  { name: "حسابداری مالی", recommendedCoefficient: 3, recommendedQuestions: 30, category: "ارشد حسابداری", source: "canonical" },
  { name: "حسابداری صنعتی", recommendedCoefficient: 2, recommendedQuestions: 20, category: "ارشد حسابداری", source: "canonical" },
  { name: "حسابرسی", recommendedCoefficient: 2, recommendedQuestions: 20, category: "ارشد حسابداری", source: "canonical" },

  // ارشد کامپیوتر و هوش مصنوعی
  { name: "ساختمان داده‌ها و الگوریتم‌ها", recommendedCoefficient: 4, recommendedQuestions: 20, category: "ارشد کامپیوتر", source: "canonical" },
  { name: "مدارهای منطقی و معماری کامپیوتر", recommendedCoefficient: 3, recommendedQuestions: 20, category: "ارشد کامپیوتر", source: "canonical" },
  { name: "سیستم‌های عامل", recommendedCoefficient: 3, recommendedQuestions: 20, category: "ارشد کامپیوتر", source: "canonical" },
  { name: "پایگاه داده‌ها", recommendedCoefficient: 2, recommendedQuestions: 15, category: "ارشد کامپیوتر", source: "canonical" },
  { name: "هوش مصنوعی", recommendedCoefficient: 3, recommendedQuestions: 20, category: "ارشد کامپیوتر", source: "canonical" },

  // حقوق
  { name: "حقوق مدنی", recommendedCoefficient: 3, recommendedQuestions: 20, category: "ارشد حقوق", source: "canonical" },
  { name: "حقوق تجارت", recommendedCoefficient: 2, recommendedQuestions: 20, category: "ارشد حقوق", source: "canonical" },
  { name: "حقوق جزا و آیین دادرسی کیفری", recommendedCoefficient: 3, recommendedQuestions: 20, category: "ارشد حقوق", source: "canonical" },
];

export const DEFAULT_MANAGEMENT_SUBJECTS = BROAD_CANONICAL_CATALOG.slice(0, 15).map((s) => s.name);

const LOCAL_STORAGE_KEY = "testino_community_subjects_cache";

function getLocalCustomSubjects(): SubjectSuggestion[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalCustomSubject(item: SubjectSuggestion) {
  if (typeof window === "undefined") return;
  try {
    const current = getLocalCustomSubjects();
    if (!current.some((c) => normalizeSubjectName(c.name) === normalizeSubjectName(item.name))) {
      current.unshift(item);
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(current.slice(0, 100)));
    }
  } catch {
    // Ignore storage quota
  }
}

/**
 * Search shared subjects with rich suggestions (including recommended coeff & questions).
 */
export async function searchSubjectDetails(query: string): Promise<SubjectSuggestion[]> {
  const trimmed = normalizeSubjectName(query);
  if (!trimmed || trimmed.length < 1) return [];

  // 1. Check local catalog
  const catalogMatches = BROAD_CANONICAL_CATALOG.filter((item) => {
    const norm = normalizeSubjectName(item.name);
    return norm.includes(trimmed);
  });

  // 2. Check local custom subjects
  const customMatches = getLocalCustomSubjects().filter((item) => {
    const norm = normalizeSubjectName(item.name);
    return norm.includes(trimmed);
  });

  const mergedMap = new Map<string, SubjectSuggestion>();
  for (const item of [...customMatches, ...catalogMatches]) {
    const key = normalizeSubjectName(item.name);
    if (!mergedMap.has(key)) mergedMap.set(key, item);
  }

  // 3. Query Supabase community subjects
  try {
    const client = getSupabaseClient();
    if (client) {
      const { data: subsData } = await client
        .from("subjects")
        .select("name")
        .ilike("normalized_name", `%${trimmed}%`)
        .limit(10);

      if (subsData && subsData.length > 0) {
        for (const row of subsData) {
          const key = normalizeSubjectName(row.name);
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              name: row.name,
              recommendedCoefficient: 2,
              recommendedQuestions: 25,
              category: "جامعه داوطلبان",
              source: "community",
            });
          }
        }
      }
    }
  } catch {
    // Offline fallback
  }

  return Array.from(mergedMap.values()).slice(0, 12);
}

/**
 * Legacy string search for backwards compatibility.
 */
export async function searchSubjects(query: string): Promise<string[]> {
  const details = await searchSubjectDetails(query);
  return details.map((d) => d.name);
}

/**
 * Get popular/frequently used subjects from community.
 */
export async function getPopularSubjects(limit = 16): Promise<string[]> {
  try {
    const client = getSupabaseClient();
    if (!client) return BROAD_CANONICAL_CATALOG.slice(0, limit).map((s) => s.name);

    const { data, error } = await client
      .from("subjects")
      .select("name")
      .limit(limit);

    if (!error && data && data.length > 0) {
      const names = [...data.map((r: { name: string }) => r.name), ...BROAD_CANONICAL_CATALOG.map((s) => s.name)];
      return canonicalizeSubjectList(names).slice(0, limit);
    }

    return BROAD_CANONICAL_CATALOG.slice(0, limit).map((s) => s.name);
  } catch {
    return BROAD_CANONICAL_CATALOG.slice(0, limit).map((s) => s.name);
  }
}

/**
 * Register a subject in both local cache and Supabase community catalog.
 * Automatically makes it immediately available to the user and everyone else.
 */
export async function registerSubject(
  name: string,
  meta?: { recommendedCoefficient?: number; recommendedQuestions?: number }
): Promise<void> {
  const trimmed = name?.trim();
  if (!trimmed || trimmed.length < 2) return;

  const normalized = normalizeSubjectName(trimmed);

  // 1. Immediately store in local custom subjects cache
  saveLocalCustomSubject({
    name: trimmed,
    recommendedCoefficient: meta?.recommendedCoefficient ?? 2,
    recommendedQuestions: meta?.recommendedQuestions ?? 25,
    category: "سفارشی داوطلب",
    source: "custom",
  });

  // 2. Upsert to Supabase subjects table in background
  try {
    const client = getSupabaseClient();
    if (!client) return;

    // Check existing bank or use community bank
    const { data: banks } = await client.from("banks").select("id").limit(1);
    const bankId = banks?.[0]?.id;

    if (bankId) {
      await client.from("subjects").upsert(
        {
          bank_id: bankId,
          name: trimmed,
          normalized_name: normalized,
          language_kind: trimmed.includes("زبان") ? "language" : "general",
        },
        { onConflict: "bank_id,normalized_name" }
      );
    }
  } catch {
    // Graceful offline — local cache already updated
  }
}

