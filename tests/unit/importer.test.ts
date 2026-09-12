import { describe, expect, it } from "vitest";
import { parseImportJson } from "@/features/questions/domain/importer";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

const validQuestion = (key: string, val = "صورت سؤال") => ({
  key,
  content: [{ type: "text" as const, value: val }],
  options: ["a", "b", "c", "d"].map((option) => ({ key: option, content: [{ type: "text" as const, value: option }] })),
  correctOptionKey: "a",
});

describe("parseImportJson", () => {
  it("keeps valid rows when another row is invalid (97/3 scenario)", () => {
    const questions = Array.from({ length: 100 }, (_, index) => validQuestion(`q${index}`));
    questions[2] = { ...questions[2], options: questions[2].options.slice(0, 3) };
    questions[50] = { ...questions[50], correctOptionKey: "missing" };
    questions[99] = { ...questions[99], content: [] };
    const parsed = parseImportJson(JSON.stringify({ schemaVersion: "1.0", defaults: { subject: "آزمایشی" }, questions }));
    expect(parsed.valid).toHaveLength(97);
    expect(new Set(parsed.issues.map((issue) => issue.rowIndex))).toEqual(new Set([3, 51, 100]));
  });

  it("writes nothing conceptually when the envelope is malformed", () => {
    expect(() => parseImportJson("{")).toThrow("هیچ سؤالی ذخیره نشد");
  });
});

describe("Database Question Importer & Deduplication (TASK-012, TASK-013, TASK-014)", () => {
  it("persists questions, creates question_revisions, and detects exact duplicates on second run", async () => {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const questions = [validQuestion("q1", "سؤال اول"), validQuestion("q2", "سؤال دوم")];
    const raw = JSON.stringify({
      schemaVersion: "1.0",
      defaults: {
        subject: "مدیریت",
        source: { kind: "EXAM", title: "کنکور ۱۴۰۲", year: 1402 },
      },
      questions,
    });

    const parsed1 = parseImportJson(raw);
    const report1 = await appDb.importQuestions(parsed1);

    expect(report1.added).toBe(2);
    expect(report1.duplicates).toBe(0);

    // Verify question_revisions were created
    const revisions = await memoryDb.query<{ id: string; content_hash: string }>(
      "SELECT id, content_hash FROM question_revisions"
    );
    expect(revisions).toHaveLength(2);
    expect(revisions[0].content_hash).toBeTruthy();

    // Verify sources table has entry
    const sources = await memoryDb.query<{ id: string; title: string }>(
      "SELECT id, title FROM sources"
    );
    expect(sources).toHaveLength(1);
    expect(sources[0].title).toBe("کنکور ۱۴۰۲");

    // Second import of same questions -> duplicate detection
    const parsed2 = parseImportJson(raw);
    const report2 = await appDb.importQuestions(parsed2);
    expect(report2.added).toBe(0);
    expect(report2.duplicates).toBe(2);
  });

  it("detects content duplicate even when external_key is different (content_hash fingerprint check)", async () => {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const q1 = validQuestion("orig-key", "متن کاملاً یکسان");
    const parsed1 = parseImportJson(
      JSON.stringify({ schemaVersion: "1.0", defaults: { subject: "حسابداری" }, questions: [q1] })
    );
    const rep1 = await appDb.importQuestions(parsed1);
    expect(rep1.added).toBe(1);

    // Question 2 has a DIFFERENT key, but the exact same subject, content, and options
    const q2 = validQuestion("different-key", "متن کاملاً یکسان");
    const parsed2 = parseImportJson(
      JSON.stringify({ schemaVersion: "1.0", defaults: { subject: "حسابداری" }, questions: [q2] })
    );
    const rep2 = await appDb.importQuestions(parsed2);
    expect(rep2.added).toBe(0);
    expect(rep2.duplicates).toBe(1);
  });

  it("repairs incomplete question group when remaining members are imported", async () => {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    // Import 1: Group has expected keys ['gq1', 'gq2'], but file only includes 'gq1'
    const import1 = {
      schemaVersion: "1.0",
      defaults: { subject: "زبان" },
      groups: [
        {
          key: "reading-passage-1",
          kind: "reading",
          content: [{ type: "text", value: "متن ریدینگ" }],
          questionKeys: ["gq1", "gq2"],
        },
      ],
      questions: [
        { ...validQuestion("gq1", "سؤال یک ریدینگ"), groupKey: "reading-passage-1", groupPosition: 0 },
      ],
    };

    const parsed1 = parseImportJson(JSON.stringify(import1));
    await appDb.importQuestions(parsed1);

    const group1 = await memoryDb.query<{ id: string; status: string }>(
      "SELECT id, status FROM question_groups WHERE external_key='reading-passage-1'"
    );
    expect(group1[0].status).toBe("incomplete");

    // Import 2: File includes 'gq2' with groupKey 'reading-passage-1'
    const import2 = {
      schemaVersion: "1.0",
      defaults: { subject: "زبان" },
      questions: [
        { ...validQuestion("gq2", "سؤال دو ریدینگ"), groupKey: "reading-passage-1", groupPosition: 1 },
      ],
    };

    const parsed2 = parseImportJson(JSON.stringify(import2));
    await appDb.importQuestions(parsed2);

    // Group should now be repaired and marked 'complete'
    const group2 = await memoryDb.query<{ id: string; status: string }>(
      "SELECT id, status FROM question_groups WHERE external_key='reading-passage-1'"
    );
    expect(group2[0].status).toBe("complete");
  });
});
