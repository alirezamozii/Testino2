import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { MediaService } from "@/features/media/domain/media-service";
import { createBackup, restoreBackup } from "@/features/backup/domain/backup-service";
import { createZipArchive } from "@/lib/zip";

// Helper minimal PNG
function createMinimalPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
  ]);
}

describe("Backup & Restore Service (TASK-029)", () => {
  it("creates a consistent backup snapshot and restores it roundtrip with 100% fidelity", async () => {
    // 1. Setup initial database with owner, profile, subject, question and media
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    const mediaService = new MediaService(db);
    const png = createMinimalPng();
    const mediaMeta = await mediaService.ingest(png, "content");

    const ownerId = crypto.randomUUID();
    const profileId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    const questionId = crypto.randomUUID();

    await db.execute(
      `INSERT INTO owners(id, kind, display_name, device_namespace, created_at, updated_at)
       VALUES(?, 'local', 'علی رضایی', 'device-123', ?, ?)`,
      [ownerId, Date.now(), Date.now()]
    );
    await db.execute(
      `INSERT INTO profiles(id, name, target_track, created_at)
       VALUES(?, 'کنکور تجربی', 'پزشکی', ?)`,
      [profileId, Date.now()]
    );
    await db.execute(
      `INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at)
       VALUES(?, ?, 'زیست‌شناسی', 4, 85, ?)`,
      [subjectId, profileId, Date.now()]
    );
    await db.execute(
      `INSERT INTO questions(id, external_key, subject, content_json, explanation_json, status, shuffle_safe, created_at)
       VALUES(?, 'bio-q1', 'زیست‌شناسی', '[]', '[]', 'published', 1, ?)`,
      [questionId, Date.now()]
    );
    await mediaService.linkMedia({
      mediaId: mediaMeta.id,
      questionId,
      role: "content",
      required: true,
    });

    // 2. Export backup
    const { archiveBytes, manifest } = await createBackup(db, mediaService);
    expect(manifest.schemaVersion).toBe("1.0");
    expect(manifest.counts.profiles).toBe(1);
    expect(manifest.counts.questions).toBe(1);
    expect(manifest.counts.media).toBe(1);
    expect(archiveBytes.length).toBeGreaterThan(200);

    // 3. Create fresh new empty database
    const newDb = await createTestDatabase();
    const newRunner = new MigrationRunner();
    await newRunner.run(newDb);
    const newMediaService = new MediaService(newDb);

    // 4. Restore backup into new database
    const restoreReport = await restoreBackup(archiveBytes, newDb, newMediaService);
    expect(restoreReport.success).toBe(true);
    expect(restoreReport.counts.profiles).toBe(1);
    expect(restoreReport.counts.questions).toBe(1);

    // 5. Verify data matches in restored database
    const restoredOwners = await newDb.query<{ display_name: string }>("SELECT display_name FROM owners");
    expect(restoredOwners[0].display_name).toBe("علی رضایی");

    const restoredQuestions = await newDb.query<{ external_key: string }>("SELECT external_key FROM questions");
    expect(restoredQuestions[0].external_key).toBe("bio-q1");

    const restoredMedia = await newDb.query<{ sha256: string }>("SELECT sha256 FROM media_files");
    expect(restoredMedia[0].sha256).toBe(mediaMeta.sha256);

    // Verify binary blob was restored
    const blob = await newMediaService.get(mediaMeta.sha256);
    expect(blob).toBeTruthy();
    expect(blob?.length).toBe(png.length);
  });

  it("rejects corrupt backup file without modifying existing database", async () => {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    // Setup an existing record
    await db.execute(
      "INSERT INTO owners(id, kind, display_name, device_namespace, created_at, updated_at) VALUES(?, 'local', 'کاربر اصلی', 'ns-1', ?, ?)",
      [crypto.randomUUID(), Date.now(), Date.now()]
    );

    const encoder = new TextEncoder();
    // Manifest declares a hash, but data.json has tampered content
    const manifest = {
      schemaVersion: "1.0",
      appVersion: "1.0.0",
      exportedAt: new Date().toISOString(),
      ownerAlias: "کاربر مخرب",
      counts: { profiles: 0, subjects: 0, questions: 0, sessions: 0, attempts: 0, media: 0 },
      dataSha256: "0000000000000000000000000000000000000000000000000000000000000000",
    };

    const corruptArchive = createZipArchive([
      { path: "manifest.json", data: encoder.encode(JSON.stringify(manifest)) },
      { path: "data.json", data: encoder.encode(JSON.stringify({ owners: [] })) },
    ]);

    // Restore should fail due to SHA-256 mismatch
    await expect(restoreBackup(corruptArchive, db)).rejects.toThrow(
      "چکسام داده‌های پشتیبان با مانیفست مطابقت ندارد"
    );

    // Existing record must still be intact
    const owners = await db.query<{ display_name: string }>("SELECT display_name FROM owners");
    expect(owners).toHaveLength(1);
    expect(owners[0].display_name).toBe("کاربر اصلی");
  });

  it("rejects backup archives with unsupported future schema versions", async () => {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    const encoder = new TextEncoder();
    const manifest = {
      schemaVersion: "99.0", // Unsupported future version
      appVersion: "99.0.0",
      exportedAt: new Date().toISOString(),
      ownerAlias: "آینده",
      counts: { profiles: 0, subjects: 0, questions: 0, sessions: 0, attempts: 0, media: 0 },
      dataSha256: "fake-sha",
    };

    const futureArchive = createZipArchive([
      { path: "manifest.json", data: encoder.encode(JSON.stringify(manifest)) },
      { path: "data.json", data: encoder.encode("{}") },
    ]);

    await expect(restoreBackup(futureArchive, db)).rejects.toThrow(
      "پشتیبانی نمی‌شود"
    );
  });
});
