import type { DatabasePort } from "@/database/ports";
import { OutboxRepository } from "@/database/repositories/outbox-repository";
import type { SyncConfig, SyncReport, SyncStatus, SyncTransport } from "./ports";
import { SupabaseTransport } from "./supabase-transport";
import { executePush } from "./push";
import { executePull } from "./pull";
import { syncPendingOfflineAuth } from "@/platform/auth/supabase-client";
import { reconcileLocalMutations } from "./aggregate-snapshots";
import { downloadRemoteMedia, uploadLocalMedia } from "./media-sync";
import { withTimeout } from "@/lib/with-timeout";

/** Hard cap on 250ms→8s backoff continuation cycles per dirty queue. */
const MAX_CONTINUATION_CYCLES = 20;
/** Network calls must never wedge syncNow forever (dead socket / captive portal). */
const AUTH_TIMEOUT_MS = 15_000;

export class SyncCoordinator {
  private db: DatabasePort;
  private outboxRepo: OutboxRepository;
  private transport: SyncTransport;
  private config: SyncConfig;
  private deviceId: string;

  private status: SyncStatus = "idle";
  private lastReport: SyncReport | null = null;
  private isSyncing = false;
  private listeners = new Set<(status: SyncStatus, report: SyncReport | null) => void>();
  private intervalTimer: ReturnType<typeof setInterval> | null = null;
  private continuationTimer: ReturnType<typeof setTimeout> | null = null;
  private continuationCycles = 0;
  private activeOwnerId: string | undefined;
  private readonly handleOnline = () => {
    this.setStatus("idle");
    withTimeout(syncPendingOfflineAuth(), AUTH_TIMEOUT_MS, "بازگردانی ورود آفلاین")
      .catch(() => {})
      .finally(() => this.syncNow(this.activeOwnerId).catch(() => {}));
  };
  private readonly handleOffline = () => this.setStatus("offline");
  private readonly handleVisibility = () => {
    if (document.visibilityState === "visible" && this.isOnline()) {
      this.syncNow(this.activeOwnerId).catch(() => {});
    }
  };

  constructor(
    db: DatabasePort,
    transport?: SyncTransport,
    config?: SyncConfig
  ) {
    this.db = db;
    this.outboxRepo = new OutboxRepository(db);
    this.transport = transport || new SupabaseTransport();
    this.config = {
      autoSyncIntervalMs: 30000,
      batchSize: 50,
      ...config,
    };
    this.deviceId = this.getOrCreateDeviceId();

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.status = "offline";
    }

    this.initEventListeners();
  }

  private getOrCreateDeviceId(): string {
    if (typeof window !== "undefined") {
      const stored = window.localStorage.getItem("testino_device_id");
      if (stored) return stored;
      const created = `web-${crypto.randomUUID().slice(0, 12)}`;
      window.localStorage.setItem("testino_device_id", created);
      return created;
    }
    return `device-${crypto.randomUUID().slice(0, 8)}`;
  }

  private setStatus(status: SyncStatus) {
    this.status = status;
    this.notifyListeners();
  }

  private notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.status, this.lastReport);
      } catch {
        // ignore listener errors
      }
    }
  }

  subscribe(listener: (status: SyncStatus, report: SyncReport | null) => void): () => void {
    this.listeners.add(listener);
    listener(this.status, this.lastReport);
    return () => this.listeners.delete(listener);
  }

  getStatus(): SyncStatus {
    return this.status;
  }

  isOnline(): boolean {
    if (typeof navigator !== "undefined") {
      return navigator.onLine;
    }
    return true;
  }

  getLastReport(): SyncReport | null {
    return this.lastReport;
  }

  private initEventListeners() {
    if (typeof window === "undefined") return;

    window.addEventListener("online", this.handleOnline);
    window.addEventListener("offline", this.handleOffline);
    document.addEventListener("visibilitychange", this.handleVisibility);
  }

  startAutoSync(ownerId?: string) {
    this.stopAutoSync();
    this.activeOwnerId = ownerId;
    if (this.isOnline()) this.syncNow(ownerId).catch(() => {});
    if (!this.config.autoSyncIntervalMs) return;

    this.intervalTimer = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this.setStatus("offline");
        return;
      }
      // Battery/CPU: don't churn the network while the tab is hidden —
      // visibilitychange triggers a sync the moment it becomes visible again.
      if (typeof document !== "undefined" && document.hidden) return;
      this.syncNow(ownerId).catch(() => {});
    }, this.config.autoSyncIntervalMs);
  }

  stopAutoSync() {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    if (this.continuationTimer) {
      clearTimeout(this.continuationTimer);
      this.continuationTimer = null;
    }
  }

  destroy() {
    this.stopAutoSync();
    if (typeof window !== "undefined") {
      window.removeEventListener("online", this.handleOnline);
      window.removeEventListener("offline", this.handleOffline);
      document.removeEventListener("visibilitychange", this.handleVisibility);
    }
    this.listeners.clear();
  }

  /**
   * Executes a single push-then-pull synchronization cycle with phase updates.
   *
   * The in-flight guard is set SYNCHRONOUSLY before any await — three triggers
   * (online event, visibilitychange, 30s interval) can fire in the same tick,
   * and a guard set after a network await let two syncs interleave on the same
   * outbox/pull cursors (duplicate forks/conflict rows).
   */
  async syncNow(ownerId?: string): Promise<SyncReport> {
    if (this.isSyncing) {
      return this.lastReport || {
        pushedCount: 0,
        pulledCount: 0,
        errors: ["همگام‌سازی دیگری در حال اجراست."],
        hasConflicts: false,
        reconciledCount: 0,
        completedAt: Date.now(),
      };
    }

    this.isSyncing = true;
    try {
      return await this.runSync(ownerId);
    } finally {
      this.isSyncing = false;
    }
  }

  private async runSync(ownerId?: string): Promise<SyncReport> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.setStatus("offline");
      return {
        pushedCount: 0,
        pulledCount: 0,
        errors: ["اتصال اینترنت برقرار نیست (حالت کاملاً آفلاین)."],
        hasConflicts: false,
        reconciledCount: 0,
        completedAt: Date.now(),
      };
    }

    // Try linking pending offline authentication before checking transport
    try {
      await withTimeout(syncPendingOfflineAuth(), AUTH_TIMEOUT_MS, "بازگردانی ورود آفلاین");
    } catch {
      // ignore
    }

    if (!this.transport.isConfigured()) {
      this.setStatus("unconfigured");
      return {
        pushedCount: 0,
        pulledCount: 0,
        errors: ["سرویس ابری تنظیم نشده است (حالت محلی فعال)."],
        hasConflicts: false,
        reconciledCount: 0,
        completedAt: Date.now(),
      };
    }

    let targetOwnerId = ownerId;
    if (!targetOwnerId) {
      const rows = await this.db.query<{ id: string }>(
        "SELECT id FROM owners WHERE inactive_at IS NULL ORDER BY created_at ASC LIMIT 1"
      );
      targetOwnerId = rows[0]?.id;
    }

    if (!targetOwnerId) {
      this.setStatus("idle");
      return {
        pushedCount: 0,
        pulledCount: 0,
        errors: ["مالک محلی برای همگام‌سازی یافت نشد."],
        hasConflicts: false,
        reconciledCount: 0,
        completedAt: Date.now(),
      };
    }

    let isAuthed = false;
    try {
      isAuthed = await withTimeout(
        this.transport.isAuthenticated(),
        AUTH_TIMEOUT_MS,
        "بررسی وضعیت ورود"
      );
    } catch {
      isAuthed = false;
    }

    if (!isAuthed) {
      this.setStatus("unconfigured");
      const unauthReport: SyncReport = {
        pushedCount: 0,
        pulledCount: 0,
        errors: ["کاربر وارد حساب ابری نشده است (ذخیره‌سازی به صورت محلی)."],
        hasConflicts: false,
        reconciledCount: 0,
        completedAt: Date.now(),
      };
      this.lastReport = unauthReport;
      this.notifyListeners();
      return unauthReport;
    }

    // Auto-ensure cloud owner exists on Supabase before push/pull
    await this.ensureCloudOwner(targetOwnerId);

    this.isSyncing = true;
    this.setStatus("pushing");

    const allErrors: string[] = [];
    const pushErrors: string[] = [];
    const pullErrors: string[] = [];
    let pushedCount = 0;
    let pulledCount = 0;
    let reconciledCount = 0;
    let conflictCount = 0;
    let uploadedMediaCount = 0;
    let downloadedMediaCount = 0;

    try {
      // Crash recovery: mutations left in 'sending' state by a crashed/closed
      // tab would otherwise be stranded forever (listPending only reads 'pending')
      // → silent permanent sync loss of user answers.
      try {
        await this.db.execute(
          "UPDATE outbox SET state='pending' WHERE state='sending' AND (owner_id IS NULL OR owner_id=?)",
          [targetOwnerId]
        );
      } catch {
        // table may not exist on very old schemas — not fatal
      }

      const mediaUpload = await uploadLocalMedia(this.db, this.transport);
      uploadedMediaCount += mediaUpload.uploaded;
      allErrors.push(...mediaUpload.errors);

      // Capture writes from both modern repositories and older application paths.
      // The durable outbox is still the only network retry source of truth.
      reconciledCount = await reconcileLocalMutations(targetOwnerId, this.db);

      // Drain all currently eligible outbox pages. A hard cap prevents a broken
      // transport from keeping the foreground task alive forever.
      for (let page = 0; page < 100; page += 1) {
        let pushRes = await executePush(
          targetOwnerId,
          this.deviceId,
          this.outboxRepo,
          this.transport,
          { batchSize: this.config.batchSize }
        );

        // Auto-heal if server rejected due to OwnerNotFound
        if (
          pushRes.errors.some(
            (e) => e.includes("OwnerNotFound") || e.includes("پروفایل مالک برای کاربر یافت نشد")
          )
        ) {
          await this.ensureCloudOwner(targetOwnerId);
          pushRes = await executePush(
            targetOwnerId,
            this.deviceId,
            this.outboxRepo,
            this.transport,
            { batchSize: this.config.batchSize }
          );
        }

        pushedCount += pushRes.pushedCount;
        conflictCount += pushRes.conflictCount;
        pushErrors.push(...pushRes.errors);
        allErrors.push(...pushRes.errors);
        if (pushRes.pushedCount === 0 || pushRes.errors.length > 0) break;
      }

      // 2. Pull Phase: downloads remote mutations
      this.setStatus("pulling");
      for (let page = 0; page < 100; page += 1) {
        let pullRes = await executePull(
          targetOwnerId,
          this.db,
          this.outboxRepo,
          this.transport,
          { limit: this.config.batchSize }
        );

        // Auto-heal if server rejected due to OwnerNotFound
        if (
          pullRes.errors.some(
            (e) => e.includes("OwnerNotFound") || e.includes("پروفایل مالک برای کاربر یافت نشد")
          )
        ) {
          await this.ensureCloudOwner(targetOwnerId);
          pullRes = await executePull(
            targetOwnerId,
            this.db,
            this.outboxRepo,
            this.transport,
            { limit: this.config.batchSize }
          );
        }

        pulledCount += pullRes.pulledCount;
        pullErrors.push(...pullRes.errors);
        allErrors.push(...pullRes.errors);
        if (!pullRes.hasMore || pullRes.errors.length > 0) break;
        // Cursor must advance: a server that keeps returning hasMore=true with
        // an unchanged cursor would otherwise re-apply the same page up to 100×
        // (creating a junk fork per page on divergent RUNNING sessions).
        if (pullRes.pulledCount === 0) break;
      }

      if (pulledCount > 0) {
        this.setStatus("merging");
      }

      const mediaDownload = await downloadRemoteMedia(this.db, this.transport);
      downloadedMediaCount += mediaDownload.downloaded;
      allErrors.push(...mediaDownload.errors);

      // Determine final sync status:
      // - If critical mutations (push/pull) had errors, mark "error" for retry.
      // - If push and pull succeeded cleanly, mark "idle" even if a non-critical
      //   media asset failed or is missing (media retries are backed off independently).
      const hasCriticalError = pushErrors.length > 0 || pullErrors.length > 0;
      this.setStatus(hasCriticalError ? "error" : "idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      allErrors.push(message);
      this.setStatus("error");
    } finally {
      this.isSyncing = false;
    }

    const report: SyncReport = {
      pushedCount,
      pulledCount,
      errors: allErrors,
      hasConflicts: conflictCount > 0,
      reconciledCount,
      uploadedMediaCount,
      downloadedMediaCount,
      completedAt: Date.now(),
    };

    this.lastReport = report;
    this.notifyListeners();

    // Large first-time libraries are reconciled in bounded chunks so one sync
    // cannot freeze the UI. Continue in the background until the durable dirty
    // queue is empty — with a cycle cap + exponential backoff so an unstable
    // payload field (triggers re-dirtying every write) can NEVER loop at 4 Hz
    // forever. Skip while hidden; the visibility handler catches up.
    if (allErrors.length === 0 && this.isOnline() && !(typeof document !== "undefined" && document.hidden)) {
      const pending = await this.db.query<{ pending: number }>(
        "SELECT COUNT(*) AS pending FROM sync_dirty_entities"
      );
      const pendingCount = Number(pending[0]?.pending ?? 0);
      if (pendingCount === 0) {
        this.continuationCycles = 0;
      } else if (!this.continuationTimer && this.continuationCycles < MAX_CONTINUATION_CYCLES) {
        this.continuationCycles += 1;
        const delay = Math.min(250 * 2 ** (this.continuationCycles - 1), 8_000);
        this.continuationTimer = setTimeout(() => {
          this.continuationTimer = null;
          this.syncNow(targetOwnerId).catch(() => {});
        }, delay);
      }
    }
    return report;
  }

  private async ensureCloudOwner(targetOwnerId: string): Promise<void> {
    if (!this.transport.claimLocalOwner) return;
    try {
      const rows = await this.db.query<{ id: string; display_name: string }>(
        "SELECT id, display_name FROM owners WHERE id=? LIMIT 1",
        [targetOwnerId]
      );
      const displayName = rows[0]?.display_name || "دانش‌آموز";
      const res = await this.transport.claimLocalOwner(targetOwnerId, displayName);
      if (res?.ownerId) {
        await this.db.execute(
          "UPDATE owners SET kind='account', updated_at=? WHERE id=?",
          [Date.now(), targetOwnerId]
        );
      }
    } catch (err) {
      console.warn("Auto-claim cloud owner failed or skipped:", err);
    }
  }
}
