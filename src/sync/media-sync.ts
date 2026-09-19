import type { DatabasePort } from "@/database/ports";
import { MediaService } from "@/features/media/domain/media-service";
import { withTimeout } from "@/lib/with-timeout";
import type { SyncTransport } from "./ports";

// A media file that fails to download (404, transient storage 500) used to be
// re-attempted on EVERY sync tick forever — wasted bandwidth + a permanent
// error status. Back off per-media for 10 minutes before trying again.
const MEDIA_RETRY_BACKOFF_MS = 10 * 60 * 1000;
const recentDownloadFailures = new Map<string, number>();

export interface MediaSyncReport {
  uploaded: number;
  downloaded: number;
  missing: number;
  errors: string[];
}

export async function uploadLocalMedia(
  db: DatabasePort,
  transport: SyncTransport,
  limit = 25
): Promise<MediaSyncReport> {
  const report: MediaSyncReport = { uploaded: 0, downloaded: 0, missing: 0, errors: [] };
  if (!transport.uploadMedia) return report;
  const service = new MediaService(db);
  const rows = await db.query<{ id: string; sha256: string; mime: string }>(
    `SELECT id, sha256, mime FROM media_files
     WHERE availability IN ('local','both') AND (remote_path IS NULL OR remote_path='')
     ORDER BY created_at ASC LIMIT ?`,
    [Math.min(Math.max(limit, 1), 100)]
  );

  for (const row of rows) {
    try {
      const bytes = await service.get(row.sha256);
      if (!bytes) {
        report.missing += 1;
        continue;
      }
      const remotePath = await withTimeout(
        transport.uploadMedia({ sha256: row.sha256, mime: row.mime, bytes }),
        60_000,
        "ارسال تصویر"
      );
      await db.execute(
        "UPDATE media_files SET remote_path=?, availability='both' WHERE id=?",
        [remotePath, row.id]
      );
      report.uploaded += 1;
    } catch (error) {
      report.errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  return report;
}

export async function downloadRemoteMedia(
  db: DatabasePort,
  transport: SyncTransport,
  options?: { subjectNames?: string[]; limit?: number }
): Promise<MediaSyncReport> {
  const report: MediaSyncReport = { uploaded: 0, downloaded: 0, missing: 0, errors: [] };
  if (!transport.downloadMedia) return report;
  const service = new MediaService(db);
  const subjects = options?.subjectNames?.map((name) => name.trim()).filter(Boolean) ?? [];
  const bind: Array<string | number> = [];
  let subjectWhere = "";
  if (subjects.length) {
    const placeholders = subjects.map(() => "?").join(",");
    subjectWhere = `AND EXISTS (
      SELECT 1 FROM question_media qm
      LEFT JOIN questions q ON q.id=qm.question_id
      LEFT JOIN question_groups qg ON qg.id=qm.group_id
      WHERE qm.media_id=m.id AND COALESCE(q.subject, qg.subject) IN (${placeholders})
    )`;
    bind.push(...subjects);
  }
  bind.push(Math.min(Math.max(options?.limit ?? 100, 1), 500));
  const rows = await db.query<{ id: string; sha256: string; mime: string; remote_path: string }>(
    `SELECT m.id, m.sha256, m.mime, m.remote_path FROM media_files m
     WHERE m.remote_path IS NOT NULL AND m.remote_path<>'' AND m.availability IN ('remote','missing')
     ${subjectWhere}
     ORDER BY m.created_at ASC LIMIT ?`,
    bind
  );

  for (const row of rows) {
    const lastFailureAt = recentDownloadFailures.get(row.id);
    if (lastFailureAt && Date.now() - lastFailureAt < MEDIA_RETRY_BACKOFF_MS) {
      // Backed off: not an error, just skip this tick silently.
      continue;
    }
    try {
      const bytes = await withTimeout(
        transport.downloadMedia(row.remote_path),
        30_000,
        "دریافت تصویر"
      );
      const ingested = await service.ingest(bytes, "content", { declaredMime: row.mime });
      if (ingested.sha256 !== row.sha256) throw new Error("هش تصویر دریافتی با manifest ابری یکسان نیست.");
      await db.execute(
        "UPDATE media_files SET local_path=?, availability='both' WHERE id=?",
        [`media/${row.sha256}.${row.mime === "image/jpeg" ? "jpg" : row.mime.split("/")[1]}`, row.id]
      );
      recentDownloadFailures.delete(row.id);
      report.downloaded += 1;
    } catch (error) {
      recentDownloadFailures.set(row.id, Date.now());
      report.missing += 1;
      report.errors.push(error instanceof Error ? error.message : String(error));
      await db.execute("UPDATE media_files SET availability='missing' WHERE id=?", [row.id]);
    }
  }
  return report;
}

