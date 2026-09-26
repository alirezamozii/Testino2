import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { OutboxRepository } from "@/database/repositories/outbox-repository";
import { executePush } from "@/sync/push";
import { executePull } from "@/sync/pull";
import { SyncCoordinator } from "@/sync/coordinator";
import { ConflictPolicy } from "@/sync/conflict-policy";
import type { SyncTransport, PushMutationItem, PushMutationResult, PullChangesResult } from "@/sync/ports";
import {
  getSupabaseConfig,
  signInWithGoogle,
} from "@/platform/auth/supabase-client";

class MockTransport implements SyncTransport {
  configured = true;
  authenticated = true;
  pushedBatches: PushMutationItem[][] = [];
  remoteChanges: PullChangesResult = {
    changes: [],
    nextCursor: "100",
    hasMore: false,
  };

  isConfigured(): boolean {
    return this.configured;
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated;
  }

  async push(_deviceId: string, mutations: PushMutationItem[]): Promise<PushMutationResult[]> {
    this.pushedBatches.push(mutations);
    return mutations.map((m, idx) => ({
      mutationId: m.mutationId,
      status: "accepted",
      serverVersion: 1,
      changeSeq: String(10 + idx),
    }));
  }

  async pull(): Promise<PullChangesResult> {
    return this.remoteChanges;
  }
}

describe("Cloud Sync Engine & Outbox (TASK-031, TASK-032, TASK-033)", () => {
  it("pushes pending outbox mutations and marks them acked", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const outbox = new OutboxRepository(db);
    const ownerId = "owner-123";

    // Enqueue 2 sample mutations
    await outbox.enqueue(ownerId, {
      mutationId: "mut-1",
      entityType: "profile",
      entityId: "prof-1",
      payload: { name: "کنکور تجربی" },
    });

    await outbox.enqueue(ownerId, {
      mutationId: "mut-2",
      entityType: "subject",
      entityId: "subj-1",
      payload: { name: "زیست‌شناسی" },
    });

    const pendingBefore = await outbox.listPending(ownerId);
    expect(pendingBefore.length).toBe(2);

    const transport = new MockTransport();
    const result = await executePush(ownerId, "test-device", outbox, transport);

    expect(result.pushedCount).toBe(2);
    expect(result.errors.length).toBe(0);
    expect(transport.pushedBatches.length).toBe(1);
    expect(transport.pushedBatches[0].length).toBe(2);

    // Verify outbox rows are acked
    const pendingAfter = await outbox.listPending(ownerId);
    expect(pendingAfter.length).toBe(0);

    // Verify applied_mutations recorded receipts
    const applied1 = await outbox.isMutationApplied(ownerId, "mut-1");
    const applied2 = await outbox.isMutationApplied(ownerId, "mut-2");
    expect(applied1).toBe(true);
    expect(applied2).toBe(true);

    // Verify sync_state was updated
    const syncState = await outbox.getSyncState(ownerId);
    expect(syncState?.last_push_at).toBeTruthy();

    await db.close();
  });

  it("pulls remote changes and applies them atomically with cursor advancement", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const outbox = new OutboxRepository(db);
    const ownerId = "owner-123";

    const transport = new MockTransport();
    transport.remoteChanges = {
      changes: [
        {
          changeSeq: "42",
          entityType: "profile",
          entityId: "prof-remote-1",
          serverVersion: 1,
          isTombstone: false,
          payload: {
            name: "پروفایل ابری",
            targetTrack: "ریاضی فیزیک",
            penaltyNumerator: 1,
            penaltyDenominator: 3,
          },
          createdAt: new Date().toISOString(),
        },
        {
          changeSeq: "43",
          entityType: "subject",
          entityId: "subj-remote-1",
          serverVersion: 1,
          isTombstone: false,
          payload: {
            profileId: "prof-remote-1",
            name: "حسابان",
            coefficient: 4,
            targetPercentage: 80,
          },
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: "43",
      hasMore: false,
    };

    const pullResult = await executePull(ownerId, db, outbox, transport);
    expect(pullResult.pulledCount).toBe(2);
    expect(pullResult.errors.length).toBe(0);

    // Verify profile was inserted into SQLite
    const profiles = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM profiles WHERE id='prof-remote-1'"
    );
    expect(profiles.length).toBe(1);
    expect(profiles[0].name).toBe("پروفایل ابری");

    // Verify subject was inserted into SQLite
    const subjects = await db.query<{ id: string; name: string }>(
      "SELECT id, name FROM subjects WHERE id='subj-remote-1'"
    );
    expect(subjects.length).toBe(1);
    expect(subjects[0].name).toBe("حسابان");

    // Verify remote cursor was persisted in sync_state
    const syncState = await outbox.getSyncState(ownerId);
    expect(syncState?.remote_cursor).toBe("43");
    expect(syncState?.last_pull_at).toBeTruthy();

    await db.close();
  });

  it("enforces conflict policy: finished sessions are terminal and cannot be overridden by running drafts", () => {
    const policy = new ConflictPolicy();

    // 1. Local session is FINISHED, remote wants to set it to RUNNING -> keep_local
    const terminalDecision = policy.resolve({
      entityType: "session",
      localState: "FINISHED",
      remoteState: "RUNNING",
    });
    expect(terminalDecision).toBe("keep_local");

    // 2. Both sessions in progress, remote has higher server version -> apply_remote
    const progressDecision = policy.resolve({
      entityType: "session",
      localState: "RUNNING",
      remoteState: "RUNNING",
      localVersion: 1,
      remoteVersion: 2,
    });
    expect(progressDecision).toBe("apply_remote");

    // 3. Question revision snapshots are immutable -> apply_remote
    const revDecision = policy.resolve({
      entityType: "questionRevision",
      localVersion: 1,
      remoteVersion: 2,
    });
    expect(revDecision).toBe("apply_remote");
  });

  it("SyncCoordinator handles offline and unconfigured states gracefully without crashing", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const transport = new MockTransport();
    transport.configured = false; // Supabase not configured yet

    const coordinator = new SyncCoordinator(db, transport);
    expect(coordinator.getStatus()).toBe("idle");

    const report = await coordinator.syncNow("owner-123");
    expect(report.pushedCount).toBe(0);
    expect(report.pulledCount).toBe(0);
    expect(coordinator.getStatus()).toBe("unconfigured");

    await db.close();
  });

  it("Supabase Auth client config and Google OAuth validation", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const cfg1 = getSupabaseConfig();
    expect(cfg1.isConfigured).toBe(false);

    // With valid credentials in env
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sample-anon-key-12345";
    const cfg2 = getSupabaseConfig();
    expect(cfg2.isConfigured).toBe(true);
    expect(cfg2.url).toBe("https://example.supabase.co");
    expect(cfg2.anonKey).toBe("sample-anon-key-12345");

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const cfg3 = getSupabaseConfig();
    expect(cfg3.isConfigured).toBe(false);

    // Calling signInWithGoogle when unconfigured returns clear error without throwing unhandled rejection
    const res = await signInWithGoogle();
    expect(res.error).toBeTruthy();
    expect(res.error?.message).toContain("CONFIG_MISSING");
  });

  it("handles concurrent divergent session conflict by creating a recovery fork (TASK-033.4)", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const outbox = new OutboxRepository(db);
    const ownerId = "owner-fork-test";

    // Setup active profile and local running session
    await db.execute("INSERT INTO profiles(id, name, created_at) VALUES('prof-f1', 'پروفایل تست', ?)", [Date.now()]);
    await db.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at) VALUES('sess-concurrent', 'prof-f1', 'RUNNING', 'seed-local', ?)",
      [Date.now()]
    );
    await db.execute(
      "INSERT INTO questions(id, external_key, subject, content_json, explanation_json, status, shuffle_safe, created_at) VALUES('q-f1', 'ext-f1', 'ریاضی', '{\"text\":\"سؤال\"}', '{\"text\":\"توضیح\"}', 'published', 1, ?)",
      [Date.now()]
    );
    await db.execute(
      "INSERT INTO session_questions(id, session_id, ordinal, question_id, snapshot_json, option_order_json, visited) VALUES('sq-f1', 'sess-concurrent', 0, 'q-f1', '{}', '[]', 1)",
    );

    // Incoming remote session that is also RUNNING (concurrent edit from device 2)
    const transport = new MockTransport();
    transport.remoteChanges = {
      changes: [
        {
          changeSeq: "88",
          entityType: "session",
          entityId: "sess-concurrent",
          serverVersion: 3,
          isTombstone: false,
          payload: {
            profileId: "prof-f1",
            state: "RUNNING",
            selectionSeed: "seed-remote-divergent",
          },
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: "88",
      hasMore: false,
    };

    const pullResult = await executePull(ownerId, db, outbox, transport);
    expect(pullResult.pulledCount).toBe(1);

    // Verify recovery fork was created
    const allSessions = await db.query<{ id: string; state: string }>(
      "SELECT id, state FROM sessions WHERE id LIKE 'sess-concurrent%'"
    );
    // Should have main session + 1 recovery fork
    expect(allSessions.length).toBe(2);

    const forkSession = allSessions.find((s) => s.id.includes("recovery_fork"));
    expect(forkSession).toBeDefined();
    expect(forkSession?.state).toBe("PAUSED");

    // Verify fork preserved session questions
    const forkedQuestions = await db.query<{ id: string; visited: number }>(
      "SELECT id, visited FROM session_questions WHERE session_id=?",
      [forkSession!.id]
    );
    expect(forkedQuestions.length).toBe(1);
    expect(forkedQuestions[0].visited).toBe(1);

    await db.close();
  });

  it("handles tombstones and mediaManifest sync items cleanly (TASK-033.4)", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const outbox = new OutboxRepository(db);
    const ownerId = "owner-tombstone-test";

    // Insert a question to be tombstoned
    await db.execute(
      "INSERT INTO questions(id, external_key, subject, content_json, explanation_json, status, shuffle_safe, created_at) VALUES('q-tomb-1', 'ext-t1', 'زیست', '{\"text\":\"سؤال\"}', '{\"text\":\"توضیح\"}', 'published', 1, ?)",
      [Date.now()]
    );

    const transport = new MockTransport();
    transport.remoteChanges = {
      changes: [
        {
          changeSeq: "90",
          entityType: "question",
          entityId: "q-tomb-1",
          serverVersion: 2,
          isTombstone: true,
          payload: {},
          createdAt: new Date().toISOString(),
        },
        {
          changeSeq: "91",
          entityType: "mediaManifest",
          entityId: "media-synced-1",
          serverVersion: 1,
          isTombstone: false,
          payload: {
            sha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
            mime: "image/png",
            bytes: 2048,
            availability: "local",
          },
          createdAt: new Date().toISOString(),
        },
      ],
      nextCursor: "91",
      hasMore: false,
    };

    const pullResult = await executePull(ownerId, db, outbox, transport);
    expect(pullResult.pulledCount).toBe(2);

    // Verify question is soft-deleted (inactive_at is set)
    const qRows = await db.query<{ inactive_at: number | null }>(
      "SELECT inactive_at FROM questions WHERE id='q-tomb-1'"
    );
    expect(qRows[0].inactive_at).toBeTruthy();

    // Verify media_file record exists and is marked ready
    const mediaRows = await db.query<{ availability: string; bytes: number }>(
      "SELECT availability, bytes FROM media_files WHERE id='media-synced-1'"
    );
    expect(mediaRows.length).toBe(1);
    expect(mediaRows[0].availability).toBe("local");
    expect(Number(mediaRows[0].bytes)).toBe(2048);

    await db.close();
  });

  it("chunks push mutations when total payload approaches 700KB limit", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const outbox = new OutboxRepository(db);
    const ownerId = "owner-chunk-test";

    // Enqueue 3 large mutations of 300KB each (total 900KB)
    const largeStr = "X".repeat(300_000);
    await outbox.enqueue(ownerId, {
      mutationId: "large-1",
      entityType: "question",
      entityId: "q-1",
      payload: { data: largeStr },
    });
    await outbox.enqueue(ownerId, {
      mutationId: "large-2",
      entityType: "question",
      entityId: "q-2",
      payload: { data: largeStr },
    });
    await outbox.enqueue(ownerId, {
      mutationId: "large-3",
      entityType: "question",
      entityId: "q-3",
      payload: { data: largeStr },
    });

    const transport = new MockTransport();
    // First push cycle: 300KB + 300KB = 600KB <= 700KB. Adding third (900KB) exceeds 700KB, so it must slice to 2 items!
    const result1 = await executePush(ownerId, "test-device", outbox, transport);
    expect(result1.pushedCount).toBe(2);
    expect(transport.pushedBatches[0].length).toBe(2);

    // Remaining 1 item in outbox
    const pending = await outbox.listPending(ownerId);
    expect(pending.length).toBe(1);
    expect(pending[0].mutation_id).toBe("large-3");

    // Second push cycle pushes the remaining item
    const result2 = await executePush(ownerId, "test-device", outbox, transport);
    expect(result2.pushedCount).toBe(1);
    expect(transport.pushedBatches[1].length).toBe(1);

    await db.close();
  });
});
