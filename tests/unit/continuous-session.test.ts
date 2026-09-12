import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

describe("Continuous / On-The-Go Session Mode", () => {
  async function setup() {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    // Create owner and profile
    const ownerId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
      [ownerId, "local", null, "کاربر آزمایشی", "ns-test", Date.now(), Date.now()]
    );

    const profileId = await appDb.createProfile({
      name: "کنکور آزمایشی",
      targetTrack: "رشته آزمایشی",
      subjects: [
        { name: "مدیریت", coefficient: 3, targetPercentage: 80 },
        { name: "زبان", coefficient: 2, targetPercentage: 70 },
      ],
    });

    // Seed test questions:
    // 3 standalone questions for "مدیریت"
    // 1 group of 2 questions for "زبان"
    // 1 standalone question for "زبان"
    const q1Id = await appDb.createQuestion({
      subject: "مدیریت",
      content: [{ type: "text", value: "سؤال ۱ مدیریت" }],
      options: [
        { key: "1", content: [{ type: "text", value: "گزینه ۱" }] },
        { key: "2", content: [{ type: "text", value: "گزینه ۲" }] },
        { key: "3", content: [{ type: "text", value: "گزینه ۳" }] },
        { key: "4", content: [{ type: "text", value: "گزینه ۴" }] },
      ],
      correctOptionKey: "1",
    });

    const q2Id = await appDb.createQuestion({
      subject: "مدیریت",
      content: [{ type: "text", value: "سؤال ۲ مدیریت" }],
      options: [
        { key: "1", content: [{ type: "text", value: "گزینه ۱" }] },
        { key: "2", content: [{ type: "text", value: "گزینه ۲" }] },
        { key: "3", content: [{ type: "text", value: "گزینه ۳" }] },
        { key: "4", content: [{ type: "text", value: "گزینه ۴" }] },
      ],
      correctOptionKey: "2",
    });

    const q3Id = await appDb.createQuestion({
      subject: "مدیریت",
      content: [{ type: "text", value: "سؤال ۳ مدیریت" }],
      options: [
        { key: "1", content: [{ type: "text", value: "گزینه ۱" }] },
        { key: "2", content: [{ type: "text", value: "گزینه ۲" }] },
        { key: "3", content: [{ type: "text", value: "گزینه ۳" }] },
        { key: "4", content: [{ type: "text", value: "گزینه ۴" }] },
      ],
      correctOptionKey: "3",
    });

    // Create a group for Reading in "زبان"
    const groupId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO question_groups(id, external_key, kind, subject, content_json, expected_keys_json, status, created_at) VALUES(?,?,?,?,?,?,?,?)",
      [groupId, "grp-lang-1", "reading", "زبان", JSON.stringify([{ type: "text", value: "متن درک مطلب زبان" }]), JSON.stringify(["gq1", "gq2"]), "complete", Date.now()]
    );

    const gq1Id = crypto.randomUUID();
    const gq2Id = crypto.randomUUID();
    await memoryDb.batch([
      {
        sql: "INSERT INTO questions(id, external_key, subject, group_id, group_position, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        bind: [gq1Id, "gq1", "زبان", groupId, 0, JSON.stringify([{ type: "text", value: "سؤال اول گروه" }]), "[]", null, "published", 1, Date.now()],
      },
      {
        sql: "INSERT INTO question_options(id, question_id, external_key, position, content_json) VALUES(?,?,?,?,?)",
        bind: [crypto.randomUUID(), gq1Id, "1", 0, JSON.stringify([{ type: "text", value: "گزینه الف" }])],
      },
      {
        sql: "INSERT INTO questions(id, external_key, subject, group_id, group_position, content_json, explanation_json, correct_option_id, status, shuffle_safe, created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        bind: [gq2Id, "gq2", "زبان", groupId, 1, JSON.stringify([{ type: "text", value: "سؤال دوم گروه" }]), "[]", null, "published", 1, Date.now()],
      },
      {
        sql: "INSERT INTO question_options(id, question_id, external_key, position, content_json) VALUES(?,?,?,?,?)",
        bind: [crypto.randomUUID(), gq2Id, "1", 0, JSON.stringify([{ type: "text", value: "گزینه الف" }])],
      },
    ]);

    return { memoryDb, appDb, profileId, questions: { q1Id, q2Id, q3Id, gq1Id, gq2Id } };
  }

  it("creates a continuous session starting with only the first unit", async () => {
    const { appDb, profileId } = await setup();

    const sessionId = await appDb.createSession(profileId, {
      mode: "continuous",
      subject: "مدیریت",
      isOpenEnded: true,
      shuffleQuestions: false,
    });

    const session = await appDb.getSession(sessionId);
    expect(session).not.toBeNull();
    expect(session?.config?.isOpenEnded).toBe(true);
    expect(session?.config?.mode).toBe("continuous");
    expect(session?.config?.subjectFilter).toBe("مدیریت");

    // In continuous mode, ONLY the first unit is initially created
    expect(session?.questions.length).toBe(1);
    expect(session?.questions[0].ordinal).toBe(0);
    expect(session?.questions[0].snapshot.subject).toBe("مدیریت");
  });

  it("appends next questions on demand and strictly excludes previously loaded questions", async () => {
    const { appDb, profileId } = await setup();

    const sessionId = await appDb.createSession(profileId, {
      mode: "continuous",
      subject: "مدیریت",
      isOpenEnded: true,
      shuffleQuestions: false,
    });

    // Start session to make it RUNNING
    await appDb.startOrResumeSession(sessionId);

    // Initial session has 1 question
    let view = await appDb.getSession(sessionId);
    expect(view?.questions.length).toBe(1);
    const firstQId = view!.questions[0].snapshot.id;

    // Append next unit
    const appended1 = await appDb.appendNextUnit(sessionId);
    expect(appended1).not.toBeNull();
    expect(appended1?.length).toBe(1);
    expect(appended1![0].ordinal).toBe(1);
    expect(appended1![0].snapshot.id).not.toBe(firstQId);

    // Append third unit
    const appended2 = await appDb.appendNextUnit(sessionId);
    expect(appended2).not.toBeNull();
    expect(appended2?.length).toBe(1);
    expect(appended2![0].ordinal).toBe(2);

    // All 3 questions of "مدیریت" are now loaded. Fourth append must return null (graceful end of pool)
    const appended3 = await appDb.appendNextUnit(sessionId);
    expect(appended3).toBeNull();

    // Verify session now has exactly 3 questions
    view = await appDb.getSession(sessionId);
    expect(view?.questions.length).toBe(3);
    const ids = view!.questions.map((q) => q.snapshot.id);
    expect(new Set(ids).size).toBe(3); // strictly unique
  });

  it("preserves reading group integrity when appending next unit", async () => {
    const { appDb, profileId } = await setup();

    const sessionId = await appDb.createSession(profileId, {
      mode: "continuous",
      subject: "زبان",
      isOpenEnded: true,
      shuffleQuestions: false,
    });

    const session = await appDb.getSession(sessionId);
    expect(session?.questions.length).toBe(2); // The 2 members of the reading group were kept together!
    expect(session?.questions[0].ordinal).toBe(0);
    expect(session?.questions[1].ordinal).toBe(1);
  });

  it("trims trailing unattempted question on finish so user is not penalized for unreached questions", async () => {
    const { appDb, profileId } = await setup();

    const sessionId = await appDb.createSession(profileId, {
      mode: "continuous",
      subject: "مدیریت",
      isOpenEnded: true,
      shuffleQuestions: false,
    });

    await appDb.startOrResumeSession(sessionId);

    let view = await appDb.getSession(sessionId);
    const q0 = view!.questions[0];

    // User answers question 0 correctly
    const correctOptId = q0.snapshot.correctOptionId!;
    await appDb.saveAnswer(sessionId, q0.id, correctOptId, "sure", 15000, 0);

    // User clicks Next -> Question 1 is generated and appended
    await appDb.appendNextUnit(sessionId);

    view = await appDb.getSession(sessionId);
    expect(view?.questions.length).toBe(2);

    // User is on Question 1, but destination arrives! User didn't answer question 1.
    // User clicks Finish Exam:
    await appDb.finishSession(sessionId);

    // Verify that question 1 (unattempted trailing question) was trimmed!
    const finalView = await appDb.getSession(sessionId);
    expect(finalView?.state).toBe("FINISHED");
    expect(finalView?.questions.length).toBe(1); // Question 1 was trimmed!

    // Verify attempts table: only question 0 was finalized
    const attempts = await appDb["client"].query<{ id: string; result: string; was_visited?: number }>(
      "SELECT * FROM attempts WHERE session_id=?",
      [sessionId]
    );
    expect(attempts.length).toBe(1);
    expect(attempts[0].result).toBe("correct");

    // Review scheduler: question 1 must NOT be in review items as a failure!
    const reviews = await appDb["client"].query<{ question_id: string }>(
      "SELECT * FROM review_items"
    );
    // Only q0 (which was answered correctly) or nothing
    expect(reviews.every((r) => r.question_id === q0.snapshot.id)).toBe(true);
  });

  it("handles finish on empty continuous session without error or penalty", async () => {
    const { appDb, profileId } = await setup();

    const sessionId = await appDb.createSession(profileId, {
      mode: "continuous",
      subject: "مدیریت",
      isOpenEnded: true,
      shuffleQuestions: false,
    });

    await appDb.startOrResumeSession(sessionId);

    // User immediately clicks finish without answering question 0
    await appDb.finishSession(sessionId);

    const finalView = await appDb.getSession(sessionId);
    expect(finalView?.state).toBe("FINISHED");
    expect(finalView?.questions.length).toBe(0);

    const attempts = await appDb["client"].query<{ id: string }>(
      "SELECT * FROM attempts WHERE session_id=?",
      [sessionId]
    );
    expect(attempts.length).toBe(0);
  });
});
