import { describe, expect, it, beforeEach } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MediaService } from "@/features/media/domain/media-service";
import { validateMediaFile, detectImageSignature } from "@/features/media/domain/media-validator";
import { MigrationRunner } from "@/database/migrate";
import type { DatabasePort } from "@/database/ports";

// Helper to create a minimal 1x1 valid PNG binary
function createMinimalPng(): Uint8Array {
  return new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, // IHDR length
    0x49, 0x48, 0x44, 0x52, // 'IHDR'
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, etc.
    0x1f, 0x15, 0xc4, 0x89, // CRC
  ]);
}

// Helper to create a minimal JPEG binary header
function createMinimalJpeg(): Uint8Array {
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, // SOI, APP0
    0x00, 0x10, // length
    0x4a, 0x46, 0x49, 0x46, 0x00, // 'JFIF'
    0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc0, // SOF0
    0x00, 0x0b, // length
    0x08, // precision
    0x00, 0x10, // height = 16
    0x00, 0x20, // width = 32
    0x01, 0x01, 0x11, 0x00,
  ]);
}

describe("Media Validator (TASK-027.1)", () => {
  it("detects valid PNG and JPEG signatures correctly", () => {
    const png = createMinimalPng();
    expect(detectImageSignature(png)).toBe("image/png");

    const jpeg = createMinimalJpeg();
    expect(detectImageSignature(jpeg)).toBe("image/jpeg");
  });

  it("rejects invalid or fake media files", async () => {
    // Plain text content pretending to be an image
    const fakeText = new TextEncoder().encode("Hello, this is not an image!");
    const res = await validateMediaFile(fakeText);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("فرمت فایل تصویر نامعتبر است");
  });

  it("rejects files exceeding 5MB limit", async () => {
    // 5MB + 1 byte
    const largeBuffer = new Uint8Array(5 * 1024 * 1024 + 1);
    largeBuffer.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // PNG header
    const res = await validateMediaFile(largeBuffer);
    expect(res.valid).toBe(false);
    expect(res.error).toContain("بیشتر است");
  });

  it("calculates canonical SHA-256 and parses dimensions", async () => {
    const png = createMinimalPng();
    const res = await validateMediaFile(png);
    expect(res.valid).toBe(true);
    expect(res.sha256).toBeTruthy();
    expect(res.sha256).toHaveLength(64);
    expect(res.width).toBe(1);
    expect(res.height).toBe(1);
  });
});

describe("MediaService Lifecycle & Storage (TASK-027.2, TASK-027.3, TASK-027.4)", () => {
  let db: DatabasePort;
  let service: MediaService;

  beforeEach(async () => {
    db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);
    service = new MediaService(db);
  });

  it("ingests a valid image and deduplicates by SHA-256 on subsequent ingests", async () => {
    const png = createMinimalPng();
    const meta1 = await service.ingest(png, "content");
    expect(meta1.id).toBeTruthy();
    expect(meta1.mime).toBe("image/png");
    expect(meta1.availability).toBe("local");

    // Second ingest of same bytes
    const meta2 = await service.ingest(png, "content");
    expect(meta2.id).toBe(meta1.id);
    expect(meta2.sha256).toBe(meta1.sha256);

    // Verify only 1 row in media_files
    const count = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM media_files");
    expect(count[0].count).toBe(1);
  });

  it("retrieves stored binary data by ID and by hash", async () => {
    const jpeg = createMinimalJpeg();
    const meta = await service.ingest(jpeg, "reference");

    const retrievedById = await service.get(meta.id);
    expect(retrievedById).toBeTruthy();
    expect(retrievedById?.length).toBe(jpeg.length);

    const retrievedByHash = await service.get(meta.sha256);
    expect(retrievedByHash).toBeTruthy();
  });

  it("cleans up orphaned media files that have no references in questions", async () => {
    const png = createMinimalPng();
    await service.ingest(png, "content");

    // Initially unreferenced
    const removedCount = await service.removeUnreferenced();
    expect(removedCount).toBe(1);

    const check = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM media_files");
    expect(check[0].count).toBe(0);
  });

  it("retains media files that are linked to questions", async () => {
    // Setup test profile & subject & question
    const profileId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    const questionId = crypto.randomUUID();

    await db.execute(
      "INSERT INTO profiles(id, name, created_at) VALUES(?, ?, ?)",
      [profileId, "تست", Date.now()]
    );
    await db.execute(
      "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at) VALUES(?, ?, ?, ?, ?, ?)",
      [subjectId, profileId, "عمومی", 1, 70, Date.now()]
    );
    await db.execute(
      `INSERT INTO questions(id, external_key, subject, content_json, explanation_json, status, shuffle_safe, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      [questionId, "q-media-1", "عمومی", "[]", "[]", "published", 1, Date.now()]
    );

    const png = createMinimalPng();
    const meta = await service.ingest(png, "content");

    // Link media to question
    await service.linkMedia({
      mediaId: meta.id,
      questionId,
      role: "content",
      required: true,
    });

    // Run orphan cleanup
    const removedCount = await service.removeUnreferenced();
    expect(removedCount).toBe(0);

    const check = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM media_files");
    expect(check[0].count).toBe(1);
  });

  it("checks media readiness and reports missing required media before exam start", async () => {
    const profileId = crypto.randomUUID();
    const subjectId = crypto.randomUUID();
    const questionId = crypto.randomUUID();
    const mediaId = crypto.randomUUID();

    await db.execute(
      "INSERT INTO profiles(id, name, created_at) VALUES(?, ?, ?)",
      [profileId, "پروفایل تست", Date.now()]
    );
    await db.execute(
      "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at) VALUES(?, ?, ?, ?, ?, ?)",
      [subjectId, profileId, "فیزیک", 1, 70, Date.now()]
    );
    await db.execute(
      `INSERT INTO questions(id, external_key, subject, content_json, explanation_json, status, shuffle_safe, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?)`,
      [questionId, "q-missing-media", "فیزیک", "[]", "[]", "published", 1, Date.now()]
    );

    // Insert a media file marked 'missing'
    await db.execute(
      `INSERT INTO media_files(id, sha256, mime, bytes, width, height, availability, variant, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [mediaId, "dummy-hash-123", "image/png", 1024, 100, 100, "missing", "original", Date.now()]
    );

    // Link as required media for question
    await service.linkMedia({
      mediaId,
      questionId,
      role: "content",
      required: true,
    });

    const readiness = await service.checkMediaReadiness([questionId]);
    expect(readiness.ready).toBe(false);
    expect(readiness.missingCount).toBe(1);
  });
});
