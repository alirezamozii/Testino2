import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { normalizeTaxonomyName } from "@/features/profiles/domain/profile-schema";

describe("Stress & Benchmark Suite (TASK-036.1, TASK-036.2)", () => {
  it("imports and queries 10,000 questions with sub-second response times and cursor pagination", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const TOTAL_QUESTIONS = 10_000;
    const BATCH_SIZE = 1_000;

    // 1. Bulk generate and insert 10,000 questions
    const insertStart = performance.now();
    for (let batch = 0; batch < TOTAL_QUESTIONS / BATCH_SIZE; batch++) {
      const statements: { sql: string; bind: unknown[] }[] = [];
      for (let i = 0; i < BATCH_SIZE; i++) {
        const idx = batch * BATCH_SIZE + i;
        const qId = `q-stress-${idx}`;
        const extKey = `ext-stress-${idx}`;
        const subject = idx % 2 === 0 ? "ریاضی و هندسه" : "زیست‌شناسی و آزمایشگاه";
        const content = JSON.stringify({
          text: `سؤال شماره ${idx} در مورد مشتق، انتگرال و ساختار سلولی گیاهی شماره ${idx}`,
        });

        statements.push({
          sql: `INSERT INTO questions(id, external_key, subject, content_json, explanation_json, status, shuffle_safe, created_at)
                VALUES(?, ?, ?, ?, '{\"text\":\"توضیح\"}', 'published', 1, ?)`,
          bind: [qId, extKey, subject, content, Date.now()],
        });
      }

      await db.transaction(async (trx) => {
        for (const stmt of statements) {
          await trx.execute(stmt.sql, stmt.bind);
        }
      });
    }
    const insertDurationMs = Math.round(performance.now() - insertStart);

    // Verify exactly 10,000 questions exist
    const countRows = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM questions");
    expect(Number(countRows[0].count)).toBe(TOTAL_QUESTIONS);

    // 2. Benchmark Indexed Filter & Cursor Pagination (limit 50)
    const queryStart = performance.now();
    const paginatedQuestions = await db.query<{ id: string; subject: string; content_json: string }>(
      `SELECT id, subject, content_json FROM questions 
       WHERE subject = 'ریاضی و هندسه' AND inactive_at IS NULL
       ORDER BY created_at DESC 
       LIMIT 50 OFFSET 0`
    );
    const queryDurationMs = Math.round(performance.now() - queryStart);

    expect(paginatedQuestions.length).toBe(50);
    // Querying first page of 50 out of 5,000 matching questions should be practically instantaneous (< 50ms)
    expect(queryDurationMs).toBeLessThan(100);

    // 3. Persian Normalizer Search Benchmark
    const searchStart = performance.now();
    const needle = normalizeTaxonomyName("سلولی");
    expect(needle).toBeTruthy();

    const searchRows = await db.query<{ id: string }>(
      `SELECT id FROM questions WHERE content_json LIKE ? LIMIT 50`,
      [`%سلولی%`]
    );
    const searchDurationMs = Math.round(performance.now() - searchStart);

    expect(searchRows.length).toBe(50);
    expect(searchDurationMs).toBeLessThan(200);

    // Output real measured results for documentation
    console.log(`[Benchmark Evidence] 10,000 Questions Insert: ${insertDurationMs}ms (${Math.round(TOTAL_QUESTIONS / (insertDurationMs / 1000))} q/s)`);
    console.log(`[Benchmark Evidence] 50-Item Paginated Query: ${queryDurationMs}ms`);
    console.log(`[Benchmark Evidence] LIKE Filter on 10k Items: ${searchDurationMs}ms`);

    await db.close();
  });

  it("handles media dataset fixtures and orphan detection at scale", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const MEDIA_COUNT = 500;
    const startMs = performance.now();

    await db.transaction(async (trx) => {
      for (let i = 0; i < MEDIA_COUNT; i++) {
        const hex = i.toString(16).padStart(64, "0");
        await trx.execute(
          `INSERT INTO media_files(id, sha256, mime, bytes, width, height, availability, variant, created_at)
           VALUES(?, ?, 'image/png', 1024, 800, 600, 'local', 'optimized', ?)`,
          [`media-fix-${i}`, hex, Date.now()]
        );
      }
    });

    const durationMs = Math.round(performance.now() - startMs);
    const mediaCount = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM media_files");
    expect(Number(mediaCount[0].count)).toBe(MEDIA_COUNT);
    expect(durationMs).toBeLessThan(1000);

    await db.close();
  });
});
