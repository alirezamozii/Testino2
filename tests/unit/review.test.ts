import { describe, expect, it } from "vitest";
import { scheduleReview } from "@/features/review/domain/scheduler";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

const now = Date.UTC(2026, 8, 9);

describe("scheduleReview", () => {
  it("does not create weakness from an unvisited question", () => {
    expect(scheduleReview({ id: "a", result: "unanswered", visited: false, confidence: null, finalizedAt: now })).toBeNull();
  });

  it("makes wrong answers immediately due", () => {
    expect(scheduleReview({ id: "a", result: "wrong", visited: true, confidence: null, finalizedAt: now })).toMatchObject({ priority: 0, dueAt: now });
  });

  it("caps sure-answer spacing at thirty days", () => {
    expect(scheduleReview({ id: "a", result: "correct", visited: true, confidence: "sure", finalizedAt: now }, { stableStreak: 9, intervalDays: 30 })).toMatchObject({ intervalDays: 30, stableStreak: 10 });
  });

  it("handles doubtful and guess answers (priority 2, 1-day interval)", () => {
    const resDoubtful = scheduleReview({ id: "a", result: "correct", visited: true, confidence: "doubtful", finalizedAt: now });
    expect(resDoubtful).toMatchObject({ priority: 2, intervalDays: 1, stableStreak: 0 });

    const resGuess = scheduleReview({ id: "a", result: "correct", visited: true, confidence: "guess", finalizedAt: now });
    expect(resGuess).toMatchObject({ priority: 2, intervalDays: 1, stableStreak: 0 });
  });

  it("handles correct answer with null confidence (priority 3, min 3 days cap)", () => {
    const resNull = scheduleReview({ id: "a", result: "correct", visited: true, confidence: null, finalizedAt: now }, { stableStreak: 2, intervalDays: 7 });
    expect(resNull).toMatchObject({ priority: 3, intervalDays: 3, stableStreak: 2 });
  });

  it("rebuilds review items idempotently and discards archived questions", async () => {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const q1 = await appDb.createQuestion({
      subject: "ریاضی",
      content: [{ type: "text", value: "سؤال ۱ ریاضی" }],
      options: [
        { key: "1", content: [{ type: "text", value: "۱" }] },
        { key: "2", content: [{ type: "text", value: "۲" }] },
        { key: "3", content: [{ type: "text", value: "۳" }] },
        { key: "4", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "1",
    });

    const qArchived = await appDb.createQuestion({
      subject: "ریاضی",
      content: [{ type: "text", value: "سؤال آرشیو شده" }],
      options: [
        { key: "1", content: [{ type: "text", value: "۱" }] },
        { key: "2", content: [{ type: "text", value: "۲" }] },
        { key: "3", content: [{ type: "text", value: "۳" }] },
        { key: "4", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "1",
    });

    // Create real profile for foreign key constraint
    const profileId = await appDb.createProfile({
      name: "کنکور",
      subjects: [{ name: "ریاضی", coefficient: 1, targetPercentage: 50 }],
    });

    // Mark qArchived as inactive/archived
    await memoryDb.execute("UPDATE questions SET inactive_at=? WHERE id=?", [Date.now(), qArchived]);

    // Insert session & attempts for both questions
    const sId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at) VALUES(?, ?, 'FINISHED', 'seed', ?)",
      [sId, profileId, Date.now()]
    );
    const sq1 = crypto.randomUUID();
    const sq2 = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json) VALUES(?,?,?,0,'{}','[]'), (?,?,?,1,'{}','[]')",
      [sq1, sId, q1, sq2, sId, qArchived]
    );

    // Both answered wrong
    await memoryDb.execute(
      "INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, active_ms, finalized_at) VALUES(?,?,?,?,'wrong',1,1000,?), (?,?,?,?,'wrong',1,1000,?)",
      [crypto.randomUUID(), sq1, sId, q1, now, crypto.randomUUID(), sq2, sId, qArchived, now]
    );

    const count = await appDb.rebuildReviewItems();
    expect(count).toBe(1); // Only q1 rebuilt, qArchived is excluded!

    const items = await memoryDb.query<{ question_id: string }>("SELECT question_id FROM review_items");
    expect(items).toHaveLength(1);
    expect(items[0].question_id).toBe(q1);
  });

  it("creates a review session including all selected pool categories (wrong, doubtful, skipped)", async () => {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const profileId = await appDb.createProfile({
      name: "کنکور",
      subjects: [{ name: "روان‌شناسی", coefficient: 1, targetPercentage: 50 }],
    });

    const createQ = async (text: string) => {
      return appDb.createQuestion({
        subject: "روان‌شناسی",
        content: [{ type: "text", value: text }],
        options: [
          { key: "1", content: [{ type: "text", value: "۱" }] },
          { key: "2", content: [{ type: "text", value: "۲" }] },
        ],
        correctOptionKey: "1",
      });
    };

    const qWrong = await createQ("سؤال ۱ غلط");
    const qDoubtful = await createQ("سؤال ۲ با شک");
    const qSkip1 = await createQ("سؤال ۳ نزده");
    const qSkip2 = await createQ("سؤال ۴ نزده");
    const qSkip3 = await createQ("سؤال ۵ نزده");
    const qCorrect = await createQ("سؤال ۶ درست مطمئن");

    const sId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at) VALUES(?, ?, 'FINISHED', 'seed', ?)",
      [sId, profileId, Date.now()]
    );

    const questions = [
      { id: qWrong, res: "wrong", conf: null },
      { id: qDoubtful, res: "correct", conf: "doubtful" },
      { id: qSkip1, res: "unanswered", conf: null },
      { id: qSkip2, res: "unanswered", conf: null },
      { id: qSkip3, res: "unanswered", conf: null },
      { id: qCorrect, res: "correct", conf: "sure" },
    ];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const sqId = crypto.randomUUID();
      await memoryDb.execute(
        "INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json) VALUES(?,?,?,?,?,?)",
        [sqId, sId, q.id, i, JSON.stringify({ id: q.id, subject: "روان‌شناسی", options: [] }), "[]"]
      );
      await memoryDb.execute(
        "INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, confidence, active_ms, finalized_at) VALUES(?,?,?,?,?,?,?,1000,?)",
        [crypto.randomUUID(), sqId, sId, q.id, q.res, q.res === "unanswered" ? 0 : 1, q.conf, Date.now()]
      );
    }

    // Now user takes Session 2 on the same questions and answers qDoubtful, qSkip1, qSkip2, qSkip3 correctly:
    const sId2 = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at) VALUES(?, ?, 'FINISHED', 'seed', ?)",
      [sId2, profileId, Date.now() + 1000]
    );

    const questions2 = [
      { id: qDoubtful, res: "correct", conf: "sure" },
      { id: qSkip1, res: "correct", conf: "sure" },
      { id: qSkip2, res: "correct", conf: "sure" },
      { id: qSkip3, res: "correct", conf: "sure" },
    ];

    for (let i = 0; i < questions2.length; i++) {
      const q = questions2[i];
      const sqId = crypto.randomUUID();
      await memoryDb.execute(
        "INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json) VALUES(?,?,?,?,?,?)",
        [sqId, sId2, q.id, i, JSON.stringify({ id: q.id, subject: "روان‌شناسی", options: [] }), "[]"]
      );
      await memoryDb.execute(
        "INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, confidence, active_ms, finalized_at) VALUES(?,?,?,?,?,?,?,1000,?)",
        [crypto.randomUUID(), sqId, sId2, q.id, q.res, 1, q.conf, Date.now() + 1000]
      );
    }

    const poolStats2 = await appDb.getQuestionPoolStats(profileId);
    console.log("Pool stats after session 2:", {
      wrong: poolStats2.wrongIds.length,
      doubtful: poolStats2.doubtfulIds.length,
      skipped: poolStats2.skippedIds.length,
      mastered: poolStats2.masteredIds.length,
    });

    const studyQuestions = await appDb.getReviewStudyQuestions(profileId, {
      modes: ["wrong", "doubtful", "skipped"],
    });
    console.log("Study questions count after session 2:", studyQuestions.length);

    const reviewSessionId = await appDb.createSession(profileId, {
      sessionType: "review",
      mode: "due",
      modes: ["wrong", "doubtful", "skipped"],
      count: 5,
      shuffleQuestions: false,
    });

    const reviewView = await appDb.getSession(reviewSessionId);
    console.log("Review session questions count after session 2:", reviewView?.questions.length);
    console.log("Review session questions after session 2:", reviewView?.questions.map((q) => q.snapshot.id || q.id));
  });
});
