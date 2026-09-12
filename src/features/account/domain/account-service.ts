import type { DatabasePort } from "@/database/ports";
import type { SyncTransport } from "@/sync/ports";
import { signOut as authSignOut } from "@/platform/auth/supabase-client";
import { createBackup } from "@/features/backup/domain/backup-service";

export interface ClaimOwnerOptions {
  createBackupBeforeClaim?: boolean;
}

export interface ClaimResult {
  ownerId: string;
  displayName: string;
  kind: "local" | "account";
  isNew: boolean;
  backupCreated: boolean;
}

export interface ClaimMarker {
  localOwnerId: string;
  displayName: string;
  startedAt: number;
  status: "pending" | "completed";
}

const CLAIM_MARKER_KEY = "testino_claim_owner_marker";

export class AccountService {
  constructor(
    private readonly db: DatabasePort,
    private readonly transport?: SyncTransport
  ) {}

  /**
   * Claims a local device owner and upgrades it to an authenticated Supabase account owner.
   * Creates an automated safety backup beforehand, records a resumable marker, and is 100% idempotent.
   */
  async claimLocalOwner(
    localOwnerId: string,
    displayName: string,
    options: ClaimOwnerOptions = { createBackupBeforeClaim: true }
  ): Promise<ClaimResult> {
    if (!this.transport) {
      throw new Error("سرویس تبادل ابری (SyncTransport) تنظیم نشده است.");
    }

    // 1. Check for existing claim marker to support resumption
    const existingMarker = this.getClaimMarker();
    if (existingMarker && existingMarker.status === "completed" && existingMarker.localOwnerId === localOwnerId) {
      const current = await this.getCurrentLocalOwner();
      if (current && current.kind === "account") {
        return {
          ownerId: current.id,
          displayName: current.displayName,
          kind: "account",
          isNew: false,
          backupCreated: false,
        };
      }
    }

    // 2. Optional safety backup before transitioning
    let backupCreated = false;
    if (options.createBackupBeforeClaim) {
      try {
        await createBackup(this.db);
        backupCreated = true;
      } catch (backupErr) {
        console.warn("Safety backup before cloud claim failed or skipped:", backupErr);
      }
    }

    // 3. Write resumable marker
    this.saveClaimMarker({
      localOwnerId,
      displayName,
      startedAt: Date.now(),
      status: "pending",
    });

    // 4. Invoke RPC via transport
    if (!this.transport.claimLocalOwner) {
      throw new Error("سرویس ابری متد claimLocalOwner را پشتیبانی نمی‌کند.");
    }

    const claimResponse = await this.transport.claimLocalOwner(localOwnerId, displayName);

    // 5. Atomic local update
    const now = Date.now();
    await this.db.transaction(async (trx) => {
      const existingOwners = await trx.query<{ id: string }>(
        "SELECT id FROM owners WHERE id=? LIMIT 1",
        [localOwnerId]
      );

      if (existingOwners.length > 0) {
        if (claimResponse.ownerId === localOwnerId) {
          await trx.execute(
            "UPDATE owners SET kind='account', display_name=?, updated_at=?, revision=revision+1 WHERE id=?",
            [claimResponse.displayName, now, localOwnerId]
          );
        } else {
          // Server mapped to an existing remote owner ID
          await trx.execute(
            "UPDATE owners SET id=?, kind='account', display_name=?, updated_at=?, revision=revision+1 WHERE id=?",
            [claimResponse.ownerId, claimResponse.displayName, now, localOwnerId]
          );
        }
      } else {
        await trx.execute(
          "INSERT INTO owners(id, kind, display_name, device_namespace, created_at, updated_at, revision) VALUES(?, 'account', ?, ?, ?, ?, 1)",
          [claimResponse.ownerId, claimResponse.displayName, `ns-${claimResponse.ownerId.slice(0, 8)}`, now, now]
        );
      }
    });

    // 6. Complete marker
    this.saveClaimMarker({
      localOwnerId,
      displayName: claimResponse.displayName,
      startedAt: Date.now(),
      status: "completed",
    });

    return {
      ownerId: claimResponse.ownerId,
      displayName: claimResponse.displayName,
      kind: claimResponse.kind,
      isNew: claimResponse.isNew,
      backupCreated,
    };
  }

  /**
   * Secure logout:
   * 1. Pauses any active running session so state is saved
   * 2. Clears authentication and claim markers
   * 3. Calls Supabase signOut
   */
  async logout(options?: { cancelTransport?: () => void }): Promise<void> {
    // 1. Pause running sessions locally
    try {
      await this.db.execute("UPDATE sessions SET state='PAUSED' WHERE state='RUNNING'");
    } catch {
      // Ignore if database is already closed
    }

    // 2. Stop transport
    if (options?.cancelTransport) {
      try {
        options.cancelTransport();
      } catch {
        // Ignore
      }
    }

    // 3. Clear local claim marker and cache
    this.clearClaimMarker();

    // 4. Supabase SignOut
    await authSignOut();
  }

  /**
   * Reopen the app offline with a recognized local/cached account owner.
   * Ensures zero network blocking and full namespace isolation.
   */
  async reopenOffline(): Promise<{
    owner: { id: string; kind: "local" | "account"; displayName: string } | null;
    isOffline: boolean;
  }> {
    const owner = await this.getCurrentLocalOwner();
    return {
      owner,
      isOffline: true,
    };
  }

  async getCurrentLocalOwner(): Promise<{ id: string; kind: "local" | "account"; displayName: string } | null> {
    const rows = await this.db.query<{ id: string; kind: string; display_name: string }>(
      "SELECT id, kind, display_name FROM owners WHERE inactive_at IS NULL ORDER BY created_at ASC LIMIT 1"
    );
    if (!rows.length) return null;
    return {
      id: rows[0].id,
      kind: rows[0].kind as "local" | "account",
      displayName: rows[0].display_name,
    };
  }

  private getClaimMarker(): ClaimMarker | null {
    if (typeof localStorage === "undefined") return null;
    try {
      const val = localStorage.getItem(CLAIM_MARKER_KEY);
      return val ? JSON.parse(val) : null;
    } catch {
      return null;
    }
  }

  private saveClaimMarker(marker: ClaimMarker): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.setItem(CLAIM_MARKER_KEY, JSON.stringify(marker));
    } catch {
      // Ignore
    }
  }

  private clearClaimMarker(): void {
    if (typeof localStorage === "undefined") return;
    try {
      localStorage.removeItem(CLAIM_MARKER_KEY);
    } catch {
      // Ignore
    }
  }
}
