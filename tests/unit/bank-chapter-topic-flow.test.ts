import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

describe("Bank Chapter and Topic Flow End-to-End", () => {
  async function setup() {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const ownerId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
      [ownerId, "local", null, "کاربر تستیونو", "ns-test", Date.now(), Date.now()]
    );

    const profileId = await appDb.createProfile({
      name: "کنکور مدیریت بازرگانی",
      targetTrack: "مدیریت",
      subjects: [
        { name: "مدیریت بازاریابی", coefficient: 4, targetPercentage: 75 },
        { name: "تئوری‌های مدیریت", coefficient: 3, targetPercentage: 70 },
      ],
    });

    // 1. Chapter 1: استراتژی‌های بازاریابی (2 questions with topic "محیط بازاریابی", 1 with "بخش‌بندی بازار")
    const q1 = await appDb.createQuestion({
      subject: "مدیریت بازاریابی",
      chapter: "استراتژی‌های بازاریابی",
      topic: "محیط بازاریابی",
      content: [{ type: "text", value: "سؤال ۱ درباره محیط خرد بازاریابی" }],
      options: [
        { key: "a", content: [{ type: "text", value: "مشتریان" }] },
        { key: "b", content: [{ type: "text", value: "رقبا" }] },
        { key: "c", content: [{ type: "text", value: "تأمین‌کنندگان" }] },
        { key: "d", content: [{ type: "text", value: "همه موارد" }] },
      ],
      correctOptionKey: "d",
    });

    const q2 = await appDb.createQuestion({
      subject: "مدیریت بازاریابی",
      chapter: "استراتژی‌های بازاریابی",
      topic: "محیط بازاریابی",
      content: [{ type: "text", value: "سؤال ۲ درباره تحلیل PESTEL" }],
      options: [
        { key: "a", content: [{ type: "text", value: "محیط کلان" }] },
        { key: "b", content: [{ type: "text", value: "محیط خرد" }] },
        { key: "c", content: [{ type: "text", value: "محیط داخلی" }] },
        { key: "d", content: [{ type: "text", value: "هیچ‌کدام" }] },
      ],
      correctOptionKey: "a",
    });

    const q3 = await appDb.createQuestion({
      subject: "مدیریت بازاریابی",
      chapter: "استراتژی‌های بازاریابی",
      topic: "بخش‌بندی بازار",
      content: [{ type: "text", value: "سؤال ۳ درباره متغیرهای جمعیت‌شناختی" }],
      options: [
        { key: "a", content: [{ type: "text", value: "سن و درآمد" }] },
        { key: "b", content: [{ type: "text", value: "سبک زندگی" }] },
        { key: "c", content: [{ type: "text", value: "شخصیت" }] },
        { key: "d", content: [{ type: "text", value: "نرخ استفاده" }] },
      ],
      correctOptionKey: "a",
    });

    // 2. Chapter 2: آمیخته بازاریابی (1 question with topic "قیمت‌گذاری")
    const q4 = await appDb.createQuestion({
      subject: "مدیریت بازاریابی",
      chapter: "آمیخته بازاریابی",
      topic: "قیمت‌گذاری",
      content: [{ type: "text", value: "سؤال ۴ قیمت‌گذاری نفوذی" }],
      options: [
        { key: "a", content: [{ type: "text", value: "قیمت اولیه پایین" }] },
        { key: "b", content: [{ type: "text", value: "قیمت اولیه بالا" }] },
        { key: "c", content: [{ type: "text", value: "قیمت بر اساس هزینه" }] },
        { key: "d", content: [{ type: "text", value: "قیمت روانی" }] },
      ],
      correctOptionKey: "a",
    });

    return { memoryDb, appDb, profileId, questions: [q1, q2, q3, q4] };
  }

  it("lists and filters questions accurately by subject, chapter, and topic", async () => {
    const { appDb } = await setup();

    // All questions of subject
    const subjectQuestions = await appDb.listQuestions({ subject: "مدیریت بازاریابی", limit: 100 });
    expect(subjectQuestions.length).toBe(4);

    // Filter by Chapter 1
    const chapter1Questions = subjectQuestions.filter((q) => q.chapter === "استراتژی‌های بازاریابی");
    expect(chapter1Questions.length).toBe(3);

    // Filter by Chapter 1 + Topic
    const topicQuestions = chapter1Questions.filter((q) => q.topic === "محیط بازاریابی");
    expect(topicQuestions.length).toBe(2);

    // Filter by Chapter 2
    const chapter2Questions = subjectQuestions.filter((q) => q.chapter === "آمیخته بازاریابی");
    expect(chapter2Questions.length).toBe(1);
  });

  it("retrieves subject stats matching chapter and topic structure without errors", async () => {
    const { appDb } = await setup();

    const stats = await appDb.getSubjectStats("مدیریت بازاریابی");
    expect(stats.totalQuestions).toBe(4);
    expect(stats.chapters.length).toBe(2);
    expect(stats.topics.length).toBe(3);

    const chapter1 = stats.chapters.find((c) => c.name === "استراتژی‌های بازاریابی");
    expect(chapter1).toBeDefined();
    expect(chapter1?.total).toBe(3);

    const chapter2 = stats.chapters.find((c) => c.name === "آمیخته بازاریابی");
    expect(chapter2).toBeDefined();
    expect(chapter2?.total).toBe(1);

    // Topics belonging to chapter 1
    const ch1Topics = stats.topics.filter((t) => t.chapter === "استراتژی‌های بازاریابی");
    expect(ch1Topics.length).toBe(2);
    expect(ch1Topics.find((t) => t.name === "محیط بازاریابی")?.total).toBe(2);
    expect(ch1Topics.find((t) => t.name === "بخش‌بندی بازار")?.total).toBe(1);
  });

  it("creates and runs an exam targeting a specific chapter without crashing or getting stuck", async () => {
    const { appDb, profileId } = await setup();

    // Create session targeting Chapter 1
    const sessionId = await appDb.createSession(profileId, {
      subject: "مدیریت بازاریابی",
      chapter: "استراتژی‌های بازاریابی",
      count: 3,
      mode: "ordered",
    });

    expect(sessionId).toBeDefined();

    // Start session
    await appDb.startOrResumeSession(sessionId);
    const session = await appDb.getSession(sessionId);

    expect(session).toBeDefined();
    expect(session?.questions.length).toBe(3);
    // Verify all questions belong to the target chapter
    for (const sq of session!.questions) {
      expect(sq.snapshot.chapter).toBe("استراتژی‌های بازاریابی");
    }

    // Answer questions
    for (let i = 0; i < session!.questions.length; i++) {
      const q = session!.questions[i];
      const selectedOptionId = q.optionOrder[0];
      await appDb.saveAnswer(sessionId, q.id, selectedOptionId, "sure", 15000, i);
    }

    // Finish session
    await appDb.finishSession(sessionId);

    // Verify session report
    const finishedSession = await appDb.getSession(sessionId);
    expect(finishedSession?.state).toBe("FINISHED");
    expect(finishedSession?.questions.every((q) => q.isAnswered)).toBe(true);

    // Verify stats updated properly
    const updatedStats = await appDb.getSubjectStats("مدیریت بازاریابی");
    expect(updatedStats.solvedCount).toBe(3);
  });

  it("creates and runs an exam targeting a specific topic without error", async () => {
    const { appDb, profileId } = await setup();

    // Create session targeting topic "قیمت‌گذاری"
    const sessionId = await appDb.createSession(profileId, {
      subject: "مدیریت بازاریابی",
      topic: "قیمت‌گذاری",
      count: 5,
      mode: "random",
    });

    await appDb.startOrResumeSession(sessionId);
    const session = await appDb.getSession(sessionId);

    expect(session).toBeDefined();
    expect(session?.questions.length).toBe(1);
    expect(session?.questions[0].snapshot.topic).toBe("قیمت‌گذاری");

    // Answer correctly
    const q = session!.questions[0];
    const correctOpt = q.snapshot.options.find(
      (o) => o.id === q.snapshot.correctOptionId || o.key === q.snapshot.correctOptionId
    )!;
    await appDb.saveAnswer(sessionId, q.id, correctOpt.id, "sure", 10000, 1);
    await appDb.finishSession(sessionId);

    const report = await appDb.getSession(sessionId);
    expect(report?.state).toBe("FINISHED");
    expect(report?.questions[0].selectedOptionId).toBe(correctOpt.id);
  });

  it("verifies markQuestionUnderstood in Leitner does NOT alter exam percentage or attempts", async () => {
    const { appDb, profileId } = await setup();

    // 1. Run an exam with 1 question and get 100%
    const sessionId = await appDb.createSession(profileId, {
      subject: "مدیریت بازاریابی",
      count: 1,
      mode: "random",
    });
    await appDb.startOrResumeSession(sessionId);
    const session = await appDb.getSession(sessionId);
    const q = session!.questions[0];
    const correctOpt = q.snapshot.options.find(
      (o) => o.id === q.snapshot.correctOptionId || o.key === q.snapshot.correctOptionId
    )!;
    await appDb.saveAnswer(sessionId, q.id, correctOpt.id, "sure", 8000, 1);
    await appDb.finishSession(sessionId);

    const statsBefore = await appDb.getSubjectStats("مدیریت بازاریابی");
    const accuracyBefore = statsBefore.accuracyPercentage;
    const correctBefore = statsBefore.correctCount;

    // 2. User clicks «یاد گرفتم» on another question
    const otherQuestionId = (await appDb.listQuestions({ subject: "مدیریت بازاریابی", limit: 10 }))[1].id;
    await appDb.markQuestionUnderstood(otherQuestionId);

    // 3. Verify stats and scores remain completely intact
    const statsAfter = await appDb.getSubjectStats("مدیریت بازاریابی");
    expect(statsAfter.accuracyPercentage).toBe(accuracyBefore);
    expect(statsAfter.correctCount).toBe(correctBefore);
    expect(statsAfter.solvedCount).toBe(statsBefore.solvedCount);
  });
});
