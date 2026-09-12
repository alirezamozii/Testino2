import type { DatabasePort } from "@/database/ports";
import type { OutboxRepository } from "@/database/repositories/outbox-repository";
import type { SyncTransport, PullChangeItem } from "./ports";
import { ConflictPolicy } from "./conflict-policy";
import { hashSyncPayload } from "./aggregate-snapshots";

export interface PullResult {
  pulledCount: number;
  hasMore: boolean;
  errors: string[];
}

export async function executePull(
  ownerId: string,
  db: DatabasePort,
  outboxRepo: OutboxRepository,
  transport: SyncTransport,
  options?: { limit?: number }
): Promise<PullResult> {
  const syncState = await outboxRepo.getSyncState(ownerId);
  const currentCursor = syncState?.remote_cursor || "0";
  const limit = Math.min(options?.limit || 100, 100);

  const errors: string[] = [];

  try {
    const pullResponse = await transport.pull(currentCursor, limit);

    if (!pullResponse.changes.length) {
      await outboxRepo.updateSyncState(ownerId, {
        last_pull_at: Date.now(),
      });
      return { pulledCount: 0, hasMore: false, errors: [] };
    }

    const conflictPolicy = new ConflictPolicy();

    // Durable transaction: Apply all remote changes and advance cursor atomically
    await db.transaction(async (trx) => {
      for (const item of pullResponse.changes) {
        await applyRemoteChange(ownerId, trx, item, conflictPolicy);
      }

      await outboxRepo.updateSyncState(
        ownerId,
        {
          remote_cursor: pullResponse.nextCursor,
          last_pull_at: Date.now(),
          last_error_code: null,
        },
        trx
      );
    });

    return {
      pulledCount: pullResponse.changes.length,
      hasMore: pullResponse.hasMore,
      errors: [],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);

    await outboxRepo.updateSyncState(ownerId, {
      last_error_code: message,
    });

    return { pulledCount: 0, hasMore: false, errors };
  }
}

export async function applyRemoteChange(
  ownerId: string,
  trx: DatabasePort,
  item: PullChangeItem,
  conflictPolicy: ConflictPolicy
): Promise<void> {
  const { entityType, entityId, payload, isTombstone } = item;

  if (isTombstone) {
    const now = Date.now();
    switch (entityType) {
      case "question":
        await trx.execute("UPDATE questions SET inactive_at=? WHERE id=?", [now, entityId]);
        break;
      case "profile":
        await trx.execute("UPDATE profiles SET inactive_at=? WHERE id=?", [now, entityId]);
        break;
      case "subject":
        await trx.execute("UPDATE subjects SET inactive_at=? WHERE id=?", [now, entityId]);
        break;
      case "questionGroup":
        await trx.execute("UPDATE question_groups SET status='incomplete' WHERE id=?", [entityId]);
        break;
      case "media":
      case "mediaManifest":
        await trx.execute("UPDATE media_files SET availability='missing' WHERE id=?", [entityId]);
        break;
    }
    return;
  }

  switch (entityType) {
    case "profileBundle":
      await applyProfileBundle(trx, payload);
      break;

    case "questionBundle":
      await applyQuestionBundle(trx, payload);
      break;

    case "sessionBundle":
      await applySessionBundle(ownerId, trx, entityId, payload);
      break;

    case "profile": {
      const p = payload as { name?: string; targetTrack?: string; penaltyNumerator?: number; penaltyDenominator?: number };
      await trx.execute(
        `INSERT INTO profiles(id, name, target_track, penalty_numerator, penalty_denominator, created_at)
         VALUES(?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           target_track=excluded.target_track,
           penalty_numerator=excluded.penalty_numerator,
           penalty_denominator=excluded.penalty_denominator`,
        [
          entityId,
          String(p.name || "پروفایل"),
          p.targetTrack ? String(p.targetTrack) : null,
          Number(p.penaltyNumerator ?? 0),
          Number(p.penaltyDenominator ?? 1),
          Date.now(),
        ]
      );
      break;
    }

    case "subject": {
      const s = payload as { profileId?: string; name?: string; coefficient?: number; targetPercentage?: number; questionCount?: number; scoreGroup?: string | null };
      if (!s.profileId || !s.name) return;
      await trx.execute(
        `INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, question_count, score_group, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name=excluded.name,
           coefficient=excluded.coefficient,
           target_percentage=excluded.target_percentage,
           question_count=excluded.question_count,
           score_group=excluded.score_group`,
        [
          entityId,
          String(s.profileId),
          String(s.name),
          Number(s.coefficient ?? 1),
          Number(s.targetPercentage ?? 70),
          Number(s.questionCount ?? 25),
          s.scoreGroup?.trim() || null,
          Date.now(),
        ]
      );
      break;
    }

    case "session": {
      const s = payload as { profileId?: string; state?: string; selectionSeed?: string; configJson?: unknown };
      // Conflict check for terminal states and concurrent divergent edits
      const existing = await trx.query<{ state: string }>("SELECT state FROM sessions WHERE id=? LIMIT 1", [entityId]);
      const localState = existing[0]?.state;
      const decision = conflictPolicy.resolve({
        entityType: "session",
        localState,
        remoteState: s.state,
        remoteVersion: item.serverVersion,
        hasDivergentLocalChanges: localState === "RUNNING" && s.state === "RUNNING",
      });

      if (decision === "fork") {
        // Recovery fork: preserve local session in a recovery fork before applying remote
        const forkId = `${entityId}_recovery_fork_${Date.now()}`;
        const fullSession = await trx.query<{ profile_id: string; selection_seed: string; config_json: string }>(
          "SELECT profile_id, selection_seed, config_json FROM sessions WHERE id=? LIMIT 1",
          [entityId]
        );
        if (fullSession.length) {
          await trx.execute(
            `INSERT INTO sessions(id, profile_id, state, selection_seed, created_at)
             VALUES(?, ?, 'PAUSED', ?, ?)`,
            [forkId, fullSession[0].profile_id, fullSession[0].selection_seed, Date.now()]
          );
          const questions = await trx.query<{
            id: string;
            ordinal: number;
            question_id: string;
            snapshot_json: string;
            option_order_json: string;
            selected_option_id: string | null;
            visited: number;
          }>(
            "SELECT id, ordinal, question_id, snapshot_json, option_order_json, selected_option_id, visited FROM session_questions WHERE session_id=?",
            [entityId]
          );
          for (const q of questions) {
            await trx.execute(
              `INSERT INTO session_questions(id, session_id, ordinal, question_id, snapshot_json, option_order_json, selected_option_id, visited)
               VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
              [crypto.randomUUID(), forkId, q.ordinal, q.question_id, q.snapshot_json || "{}", q.option_order_json || "[]", q.selected_option_id, q.visited]
            );
          }
        }
      }

      if (decision === "apply_remote" || decision === "fork" || !existing.length) {
        await trx.execute(
          `INSERT INTO sessions(id, profile_id, state, selection_seed, created_at)
           VALUES(?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             state=excluded.state`,
          [
            entityId,
            String(s.profileId || ""),
            String(s.state || "CREATED"),
            String(s.selectionSeed || crypto.randomUUID()),
            Date.now(),
          ]
        );
      }
      break;
    }

    case "attempt": {
      const a = payload as {
        sessionQuestionId?: string;
        sessionId?: string;
        questionId?: string;
        result?: string;
        visited?: boolean;
        confidence?: string | null;
        activeMs?: number;
        finalizedAt?: number;
      };
      if (!a.sessionQuestionId || !a.sessionId || !a.questionId) return;

      await trx.execute(
        `INSERT OR IGNORE INTO attempts(id, session_question_id, session_id, question_id, result, visited, confidence, active_ms, finalized_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entityId,
          String(a.sessionQuestionId),
          String(a.sessionId),
          String(a.questionId),
          String(a.result || "unanswered"),
          a.visited ? 1 : 0,
          a.confidence || null,
          Number(a.activeMs || 0),
          Number(a.finalizedAt || Date.now()),
        ]
      );
      break;
    }

    case "mediaManifest": {
      const m = payload as { sha256?: string; mime?: string; bytes?: number; availability?: string; width?: number; height?: number; variant?: string };
      if (!m.sha256) return;
      await trx.execute(
        `INSERT INTO media_files(id, sha256, mime, bytes, width, height, availability, variant, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           availability=excluded.availability,
           mime=excluded.mime,
           bytes=excluded.bytes`,
        [
          entityId,
          String(m.sha256),
          String(m.mime || "image/png"),
          Math.max(Number(m.bytes ?? 1), 1),
          Math.max(Number(m.width ?? 800), 1),
          Math.max(Number(m.height ?? 600), 1),
          String(m.availability || "local"),
          String(m.variant || "optimized"),
          Date.now(),
        ]
      );
      break;
    }

    default:
      // Other entities can be added or ignored safely
      break;
  }

  if (entityType === "profileBundle" || entityType === "questionBundle" || entityType === "sessionBundle") {
    const payloadHash = await hashSyncPayload(payload);
    await trx.execute(
      `INSERT INTO sync_entity_cache(owner_id, entity_type, entity_id, payload_hash, observed_at)
       VALUES(?, ?, ?, ?, ?)
       ON CONFLICT(owner_id, entity_type, entity_id) DO UPDATE SET
         payload_hash=excluded.payload_hash,
         observed_at=excluded.observed_at`,
      [ownerId, entityType, entityId, payloadHash, Date.now()]
    );
  }
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object"))
    : [];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

async function upsertRaw(
  trx: DatabasePort,
  table: string,
  row: Record<string, unknown>,
  columns: string[],
  conflictColumn = "id"
): Promise<void> {
  const present = columns.filter((column) => row[column] !== undefined);
  if (!present.includes(conflictColumn)) return;
  const updateColumns = present.filter((column) => column !== conflictColumn && column !== "created_at");
  const placeholders = present.map(() => "?").join(",");
  const update = updateColumns.length
    ? ` DO UPDATE SET ${updateColumns.map((column) => `${column}=excluded.${column}`).join(",")}`
    : " DO NOTHING";
  await trx.execute(
    `INSERT INTO ${table}(${present.join(",")}) VALUES(${placeholders}) ON CONFLICT(${conflictColumn})${update}`,
    present.map((column) => row[column] ?? null)
  );
}

const PROFILE_COLUMNS = [
  "id", "name", "target_track", "penalty_numerator", "penalty_denominator", "created_at", "revision", "inactive_at", "default_timer_mode",
];
const SUBJECT_COLUMNS = ["id", "profile_id", "name", "coefficient", "target_percentage", "created_at", "question_count", "score_group"];
const CHAPTER_COLUMNS = ["id", "subject_id", "name", "normalized_name", "position", "created_at", "updated_at", "revision", "inactive_at"];
const TOPIC_COLUMNS = ["id", "chapter_id", "name", "normalized_name", "position", "target_seconds", "created_at", "updated_at", "revision", "inactive_at"];

async function applyProfileBundle(trx: DatabasePort, payload: Record<string, unknown>): Promise<void> {
  const profile = record(payload.profile);
  if (!profile) throw new Error("بستهٔ پروفایل ابری ناقص است.");
  await upsertRaw(trx, "profiles", profile, PROFILE_COLUMNS);
  const subjects = records(payload.subjects);
  const chapters = records(payload.chapters);
  const topics = records(payload.topics);
  for (const subject of subjects) await upsertRaw(trx, "subjects", subject, SUBJECT_COLUMNS);
  for (const chapter of chapters) await upsertRaw(trx, "chapters", chapter, CHAPTER_COLUMNS);
  for (const topic of topics) await upsertRaw(trx, "topics", topic, TOPIC_COLUMNS);
}

const SOURCE_COLUMNS = ["id", "kind", "title", "year", "external_key", "created_at"];
const GROUP_COLUMNS = ["id", "external_key", "kind", "subject", "chapter", "topic", "content_json", "expected_keys_json", "status", "created_at"];
const QUESTION_COLUMNS = [
  "id", "external_key", "subject", "chapter", "topic", "group_id", "group_position", "source_id", "content_json", "explanation_json", "correct_option_id", "status", "shuffle_safe", "created_at", "inactive_at",
];
const OPTION_COLUMNS = ["id", "question_id", "external_key", "position", "content_json"];
const REVISION_COLUMNS = ["id", "question_id", "version", "snapshot_json", "content_hash", "created_at"];
const MEDIA_COLUMNS = ["id", "bank_id", "sha256", "mime", "bytes", "width", "height", "local_path", "remote_path", "availability", "variant", "created_at"];
const QUESTION_MEDIA_COLUMNS = ["id", "question_id", "group_id", "media_id", "role", "required", "created_at"];

async function applyQuestionBundle(trx: DatabasePort, payload: Record<string, unknown>): Promise<void> {
  const question = record(payload.question);
  if (!question) throw new Error("بستهٔ سؤال ابری ناقص است.");
  const source = record(payload.source);
  const group = record(payload.group);
  const mediaIdMap = new Map<string, string>();
  if (source) await upsertRaw(trx, "sources", source, SOURCE_COLUMNS);
  if (group) await upsertRaw(trx, "question_groups", group, GROUP_COLUMNS);
  for (const media of records(payload.mediaFiles)) {
    const [localMedia] = await trx.query<{ availability: string; local_path: string | null }>(
      "SELECT availability,local_path FROM media_files WHERE id=? OR sha256=? LIMIT 1",
      [media.id, media.sha256]
    );
    const hasLocalBlob = localMedia?.availability === "local" || localMedia?.availability === "both";
    const [localIdentity] = await trx.query<{ id: string }>(
      "SELECT id FROM media_files WHERE id=? OR sha256=? LIMIT 1",
      [media.id, media.sha256]
    );
    if (localIdentity && localIdentity.id !== media.id) {
      mediaIdMap.set(String(media.id), localIdentity.id);
      if (media.remote_path) {
        await trx.execute(
          "UPDATE media_files SET remote_path=COALESCE(remote_path,?), availability=CASE WHEN local_path IS NOT NULL THEN 'both' ELSE 'remote' END WHERE id=?",
          [media.remote_path, localIdentity.id]
        );
      }
      continue;
    }
    const remoteMedia = {
      ...media,
      local_path: hasLocalBlob ? localMedia.local_path : null,
      availability: hasLocalBlob && media.remote_path ? "both" : media.remote_path ? "remote" : media.availability,
    };
    await upsertRaw(trx, "media_files", remoteMedia, MEDIA_COLUMNS);
  }
  await upsertRaw(trx, "questions", question, QUESTION_COLUMNS);
  await trx.execute("DELETE FROM question_options WHERE question_id=?", [question.id]);
  for (const option of records(payload.options)) await upsertRaw(trx, "question_options", option, OPTION_COLUMNS);
  for (const revision of records(payload.revisions)) {
    const collision = await trx.query<{ id: string }>(
      "SELECT id FROM question_revisions WHERE question_id=? AND version=? LIMIT 1",
      [revision.question_id, revision.version]
    );
    if (collision.length && collision[0].id !== revision.id) {
      const [latest] = await trx.query<{ version: number }>(
        "SELECT COALESCE(MAX(version),0) AS version FROM question_revisions WHERE question_id=?",
        [revision.question_id]
      );
      await upsertRaw(
        trx,
        "question_revisions",
        { ...revision, version: Number(latest?.version ?? 0) + 1 },
        REVISION_COLUMNS
      );
    } else {
      await upsertRaw(trx, "question_revisions", revision, REVISION_COLUMNS);
    }
  }
  if (group?.id) {
    await trx.execute("DELETE FROM question_media WHERE question_id=? OR group_id=?", [question.id, group.id]);
  } else {
    await trx.execute("DELETE FROM question_media WHERE question_id=?", [question.id]);
  }
  for (const relation of records(payload.questionMedia)) {
    await upsertRaw(
      trx,
      "question_media",
      { ...relation, media_id: mediaIdMap.get(String(relation.media_id)) ?? relation.media_id },
      QUESTION_MEDIA_COLUMNS
    );
  }
}

const SESSION_COLUMNS = ["id", "profile_id", "state", "selection_seed", "current_ordinal", "started_at", "finished_at", "active_ms", "created_at", "config_json"];
const SESSION_QUESTION_COLUMNS = ["id", "session_id", "question_id", "ordinal", "snapshot_json", "option_order_json", "selected_option_id", "first_selected_option_id", "change_count", "confidence", "visited", "active_ms"];
const ATTEMPT_COLUMNS = ["id", "session_question_id", "session_id", "question_id", "result", "visited", "confidence", "active_ms", "finalized_at"];
const EVENT_COLUMNS = ["id", "session_id", "session_question_id", "kind", "payload_json", "occurred_at"];
const REVIEW_COLUMNS = ["question_id", "due_at", "priority", "stable_streak", "interval_days", "last_attempt_id"];

async function ensureSnapshotQuestion(trx: DatabasePort, sessionQuestion: Record<string, unknown>): Promise<void> {
  const questionId = String(sessionQuestion.question_id || "");
  if (!questionId) return;
  const exists = await trx.query<{ id: string }>("SELECT id FROM questions WHERE id=? LIMIT 1", [questionId]);
  if (exists.length) return;
  let snapshot: Record<string, unknown> = {};
  try {
    snapshot = JSON.parse(String(sessionQuestion.snapshot_json || "{}")) as Record<string, unknown>;
  } catch {
    // Keep a recoverable draft placeholder if an older snapshot is malformed.
  }
  const now = Date.now();
  await trx.execute(
    `INSERT INTO questions(id, external_key, subject, chapter, topic, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at)
     VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      questionId,
      String(snapshot.externalKey || `recovered-${questionId}`),
      String(snapshot.subject || "بازیابی‌شده"),
      snapshot.chapter ?? null,
      snapshot.topic ?? null,
      JSON.stringify(snapshot.content || []),
      JSON.stringify(snapshot.explanation || []),
      snapshot.correctOptionId ?? null,
      snapshot.correctOptionId ? "published" : "draft",
      snapshot.shuffleSafe ? 1 : 0,
      Number(snapshot.createdAt || now),
    ]
  );
  for (const [position, option] of records(snapshot.options).entries()) {
    await trx.execute(
      "INSERT OR IGNORE INTO question_options(id, question_id, external_key, position, content_json) VALUES(?, ?, ?, ?, ?)",
      [option.id, questionId, String(option.key || position), position, JSON.stringify(option.content || [])]
    );
  }
}

async function applySessionBundle(
  ownerId: string,
  trx: DatabasePort,
  entityId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const session = record(payload.session);
  if (!session) throw new Error("بستهٔ جلسهٔ ابری ناقص است.");
  const local = await trx.query<{ state: string }>("SELECT state FROM sessions WHERE id=? LIMIT 1", [session.id]);
  if (local[0]?.state === "FINISHED" && session.state !== "FINISHED") return;

  if (local.length && local[0].state !== "FINISHED" && session.state !== "FINISHED") {
    const localQuestions = await trx.query<Record<string, unknown>>(
      "SELECT * FROM session_questions WHERE session_id=? ORDER BY ordinal, id",
      [session.id]
    );
    const remoteQuestions = records(payload.sessionQuestions);
    const remoteByQuestion = new Map(remoteQuestions.map((question) => [String(question.question_id), question]));
    const divergent = localQuestions.some((question) => {
      const remote = remoteByQuestion.get(String(question.question_id));
      return remote && (
        String(question.selected_option_id ?? "") !== String(remote.selected_option_id ?? "") ||
        String(question.confidence ?? "") !== String(remote.confidence ?? "")
      );
    });
    if (divergent) {
      const forkId = crypto.randomUUID();
      const [fullLocal] = await trx.query<Record<string, unknown>>("SELECT * FROM sessions WHERE id=?", [session.id]);
      if (fullLocal) {
        await upsertRaw(trx, "sessions", { ...fullLocal, id: forkId, state: "PAUSED" }, SESSION_COLUMNS);
        for (const question of localQuestions) {
          await upsertRaw(
            trx,
            "session_questions",
            { ...question, id: crypto.randomUUID(), session_id: forkId },
            SESSION_QUESTION_COLUMNS
          );
        }
        await trx.execute(
          `INSERT INTO sync_conflicts(id, owner_id, entity_type, entity_id, local_payload_json,
             remote_payload_json, resolution, created_at)
           VALUES(?, ?, 'sessionBundle', ?, ?, ?, 'forked', ?)`,
          [crypto.randomUUID(), ownerId, entityId, JSON.stringify({ session: fullLocal, sessionQuestions: localQuestions }), JSON.stringify(payload), Date.now()]
        );
      }
    }
  }
  await upsertRaw(trx, "sessions", session, SESSION_COLUMNS);
  for (const sessionQuestion of records(payload.sessionQuestions)) {
    await ensureSnapshotQuestion(trx, sessionQuestion);
    await upsertRaw(trx, "session_questions", sessionQuestion, SESSION_QUESTION_COLUMNS);
  }
  for (const attempt of records(payload.attempts)) await upsertRaw(trx, "attempts", attempt, ATTEMPT_COLUMNS);
  for (const event of records(payload.attemptEvents)) await upsertRaw(trx, "attempt_events", event, EVENT_COLUMNS);
  for (const review of records(payload.reviews)) await upsertRaw(trx, "review_items", review, REVIEW_COLUMNS, "question_id");
}
