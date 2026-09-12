import type { DatabasePort } from "@/database/ports";
import { OutboxRepository } from "@/database/repositories/outbox-repository";

export type SyncAggregateType = "profileBundle" | "questionBundle" | "sessionBundle";

export interface SyncAggregate {
  entityType: SyncAggregateType;
  entityId: string;
  payload: Record<string, unknown>;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, stableValue(child)])
    );
  }
  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value));
}

export async function hashSyncPayload(payload: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(stableStringify(payload));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function captureSyncAggregates(db: DatabasePort): Promise<SyncAggregate[]> {
  const profiles = await db.query<Record<string, unknown>>("SELECT * FROM profiles ORDER BY id");
  const subjects = await db.query<Record<string, unknown>>("SELECT * FROM subjects ORDER BY id");
  const chapters = await db.query<Record<string, unknown>>("SELECT * FROM chapters ORDER BY id");
  const topics = await db.query<Record<string, unknown>>("SELECT * FROM topics ORDER BY id");

  const questions = await db.query<Record<string, unknown>>("SELECT * FROM questions ORDER BY id");
  const options = await db.query<Record<string, unknown>>("SELECT * FROM question_options ORDER BY question_id, position, id");
  const revisions = await db.query<Record<string, unknown>>("SELECT * FROM question_revisions ORDER BY question_id, version, id");
  const groups = await db.query<Record<string, unknown>>("SELECT * FROM question_groups ORDER BY id");
  const sources = await db.query<Record<string, unknown>>("SELECT * FROM sources ORDER BY id");
  const questionMedia = await db.query<Record<string, unknown>>("SELECT * FROM question_media ORDER BY question_id, group_id, id");
  const mediaFiles = await db.query<Record<string, unknown>>("SELECT * FROM media_files ORDER BY id");

  const sessions = await db.query<Record<string, unknown>>("SELECT * FROM sessions ORDER BY id");
  const sessionQuestions = await db.query<Record<string, unknown>>("SELECT * FROM session_questions ORDER BY session_id, ordinal, id");
  const attempts = await db.query<Record<string, unknown>>("SELECT * FROM attempts ORDER BY session_id, finalized_at, id");
  const attemptEvents = await db.query<Record<string, unknown>>("SELECT * FROM attempt_events ORDER BY session_id, occurred_at, id");
  const reviews = await db.query<Record<string, unknown>>("SELECT * FROM review_items ORDER BY question_id");

  const result: SyncAggregate[] = profiles.map((profile) => {
    const profileSubjects = subjects.filter((subject) => subject.profile_id === profile.id);
    const subjectIds = new Set(profileSubjects.map((subject) => subject.id));
    const profileChapters = chapters.filter((chapter) => subjectIds.has(chapter.subject_id));
    const chapterIds = new Set(profileChapters.map((chapter) => chapter.id));
    return {
      entityType: "profileBundle" as const,
      entityId: String(profile.id),
      payload: {
        profile,
        subjects: profileSubjects,
        chapters: profileChapters,
        topics: topics.filter((topic) => chapterIds.has(topic.chapter_id)),
      },
    };
  });

  for (const question of questions) {
    const group = question.group_id ? groups.find((item) => item.id === question.group_id) ?? null : null;
    const source = question.source_id ? sources.find((item) => item.id === question.source_id) ?? null : null;
    const relations = questionMedia.filter(
      (relation) => relation.question_id === question.id || (group && relation.group_id === group.id)
    );
    const mediaIds = new Set(relations.map((relation) => relation.media_id));
    result.push({
      entityType: "questionBundle",
      entityId: String(question.id),
      payload: {
        question,
        options: options.filter((option) => option.question_id === question.id),
        revisions: revisions.filter((revision) => revision.question_id === question.id),
        group,
        source,
        questionMedia: relations,
        mediaFiles: mediaFiles.filter((media) => mediaIds.has(media.id)),
      },
    });
  }

  for (const session of sessions) {
    const children = sessionQuestions.filter((question) => question.session_id === session.id);
    const childIds = new Set(children.map((question) => question.id));
    const sessionAttempts = attempts.filter((attempt) => attempt.session_id === session.id);
    const attemptQuestionIds = new Set(sessionAttempts.map((attempt) => attempt.question_id));
    result.push({
      entityType: "sessionBundle",
      entityId: String(session.id),
      payload: {
        session,
        sessionQuestions: children,
        attempts: sessionAttempts,
        attemptEvents: attemptEvents.filter(
          (event) => event.session_id === session.id || childIds.has(event.session_question_id)
        ),
        reviews: reviews.filter((review) => attemptQuestionIds.has(review.question_id)),
      },
    });
  }

  return result;
}

export async function captureSyncAggregate(
  db: DatabasePort,
  entityType: SyncAggregateType,
  entityId: string
): Promise<SyncAggregate | null> {
  if (entityType === "profileBundle") {
    const [profile] = await db.query<Record<string, unknown>>("SELECT * FROM profiles WHERE id=? LIMIT 1", [entityId]);
    if (!profile) return null;
    const subjects = await db.query<Record<string, unknown>>("SELECT * FROM subjects WHERE profile_id=? ORDER BY id", [entityId]);
    const subjectIds = subjects.map((subject) => subject.id);
    const chapters = subjectIds.length
      ? await db.query<Record<string, unknown>>(
          `SELECT * FROM chapters WHERE subject_id IN (${subjectIds.map(() => "?").join(",")}) ORDER BY id`,
          subjectIds
        )
      : [];
    const chapterIds = chapters.map((chapter) => chapter.id);
    const topics = chapterIds.length
      ? await db.query<Record<string, unknown>>(
          `SELECT * FROM topics WHERE chapter_id IN (${chapterIds.map(() => "?").join(",")}) ORDER BY id`,
          chapterIds
        )
      : [];
    return { entityType, entityId, payload: { profile, subjects, chapters, topics } };
  }

  if (entityType === "questionBundle") {
    const [question] = await db.query<Record<string, unknown>>("SELECT * FROM questions WHERE id=? LIMIT 1", [entityId]);
    if (!question) return null;
    const options = await db.query<Record<string, unknown>>(
      "SELECT * FROM question_options WHERE question_id=? ORDER BY position,id",
      [entityId]
    );
    const revisions = await db.query<Record<string, unknown>>(
      "SELECT * FROM question_revisions WHERE question_id=? ORDER BY version,id",
      [entityId]
    );
    const [group] = question.group_id
      ? await db.query<Record<string, unknown>>("SELECT * FROM question_groups WHERE id=? LIMIT 1", [question.group_id])
      : [];
    const [source] = question.source_id
      ? await db.query<Record<string, unknown>>("SELECT * FROM sources WHERE id=? LIMIT 1", [question.source_id])
      : [];
    const relations = await db.query<Record<string, unknown>>(
      "SELECT * FROM question_media WHERE question_id=? OR (? IS NOT NULL AND group_id=?) ORDER BY id",
      [entityId, question.group_id ?? null, question.group_id ?? null]
    );
    const mediaIds = relations.map((relation) => relation.media_id);
    const mediaFiles = mediaIds.length
      ? await db.query<Record<string, unknown>>(
          `SELECT * FROM media_files WHERE id IN (${mediaIds.map(() => "?").join(",")}) ORDER BY id`,
          mediaIds
        )
      : [];
    return {
      entityType,
      entityId,
      payload: { question, options, revisions, group: group ?? null, source: source ?? null, questionMedia: relations, mediaFiles },
    };
  }

  const [session] = await db.query<Record<string, unknown>>("SELECT * FROM sessions WHERE id=? LIMIT 1", [entityId]);
  if (!session) return null;
  const sessionQuestions = await db.query<Record<string, unknown>>(
    "SELECT * FROM session_questions WHERE session_id=? ORDER BY ordinal,id",
    [entityId]
  );
  const attempts = await db.query<Record<string, unknown>>(
    "SELECT * FROM attempts WHERE session_id=? ORDER BY finalized_at,id",
    [entityId]
  );
  const attemptEvents = await db.query<Record<string, unknown>>(
    "SELECT * FROM attempt_events WHERE session_id=? ORDER BY occurred_at,id",
    [entityId]
  );
  const questionIds = attempts.map((attempt) => attempt.question_id);
  const reviews = questionIds.length
    ? await db.query<Record<string, unknown>>(
        `SELECT * FROM review_items WHERE question_id IN (${questionIds.map(() => "?").join(",")}) ORDER BY question_id`,
        questionIds
      )
    : [];
  return { entityType, entityId, payload: { session, sessionQuestions, attempts, attemptEvents, reviews } };
}

/**
 * Finds writes made through every local code path, including legacy paths that do
 * not yet call a repository directly. The payload hash is persisted before the
 * network request; the durable outbox remains the retry source of truth.
 */
export async function reconcileLocalMutations(
  ownerId: string,
  db: DatabasePort,
  options?: { maxEntities?: number }
): Promise<number> {
  const maxEntities = Math.min(Math.max(1, options?.maxEntities ?? 200), 1_000);
  const dirty = await db.query<{ entity_type: SyncAggregateType; entity_id: string; dirtied_at: number }>(
    "SELECT entity_type,entity_id,dirtied_at FROM sync_dirty_entities ORDER BY dirtied_at,entity_type,entity_id LIMIT ?",
    [maxEntities]
  );
  const outbox = new OutboxRepository(db);
  let queued = 0;

  for (const item of dirty) {
    const aggregate = await captureSyncAggregate(db, item.entity_type, item.entity_id);
    if (!aggregate) {
      await db.execute(
        "DELETE FROM sync_dirty_entities WHERE entity_type=? AND entity_id=? AND dirtied_at=?",
        [item.entity_type, item.entity_id, item.dirtied_at]
      );
      continue;
    }
    const payloadHash = await hashSyncPayload(aggregate.payload);
    const cached = await db.query<{ payload_hash: string }>(
      "SELECT payload_hash FROM sync_entity_cache WHERE owner_id=? AND entity_type=? AND entity_id=? LIMIT 1",
      [ownerId, aggregate.entityType, aggregate.entityId]
    );
    if (cached[0]?.payload_hash === payloadHash) {
      await db.execute(
        "DELETE FROM sync_dirty_entities WHERE entity_type=? AND entity_id=? AND dirtied_at=?",
        [item.entity_type, item.entity_id, item.dirtied_at]
      );
      continue;
    }

    const mutationId = `state:${aggregate.entityType}:${aggregate.entityId}:${payloadHash}`;
    await db.transaction(async (trx) => {
      await outbox.enqueueIfAbsent(
        ownerId,
        {
          mutationId,
          entityType: aggregate.entityType,
          entityId: aggregate.entityId,
          baseVersion: 1,
          payload: aggregate.payload,
        },
        trx
      );
      await trx.execute(
        `INSERT INTO sync_entity_cache(owner_id, entity_type, entity_id, payload_hash, observed_at)
         VALUES(?, ?, ?, ?, ?)
         ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET
           payload_hash=excluded.payload_hash,
           observed_at=excluded.observed_at`,
        [ownerId, aggregate.entityType, aggregate.entityId, payloadHash, Date.now()]
      );
      await trx.execute(
        "DELETE FROM sync_dirty_entities WHERE entity_type=? AND entity_id=? AND dirtied_at=?",
        [item.entity_type, item.entity_id, item.dirtied_at]
      );
    });
    queued += 1;
  }

  return queued;
}
