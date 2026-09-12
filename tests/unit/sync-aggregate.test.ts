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
      const item: PullChangeItem = {
        changeSeq,
        entityType: mutation.entityType,
        entityId: mutation.entityId,
        serverVersion: (existing?.serverVersion ?? 0) + 1,
        isTombstone: false,
        payload: mutation.payload as Record<string, unknown>,
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
});
