import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

describe("Analytics Aggregates & Target Percentage (TASK-023)", () => {
  async function setup() {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const ownerId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
      [ownerId, "local", null, "کاربر تستی", "ns-analytics", Date.now(), Date.now()]
    );

    const profileId = await appDb.createProfile({
      name: "کنکور مدیریت",
      targetTrack: "مدیریت بازرگانی",
      subjects: [
        { name: "ریاضی", coefficient: 3, targetPercentage: 70 },
        { name: "اقتصاد", coefficient: 2, targetPercentage: 50 },
      ],
    });

    // Create 3 questions for ریاضی
    const q1 = await appDb.createQuestion({
      subject: "ریاضی",
      topic: "مشتق",
      content: [{ type: "text", value: "سؤال ۱" }],
      options: [
        { key: "1", content: [{ type: "text", value: "۱" }] },
        { key: "2", content: [{ type: "text", value: "۲" }] },
        { key: "3", content: [{ type: "text", value: "۳" }] },
        { key: "4", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "1",
    });

    const q2 = await appDb.createQuestion({
      subject: "ریاضی",
      topic: "مشتق",
      content: [{ type: "text", value: "سؤال ۲" }],
      options: [
        { key: "1", content: [{ type: "text", value: "۱" }] },
        { key: "2", content: [{ type: "text", value: "۲" }] },
        { key: "3", content: [{ type: "text", value: "۳" }] },
        { key: "4", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "2",
    });

    const q3 = await appDb.createQuestion({
      subject: "ریاضی",
      topic: "انتگرال",
      content: [{ type: "text", value: "سؤال ۳" }],
      options: [
        { key: "1", content: [{ type: "text", value: "۱" }] },
        { key: "2", content: [{ type: "text", value: "۲" }] },
        { key: "3", content: [{ type: "text", value: "۳" }] },
        { key: "4", content: [{ type: "text", value: "۴" }] },
      ],
      correctOptionKey: "3",
    });

    return { memoryDb, appDb, profileId, q1, q2, q3 };
  }

  it("calculates accuracy, target gaps, and weak topics correctly", async () => {
    const { memoryDb, appDb, profileId, q1, q2, q3 } = await setup();

    // Create session with mode 'random'
    const sId = crypto.randomUUID();
    const now = Date.now();
    await memoryDb.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at, config_json) VALUES(?, ?, 'FINISHED', 'seed', ?, ?)",
      [sId, profileId, now, JSON.stringify({ mode: "random" })]
    );

    const sq1 = crypto.randomUUID();
    const sq2 = crypto.randomUUID();
    const sq3 = crypto.randomUUID();

    await memoryDb.execute(
      "INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json) VALUES(?,?,?,0,'{}','[]'), (?,?,?,1,'{}','[]'), (?,?,?,2,'{}','[]')",
      [sq1, sId, q1, sq2, sId, q2, sq3, sId, q3]
    );

    // Q1 correct (2000ms), Q2 wrong (4000ms), Q3 wrong (3000ms)
    await memoryDb.execute(
      `INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, active_ms, finalized_at)
       VALUES (?,?,?,?,'correct',1,2000,?),
              (?,?,?,?,'wrong',1,4000,?),
              (?,?,?,?,'wrong',1,3000,?)`,
      [
        crypto.randomUUID(), sq1, sId, q1, now,
        crypto.randomUUID(), sq2, sId, q2, now,
        crypto.randomUUID(), sq3, sId, q3, now,
      ]
    );

    const result = await appDb.analytics(profileId);
    expect(result.totals.total).toBe(3);
    expect(result.totals.correct).toBe(1);
    expect(result.totals.wrong).toBe(2);

    // Check subject stats
    const math = result.bySubject.find((s) => s.subject === "ریاضی عمومی");
    expect(math).toBeDefined();
    expect(math?.total).toBe(3);
    expect(math?.correct).toBe(1);
    expect(math?.targetPercentage).toBe(70);
    // Target gap = raw/penalized - 70
    expect(math?.targetGap).toBeLessThan(0);

    // Check average time
    // Total ms = 2000 + 4000 + 3000 = 9000ms -> 3 sec avg
    expect(result.averageTimePerQuestionSec).toBe(3);

    // Check filter by mode: 'due' should yield 0 results
    const dueResult = await appDb.analytics(profileId, { mode: "due" });
    expect(dueResult.totals.total).toBe(0);

    // Filter by mode: 'random' should yield 3 results
    const randomResult = await appDb.analytics(profileId, { mode: "random" });
    expect(randomResult.totals.total).toBe(3);
  });

  it("deduplicates repeated attempts on the same question taking the latest attempt for mastery", async () => {
    const { memoryDb, appDb, profileId, q1 } = await setup();
    const now = Date.now();

    // Session 1: user takes an exam and gets Q1 wrong
    const s1 = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at, config_json) VALUES(?, ?, 'FINISHED', 'seed', ?, '{}')",
      [s1, profileId, now - 10000]
    );
    const sq1 = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json) VALUES(?,?,?,0,'{}','[]')",
      [sq1, s1, q1]
    );
    await memoryDb.execute(
      "INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, active_ms, finalized_at) VALUES (?,?,?,?,'wrong',1,2000,?)",
      [crypto.randomUUID(), sq1, s1, q1, now - 10000]
    );

    // Session 2: user studies and retakes Q1 and gets it correct!
    const s2 = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at, config_json) VALUES(?, ?, 'FINISHED', 'seed', ?, '{}')",
      [s2, profileId, now - 5000]
    );
    const sq2 = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO session_questions(id, session_id, question_id, ordinal, snapshot_json, option_order_json) VALUES(?,?,?,0,'{}','[]')",
      [sq2, s2, q1]
    );
    await memoryDb.execute(
      "INSERT INTO attempts(id, session_question_id, session_id, question_id, result, visited, active_ms, finalized_at) VALUES (?,?,?,?,'correct',1,2000,?)",
      [crypto.randomUUID(), sq2, s2, q1, now - 5000]
    );

    // Analytics tracks both total cumulative exam attempts (for true Konkur scoring and sync with Dashboard)
    // and unique questions count
    const result = await appDb.analytics(profileId);
    expect(result.totals.total).toBe(2); // 2 total exam attempts
    expect(result.totals.totalAttempts).toBe(2); // 2 total attempts across sessions
    expect(result.totals.uniqueQuestionsCount).toBe(1); // 1 unique question tested
    expect(result.totals.correct).toBe(1); // 1 correct attempt
    expect(result.totals.wrong).toBe(1); // 1 wrong attempt preserved accurately

    const math = result.bySubject.find((s) => s.subject === "ریاضی عمومی");
    expect(math?.total).toBe(2);
    expect(math?.totalAttempts).toBe(2);
    expect(math?.correct).toBe(1);
    expect(math?.wrong).toBe(1);
  });
});
