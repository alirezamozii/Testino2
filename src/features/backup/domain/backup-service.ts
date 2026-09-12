import type { DatabasePort } from "@/database/ports";
import type { MediaService } from "@/features/media/domain/media-service";
import { calculateSha256 } from "@/features/media/domain/media-validator";
import { createZipArchive, parseZipArchive, type ZipEntry } from "@/lib/zip";
import { UnsupportedSchemaError } from "@/lib/errors";

export interface BackupManifest {
  schemaVersion: "1.0";
  appVersion: "1.0.0";
  exportedAt: string;
  ownerAlias: string;
  counts: {
    profiles: number;
    subjects: number;
    questions: number;
    sessions: number;
    attempts: number;
    media: number;
  };
  dataSha256: string;
}

export interface BackupData {
  owners: Array<Record<string, unknown>>;
  profiles: Array<Record<string, unknown>>;
  subjects: Array<Record<string, unknown>>;
  chapters: Array<Record<string, unknown>>;
  topics: Array<Record<string, unknown>>;
  sources: Array<Record<string, unknown>>;
  question_groups: Array<Record<string, unknown>>;
  questions: Array<Record<string, unknown>>;
  question_options: Array<Record<string, unknown>>;
  question_revisions: Array<Record<string, unknown>>;
  sessions: Array<Record<string, unknown>>;
  session_questions: Array<Record<string, unknown>>;
  attempts: Array<Record<string, unknown>>;
  review_items: Array<Record<string, unknown>>;
  media_files: Array<Record<string, unknown>>;
  question_media: Array<Record<string, unknown>>;
}

export interface RestoreReport {
  success: boolean;
  exportedAt: string;
  counts: BackupManifest["counts"];
}

/**
 * Creates a complete consistent snapshot archive containing manifest, data.json, and referenced media (TASK-029.1).
 */
export async function createBackup(
  db: DatabasePort,
  mediaService?: MediaService
): Promise<{ archiveBytes: Uint8Array; manifest: BackupManifest }> {
  // 1. Fetch tables consistently
  const owners = await db.query<Record<string, unknown>>("SELECT * FROM owners");
  const sanitizedOwners = owners.map((o) => ({
    ...o,
    auth_user_id: null, // Never export cloud auth token or private user id
  }));

  const profiles = await db.query<Record<string, unknown>>("SELECT * FROM profiles");
  const subjects = await db.query<Record<string, unknown>>("SELECT * FROM subjects");
  const chapters = await db.query<Record<string, unknown>>("SELECT * FROM chapters");
  const topics = await db.query<Record<string, unknown>>("SELECT * FROM topics");
  const sources = await db.query<Record<string, unknown>>("SELECT * FROM sources");
  const question_groups = await db.query<Record<string, unknown>>("SELECT * FROM question_groups");
  const questions = await db.query<Record<string, unknown>>("SELECT * FROM questions");
  const question_options = await db.query<Record<string, unknown>>("SELECT * FROM question_options");
  const question_revisions = await db.query<Record<string, unknown>>("SELECT * FROM question_revisions");
  const sessions = await db.query<Record<string, unknown>>("SELECT * FROM sessions");
  const session_questions = await db.query<Record<string, unknown>>("SELECT * FROM session_questions");
  const attempts = await db.query<Record<string, unknown>>("SELECT * FROM attempts");
  const review_items = await db.query<Record<string, unknown>>("SELECT * FROM review_items");
  const media_files = await db.query<Record<string, unknown>>("SELECT * FROM media_files");
  const question_media = await db.query<Record<string, unknown>>("SELECT * FROM question_media");

  const data: BackupData = {
    owners: sanitizedOwners,
    profiles,
    subjects,
    chapters,
    topics,
    sources,
    question_groups,
    questions,
    question_options,
    question_revisions,
    sessions,
    session_questions,
    attempts,
    review_items,
    media_files,
    question_media,
  };

  const encoder = new TextEncoder();
  const dataBytes = encoder.encode(JSON.stringify(data, null, 2));
  const dataSha256 = await calculateSha256(dataBytes);

  const ownerName = ((sanitizedOwners[0] as Record<string, unknown> | undefined)?.display_name as string) || "کاربر تستیونو";

  const manifest: BackupManifest = {
    schemaVersion: "1.0",
    appVersion: "1.0.0",
    exportedAt: new Date().toISOString(),
    ownerAlias: ownerName,
    counts: {
      profiles: profiles.length,
      subjects: subjects.length,
      questions: questions.length,
      sessions: sessions.length,
      attempts: attempts.length,
      media: media_files.length,
    },
    dataSha256,
  };

  const manifestBytes = encoder.encode(JSON.stringify(manifest, null, 2));

  const zipEntries: ZipEntry[] = [
    { path: "manifest.json", data: manifestBytes },
    { path: "data.json", data: dataBytes },
  ];

  // 2. Fetch and package referenced media blobs
  if (mediaService) {
    for (const m of media_files) {
      const sha = String(m.sha256 || "");
      if (!sha) continue;
      const blobData = await mediaService.get(sha);
      if (blobData) {
        const mime = String(m.mime || "image/png");
        const ext = mime.split("/")[1] || "png";
        zipEntries.push({
          path: `media/${sha}.${ext}`,
          data: blobData,
        });
      }
    }
  }

  const archiveBytes = createZipArchive(zipEntries);
  return { archiveBytes, manifest };
}

/**
 * Restores database and media from a backup archive (TASK-029.3).
 * Validates manifest, checksums, schema version, and applies changes inside an atomic transaction.
 * If validation fails, zero writes are made to the database.
 */
export async function restoreBackup(
  archiveBytes: Uint8Array,
  db: DatabasePort,
  mediaService?: MediaService
): Promise<RestoreReport> {
  // 1. Unpack ZIP safely
  const entries = await parseZipArchive(archiveBytes);

  const manifestEntry = entries.find((e) => e.path === "manifest.json");
  if (!manifestEntry) {
    throw new Error("فایل manifest.json در بستهٔ پشتیبان یافت نشد.");
  }

  const dataEntry = entries.find((e) => e.path === "data.json");
  if (!dataEntry) {
    throw new Error("فایل data.json در بستهٔ پشتیبان یافت نشد.");
  }

  const decoder = new TextDecoder("utf-8");
  let manifest: BackupManifest;
  try {
    manifest = JSON.parse(decoder.decode(manifestEntry.data));
  } catch {
    throw new Error("فایل manifest.json مخدوش و غیرقابل خواندن است.");
  }

  // 2. Validate schema version
  if (manifest.schemaVersion !== "1.0") {
    throw new UnsupportedSchemaError(
      `نسخهٔ شمای فایل پشتیبان (${manifest.schemaVersion}) پشتیبانی نمی‌شود. حداکثر نسخهٔ قابل قبول 1.0 است.`
    );
  }

  // 3. Verify data.json SHA-256 integrity
  const actualDataSha256 = await calculateSha256(dataEntry.data);
  if (actualDataSha256 !== manifest.dataSha256) {
    throw new Error("چکسام داده‌های پشتیبان با مانیفست مطابقت ندارد. فایل مخدوش است.");
  }

  let data: BackupData;
  try {
    data = JSON.parse(decoder.decode(dataEntry.data));
  } catch {
    throw new Error("محتوای data.json معتبر نیست.");
  }

  // 4. Ingest media files first
  if (mediaService) {
    const mediaEntries = entries.filter((e) => e.path.startsWith("media/") && !e.path.endsWith("/"));
    for (const me of mediaEntries) {
      try {
        await mediaService.ingest(me.data, "content");
      } catch {
        // Continue partial media ingest if any file fails validation
      }
    }
  }

  // 5. Atomic restore transaction (replaces owner tables cleanly without leaving partial records)
  await db.transaction(async (trx) => {
    // Clear dependent tables in foreign key order
    await trx.execute("DELETE FROM review_items;");
    await trx.execute("DELETE FROM attempt_events;");
    await trx.execute("DELETE FROM attempts;");
    await trx.execute("DELETE FROM session_questions;");
    await trx.execute("DELETE FROM sessions;");
    await trx.execute("DELETE FROM question_media;");
    await trx.execute("DELETE FROM question_revisions;");
    await trx.execute("DELETE FROM question_options;");
    await trx.execute("DELETE FROM questions;");
    await trx.execute("DELETE FROM question_groups;");
    await trx.execute("DELETE FROM sources;");
    await trx.execute("DELETE FROM media_files;");
    await trx.execute("DELETE FROM topics;");
    await trx.execute("DELETE FROM chapters;");
    await trx.execute("DELETE FROM subjects;");
    await trx.execute("DELETE FROM profiles;");
    await trx.execute("DELETE FROM owners;");

    // Insert owners
    for (const o of data.owners || []) {
      await trx.execute(
        `INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at, revision, inactive_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          o.id,
          o.kind || "local",
          null,
          o.display_name || "کاربر تستیونو",
          o.device_namespace || `ns-${crypto.randomUUID().slice(0, 8)}`,
          o.created_at || Date.now(),
          o.updated_at || Date.now(),
          o.revision || 1,
          o.inactive_at ?? null,
        ]
      );
    }

    // Insert profiles
    for (const p of data.profiles || []) {
      await trx.execute(
        `INSERT INTO profiles(id, name, target_track, penalty_numerator, penalty_denominator, default_timer_mode, created_at, revision, inactive_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          p.id,
          p.name,
          p.target_track ?? null,
          p.penalty_numerator ?? 0,
          p.penalty_denominator ?? 1,
          p.default_timer_mode ?? "active",
          p.created_at || Date.now(),
          p.revision || 1,
          p.inactive_at ?? null,
        ]
      );
    }

    // Insert subjects
    for (const s of data.subjects || []) {
      await trx.execute(
        `INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, question_count, score_group, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.profile_id, s.name, s.coefficient ?? 1, s.target_percentage ?? 70, s.question_count ?? 25, s.score_group ?? null, s.created_at || Date.now()]
      );
    }

    // Insert chapters
    for (const c of data.chapters || []) {
      await trx.execute(
        `INSERT INTO chapters(id, subject_id, name, normalized_name, position, created_at, updated_at, revision, inactive_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [c.id, c.subject_id, c.name, c.normalized_name || c.name, c.position ?? 0, c.created_at || Date.now(), c.updated_at || Date.now(), c.revision || 1, c.inactive_at ?? null]
      );
    }

    // Insert topics
    for (const t of data.topics || []) {
      await trx.execute(
        `INSERT INTO topics(id, chapter_id, name, normalized_name, position, target_seconds, created_at, updated_at, revision, inactive_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [t.id, t.chapter_id, t.name, t.normalized_name || t.name, t.position ?? 0, t.target_seconds ?? null, t.created_at || Date.now(), t.updated_at || Date.now(), t.revision || 1, t.inactive_at ?? null]
      );
    }

    // Insert sources
    for (const src of data.sources || []) {
      await trx.execute(
        `INSERT INTO sources(id, kind, title, year, external_key, created_at)
         VALUES(?, ?, ?, ?, ?, ?)`,
        [src.id, src.kind || "EXAM", src.title ?? null, src.year ?? null, src.external_key, src.created_at || Date.now()]
      );
    }

    // Insert question_groups
    for (const g of data.question_groups || []) {
      await trx.execute(
        `INSERT INTO question_groups(id, external_key, kind, subject, chapter, topic, content_json, expected_keys_json, status, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [g.id, g.external_key, g.kind || "reading", g.subject, g.chapter ?? null, g.topic ?? null, g.content_json, g.expected_keys_json, g.status || "complete", g.created_at || Date.now()]
      );
    }

    // Insert questions
    for (const q of data.questions || []) {
      await trx.execute(
        `INSERT INTO questions(id, external_key, subject, chapter, topic, group_id, group_position, source_id, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at, inactive_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [q.id, q.external_key, q.subject, q.chapter ?? null, q.topic ?? null, q.group_id ?? null, q.group_position ?? null, q.source_id ?? null, q.content_json, q.explanation_json, q.correct_option_id ?? null, q.status || "published", q.shuffle_safe ? 1 : 0, q.created_at || Date.now(), q.inactive_at ?? null]
      );
    }

    // Insert question_options
    for (const opt of data.question_options || []) {
      await trx.execute(
        `INSERT INTO question_options(id, question_id, external_key, position, content_json)
         VALUES(?, ?, ?, ?, ?)`,
        [opt.id, opt.question_id, opt.external_key, opt.position ?? 0, opt.content_json]
      );
    }

    // Insert question_revisions
    for (const rev of data.question_revisions || []) {
      await trx.execute(
        `INSERT INTO question_revisions(id, question_id, version, snapshot_json, content_hash, created_at)
         VALUES(?, ?, ?, ?, ?, ?)`,
        [rev.id, rev.question_id, rev.version || 1, rev.snapshot_json, rev.content_hash, rev.created_at || Date.now()]
      );
    }

    // Insert sessions
    for (const s of data.sessions || []) {
      await trx.execute(
        `INSERT INTO sessions(id, profile_id, state, selection_seed, current_ordinal, started_at, finished_at, active_ms, config_json, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [s.id, s.profile_id, s.state || "FINISHED", s.selection_seed || "seed", s.current_ordinal ?? 0, s.started_at ?? null, s.finished_at ?? null, s.active_ms ?? 0, s.config_json ?? null, s.created_at || Date.now()]
      );
    }

    // Insert session_questions
    for (const sq of data.session_questions || []) {
      await trx.execute(
        `INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json, selected_option_id, first_selected_option_id, change_count, confidence, visited, active_ms)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [sq.id, sq.session_id, sq.question_id, sq.ordinal ?? 0, sq.snapshot_json, sq.option_order_json, sq.selected_option_id ?? null, sq.first_selected_option_id ?? null, sq.change_count ?? 0, sq.confidence ?? null, sq.visited ? 1 : 0, sq.active_ms ?? 0]
      );
    }

    // Insert attempts
    for (const a of data.attempts || []) {
      await trx.execute(
        `INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, confidence, active_ms, finalized_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [a.id, a.session_question_id, a.session_id, a.question_id, a.result || "unanswered", a.visited ? 1 : 0, a.confidence ?? null, a.active_ms ?? 0, a.finalized_at || Date.now()]
      );
    }

    // Insert review_items
    for (const r of data.review_items || []) {
      await trx.execute(
        `INSERT INTO review_items(question_id, due_at, priority, stable_streak, interval_days, last_attempt_id)
         VALUES(?, ?, ?, ?, ?, ?)`,
        [r.question_id, r.due_at || Date.now(), r.priority ?? 0, r.stable_streak ?? 0, r.interval_days ?? 1, r.last_attempt_id]
      );
    }

    // Insert media_files metadata
    for (const mf of data.media_files || []) {
      await trx.execute(
        `INSERT INTO media_files(id, bank_id, sha256, mime, bytes, width, height, local_path, availability, variant, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [mf.id, mf.bank_id ?? null, mf.sha256, mf.mime, mf.bytes, mf.width || 800, mf.height || 600, mf.local_path ?? null, mf.availability || "local", mf.variant || "optimized", mf.created_at || Date.now()]
      );
    }

    // Insert question_media
    for (const qm of data.question_media || []) {
      await trx.execute(
        `INSERT INTO question_media(id, question_id, group_id, media_id, role, required, created_at)
         VALUES(?, ?, ?, ?, ?, ?, ?)`,
        [qm.id, qm.question_id ?? null, qm.group_id ?? null, qm.media_id, qm.role || "content", qm.required ? 1 : 0, qm.created_at || Date.now()]
      );
    }
  });

  return {
    success: true,
    exportedAt: manifest.exportedAt,
    counts: manifest.counts,
  };
}
