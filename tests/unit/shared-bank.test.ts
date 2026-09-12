import { describe, expect, it } from "vitest";
import { SharedBankService, type AttemptStats } from "@/features/banks/domain/shared-bank-service";

describe("Optional Shared Bank & Contributor Roles (TASK-034)", () => {
  const OWNER = "user-owner-1";
  const EDITOR = "user-editor-2";
  const READER = "user-reader-3";
  const STRANGER = "user-stranger-4";

  it("enforces role rights: reader can read but not write; editor can write; stranger cannot access", () => {
    const service = new SharedBankService();
    const bank = service.createBank("bank-101", OWNER, "بانک سوالات فیزیک دوازدهم");

    // Initially private
    expect(bank.visibility).toBe("private");
    expect(service.canRead("bank-101", OWNER)).toBe(true);
    expect(service.canWriteQuestions("bank-101", OWNER)).toBe(true);
    expect(service.canRead("bank-101", STRANGER)).toBe(false);
    expect(service.canWriteQuestions("bank-101", STRANGER)).toBe(false);

    // Invite editor and reader
    const inviteEd = service.inviteMember("bank-101", OWNER, EDITOR, "editor", "editor@example.com");
    expect(inviteEd.success).toBe(true);

    const inviteRd = service.inviteMember("bank-101", OWNER, READER, "reader", "reader@example.com");
    expect(inviteRd.success).toBe(true);

    // Bank visibility should now be shared
    expect(service.getBank("bank-101")?.visibility).toBe("shared");

    // Check Reader rights
    expect(service.canRead("bank-101", READER)).toBe(true);
    expect(service.canWriteQuestions("bank-101", READER)).toBe(false); // Reader CANNOT write
    expect(service.canManageMembers("bank-101", READER)).toBe(false);

    // Check Editor rights
    expect(service.canRead("bank-101", EDITOR)).toBe(true);
    expect(service.canWriteQuestions("bank-101", EDITOR)).toBe(true); // Editor CAN write
    expect(service.canManageMembers("bank-101", EDITOR)).toBe(false); // Editor CANNOT manage members

    // Stranger remains blocked
    expect(service.canRead("bank-101", STRANGER)).toBe(false);
    expect(service.canWriteQuestions("bank-101", STRANGER)).toBe(false);
  });

  it("non-owner cannot invite or remove bank members", () => {
    const service = new SharedBankService();
    service.createBank("bank-102", OWNER, "زیست‌شناسی جامع");
    service.inviteMember("bank-102", OWNER, EDITOR, "editor");

    // Editor attempts to invite another user
    const illegalInvite = service.inviteMember("bank-102", EDITOR, STRANGER, "reader");
    expect(illegalInvite.success).toBe(false);
    expect(illegalInvite.error).toContain("فقط مالک بانک");

    // Editor attempts to remove a member
    const illegalRemove = service.removeMember("bank-102", EDITOR, OWNER);
    expect(illegalRemove.success).toBe(false);
    expect(illegalRemove.error).toContain("فقط مالک بانک");
  });

  it("revoking membership immediately denies bank access", () => {
    const service = new SharedBankService();
    service.createBank("bank-103", OWNER, "شیمی پایه");
    service.inviteMember("bank-103", OWNER, READER, "reader");

    expect(service.canRead("bank-103", READER)).toBe(true);

    // Owner revokes membership
    const removeRes = service.removeMember("bank-103", OWNER, READER);
    expect(removeRes.success).toBe(true);

    // Revoked user immediately loses read & write rights
    expect(service.canRead("bank-103", READER)).toBe(false);
    expect(service.canWriteQuestions("bank-103", READER)).toBe(false);
  });

  it("strictly separates personal performance metrics and attempts from content sharing", () => {
    const service = new SharedBankService();
    service.createBank("bank-104", OWNER, "ریاضیات گسسته");
    service.inviteMember("bank-104", OWNER, EDITOR, "editor");

    // Shared attempts on questions in the bank
    const mixedAttempts: AttemptStats[] = [
      { id: "att-1", ownerId: OWNER, questionId: "q-1", result: "correct" },
      { id: "att-2", ownerId: OWNER, questionId: "q-2", result: "wrong" },
      { id: "att-3", ownerId: EDITOR, questionId: "q-1", result: "wrong" },
      { id: "att-4", ownerId: EDITOR, questionId: "q-2", result: "correct" },
    ];

    // Editor requests stats -> receives ONLY their own attempts, never Owner's attempts
    const editorStats = service.filterPersonalStats(mixedAttempts, EDITOR);
    expect(editorStats.length).toBe(2);
    expect(editorStats.every((a) => a.ownerId === EDITOR)).toBe(true);

    // Owner requests stats -> receives ONLY Owner's attempts
    const ownerStats = service.filterPersonalStats(mixedAttempts, OWNER);
    expect(ownerStats.length).toBe(2);
    expect(ownerStats.every((a) => a.ownerId === OWNER)).toBe(true);
  });
});
