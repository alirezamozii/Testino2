import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { AccountService } from "@/features/account/domain/account-service";
import type { SyncTransport, PushMutationItem, PushMutationResult, PullChangesResult } from "@/sync/ports";

class MockAccountTransport implements SyncTransport {
  configured = true;
  authenticated = true;
  claimedCalls = 0;

  isConfigured(): boolean {
    return this.configured;
  }

  async isAuthenticated(): Promise<boolean> {
    return this.authenticated;
  }

  async push(_deviceId: string, mutations: PushMutationItem[]): Promise<PushMutationResult[]> {
    return mutations.map((m) => ({ mutationId: m.mutationId, status: "accepted" }));
  }

  async pull(): Promise<PullChangesResult> {
    return { changes: [], nextCursor: "0", hasMore: false };
  }

  async claimLocalOwner(localOwnerId: string, displayName: string): Promise<{
    ownerId: string;
    displayName: string;
    kind: "local" | "account";
    isNew: boolean;
  }> {
    this.claimedCalls++;
    return {
      ownerId: localOwnerId,
      displayName: displayName || "کاربر تستیونو",
      kind: "account",
      isNew: false,
    };
  }
}

describe("AccountService & Owner Transition (TASK-032.2, 032.3, 032.4)", () => {
  it("claims local owner, sets kind to account, and creates safety backup", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const transport = new MockAccountTransport();
    const service = new AccountService(db, transport);

    // Seed local owner
    const localId = "local-owner-abc";
    await db.execute(
      "INSERT INTO owners(id, kind, display_name, device_namespace, created_at, updated_at) VALUES(?, 'local', ?, ?, ?, ?)",
      [localId, "کاربر محلی دستگاه", "ns-local", Date.now(), Date.now()]
    );

    // Execute claim
    const result = await service.claimLocalOwner(localId, "علی رضایی", { createBackupBeforeClaim: true });
    expect(result.ownerId).toBe(localId);
    expect(result.kind).toBe("account");
    expect(result.displayName).toBe("علی رضایی");
    expect(result.backupCreated).toBe(true);
    expect(transport.claimedCalls).toBe(1);

    // Verify DB state
    const currentOwner = await service.getCurrentLocalOwner();
    expect(currentOwner?.kind).toBe("account");
    expect(currentOwner?.displayName).toBe("علی رضایی");

    await db.close();
  });

  it("retrying claimLocalOwner is idempotent and does not produce duplicate owners", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const transport = new MockAccountTransport();
    const service = new AccountService(db, transport);

    const localId = "local-owner-retry";
    await db.execute(
      "INSERT INTO owners(id, kind, display_name, device_namespace, created_at, updated_at) VALUES(?, 'local', ?, ?, ?, ?)",
      [localId, "کاربر تستی", "ns-retry", Date.now(), Date.now()]
    );

    // Call 1
    const res1 = await service.claimLocalOwner(localId, "تست تکرار");
    expect(res1.ownerId).toBe(localId);

    // Call 2 (Retry)
    const res2 = await service.claimLocalOwner(localId, "تست تکرار");
    expect(res2.ownerId).toBe(localId);
    expect(res2.kind).toBe("account");

    // Ensure total owners count in DB is strictly 1
    const countRows = await db.query<{ count: number }>("SELECT COUNT(*) as count FROM owners");
    expect(Number(countRows[0].count)).toBe(1);

    await db.close();
  });

  it("logout pauses any running exam session so user progress is saved before sign out", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const service = new AccountService(db);

    // Insert active profile and a RUNNING session
    await db.execute(
      "INSERT INTO profiles(id, name, created_at) VALUES('prof-run', 'رشته تست', ?)",
      [Date.now()]
    );
    await db.execute(
      "INSERT INTO sessions(id, profile_id, state, selection_seed, created_at) VALUES('sess-active', 'prof-run', 'RUNNING', 'seed-1', ?)",
      [Date.now()]
    );

    let cancelled = false;
    await service.logout({
      cancelTransport: () => {
        cancelled = true;
      },
    });

    expect(cancelled).toBe(true);

    // Verify session state was paused
    const session = await db.query<{ state: string }>("SELECT state FROM sessions WHERE id='sess-active'");
    expect(session[0].state).toBe("PAUSED");

    await db.close();
  });

  it("offline reopening returns the known account owner without crashing or network requests", async () => {
    const db = await createTestDatabase();
    await new MigrationRunner().run(db);

    const service = new AccountService(db);

    await db.execute(
      "INSERT INTO owners(id, kind, display_name, device_namespace, created_at, updated_at) VALUES('acc-offline-1', 'account', 'دانش‌آموز آفلاین', 'ns-acc', ?, ?)",
      [Date.now(), Date.now()]
    );

    const status = await service.reopenOffline();
    expect(status.isOffline).toBe(true);
    expect(status.owner?.id).toBe("acc-offline-1");
    expect(status.owner?.kind).toBe("account");
    expect(status.owner?.displayName).toBe("دانش‌آموز آفلاین");

    await db.close();
  });
});
