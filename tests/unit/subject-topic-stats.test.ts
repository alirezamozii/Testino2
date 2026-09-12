import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

describe("Subject and Topic Analytics Stats (Wireframes 06 & 07)", () => {
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
      name: "پروفایل کنکور ارشد",
      targetTrack: "فناوری اطلاعات",
      subjects: [{ name: "تحقیق در عملیات", coefficient: 3, targetPercentage: 80 }],
    });

    const q1Id = await appDb.createQuestion({
      subject: "تحقیق در عملیات",
      chapter: "برنامه‌ریزی خطی",
      topic: "روش سیمپلکس",
      content: [{ type: "text", value: "سؤال ۱ سیمپلکس" }],
      options: [
        { key: "a", content: [{ type: "text", value: "۱" }] },
        { key: "b", content: [{ type: "text", value: "۲" }] },
        { key: "c", content: [{ type: "text", value: "۳" }] },
        { key: "d", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "a",
    });

    const q2Id = await appDb.createQuestion({
      subject: "تحقیق در عملیات",
      chapter: "برنامه‌ریزی خطی",
      topic: "روش سیمپلکس",
      content: [{ type: "text", value: "سؤال ۲ سیمپلکس" }],
      options: [
        { key: "a", content: [{ type: "text", value: "۱" }] },
        { key: "b", content: [{ type: "text", value: "۲" }] },
        { key: "c", content: [{ type: "text", value: "۳" }] },
        { key: "d", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "b",
    });

    const q3Id = await appDb.createQuestion({
      subject: "تحقیق در عملیات",
      chapter: "مدل حمل و نقل",
      topic: "تخصیص",
      content: [{ type: "text", value: "سؤال ۳ حمل و نقل" }],
      options: [
        { key: "a", content: [{ type: "text", value: "۱" }] },
        { key: "b", content: [{ type: "text", value: "۲" }] },
        { key: "c", content: [{ type: "text", value: "۳" }] },
        { key: "d", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "c",
    });

    return { memoryDb, appDb, profileId, q1Id, q2Id, q3Id };
  }

  it("calculates subject stats accurately with chapters and topics breakdown", async () => {
    const { appDb, profileId } = await setup();

    // 1. Initial stats before taking any exam
    const initialStats = await appDb.getSubjectStats("تحقیق در عملیات");
    expect(initialStats.totalQuestions).toBe(3);
    expect(initialStats.solvedCount).toBe(0);
    expect(initialStats.chapters.length).toBe(2);
    expect(initialStats.topics.length).toBe(2);

    // 2. Create session, answer questions and finish
    const sessionId = await appDb.createSession(profileId, {
      subject: "تحقیق در عملیات",
      count: 3,
      mode: "random",
    });
    await appDb.startOrResumeSession(sessionId);
    const session = await appDb.getSession(sessionId);

    // Answer first question correctly
    const q1 = session!.questions[0];
    const correctOpt1 = q1.snapshot.options.find(
      (o) => o.id === q1.snapshot.correctOptionId || o.key === q1.snapshot.correctOptionId
    )!;
    await appDb.saveAnswer(sessionId, q1.id, correctOpt1.id, "sure", 12000, 1);

    await appDb.finishSession(sessionId);

    // 3. Stats after answering
    const updatedStats = await appDb.getSubjectStats("تحقیق در عملیات");
    expect(updatedStats.totalQuestions).toBe(3);
    expect(updatedStats.solvedCount).toBe(1);
    expect(updatedStats.correctCount).toBe(1);
    expect(updatedStats.accuracyPercentage).toBe(100);
  });

  it("calculates topic stats accurately", async () => {
    const { appDb } = await setup();
    const stats = await appDb.getTopicStats("تحقیق در عملیات", "روش سیمپلکس");
    expect(stats.totalQuestions).toBe(2);
    expect(stats.solvedCount).toBe(0);
  });
});
