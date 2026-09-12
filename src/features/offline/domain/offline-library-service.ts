import type { DatabasePort } from "@/database/ports";
import { ConflictPolicy } from "@/sync/conflict-policy";
import { applyRemoteChange } from "@/sync/pull";
import { downloadRemoteMedia } from "@/sync/media-sync";
import type { SyncTransport } from "@/sync/ports";
import { SupabaseTransport } from "@/sync/supabase-transport";

export interface OfflineSubjectState {
  subjectId: string;
  subjectName: string;
  enabled: boolean;
  status: "pending" | "downloading" | "ready" | "error";
  downloadedQuestions: number;
  downloadedMedia: number;
  missingMedia: number;
  lastSyncedAt: number | null;
  lastErrorCode: string | null;
}

export interface OfflineDownloadReport {
  subjects: number;
  questions: number;
  media: number;
  missingMedia: number;
  errors: string[];
}

export class OfflineLibraryService {
  private transport: SyncTransport;

  constructor(private db: DatabasePort, transport?: SyncTransport) {
    this.transport = transport ?? new SupabaseTransport();
  }

  async list(ownerId: string, profileId: string): Promise<OfflineSubjectState[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      enabled: number | null;
      status: OfflineSubjectState["status"] | null;
      downloaded_questions: number | null;
      downloaded_media: number | null;
      missing_media: number | null;
      last_synced_at: number | null;
      last_error_code: string | null;
    }>(
      `SELECT s.id, s.name, os.enabled, os.status, os.downloaded_questions,
              os.downloaded_media, os.missing_media, os.last_synced_at, os.last_error_code
       FROM subjects s
       LEFT JOIN offline_subjects os
         ON os.subject_id=s.id AND os.profile_id=s.profile_id AND os.owner_id=?
       WHERE s.profile_id=?
       ORDER BY s.created_at, s.id`,
      [ownerId, profileId]
    );
    return rows.map((row) => ({
      subjectId: row.id,
      subjectName: row.name,
      enabled: Boolean(row.enabled),
      status: row.status ?? "pending",
      downloadedQuestions: Number(row.downloaded_questions ?? 0),
      downloadedMedia: Number(row.downloaded_media ?? 0),
      missingMedia: Number(row.missing_media ?? 0),
      lastSyncedAt: row.last_synced_at,
      lastErrorCode: row.last_error_code,
    }));
  }

  async setEnabled(
    ownerId: string,
    profileId: string,
    subject: { id: string; name: string },
    enabled: boolean
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO offline_subjects(owner_id, profile_id, subject_id, subject_name, enabled, status)
       VALUES(?, ?, ?, ?, ?, 'pending')
       ON CONFLICT(owner_id, profile_id, subject_id) DO UPDATE SET
         subject_name=excluded.subject_name,
         enabled=excluded.enabled,
         status=CASE WHEN excluded.enabled=1 THEN 'pending' ELSE offline_subjects.status END`,
      [ownerId, profileId, subject.id, subject.name, enabled ? 1 : 0]
    );
  }

  async downloadEnabled(ownerId: string, profileId: string): Promise<OfflineDownloadReport> {
    const selected = (await this.list(ownerId, profileId)).filter((subject) => subject.enabled);
    const report: OfflineDownloadReport = { subjects: selected.length, questions: 0, media: 0, missingMedia: 0, errors: [] };
    if (!selected.length) return report;
    if (this.transport.isConfigured() && !(await this.transport.isAuthenticated())) {
      throw new Error("برای دریافت بانک ابری باید وارد حساب Supabase شوید.");
    }

    for (const subject of selected) {
      await this.db.execute(
        "UPDATE offline_subjects SET status='downloading', last_error_code=NULL WHERE owner_id=? AND profile_id=? AND subject_id=?",
        [ownerId, profileId, subject.subjectId]
      );
      try {
        const state = await this.db.query<{ remote_cursor: string }>(
          "SELECT remote_cursor FROM offline_subjects WHERE owner_id=? AND profile_id=? AND subject_id=? LIMIT 1",
          [ownerId, profileId, subject.subjectId]
        );
        let cursor = state[0]?.remote_cursor || "0";
        if (this.transport.isConfigured() && this.transport.downloadSubjects) {
          for (let page = 0; page < 1_000; page += 1) {
            const pulled = await this.transport.downloadSubjects([subject.subjectName], cursor, 100);
            if (pulled.changes.length) {
              await this.db.transaction(async (trx) => {
                const policy = new ConflictPolicy();
                for (const change of pulled.changes) {
                  await applyRemoteChange(ownerId, trx, change, policy);
                }
              });
            }
            cursor = pulled.nextCursor;
            if (!pulled.hasMore) break;
          }
        }

        const media = await downloadRemoteMedia(this.db, this.transport, { subjectNames: [subject.subjectName], limit: 500 });
        const [questionCount] = await this.db.query<{ total: number }>(
          "SELECT COUNT(*) AS total FROM questions WHERE subject=? AND inactive_at IS NULL",
          [subject.subjectName]
        );
        const [missingCount] = await this.db.query<{ total: number }>(
          `SELECT COUNT(DISTINCT m.id) AS total FROM media_files m
           JOIN question_media qm ON qm.media_id=m.id
           LEFT JOIN questions q ON q.id=qm.question_id
           LEFT JOIN question_groups qg ON qg.id=qm.group_id
           WHERE COALESCE(q.subject, qg.subject)=? AND m.availability IN ('remote','missing')`,
          [subject.subjectName]
        );
        const questions = Number(questionCount?.total ?? 0);
        const missing = Number(missingCount?.total ?? 0);
        await this.db.execute(
          `UPDATE offline_subjects SET status=?, downloaded_questions=?,
             downloaded_media=downloaded_media+?, missing_media=?, remote_cursor=?,
             last_synced_at=?, last_error_code=?
           WHERE owner_id=? AND profile_id=? AND subject_id=?`,
          [
            missing || media.errors.length ? "error" : "ready",
            questions,
            media.downloaded,
            missing,
            cursor,
            Date.now(),
            media.errors[0] ?? null,
            ownerId,
            profileId,
            subject.subjectId,
          ]
        );
        report.questions += questions;
        report.media += media.downloaded;
        report.missingMedia += missing;
        report.errors.push(...media.errors);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        report.errors.push(message);
        await this.db.execute(
          "UPDATE offline_subjects SET status='error', last_error_code=? WHERE owner_id=? AND profile_id=? AND subject_id=?",
          [message, ownerId, profileId, subject.subjectId]
        );
      }
    }
    return report;
  }
}
