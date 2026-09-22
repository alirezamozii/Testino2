/**
 * Community Questions Pool — Automatic crowd-sharing of questions across Testino users.
 *
 * - publishQuestionToCommunity: Share a newly created or imported question with all users.
 * - syncCommunityQuestionsForSubjects: Download community-shared questions for the user's active subjects.
 */

import { getSupabaseClient } from "@/platform/auth/supabase-client";
import { registerSubject } from "@/platform/shared-subjects";
import { canonicalizeSubject } from "@/features/questions/domain/subject-registry";
import { checkIsOwner } from "@/lib/permissions";
import type { AppDatabase } from "@/database/app-database";
import type { ContentBlock } from "@/features/questions/domain/question-schema";

export interface CommunitySyncResult {
  addedCount: number;
  error?: string;
}

/**
 * Automatically publish a question to the community repository in Supabase.
 * ONLY allowed for the platform Owner. Regular user edits remain local.
 */
export async function publishQuestionToCommunity(input: {
  id: string;
  subject: string;
  chapter?: string | null;
  topic?: string | null;
  content: ContentBlock[];
  options: Array<{ id?: string; key: string; content: ContentBlock[] }>;
  correctOptionKey?: string | null;
  correctOptionId?: string | null;
  explanation?: ContentBlock[];
  shuffleSafe?: boolean;
}): Promise<void> {
  const isOwner = await checkIsOwner();
  if (!isOwner) {
    // Regular users never overwrite or publish to the central cloud repository
    return;
  }

  const client = getSupabaseClient();
  if (!client) return;

  const canonSubject = canonicalizeSubject(input.subject);
  // Auto register subject name in catalog
  void registerSubject(canonSubject);

  try {
    const now = Date.now();
    const payload = {
      question: {
        id: input.id,
        subject: canonSubject,
        chapter: input.chapter || null,
        topic: input.topic || null,
        content_json: JSON.stringify(input.content),
        explanation_json: JSON.stringify(input.explanation || []),
        correct_option_id: input.correctOptionId || null,
        status: "published",
        shuffle_safe: input.shuffleSafe ? 1 : 0,
        is_community: true,
        created_at: now,
        updated_at: now,
        is_owner_update: true,
      },
      options: input.options.map((opt, idx) => ({
        id: opt.id || crypto.randomUUID(),
        question_id: input.id,
        external_key: opt.key,
        position: idx,
        content_json: JSON.stringify(opt.content),
      })),
      revisions: [
        {
          id: crypto.randomUUID(),
          question_id: input.id,
          version: 1,
          snapshot_json: JSON.stringify(input),
          created_at: now,
        },
      ],
    };

    // Store in Supabase sync_entity_state or community table
    await client.from("sync_entity_state").upsert(
      {
        owner_id: "00000000-0000-0000-0000-000000000000",
        entity_type: "questionBundle",
        entity_id: input.id,
        server_version: 1,
        is_tombstone: false,
        payload,
        last_change_seq: now,
        updated_at: new Date(now).toISOString(),
      },
      { onConflict: "owner_id,entity_type,entity_id" }
    );
  } catch {
    // Offline or permissions graceful fallback
  }
}

/**
 * Synchronize community questions for the user's active subjects.
 * Fetches questions from Supabase and merges them into the local SQLite database.
 * If a question already exists locally but the cloud has an update from the Owner,
 * it updates the local question content, options, and explanation.
 */
export async function syncCommunityQuestionsForSubjects(
  subjectNames: string[],
  db: AppDatabase
): Promise<CommunitySyncResult> {
  const client = getSupabaseClient();
  if (!client || !subjectNames.length) return { addedCount: 0 };

  const cleanedNames = Array.from(new Set(subjectNames.map((s) => canonicalizeSubject(s)).filter(Boolean)));
  if (!cleanedNames.length) return { addedCount: 0 };

  try {
    // 1. Query community questions from Supabase
    const { data: rows, error } = await client
      .from("sync_entity_state")
      .select("payload")
      .eq("entity_type", "questionBundle")
      .eq("is_tombstone", false)
      .limit(100);

    if (error || !rows || rows.length === 0) {
      return { addedCount: 0 };
    }

    let addedCount = 0;

    for (const row of rows) {
      const bundle = row.payload as {
        question?: Record<string, unknown>;
        options?: Array<Record<string, unknown>>;
      };
      if (!bundle?.question) continue;

      const q = bundle.question;
      const qSubject = canonicalizeSubject(String(q.subject || ""));

      // Check if user has this subject in their curriculum
      if (!cleanedNames.some((name) => canonicalizeSubject(name) === qSubject)) {
        continue;
      }

      const qId = String(q.id || "");
      if (!qId) continue;

      const content = typeof q.content_json === "string" ? JSON.parse(q.content_json) : (q.content_json || []);
      const explanation = typeof q.explanation_json === "string" ? JSON.parse(q.explanation_json) : (q.explanation_json || []);

      const options = (bundle.options || []).map((o) => ({
        id: String(o.id || crypto.randomUUID()),
        key: String(o.external_key || "a"),
        content: typeof o.content_json === "string" ? JSON.parse(o.content_json) : (o.content_json || []),
      }));

      const correctOptionId = q.correct_option_id ? String(q.correct_option_id) : null;
      const remoteUpdated = Number(q.updated_at || q.created_at || 0);

      // Check if already in local SQLite
      const existing = await db.getQuestion(qId);
      if (existing) {
        // If question already exists locally, update it if the cloud version is newer (owner edit)
        const localCreated = Number(existing.createdAt || 0);
        if (remoteUpdated > localCreated) {
          await db.getClient().batch([
            {
              sql: `UPDATE questions SET
                      subject=?, chapter=?, topic=?, content_json=?, explanation_json=?,
                      correct_option_id=?, status='published', shuffle_safe=?
                    WHERE id=?`,
              bind: [
                qSubject,
                q.chapter ? String(q.chapter) : null,
                q.topic ? String(q.topic) : null,
                JSON.stringify(content),
                JSON.stringify(explanation),
                correctOptionId,
                q.shuffle_safe ? 1 : 0,
                qId,
              ],
            },
            {
              sql: "DELETE FROM question_options WHERE question_id=?",
              bind: [qId],
            },
            ...options.map((opt, pos) => ({
              sql: `INSERT INTO question_options(id, question_id, external_key, position, content_json)
                    VALUES(?, ?, ?, ?, ?)`,
              bind: [opt.id, qId, opt.key, pos, JSON.stringify(opt.content)],
            })),
          ]);
          addedCount++;
        }
        continue;
      }

      // Insert new question into local SQLite
      await db.getClient().batch([
        {
          sql: `INSERT OR IGNORE INTO questions(id, external_key, subject, chapter, topic, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          bind: [
            qId,
            `community-${qId.slice(0, 8)}`,
            qSubject,
            q.chapter ? String(q.chapter) : null,
            q.topic ? String(q.topic) : null,
            JSON.stringify(content),
            JSON.stringify(explanation),
            correctOptionId,
            "published",
            q.shuffle_safe ? 1 : 0,
            remoteUpdated || Date.now(),
          ],
        },
        ...options.map((opt, pos) => ({
          sql: `INSERT OR IGNORE INTO question_options(id, question_id, external_key, position, content_json)
                VALUES(?, ?, ?, ?, ?)`,
          bind: [opt.id, qId, opt.key, pos, JSON.stringify(opt.content)],
        })),
      ]);

      addedCount++;
    }

    return { addedCount };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { addedCount: 0, error: msg };
  }
}
