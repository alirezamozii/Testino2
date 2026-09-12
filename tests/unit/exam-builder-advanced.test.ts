import { describe, expect, it } from "vitest";
import { selectQuestions, type QuestionCandidate } from "@/features/exams/domain/selection";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

describe("Advanced Exam Creation & Selection Features", () => {
  describe("Multi-Subject, Chapter & Topic Selection Engine", () => {
    const candidates: QuestionCandidate[] = [
      { id: "q1", subject: "مدیریت", chapter: "فصل ۱", topic: "مبانی", groupId: null, status: "published", hasAttempts: false },
      { id: "q2", subject: "مدیریت", chapter: "فصل ۲", topic: "برنامه‌ریزی", groupId: null, status: "published", hasAttempts: false },
      { id: "q3", subject: "زبان", chapter: "گرامر", topic: "افعال", groupId: null, status: "published", hasAttempts: false },
      { id: "q4", subject: "زبان", chapter: "درک مطلب", topic: "پسیج ۱", groupId: "grp-1", status: "published", hasAttempts: false },
      { id: "q5", subject: "زبان", chapter: "درک مطلب", topic: "پسیج ۱", groupId: "grp-1", status: "published", hasAttempts: false },
      { id: "q6", subject: "ریاضی", chapter: "حسابان", topic: "مشتق", groupId: null, status: "published", hasAttempts: false },
    ];

    it("filters questions across multiple selected subjects (Multi-Subject Selection)", () => {
      const outcome = selectQuestions(candidates, {
        mode: "random",
        requestedCount: 10,
        subjectFilters: ["مدیریت", "زبان"],
      });

      expect(outcome.selectedIds).toContain("q1");
      expect(outcome.selectedIds).toContain("q2");
      expect(outcome.selectedIds).toContain("q3");
      expect(outcome.selectedIds).toContain("q4");
      expect(outcome.selectedIds).toContain("q5");
      expect(outcome.selectedIds).not.toContain("q6"); // ریاضی was not selected
      expect(outcome.actualCount).toBe(5);
    });

    it("filters questions by specific chapters across subjects", () => {
      const outcome = selectQuestions(candidates, {
        mode: "random",
        requestedCount: 10,
        subjectFilters: ["مدیریت", "زبان"],
        chapterFilters: ["فصل ۱", "گرامر"],
      });

      expect(outcome.selectedIds).toEqual(expect.arrayContaining(["q1", "q3"]));
      expect(outcome.selectedIds).not.toContain("q2");
      expect(outcome.selectedIds).not.toContain("q4");
      expect(outcome.selectedIds).not.toContain("q6");
      expect(outcome.actualCount).toBe(2);
    });

    it("filters questions by specific topics", () => {
      const outcome = selectQuestions(candidates, {
        mode: "random",
        requestedCount: 10,
        subjectFilters: ["مدیریت"],
        topicFilters: ["برنامه‌ریزی"],
      });

      expect(outcome.selectedIds).toEqual(["q2"]);
    });

    it("preserves question group integrity during seeded shuffle without breaking passage members", () => {
      // Shuffling with various seeds must keep q4 and q5 adjacent
      for (let i = 0; i < 5; i++) {
        const outcome = selectQuestions(candidates, {
          mode: "random",
          requestedCount: 10,
          subjectFilters: ["زبان"],
          seed: `seed-trial-${i}`,
        });

        const idx4 = outcome.selectedIds.indexOf("q4");
        const idx5 = outcome.selectedIds.indexOf("q5");
        expect(idx4).not.toBe(-1);
        expect(idx5).not.toBe(-1);
        // Both group members must be contiguous!
        expect(Math.abs(idx4 - idx5)).toBe(1);
      }
    });
  });

  describe("Database Integration: Multi-Subject, Taxonomy, and Passage Groups", () => {
    async function setupDatabase() {
      const memoryDb = await createTestDatabase();
      const appDb = new AppDatabase(memoryDb);
      await appDb.open();

      const ownerId = crypto.randomUUID();
      await memoryDb.execute(
        "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
        [ownerId, "local", null, "کاربر آزمایشی", "ns-test", Date.now(), Date.now()]
      );

      const profileId = await appDb.createProfile({
        name: "پروفایل آزمایشی",
        targetTrack: "مدیریت و زبان",
        subjects: [
          { name: "مدیریت", coefficient: 3, targetPercentage: 80 },
          { name: "زبان", coefficient: 2, targetPercentage: 70 },
          { name: "اقتصاد", coefficient: 2, targetPercentage: 75 },
        ],
      });

      // Insert question group for Reading passage
      const groupId = crypto.randomUUID();
      const passageBlocks = [{ type: "text", value: "متن اصلی درک مطلب زبان تخصصی" }];
      await memoryDb.execute(
        "INSERT INTO question_groups(id, external_key, kind, subject, chapter, topic, content_json, expected_keys_json, status, created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [
          groupId,
          "grp-reading-eng",
          "reading",
          "زبان",
          "درک مطلب",
          "پسیج ۱",
          JSON.stringify(passageBlocks),
          JSON.stringify(["lang-q1", "lang-q2"]),
          "complete",
          Date.now(),
        ]
      );

      // 2 grouped questions
      const langQ1 = crypto.randomUUID();
      const langQ2 = crypto.randomUUID();
      await memoryDb.batch([
        {
          sql: "INSERT INTO questions(id, external_key, subject, chapter, topic, group_id, group_position, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          bind: [langQ1, "lang-q1", "زبان", "درک مطلب", "پسیج ۱", groupId, 0, JSON.stringify([{ type: "text", value: "سؤال ۱ درک مطلب" }]), "[]", null, "published", 1, Date.now()],
        },
        {
          sql: "INSERT INTO question_options(id, question_id, external_key, position, content_json) VALUES(?,?,?,?,?)",
          bind: [crypto.randomUUID(), langQ1, "1", 0, JSON.stringify([{ type: "text", value: "پاسخ ۱" }])],
        },
        {
          sql: "INSERT INTO questions(id, external_key, subject, chapter, topic, group_id, group_position, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
          bind: [langQ2, "lang-q2", "زبان", "درک مطلب", "پسیج ۱", groupId, 1, JSON.stringify([{ type: "text", value: "سؤال ۲ درک مطلب" }]), "[]", null, "published", 1, Date.now()],
        },
        {
          sql: "INSERT INTO question_options(id, question_id, external_key, position, content_json) VALUES(?,?,?,?,?)",
          bind: [crypto.randomUUID(), langQ2, "1", 0, JSON.stringify([{ type: "text", value: "پاسخ ۲" }])],
        },
      ]);

      // Standalone question in مدیریت
      await appDb.createQuestion({
        subject: "مدیریت",
        chapter: "فصل ۱: کلیات",
        topic: "تعاریف",
        content: [{ type: "text", value: "سؤال اول مدیریت" }],
        options: [
          { key: "1", content: [{ type: "text", value: "الف" }] },
          { key: "2", content: [{ type: "text", value: "ب" }] },
        ],
        correctOptionKey: "1",
      });

      // Standalone question in اقتصاد
      await appDb.createQuestion({
        subject: "اقتصاد",
        chapter: "فصل خرد",
        topic: "عرضه و تقاضا",
        content: [{ type: "text", value: "سؤال اول اقتصاد" }],
        options: [
          { key: "1", content: [{ type: "text", value: "الف" }] },
          { key: "2", content: [{ type: "text", value: "ب" }] },
        ],
        correctOptionKey: "1",
      });

      return { appDb, profileId, groupId };
    }

    it("creates a session with multi-subjects and attaches groupContent to reading questions", async () => {
      const { appDb, profileId, groupId } = await setupDatabase();

      const sessionId = await appDb.createSession(profileId, {
        mode: "random",
        subjects: ["زبان", "مدیریت"],
        count: 10,
      });

      const session = await appDb.getSession(sessionId);
      expect(session).not.toBeNull();
      expect(session?.config?.subjectFilters).toEqual(["زبان", "مدیریت"]);

      // Should have 3 questions (2 from زبان, 1 from مدیریت). اقتصاد should NOT be included!
      expect(session?.questions).toHaveLength(3);
      const subjectsInSession = new Set(session?.questions.map((q) => q.snapshot.subject));
      expect(subjectsInSession.has("زبان")).toBe(true);
      expect(subjectsInSession.has("مدیریت")).toBe(true);
      expect(subjectsInSession.has("اقتصاد")).toBe(false);

      // Verify that the Reading passage questions have groupContent attached
      const readingQuestions = session?.questions.filter((q) => q.snapshot.groupId === groupId);
      expect(readingQuestions).toHaveLength(2);
      expect(readingQuestions![0].snapshot.groupKind).toBe("reading");
      const firstBlock = readingQuestions![0].snapshot.groupContent?.[0];
      expect(firstBlock?.type).toBe("text");
      if (firstBlock && firstBlock.type === "text") {
        expect(firstBlock.value).toBe("متن اصلی درک مطلب زبان تخصصی");
      }
    });

    it("filters questions by selected chapters during session creation", async () => {
      const { appDb, profileId } = await setupDatabase();

      const sessionId = await appDb.createSession(profileId, {
        mode: "random",
        subjects: ["زبان", "مدیریت"],
        chapters: ["فصل ۱: کلیات"],
        count: 10,
      });

      const session = await appDb.getSession(sessionId);
      expect(session?.questions).toHaveLength(1);
      expect(session?.questions[0].snapshot.subject).toBe("مدیریت");
      expect(session?.questions[0].snapshot.chapter).toBe("فصل ۱: کلیات");
    });

    it("keeps chapter and topic filters scoped to their selected subject", async () => {
      const { appDb, profileId } = await setupDatabase();

      const sessionId = await appDb.createSession(profileId, {
        mode: "random",
        subjects: ["زبان", "مدیریت"],
        chapters: ["مدیریت::فصل ۱: کلیات"],
        topics: ["مدیریت::فصل ۱: کلیات::تعاریف"],
        count: 10,
      });

      const session = await appDb.getSession(sessionId);
      expect(session?.questions).toHaveLength(1);
      expect(session?.questions[0].snapshot.subject).toBe("مدیریت");
      expect(session?.questions[0].snapshot.topic).toBe("تعاریف");
    });

    it("supports continuous mode across multiple subjects with dynamic appendNextUnit", async () => {
      const { appDb, profileId } = await setupDatabase();

      const sessionId = await appDb.createSession(profileId, {
        mode: "continuous",
        subjects: ["زبان", "مدیریت"],
        isOpenEnded: true,
      });

      await appDb.startOrResumeSession(sessionId);

      let session = await appDb.getSession(sessionId);
      expect(session?.config?.isOpenEnded).toBe(true);
      // Continuous mode begins with first unit only
      const initialCount = session?.questions.length ?? 0;
      expect(initialCount).toBeGreaterThanOrEqual(1);

      // Append next unit
      const appended = await appDb.appendNextUnit(sessionId);
      expect(appended).not.toBeNull();

      session = await appDb.getSession(sessionId);
      expect(session?.questions.length).toBe(3); // 2 from group + 1 standalone = 3
    });
  });
});
