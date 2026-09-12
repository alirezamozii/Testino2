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
});
