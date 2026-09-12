import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";
import { MediaService } from "@/features/media/domain/media-service";
import { importMediaPackage } from "@/features/media/domain/media-package";
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

describe("Media Package ZIP Ingestion (TASK-028)", () => {
  it("imports a ZIP package with questions and referenced images", async () => {
    const db = await createTestDatabase();
    const appDb = new AppDatabase(db);
    await appDb.open();
    const mediaService = new MediaService(db);

    const encoder = new TextEncoder();
    const questionsJson = {
      schemaVersion: "1.0",
      defaults: { subject: "زیست‌شناسی" },
      questions: [
        {
          key: "q-img-1",
          content: [
            { type: "text", value: "نمودار زیر را بررسی کنید:" },
            { type: "image", mediaKey: "diagram-1", alt: "نمودار تنفس" },
          ],
          options: [
            { key: "a", content: [{ type: "text", value: "گزینه ۱" }] },
            { key: "b", content: [{ type: "text", value: "گزینه ۲" }] },
            { key: "c", content: [{ type: "text", value: "گزینه ۳" }] },
            { key: "d", content: [{ type: "text", value: "گزینه ۴" }] },
          ],
          correctOptionKey: "a",
        },
      ],
    };

    const zipBytes = createZipArchive([
      { path: "questions.json", data: encoder.encode(JSON.stringify(questionsJson)) },
      { path: "media/diagram-1.png", data: createMinimalPng() },
    ]);

    const report = await importMediaPackage(zipBytes, appDb, mediaService);
    expect(report.totalQuestions).toBe(1);
    expect(report.importedQuestions).toBe(1);
    expect(report.mediaImported).toBe(1);
    expect(report.failedQuestions).toBe(0);

    // Verify media exists in database
    const mediaRows = await db.query<{ id: string }>("SELECT id FROM media_files");
    expect(mediaRows).toHaveLength(1);
  });

  it("isolates partial errors when one question has a missing image (TASK-028.3)", async () => {
    const db = await createTestDatabase();
    const appDb = new AppDatabase(db);
    await appDb.open();
    const mediaService = new MediaService(db);

    const encoder = new TextEncoder();
    const questionsJson = {
      schemaVersion: "1.0",
      defaults: { subject: "شیمی" },
      questions: [
        {
          key: "q-healthy",
          content: [{ type: "text", value: "سؤال سالم بدون تصویر" }],
          options: [
            { key: "a", content: [{ type: "text", value: "۱" }] },
            { key: "b", content: [{ type: "text", value: "۲" }] },
            { key: "c", content: [{ type: "text", value: "۳" }] },
            { key: "d", content: [{ type: "text", value: "۴" }] },
          ],
          correctOptionKey: "a",
        },
        {
          key: "q-broken-media",
          content: [
            { type: "text", value: "سؤال دارای تصویر ناموجود" },
            { type: "image", mediaKey: "missing-img-key", alt: "تصویر گم‌شده" },
          ],
          options: [
            { key: "a", content: [{ type: "text", value: "۱" }] },
            { key: "b", content: [{ type: "text", value: "۲" }] },
            { key: "c", content: [{ type: "text", value: "۳" }] },
            { key: "d", content: [{ type: "text", value: "۴" }] },
          ],
          correctOptionKey: "a",
        },
      ],
    };

    // ZIP contains questions.json but does NOT include missing-img-key in media/
    const zipBytes = createZipArchive([
      { path: "questions.json", data: encoder.encode(JSON.stringify(questionsJson)) },
    ]);

    const report = await importMediaPackage(zipBytes, appDb, mediaService);
    // Healthy question must be imported, broken question must fail with descriptive issue
    expect(report.totalQuestions).toBe(2);
    expect(report.importedQuestions).toBe(1);
    expect(report.failedQuestions).toBe(1);
    expect(report.issues.some((i) => i.message.includes("تصویر وابسته"))).toBe(true);

    // Verify only the healthy question is in the DB
    const questions = await appDb.listQuestions();
    expect(questions.some((q) => q.externalKey === "q-healthy")).toBe(true);
    expect(questions.some((q) => q.externalKey === "q-broken-media")).toBe(false);
  });
});
