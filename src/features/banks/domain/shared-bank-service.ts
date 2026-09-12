export type BankRole = "owner" | "editor" | "reader";

export interface BankEntity {
  id: string;
  ownerId: string;
  name: string;
  visibility: "private" | "shared";
  createdAt: number;
}

export interface BankMemberEntity {
  id: string;
  bankId: string;
  userId: string;
  userEmail?: string;
  role: BankRole;
  createdAt: number;
}

export interface AttemptStats {
  id: string;
  ownerId: string;
  questionId: string;
  result: "correct" | "wrong" | "unanswered";
}

export class SharedBankService {
  private banks = new Map<string, BankEntity>();
  private memberships: BankMemberEntity[] = [];

  createBank(id: string, ownerId: string, name: string, visibility: "private" | "shared" = "private"): BankEntity {
    const bank: BankEntity = {
      id,
      ownerId,
      name,
      visibility,
      createdAt: Date.now(),
    };
    this.banks.set(id, bank);
    // Automatically add owner as owner member
    this.memberships.push({
      id: `mem-${id}-${ownerId}`,
      bankId: id,
      userId: ownerId,
      role: "owner",
      createdAt: Date.now(),
    });
    return bank;
  }

  getBank(bankId: string): BankEntity | null {
    return this.banks.get(bankId) || null;
  }

  inviteMember(
    bankId: string,
    requestingUserId: string,
    targetUserId: string,
    role: BankRole,
    targetEmail?: string
  ): { success: boolean; error?: string } {
    const bank = this.banks.get(bankId);
    if (!bank) return { success: false, error: "بانک یافت نشد." };

    if (!this.canManageMembers(bankId, requestingUserId)) {
      return { success: false, error: "فقط مالک بانک می‌تواند اعضا را مدیریت کند." };
    }

    // Set bank visibility to shared if not already
    bank.visibility = "shared";

    const existingIndex = this.memberships.findIndex(
      (m) => m.bankId === bankId && m.userId === targetUserId
    );
    if (existingIndex >= 0) {
      this.memberships[existingIndex].role = role;
    } else {
      this.memberships.push({
        id: `mem-${bankId}-${targetUserId}`,
        bankId,
        userId: targetUserId,
        userEmail: targetEmail,
        role,
        createdAt: Date.now(),
      });
    }

    return { success: true };
  }

  removeMember(
    bankId: string,
    requestingUserId: string,
    targetUserId: string
  ): { success: boolean; error?: string } {
    const bank = this.banks.get(bankId);
    if (!bank) return { success: false, error: "بانک یافت نشد." };

    if (!this.canManageMembers(bankId, requestingUserId)) {
      return { success: false, error: "فقط مالک بانک می‌تواند اعضا را حذف کند." };
    }

    if (bank.ownerId === targetUserId) {
      return { success: false, error: "مالک اصلی بانک قابل حذف نیست." };
    }

    this.memberships = this.memberships.filter(
      (m) => !(m.bankId === bankId && m.userId === targetUserId)
    );

    return { success: true };
  }

  getMembership(bankId: string, userId: string): BankMemberEntity | null {
    return this.memberships.find((m) => m.bankId === bankId && m.userId === userId) || null;
  }

  canRead(bankId: string, userId: string): boolean {
    const bank = this.banks.get(bankId);
    if (!bank) return false;
    if (bank.ownerId === userId) return true;
    return this.memberships.some((m) => m.bankId === bankId && m.userId === userId);
  }

  canWriteQuestions(bankId: string, userId: string): boolean {
    const bank = this.banks.get(bankId);
    if (!bank) return false;
    if (bank.ownerId === userId) return true;
    const membership = this.getMembership(bankId, userId);
    return membership !== null && (membership.role === "owner" || membership.role === "editor");
  }

  canManageMembers(bankId: string, userId: string): boolean {
    const bank = this.banks.get(bankId);
    if (!bank) return false;
    return bank.ownerId === userId;
  }

  /**
   * Strictly isolates personal attempt stats:
   * Contributor/editor/reader never sees any other member's personal attempts or accuracy.
   */
  filterPersonalStats(attempts: AttemptStats[], requestingUserId: string): AttemptStats[] {
    return attempts.filter((a) => a.ownerId === requestingUserId);
  }
}
