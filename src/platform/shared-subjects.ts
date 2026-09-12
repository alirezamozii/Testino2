/**
 * Shared Subjects Catalog — Supabase-backed autocomplete & community registry.
 *
 * - searchSubjects(query): fuzzy search for autocomplete dropdown.
 * - registerSubject(name): upsert a new subject into shared registry in Supabase.
 * - getPopularSubjects(limit): top suggested subjects.
 *
 * Built-in fallback to the reviewed management subject labels ensures instant
 * autocomplete even before network response or in offline mode.
 */

import { getSupabaseClient } from "@/platform/auth/supabase-client";
import {
  CANONICAL_MANAGEMENT_SUBJECTS,
  canonicalizeSubject,
  canonicalizeSubjectList,
  normalizeSubjectName,
} from "@/features/questions/domain/subject-registry";

export const DEFAULT_MANAGEMENT_SUBJECTS = CANONICAL_MANAGEMENT_SUBJECTS.map((subject) => subject.canonicalName);

export interface SharedSubject {
  id: string;
  name: string;
  usage_count: number;
}

/**
 * Search shared subjects by partial name (autocomplete).
 * Returns matching subjects sorted by relevance.
 * Combines Supabase community subjects with default management catalog.
 */
export async function searchSubjects(query: string): Promise<string[]> {
  const trimmed = normalizeSubjectName(query);
  if (!trimmed || trimmed.length < 1) return [];

  // 1. Local / Catalog matches first
  const localMatches = CANONICAL_MANAGEMENT_SUBJECTS.filter((subject) =>
    [subject.canonicalName, ...subject.aliases].some((name) => normalizeSubjectName(name).includes(trimmed))
  ).map((subject) => subject.canonicalName);

  try {
    const client = getSupabaseClient();
    if (!client) return localMatches;

    // Search in subjects table
    const { data: subsData } = await client
      .from("subjects")
      .select("name")
      .ilike("normalized_name", `%${trimmed}%`)
      .limit(15);

    if (subsData && subsData.length > 0) {
      return canonicalizeSubjectList([...localMatches, ...subsData.map((r: { name: string }) => r.name)]).slice(0, 15);
    }

    return localMatches;
  } catch {
    return localMatches;
  }
}

/**
 * Get popular/frequently used subjects from community.
 * Shows the reviewed management subjects by default, plus any registered subjects.
 */
export async function getPopularSubjects(limit = 16): Promise<string[]> {
  try {
    const client = getSupabaseClient();
    if (!client) return DEFAULT_MANAGEMENT_SUBJECTS.slice(0, limit);

    const { data, error } = await client
      .from("subjects")
      .select("name")
      .limit(limit);

    if (!error && data && data.length > 0) {
      return canonicalizeSubjectList([...DEFAULT_MANAGEMENT_SUBJECTS, ...data.map((r: { name: string }) => r.name)]).slice(0, limit);
    }

    return DEFAULT_MANAGEMENT_SUBJECTS.slice(0, limit);
  } catch {
    return DEFAULT_MANAGEMENT_SUBJECTS.slice(0, limit);
  }
}

/**
 * Register a subject in the Supabase catalog.
 * Inserts the new subject so it becomes available to other users.
 * Silently fails if offline or without permission.
 */
export async function registerSubject(name: string): Promise<void> {
  try {
    const trimmed = canonicalizeSubject(name);
    if (!trimmed) return;

    const client = getSupabaseClient();
    if (!client) return;

    const normalized = normalizeSubjectName(trimmed);

    // Fetch shared bank ID
    const { data: banks } = await client.from("banks").select("id").limit(1);
    const bankId = banks?.[0]?.id;

    if (bankId) {
      await client.from("subjects").upsert({
        bank_id: bankId,
        name: trimmed,
        normalized_name: normalized,
        language_kind: trimmed.includes("زبان") ? "language" : "general"
      }, { onConflict: "bank_id,normalized_name" });
    }
  } catch {
    // Graceful offline — do nothing
  }
}
