import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { AppDatabase } from "@/database/app-database";

describe("Session Lifecycle, Commands, & Finish Finalization (TASK-017, TASK-018, TASK-020)", () => {
  async function setup() {
    const memoryDb = await createTestDatabase();
    const appDb = new AppDatabase(memoryDb);
    await appDb.open();

    const ownerId = crypto.randomUUID();
    await memoryDb.execute(
      "INSERT INTO owners(id, kind, auth_user_id, display_name, device_namespace, created_at, updated_at) VALUES(?,?,?,?,?,?,?)",
      [ownerId, "local", null, "کاربر تستی", "ns-lifecycle", Date.now(), Date.now()]
    );

    const profileId = await appDb.createProfile({
      name: "کنکور آزمایشی",
      targetTrack: "مدیریت",
      subjects: [{ name: "مدیریت", coefficient: 3, targetPercentage: 80 }],
    });

    const q1 = await appDb.createQuestion({
      subject: "مدیریت",
      content: [{ type: "text", value: "سؤال ۱" }],
      options: [
        { key: "1", content: [{ type: "text", value: "گزینه ۱" }] },
        { key: "2", content: [{ type: "text", value: "گزینه ۲" }] },
        { key: "3", content: [{ type: "text", value: "گزینه ۳" }] },
        { key: "4", content: [{ type: "text", value: "گزینه ۴" }] },
      ],
      correctOptionKey: "1",
    });

    const q2 = await appDb.createQuestion({
      subject: "مدیریت",
      content: [{ type: "text", value: "سؤال ۲" }],
      options: [
        { key: "1", content: [{ type: "text", value: "گزینه ۱" }] },
        { key: "2", content: [{ type: "text", value: "گزینه ۲" }] },
        { key: "3", content: [{ type: "text", value: "گزینه ۳" }] },
        { key: "4", content: [{ type: "text", value: "گزینه ۴" }] },
      ],
      correctOptionKey: "2",
    });

    return { memoryDb, appDb, profileId, q1, q2 };
  }

  it("enforces only one RUNNING session on the device", async () => {
    const { appDb, profileId } = await setup();
    const s1 = await appDb.createSession(profileId, { count: 2 });
    const s2 = await appDb.createSession(profileId, { count: 2 });

    await appDb.startOrResumeSession(s1);
    let view1 = await appDb.getSession(s1);
    expect(view1?.state).toBe("RUNNING");

    // Starting s2 automatically pauses s1
    await appDb.startOrResumeSession(s2);
    view1 = await appDb.getSession(s1);
    const view2 = await appDb.getSession(s2);
    expect(view1?.state).toBe("PAUSED");
    expect(view2?.state).toBe("RUNNING");
  });

  it("rejects answering when session is PAUSED", async () => {
    const { appDb, profileId } = await setup();
    const sId = await appDb.createSession(profileId, { count: 2 });
    await appDb.startOrResumeSession(sId);
    await appDb.pauseSession(sId);

    const view = await appDb.getSession(sId);
    expect(view?.state).toBe("PAUSED");

    const firstSq = view!.questions[0];
    const optionId = firstSq.optionOrder[0];

    // Attempting saveAnswer while PAUSED
    await appDb.saveAnswer(sId, firstSq.id, optionId, "sure", 1000, 0);

    // Verify it was NOT saved because state is not RUNNING
    const checkView = await appDb.getSession(sId);
    expect(checkView?.questions[0].selectedOptionId).toBeNull();
  });

  it("does not create attempts during PAUSE", async () => {
    const { memoryDb, appDb, profileId } = await setup();
    const sId = await appDb.createSession(profileId, { count: 2 });
    await appDb.startOrResumeSession(sId);
    await appDb.pauseSession(sId);

    const attempts = await memoryDb.query("SELECT * FROM attempts WHERE session_id=?", [sId]);
    expect(attempts).toHaveLength(0);
  });

  it("finalizes attempts ONCE and is idempotent on finishSession (duplicate call safe)", async () => {
    const { memoryDb, appDb, profileId } = await setup();
    const sId = await appDb.createSession(profileId, { count: 2 });
    await appDb.startOrResumeSession(sId);

    const view = await appDb.getSession(sId);
    const q0 = view!.questions[0];
    const correctOpt0 = q0.snapshot.correctOptionId;

    // Answer Q0 correctly
    await appDb.saveAnswer(sId, q0.id, correctOpt0, "sure", 2500, 0);

    // Leave Q1 unanswered
    await appDb.finishSession(sId);

    const finalView = await appDb.getSession(sId);
    expect(finalView?.state).toBe("FINISHED");

    // Attempts created
    const attempts = await memoryDb.query<{ result: string }>(
      "SELECT result FROM attempts WHERE session_id=? ORDER BY finalized_at ASC",
      [sId]
    );
    expect(attempts).toHaveLength(2);
    expect(attempts.map((a) => a.result)).toEqual(["correct", "unanswered"]);

    // Calling finishSession second time is idempotent and does not create duplicate attempts
    await appDb.finishSession(sId);
    const attemptsAfterSecond = await memoryDb.query(
      "SELECT * FROM attempts WHERE session_id=?",
      [sId]
    );
    expect(attemptsAfterSecond).toHaveLength(2);
  });
});
