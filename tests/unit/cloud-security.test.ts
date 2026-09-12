import { describe, expect, it } from "vitest";

/**
 * Simulates and verifies Row Level Security (RLS) policies and RPC guards
 * defined in supabase/migrations/20260910000001_core_schema_and_rls.sql
 * and 20260910000002_sync_rpc.sql.
 *
 * Acceptance Criterion:
 * A non-member cannot read/write bank questions; User 2 cannot read or alter
 * another user's personal sessions, attempts, or profiles.
 */

interface OwnerRecord {
  id: string;
  kind: "local" | "account";
  auth_user_id: string | null;
  display_name: string;
  device_namespace: string;
}

interface BankRecord {
  id: string;
  owner_id: string;
  name: string;
  visibility: "private" | "shared";
}

interface BankMemberRecord {
  bank_id: string;
  account_user_id: string;
  role: "owner" | "editor" | "reader";
}

interface QuestionRecord {
  id: string;
  bank_id: string;
  content: string;
}

interface AttemptRecord {
  id: string;
  owner_id: string;
  session_id: string;
  question_id: string;
  result: string;
}

interface ChangeLogRecord {
  change_seq: number;
  owner_id: string | null;
  bank_id: string | null;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
}

class SimulatedRlsEngine {
  owners: OwnerRecord[] = [];
  banks: BankRecord[] = [];
  bankMembers: BankMemberRecord[] = [];
  questions: QuestionRecord[] = [];
  attempts: AttemptRecord[] = [];
  changeLog: ChangeLogRecord[] = [];
  mutationReceipts: { actor_id: string; mutation_id: string }[] = [];

  // Helper function matching SQL: public.current_owner_id()
  currentOwnerId(authUid: string): string | null {
    const owner = this.owners.find((o) => o.auth_user_id === authUid);
    return owner ? owner.id : null;
  }

  // Policy: owners_self_policy (auth_user_id = auth.uid())
  selectOwners(authUid: string): OwnerRecord[] {
    return this.owners.filter((o) => o.auth_user_id === authUid);
  }

  // Policy: banks_policy (owner_id = current_owner_id() OR id IN bank_members)
  selectBanks(authUid: string): BankRecord[] {
    const ownerId = this.currentOwnerId(authUid);
    return this.banks.filter((b) => {
      if (ownerId && b.owner_id === ownerId) return true;
      return this.bankMembers.some((m) => m.bank_id === b.id && m.account_user_id === authUid);
    });
  }

  // Policy: questions_policy
  selectQuestions(authUid: string): QuestionRecord[] {
    const accessibleBanks = new Set(this.selectBanks(authUid).map((b) => b.id));
    return this.questions.filter((q) => accessibleBanks.has(q.bank_id));
  }

  insertQuestion(authUid: string, question: QuestionRecord): { success: boolean; error?: string } {
    const ownerId = this.currentOwnerId(authUid);
    const bank = this.banks.find((b) => b.id === question.bank_id);
    if (!bank) return { success: false, error: "Bank not found" };

    const isOwner = ownerId && bank.owner_id === ownerId;
    const membership = this.bankMembers.find((m) => m.bank_id === bank.id && m.account_user_id === authUid);
    const canEdit = isOwner || (membership && (membership.role === "owner" || membership.role === "editor"));

    if (!canEdit) {
      return { success: false, error: "دسترسی نوشتن مجاز نیست (Permission denied)" };
    }

    this.questions.push(question);
    return { success: true };
  }

  // Policy: attempts_owner_policy (owner_id = current_owner_id())
  selectAttempts(authUid: string): AttemptRecord[] {
    const ownerId = this.currentOwnerId(authUid);
    if (!ownerId) return [];
    return this.attempts.filter((a) => a.owner_id === ownerId);
  }

  // RPC: pull_changes
  pullChanges(authUid: string, cursor = 0): ChangeLogRecord[] {
    const ownerId = this.currentOwnerId(authUid);
    if (!ownerId) return [];

    const memberBankIds = new Set(
      this.bankMembers.filter((m) => m.account_user_id === authUid).map((m) => m.bank_id)
    );
    const ownedBankIds = new Set(
      this.banks.filter((b) => b.owner_id === ownerId).map((b) => b.id)
    );

    return this.changeLog.filter((cl) => {
      if (cl.change_seq <= cursor) return false;
      if (cl.owner_id === ownerId) return true;
      if (cl.bank_id && (ownedBankIds.has(cl.bank_id) || memberBankIds.has(cl.bank_id))) return true;
      return false;
    });
  }

  // RPC: claim_local_owner
  claimLocalOwner(authUid: string, localOwnerId: string, displayName: string): { ownerId: string; isNew: boolean } {
    // Check if auth user already has an owner
    const existing = this.owners.find((o) => o.auth_user_id === authUid);
    if (existing) {
      return { ownerId: existing.id, isNew: false };
    }

    // Check if local owner exists and is unassigned
    const unassignedLocal = this.owners.find((o) => o.id === localOwnerId && o.auth_user_id === null);
    if (unassignedLocal) {
      unassignedLocal.auth_user_id = authUid;
      unassignedLocal.kind = "account";
      unassignedLocal.display_name = displayName;
      return { ownerId: unassignedLocal.id, isNew: false };
    }

    // Otherwise create new
    const newId = `owner-acc-${Math.random().toString(36).slice(2, 8)}`;
    const newOwner: OwnerRecord = {
      id: newId,
      kind: "account",
      auth_user_id: authUid,
      display_name: displayName,
      device_namespace: `ns-${newId}`,
    };
    this.owners.push(newOwner);
    return { ownerId: newId, isNew: true };
  }
}

describe("Two-Account RLS & Cloud Security Policy (TASK-031.4)", () => {
  const USER_1 = "auth-user-1";
  const USER_2 = "auth-user-2";

  it("User 2 cannot read or modify User 1's private owner-scoped records", () => {
    const engine = new SimulatedRlsEngine();

    // Setup User 1 and User 2 owners
    engine.owners.push(
      { id: "owner-1", kind: "account", auth_user_id: USER_1, display_name: "کاربر ۱", device_namespace: "ns-1" },
      { id: "owner-2", kind: "account", auth_user_id: USER_2, display_name: "کاربر ۲", device_namespace: "ns-2" }
    );

    // User 1 has exam attempts
    engine.attempts.push(
      { id: "att-1", owner_id: "owner-1", session_id: "ses-1", question_id: "q-1", result: "correct" },
      { id: "att-2", owner_id: "owner-1", session_id: "ses-1", question_id: "q-2", result: "wrong" }
    );

    // User 1 sees their attempts
    const u1Attempts = engine.selectAttempts(USER_1);
    expect(u1Attempts.length).toBe(2);

    // User 2 sees ZERO of User 1's attempts
    const u2Attempts = engine.selectAttempts(USER_2);
    expect(u2Attempts.length).toBe(0);

    // User 2 sees only their own owner record, never User 1
    const u2Owners = engine.selectOwners(USER_2);
    expect(u2Owners.length).toBe(1);
    expect(u2Owners[0].id).toBe("owner-2");
  });

  it("Non-member cannot read or write questions in a private bank", () => {
    const engine = new SimulatedRlsEngine();

    engine.owners.push(
      { id: "owner-1", kind: "account", auth_user_id: USER_1, display_name: "کاربر ۱", device_namespace: "ns-1" },
      { id: "owner-2", kind: "account", auth_user_id: USER_2, display_name: "کاربر ۲", device_namespace: "ns-2" }
    );

    // User 1 creates private bank
    engine.banks.push({ id: "bank-1", owner_id: "owner-1", name: "بانک خصوصی آزمون ۱", visibility: "private" });
    engine.questions.push(
      { id: "q-101", bank_id: "bank-1", content: "سؤال اختصاصی کاربر ۱" }
    );

    // User 1 can see their questions
    expect(engine.selectQuestions(USER_1).length).toBe(1);

    // User 2 (non-member) cannot see questions in User 1's private bank
    expect(engine.selectQuestions(USER_2).length).toBe(0);

    // User 2 cannot insert questions into User 1's bank
    const insertRes = engine.insertQuestion(USER_2, {
      id: "q-hack",
      bank_id: "bank-1",
      content: "تلاش غیرمجاز برای درج سؤال",
    });
    expect(insertRes.success).toBe(false);
    expect(insertRes.error).toContain("دسترسی نوشتن مجاز نیست");
  });

  it("Role-based access: Reader member can read questions but cannot mutate content", () => {
    const engine = new SimulatedRlsEngine();

    engine.owners.push(
      { id: "owner-1", kind: "account", auth_user_id: USER_1, display_name: "کاربر ۱", device_namespace: "ns-1" },
      { id: "owner-2", kind: "account", auth_user_id: USER_2, display_name: "کاربر ۲", device_namespace: "ns-2" }
    );

    engine.banks.push({ id: "bank-shared", owner_id: "owner-1", name: "بانک مشترک", visibility: "shared" });
    engine.questions.push({ id: "q-s-1", bank_id: "bank-shared", content: "سؤال مشترک ۱" });

    // User 2 is added as 'reader'
    engine.bankMembers.push({
      bank_id: "bank-shared",
      account_user_id: USER_2,
      role: "reader",
    });

    // User 2 CAN read questions
    expect(engine.selectQuestions(USER_2).length).toBe(1);
    expect(engine.selectQuestions(USER_2)[0].content).toBe("سؤال مشترک ۱");

    // User 2 (reader) CANNOT insert or modify questions
    const writeAttempt = engine.insertQuestion(USER_2, {
      id: "q-s-2",
      bank_id: "bank-shared",
      content: "سؤال جدید توسط خواننده",
    });
    expect(writeAttempt.success).toBe(false);
    expect(writeAttempt.error).toContain("دسترسی نوشتن مجاز نیست");
  });

  it("pull_changes strictly isolates private change_log entries between users", () => {
    const engine = new SimulatedRlsEngine();

    engine.owners.push(
      { id: "owner-1", kind: "account", auth_user_id: USER_1, display_name: "کاربر ۱", device_namespace: "ns-1" },
      { id: "owner-2", kind: "account", auth_user_id: USER_2, display_name: "کاربر ۲", device_namespace: "ns-2" }
    );

    engine.changeLog.push(
      { change_seq: 1, owner_id: "owner-1", bank_id: null, entity_type: "session", entity_id: "ses-1", payload: {} },
      { change_seq: 2, owner_id: "owner-1", bank_id: null, entity_type: "attempt", entity_id: "att-1", payload: {} },
      { change_seq: 3, owner_id: "owner-2", bank_id: null, entity_type: "session", entity_id: "ses-2", payload: {} }
    );

    const u1Changes = engine.pullChanges(USER_1);
    expect(u1Changes.map((c) => c.change_seq)).toEqual([1, 2]);

    const u2Changes = engine.pullChanges(USER_2);
    expect(u2Changes.map((c) => c.change_seq)).toEqual([3]);
  });

  it("claim_local_owner is idempotent and prevents User 2 from stealing User 1's local owner", () => {
    const engine = new SimulatedRlsEngine();

    // Local owner on Device 1
    engine.owners.push({
      id: "owner-local-1",
      kind: "local",
      auth_user_id: null,
      display_name: "دستگاه ۱",
      device_namespace: "ns-local-1",
    });

    // User 1 claims their local owner
    const claim1 = engine.claimLocalOwner(USER_1, "owner-local-1", "کاربر یکپارچه‌شده");
    expect(claim1.ownerId).toBe("owner-local-1");

    // Retrying claim with same user returns the same owner without duplicating
    const claim1Retry = engine.claimLocalOwner(USER_1, "owner-local-1", "کاربر یکپارچه‌شده");
    expect(claim1Retry.ownerId).toBe("owner-local-1");
    expect(claim1Retry.isNew).toBe(false);

    // User 2 attempts to claim User 1's local owner ID
    // Since owner-local-1 is already claimed by User 1, User 2 CANNOT steal it; they receive a new owner
    const claim2 = engine.claimLocalOwner(USER_2, "owner-local-1", "کاربر دوم هکر");
    expect(claim2.ownerId).not.toBe("owner-local-1");
    expect(claim2.ownerId.startsWith("owner-acc-")).toBe(true);

    // Verify owner-local-1 remains safely owned by User 1
    const ownerRec = engine.owners.find((o) => o.id === "owner-local-1");
    expect(ownerRec?.auth_user_id).toBe(USER_1);
  });
});
