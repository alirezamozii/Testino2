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

  it("safely handles re-importing groups when group already exists without foreign key failure", async () => {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const importData = {
      schemaVersion: "1.0",
      defaults: { subject: "زبان" },
      groups: [
        {
          key: "group-cloze-1",
          kind: "cloze",
          content: "متن کلوز تستی",
          questionKeys: ["q-cloze-1"],
        },
      ],
      questions: [
        {
          ...validQuestion("q-cloze-1", "سؤال کلوز ۱"),
          groupKey: "group-cloze-1",
          groupPosition: 0,
        },
      ],
    };

    // First import
    const parsed1 = parseImportJson(JSON.stringify(importData));
    const rep1 = await appDb.importQuestions(parsed1);
    expect(rep1.added).toBe(1);
    expect(rep1.issues).toHaveLength(0);

    // Second import with the same group and a new question referencing that same group
    const importData2 = {
      schemaVersion: "1.0",
      defaults: { subject: "زبان" },
      groups: [
        {
          key: "group-cloze-1",
          kind: "cloze",
          content: "متن کلوز تستی آپدیت شده",
          questionKeys: ["q-cloze-1", "q-cloze-2"],
        },
      ],
      questions: [
        {
          ...validQuestion("q-cloze-2", "سؤال کلوز ۲ جدید"),
          groupKey: "group-cloze-1",
          groupPosition: 1,
        },
      ],
    };

    const parsed2 = parseImportJson(JSON.stringify(importData2));
    const rep2 = await appDb.importQuestions(parsed2);
    expect(rep2.added).toBe(1);
    expect(rep2.failed).toBe(0);
    expect(rep2.issues.filter((i) => !i.isWarning)).toHaveLength(0);

    // Verify question 2 points to the existing group
    const questionsInDb = await memoryDb.query<{ id: string; group_id: string }>(
      "SELECT id, group_id FROM questions WHERE external_key='q-cloze-2'"
    );
    expect(questionsInDb).toHaveLength(1);
    const groupsInDb = await memoryDb.query<{ id: string; external_key: string }>(
      "SELECT id, external_key FROM question_groups WHERE external_key='group-cloze-1'"
    );
    expect(groupsInDb).toHaveLength(1);
    expect(questionsInDb[0].group_id).toBe(groupsInDb[0].id);
  });

  it("imports user 25-question master exam with cloze and reading passages cleanly and idempotently", async () => {
    const fs = await import("fs");
    const path = "C:/Users/Mozart/.gemini/antigravity/brain/a1c0f2cf-2d88-402a-a209-e9961472d03e/scratch/user_fixed.json";
    if (!fs.existsSync(path)) return;

    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const raw = fs.readFileSync(path, "utf-8");
    const parsed1 = parseImportJson(raw);
    expect(parsed1.valid).toHaveLength(25);
    expect(parsed1.groups).toHaveLength(4);
    expect(parsed1.groups.every((g) => g.status === "complete")).toBe(true);
    expect(parsed1.issues.filter((i) => i.isWarning && i.path === "groups")).toHaveLength(0);

    // 1st import
    const rep1 = await appDb.importQuestions(parsed1);
    expect(rep1.added).toBe(25);
    expect(rep1.failed).toBe(0);
    expect(rep1.issues.filter((i) => !i.isWarning)).toHaveLength(0);

    // Verify all 4 groups exist in the database and are complete
    const groupsInDb = await memoryDb.query<{ id: string; external_key: string; status: string }>(
      "SELECT id, external_key, status FROM question_groups"
    );
    expect(groupsInDb).toHaveLength(4);
    expect(groupsInDb.every((g) => g.status === "complete")).toBe(true);

    // 2nd import: test re-importing the exact same envelope (upserting groups, detecting duplicate questions)
    const parsed2 = parseImportJson(raw);
    const rep2 = await appDb.importQuestions(parsed2);
    expect(rep2.added).toBe(0);
    expect(rep2.duplicates).toBe(25);
    expect(rep2.failed).toBe(0);
    expect(rep2.issues.filter((i) => !i.isWarning)).toHaveLength(0);
  });

  it("resiliently repairs markdown fences, conversational text, trailing commas, and curly quotes", () => {
    const rawAiOutput = `
Here is the requested exam JSON:
\`\`\`json
{
  "schemaVersion": "1.0",
  "defaults": {
    "subject": "مدیریت عمومی",
  },
  "questions": [
    {
      "sourceNumber": "1",
      "content": "هدف اصلی سازمان چیست؟",
      "options": [
        "1) بقا و رشد",
        "2) افزایش هزینه",
        "3) کاهش تولید",
        "4) عدم قطعیت",
      ],
      "correctOptionKey": "۱",
    },
  ],
}
\`\`\`
Hope this helps! Let me know if you need more questions.
`;

    const parsed = parseImportJson(rawAiOutput);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.valid[0].correctOptionKey).toBe("1");
    const firstBlock = parsed.valid[0].options[0].content[0];
    expect(firstBlock?.type === "text" ? firstBlock.value : "").toBe("بقا و رشد");
  });

  it("auto-wraps a raw array of questions when AI omits the outer envelope", () => {
    const rawArray = `[
      {
        "content": "صورت تستی بدون پاکت نامه",
        "options": ["گزینه ۱", "گزینه ۲", "گزینه ۳", "گزینه ۴"],
        "correctOptionKey": "الف"
      }
    ]`;

    const parsed = parseImportJson(rawArray);
    expect(parsed.valid).toHaveLength(1);
    expect(parsed.envelope.defaults.subject).toBe("عمومی");
    expect(parsed.valid[0].correctOptionKey).toBe("1");
  });

  it("automatically forces shuffleSafe=false when options contain order-dependent phrases", () => {
    const json = JSON.stringify({
      schemaVersion: "1.0",
      defaults: { subject: "مدیریت" },
      questions: [
        {
          content: "کدام مورد از وظایف مدیر است؟",
          options: ["برنامه‌ریزی", "سازماندهی", "گزینه ۱ و ۲", "هیچ‌کدام"],
          correctOptionKey: "3",
          shuffleSafe: true, // even if AI wrongfully marked it true
        },
        {
          content: "تعریف استراتژی چیست؟",
          options: ["مسیر بلندمدت", "برنامه کوتاه‌مدت", "فرآیند تولید", "سنجش روزانه"],
          correctOptionKey: "1",
        },
      ],
    });

    const parsed = parseImportJson(json);
    expect(parsed.valid).toHaveLength(2);
    // Question 1 has "گزینه ۱ و ۲" -> must be forced to false
    expect(parsed.valid[0].shuffleSafe).toBe(false);
    // Question 2 is independent -> defaults to true
    expect(parsed.valid[1].shuffleSafe).toBe(true);
  });
});

