import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { reconcileLocalMutations } from "@/sync/aggregate-snapshots";
import { OutboxRepository } from "@/database/repositories/outbox-repository";
import { executePush } from "@/sync/push";
import { executePull } from "@/sync/pull";
import { OfflineLibraryService } from "@/features/offline/domain/offline-library-service";
import type {
  PullChangeItem,
  PullChangesResult,
  PushMutationItem,
  PushMutationResult,
  SyncTransport,
} from "@/sync/ports";

class MemoryCloudTransport implements SyncTransport {
  changes: PullChangeItem[] = [];
  isConfigured() { return true; }
  async isAuthenticated() { return true; }
  async push(_deviceId: string, mutations: PushMutationItem[]): Promise<PushMutationResult[]> {
    return mutations.map((mutation) => {
      const existing = this.changes.find(
        (change) => change.entityType === mutation.entityType && change.entityId === mutation.entityId
      );
      const changeSeq = String(this.changes.length + 1);
      const payloadRecord = mutation.payload as Record<string, unknown> | undefined;
      const isTombstone = Boolean(
        mutation.entityType === "tombstone" ||
        payloadRecord?.is_tombstone ||
        (payloadRecord?.session as Record<string, unknown> | undefined)?.is_tombstone ||
        (payloadRecord?.session as Record<string, unknown> | undefined)?.state === "DELETED"
      );
      const item: PullChangeItem = {
        changeSeq,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        serverVersion: (existing?.serverVersion ?? 0) + 1,
        isTombstone,
        payload: (mutation.payload as Record<string, unknown>) || {},
        createdAt: new Date().toISOString(),
      };
      this.changes.push(item);
      return { mutationId: mutation.mutationId, status: "accepted", changeSeq };
    });
  }
  async pull(cursor: string, limit = 100): Promise<PullChangesResult> {
    const eligible = this.changes.filter((change) => BigInt(change.changeSeq) > BigInt(cursor || "0"));
    const page = eligible.slice(0, limit);
    return {
      changes: page,
      nextCursor: page.at(-1)?.changeSeq ?? cursor,
      hasMore: eligible.length > page.length,
    };
  }
  async downloadSubjects(subjectNames: string[], cursor: string, limit = 100) {
    const all = await this.pull(cursor, limit);
    const changes = all.changes.filter((change) => {
      if (change.entityType === "profileBundle") return true;
      const question = change.payload.question as Record<string, unknown> | undefined;
      return change.entityType === "questionBundle" && subjectNames.includes(String(question?.subject || ""));
    });
    return { changes, nextCursor: all.nextCursor, hasMore: all.hasMore };
  }
}

async function seedDevice(db: Awaited<ReturnType<typeof createTestDatabase>>) {
  const now = Date.now();
  await db.execute(
    "INSERT INTO owners(id,kind,display_name,device_namespace,created_at,updated_at) VALUES('owner-sync','account','کاربر','device-a',?,?)",
    [now, now]
  );
  await db.execute("INSERT INTO profiles(id,name,created_at) VALUES('profile-sync','آزمون',?)", [now]);
  await db.execute(
    "INSERT INTO subjects(id,profile_id,name,coefficient,target_percentage,question_count,created_at) VALUES('subject-sync','profile-sync','ریاضی',2,80,25,?)",
    [now]
  );
  await db.execute(
    "INSERT INTO questions(id,external_key,subject,content_json,explanation_json,correct_option_id,status,shuffle_safe,created_at) VALUES('question-sync','q1','ریاضی','[{\"type\":\"text\",\"value\":\"۲+۲؟\"}]','[]','option-c','published',1,?)",
    [now]
  );
  for (const [position, id] of ["option-a", "option-b", "option-c", "option-d"].entries()) {
    await db.execute(
      "INSERT INTO question_options(id,question_id,external_key,position,content_json) VALUES(?,'question-sync',?,?,?)",
      [id, String.fromCharCode(97 + position), position, `[{"type":"text","value":"${position + 2}"}]`]
    );
  }
  const snapshot = JSON.stringify({
    id: "question-sync",
    externalKey: "q1",
    subject: "ریاضی",
    content: [{ type: "text", value: "۲+۲؟" }],
    explanation: [],
    correctOptionId: "option-c",
    shuffleSafe: true,
    options: ["option-a", "option-b", "option-c", "option-d"].map((id, position) => ({ id, key: String(position), content: [] })),
  });
  await db.execute(
    "INSERT INTO sessions(id,profile_id,state,selection_seed,current_ordinal,created_at,config_json) VALUES('session-sync','profile-sync','PAUSED','seed',0,?,'{}')",
    [now]
  );
  await db.execute(
    "INSERT INTO session_questions(id,session_id,question_id,ordinal,snapshot_json,option_order_json,selected_option_id,visited) VALUES('sq-sync','session-sync','question-sync',0,?,'[\"option-a\",\"option-b\",\"option-c\",\"option-d\"]','option-c',1)",
    [snapshot]
  );
}

describe("aggregate cross-device sync and offline library", () => {
  it("reconciles all durable local state and rebuilds it on a second device", async () => {
    const first = await createTestDatabase();
    const second = await createTestDatabase();
    await new MigrationRunner().run(first);
    await new MigrationRunner().run(second);
    await seedDevice(first);
    await second.execute(
      "INSERT INTO owners(id,kind,display_name,device_namespace,created_at,updated_at) VALUES('owner-sync','account','کاربر','device-b',?,?)",
      [Date.now(), Date.now()]
    );

    expect(await reconcileLocalMutations("owner-sync", first)).toBe(3);
    const cloud = new MemoryCloudTransport();
    const pushed = await executePush("owner-sync", "device-a", new OutboxRepository(first), cloud, { batchSize: 100 });
    expect(pushed.pushedCount).toBe(3);

    const pulled = await executePull("owner-sync", second, new OutboxRepository(second), cloud, { limit: 100 });
    expect(pulled.pulledCount).toBe(3);
    expect((await second.query("SELECT id FROM profiles WHERE id='profile-sync'")).length).toBe(1);
    expect((await second.query("SELECT id FROM question_options WHERE question_id='question-sync'")).length).toBe(4);
    const [answer] = await second.query<{ selected_option_id: string }>(
      "SELECT selected_option_id FROM session_questions WHERE id='sq-sync'"
    );
    expect(answer.selected_option_id).toBe("option-c");

    await first.close();
    await second.close();
  });

  it("stores explicit per-subject offline selection and downloads the selected content", async () => {
    const source = await createTestDatabase();
    const target = await createTestDatabase();
    await new MigrationRunner().run(source);
    await new MigrationRunner().run(target);
    await seedDevice(source);
    await target.execute(
      "INSERT INTO owners(id,kind,display_name,device_namespace,created_at,updated_at) VALUES('owner-sync','account','کاربر','device-c',?,?)",
      [Date.now(), Date.now()]
    );
    await reconcileLocalMutations("owner-sync", source);
    const cloud = new MemoryCloudTransport();
    await executePush("owner-sync", "device-a", new OutboxRepository(source), cloud, { batchSize: 100 });
    await executePull("owner-sync", target, new OutboxRepository(target), {
      ...cloud,
      pull: async () => ({ changes: cloud.changes.filter((item) => item.entityType === "profileBundle"), nextCursor: "1", hasMore: false }),
      isConfigured: () => true,
      isAuthenticated: async () => true,
      push: cloud.push.bind(cloud),
      downloadSubjects: cloud.downloadSubjects.bind(cloud),
    });

    const service = new OfflineLibraryService(target, cloud);
    await service.setEnabled("owner-sync", "profile-sync", { id: "subject-sync", name: "ریاضی" }, true);
    const report = await service.downloadEnabled("owner-sync", "profile-sync");
    expect(report.questions).toBe(1);
    expect((await target.query("SELECT id FROM questions WHERE id='question-sync'")).length).toBe(1);
    const [state] = await target.query<{ status: string }>("SELECT status FROM offline_subjects WHERE subject_id='subject-sync'");
    expect(state.status).toBe("ready");

    await source.close();
    await target.close();
  });

  it("forks a recoverable session when two offline devices changed the same answer", async () => {
    const phone = await createTestDatabase();
    const desktop = await createTestDatabase();
    await new MigrationRunner().run(phone);
    await new MigrationRunner().run(desktop);
    await seedDevice(phone);
    await seedDevice(desktop);
    await desktop.execute("UPDATE owners SET device_namespace='device-desktop' WHERE id='owner-sync'");
    await desktop.execute("UPDATE session_questions SET selected_option_id='option-a' WHERE id='sq-sync'");

    const cloud = new MemoryCloudTransport();
    await reconcileLocalMutations("owner-sync", phone);
    await executePush("owner-sync", "phone", new OutboxRepository(phone), cloud, { batchSize: 100 });
    await executePull("owner-sync", desktop, new OutboxRepository(desktop), cloud, { limit: 100 });

    const sessions = await desktop.query<{ id: string; state: string }>("SELECT id,state FROM sessions ORDER BY created_at,id");
    expect(sessions).toHaveLength(2);
    expect(sessions.some((session) => session.id !== "session-sync" && session.state === "PAUSED")).toBe(true);
    const [conflicts] = await desktop.query<{ total: number }>("SELECT COUNT(*) AS total FROM sync_conflicts WHERE resolution='forked'");
    expect(Number(conflicts.total)).toBe(1);

    await phone.close();
    await desktop.close();
  });

  it("reconciles only dirty aggregates after the initial sync", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);
    await seedDevice(db);
    expect(await reconcileLocalMutations("owner-sync", db)).toBe(3);
    expect(await reconcileLocalMutations("owner-sync", db)).toBe(0);

    await db.execute(
      "UPDATE questions SET content_json='[{\"type\":\"text\",\"value\":\"نسخه تازه\"}]' WHERE id='question-sync'"
    );
    expect(await reconcileLocalMutations("owner-sync", db)).toBe(1);
    const [remaining] = await db.query<{ total: number }>("SELECT COUNT(*) AS total FROM sync_dirty_entities");
    expect(Number(remaining.total)).toBe(0);
    await db.close();
  });

  it("synchronizes session deletion from laptop to phone and verifies bidirectional sync fidelity", async () => {
    const laptop = await createTestDatabase();
    const phone = await createTestDatabase();
    await new MigrationRunner().run(laptop);
    await new MigrationRunner().run(phone);

    // 1. Seed Laptop
    await seedDevice(laptop);
    await phone.execute(
      "INSERT INTO owners(id,kind,display_name,device_namespace,created_at,updated_at) VALUES('owner-sync','account','کاربر','device-phone',?,?)",
      [Date.now(), Date.now()]
    );

    const cloud = new MemoryCloudTransport();

    // 2. Laptop reconciles and pushes initial state to Cloud
    expect(await reconcileLocalMutations("owner-sync", laptop)).toBe(3);
    const push1 = await executePush("owner-sync", "device-laptop", new OutboxRepository(laptop), cloud, { batchSize: 100 });
    expect(push1.pushedCount).toBe(3);

    // 3. Phone pulls initial state from Cloud
    const pull1 = await executePull("owner-sync", phone, new OutboxRepository(phone), cloud, { limit: 100 });
    expect(pull1.pulledCount).toBe(3);

    // Verify Phone has the session
    const phoneSessionsBefore = await phone.query("SELECT id FROM sessions WHERE id='session-sync'");
    expect(phoneSessionsBefore).toHaveLength(1);
    const phoneQuestionsBefore = await phone.query("SELECT id FROM session_questions WHERE session_id='session-sync'");
    expect(phoneQuestionsBefore).toHaveLength(1);

    // 4. Laptop deletes the session history
    const laptopOutbox = new OutboxRepository(laptop);
    await laptopOutbox.enqueue("owner-sync", {
      mutationId: `tombstone:sessionBundle:session-sync:${Date.now()}`,
      entityType: "sessionBundle",
      entityId: "session-sync",
      baseVersion: 1,
      payload: {
        id: "session-sync",
        is_tombstone: true,
        session: { id: "session-sync", state: "DELETED", is_tombstone: true },
      },
    });
    await laptop.execute("DELETE FROM review_items WHERE last_attempt_id IN (SELECT id FROM attempts WHERE session_id='session-sync')");
    await laptop.execute("DELETE FROM attempt_events WHERE session_id='session-sync'");
    await laptop.execute("DELETE FROM attempts WHERE session_id='session-sync'");
    await laptop.execute("DELETE FROM session_questions WHERE session_id='session-sync'");
    await laptop.execute("DELETE FROM sessions WHERE id='session-sync'");

    // Verify Laptop has 0 sessions
    expect(await laptop.query("SELECT id FROM sessions WHERE id='session-sync'")).toHaveLength(0);

    // 5. Laptop pushes deletion tombstone to Cloud
    const push2 = await executePush("owner-sync", "device-laptop", new OutboxRepository(laptop), cloud, { batchSize: 100 });
    expect(push2.pushedCount).toBe(1);
    await executePull("owner-sync", laptop, new OutboxRepository(laptop), cloud, { limit: 100 });

    // 6. Phone pulls changes from Cloud
    const pull2 = await executePull("owner-sync", phone, new OutboxRepository(phone), cloud, { limit: 100 });
    expect(pull2.pulledCount).toBe(1);

    // 7. Verify Phone has 0 sessions (no resurrection, ghost completely deleted)
    const phoneSessionsAfter = await phone.query("SELECT id FROM sessions WHERE id='session-sync'");
    expect(phoneSessionsAfter).toHaveLength(0);
    const phoneQuestionsAfter = await phone.query("SELECT id FROM session_questions WHERE session_id='session-sync'");
    expect(phoneQuestionsAfter).toHaveLength(0);

    // 8. Phone creates a new session while offline
    const now = Date.now();
    const snapshot = JSON.stringify({
      id: "question-sync",
      externalKey: "q1",
      subject: "ریاضی",
      content: [{ type: "text", value: "۲+۲؟" }],
      explanation: [],
      correctOptionId: "option-c",
      shuffleSafe: true,
      options: ["option-a", "option-b", "option-c", "option-d"].map((id, position) => ({ id, key: String(position), content: [] })),
    });
    await phone.execute(
      "INSERT INTO sessions(id,profile_id,state,selection_seed,current_ordinal,created_at,config_json) VALUES('session-phone-new','profile-sync','PAUSED','seed',0,?,'{}')",
      [now]
    );
    await phone.execute(
      "INSERT INTO session_questions(id,session_id,question_id,ordinal,snapshot_json,option_order_json,selected_option_id,visited) VALUES('sq-phone-new','session-phone-new','question-sync',0,?,'[\"option-a\",\"option-b\",\"option-c\",\"option-d\"]','option-b',1)",
      [snapshot]
    );

    // 9. Phone goes online, reconciles and pushes to Cloud
    const reconciledPhone = await reconcileLocalMutations("owner-sync", phone);
    expect(reconciledPhone).toBe(1);
    const push3 = await executePush("owner-sync", "device-phone", new OutboxRepository(phone), cloud, { batchSize: 100 });
    expect(push3.pushedCount).toBe(1);

    // 10. Laptop pulls from Cloud
    const pull3 = await executePull("owner-sync", laptop, new OutboxRepository(laptop), cloud, { limit: 100 });
    expect(pull3.pulledCount).toBe(1);

    // 11. Verify Laptop receives Phone's new session perfectly
    const laptopNewSession = await laptop.query<{ id: string }>("SELECT id FROM sessions WHERE id='session-phone-new'");
    expect(laptopNewSession).toHaveLength(1);
    const [laptopNewAnswer] = await laptop.query<{ selected_option_id: string }>(
      "SELECT selected_option_id FROM session_questions WHERE id='sq-phone-new'"
    );
    expect(laptopNewAnswer.selected_option_id).toBe("option-b");

    await laptop.close();
    await phone.close();
  });

  it("gracefully handles out-of-order pull items and missing foreign keys without throwing code 787", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const cloud = new MemoryCloudTransport();
    // Simulate remote server having a sessionBundle with a non-existent profile and review items with non-existent attempts
    cloud.changes.push({
      changeSeq: "1",
      entityType: "sessionBundle",
      entityId: "session-orphan",
      serverVersion: 1,
      isTombstone: false,
      payload: {
        session: {
          id: "session-orphan",
          profile_id: "profile-non-existent-yet",
          state: "FINISHED",
          selection_seed: "seed-123",
          created_at: Date.now(),
        },
        sessionQuestions: [
          {
            id: "sq-orphan-1",
            session_id: "session-orphan",
            question_id: "question-orphan-1",
            ordinal: 0,
            snapshot_json: JSON.stringify({ externalKey: "ext-q1", subject: "ریاضی" }),
            option_order_json: "[]",
          },
        ],
        attempts: [
          {
            id: "att-orphan-1",
            session_question_id: "sq-orphan-1",
            session_id: "session-orphan",
            question_id: "question-orphan-1",
            result: "correct",
            visited: 1,
          },
        ],
        reviews: [
          {
            question_id: "question-orphan-1",
            due_at: Date.now() + 86400000,
            priority: 1,
            stable_streak: 1,
            interval_days: 1,
            last_attempt_id: "att-orphan-1",
          },
        ],
      },
      createdAt: new Date().toISOString(),
    });

    // Also push a question referencing non-existent group_id and source_id
    cloud.changes.push({
      changeSeq: "2",
      entityType: "questionBundle",
      entityId: "q-with-missing-group",
      serverVersion: 1,
      isTombstone: false,
      payload: {
        question: {
          id: "q-with-missing-group",
          external_key: "ext-missing-group",
          subject: "اقتصاد",
          group_id: "non-existent-group-id",
          source_id: "non-existent-source-id",
          content_json: "[]",
          status: "published",
        },
        options: [],
        revisions: [],
        questionMedia: [
          {
            id: "qm-1",
            question_id: "q-with-missing-group",
            media_id: "non-existent-media-id",
            role: "content",
          },
        ],
      },
      createdAt: new Date().toISOString(),
    });

    const outboxRepo = new OutboxRepository(db);
    const pullResult = await executePull("owner-test", db, outboxRepo, cloud, { limit: 100 });

    expect(pullResult.errors).toHaveLength(0);
    expect(pullResult.pulledCount).toBe(2);

    // Verify session and question were persisted cleanly
    const sessions = await db.query<{ id: string }>("SELECT id FROM sessions WHERE id='session-orphan'");
    expect(sessions).toHaveLength(1);
    const questions = await db.query<{ id: string }>("SELECT id FROM questions WHERE id='q-with-missing-group'");
    expect(questions).toHaveLength(1);

    await db.close();
  });
});
