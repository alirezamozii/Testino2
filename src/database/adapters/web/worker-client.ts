import type { DatabaseHealth, DatabasePort } from "../../ports";
import type { DatabaseReply, DatabaseRequest, SqlStatement } from "../../protocol";
import { OperationOutcomeUnknownError, StorageUnavailableError } from "@/lib/errors";

interface PendingRequest {
  resolve: (reply: DatabaseReply) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

type DirectSqliteDb = {
  exec(options: { sql: string; bind?: SqlStatement["bind"]; returnValue?: "resultRows"; rowMode?: "object" }): unknown;
  close(): void;
};

export class SqliteWorkerClient implements DatabasePort {
  private worker: Worker | null = null;
  private channel: BroadcastChannel | null = null;
  private isLeader = false;
  private releaseLeaderLock: (() => void) | null = null;
  private ownerKey = "default";
  private pending = new Map<string, PendingRequest>();
  private directDb: DirectSqliteDb | null = null;
  private isDirectMode = false;
  private storageType: "opfs" | "native" | "memory" = "opfs";
  private storageDetail: string | undefined;
  // Worker crash recovery: restart the worker instead of silently swapping in
  // an EMPTY un-migrated in-memory DB (which made every query fail with
  // "no such table" while the UI still showed opfs/ready).
  private restartAttempts = 0;
  private restartPromise: Promise<void> | null = null;
  // Transaction mutex: overlapping transaction() calls used to interleave
  // SAVEPOINTs on the same connection — the inner RELEASE could throw
  // "no such savepoint" and the remaining writes committed WITHOUT atomicity.
  private txChain: Promise<unknown> = Promise.resolve();

  async open(ownerKey = "default") {
    this.ownerKey = ownerKey;

    // Detect single-instance environments (Desktop Electron, Capacitor Native, or iframe)
    const isSingleInstance = typeof window !== "undefined" && (
      Boolean((window as unknown as { testinoDesktop?: unknown }).testinoDesktop) ||
      Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.()) ||
      window.self !== window.top
    );

    // Check if multi-tab lock and channel are supported
    const hasWebLocks = typeof navigator !== "undefined" && "locks" in navigator && Boolean(navigator.locks);
    const hasChannel = typeof BroadcastChannel !== "undefined";

    if (!isSingleInstance && hasWebLocks && hasChannel) {
      // Multi-tab coordination removed: an old background tab could hold the
      // leader lock and serve STALE (or empty) data over the BroadcastChannel
      // to newer tabs, and OPFS handle contention between tabs caused
      // wedges/crashes. SQLite + OPFS SAHPool already supports multiple
      // independent connections safely via file locking — each tab now owns
      // its own worker and talks directly to it.
      this.isLeader = true;
      await this.initLeaderWorkerOnly();
    } else {
      // Fallback for single-instance / Android / desktop / environments without locks
      this.isLeader = true;
      await this.initLeaderWorkerOnly();
    }
  }

  private tryAcquireLeaderLock(ownerKey: string): Promise<boolean> {
    if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) {
      return Promise.resolve(false);
    }
    return new Promise<boolean>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, 150);

      navigator.locks.request(
        `testino-db-leader:${ownerKey}`,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) {
            if (!settled) {
              settled = true;
              clearTimeout(timeout);
              resolve(false);
            }
            return;
          }
          this.isLeader = true;
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve(true);
          }

          // Hold lock until window closes or close() is called
          await new Promise<void>((rel) => {
            this.releaseLeaderLock = rel;
          });
        }
      ).catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(false);
        }
      });
    });
  }

  private async initLeader() {
    this.isLeader = true;
    await this.initLeaderWorkerOnly();

    if (this.isDirectMode) return;

    // Open channel to serve queries from other open tabs
    try {
      this.channel = new BroadcastChannel(`testino-db-bus:${this.ownerKey}`);
      this.channel.onmessage = async (event: MessageEvent<DatabaseRequest>) => {
        const request = event.data;
        if (!request || !request.id) return;
        if ((request as unknown as { type: string }).type === "ping") {
          this.channel?.postMessage({ id: request.id, ok: true, type: "pong" });
          return;
        }
        try {
          const reply = await this.sendToWorker(request);
          this.channel?.postMessage(reply);
        } catch (err) {
          this.channel?.postMessage({
            id: request.id,
            ok: false,
            error: err instanceof Error ? err.message : "خطا در پایگاه داده",
          });
        }
      };
    } catch {
      // ignore channel errors
    }
  }

  private async initLeaderWorkerOnly() {
    try {
      if (!this.worker && typeof Worker !== "undefined") {
        this.worker = new Worker(new URL("./sqlite-worker.ts", import.meta.url), { type: "module" });
        this.worker.onmessage = (event: MessageEvent<DatabaseReply>) => this.receive(event.data);
        this.worker.onerror = (err) => {
          console.warn("Worker error detected — attempting worker restart (crash recovery):", err);
          void this.restartWorker();
        };
      }
      if (this.worker) {
        // Generous timeout: WASM compile + first OPFS pool setup can take several
        // seconds in dev mode. Falling back early would recompile the whole SQLite
        // WASM on the main thread (double work, much slower startup).
        const reply = await this.sendToWorker({ id: crypto.randomUUID(), type: "open", ownerKey: this.ownerKey }, 20000);
        if (!reply.ok) {
          console.warn("Worker database open failed, switching to direct mode:", reply.error);
          await this.initDirectMode();
        } else {
          this.storageType = reply.storage || "opfs";
          this.storageDetail = reply.storageDetail;
          if (this.storageType === "memory" && this.storageDetail) {
            // Surface the fallback reason in the page console (worker logs are not visible here).
            console.warn(`Testino: persistent storage (OPFS) unavailable — data will NOT survive reload. Reason: ${this.storageDetail}`);
          }
        }
      } else {
        await this.initDirectMode();
      }
    } catch (err) {
      console.warn("Failed to initialize worker database, activating resilient direct mode:", err);
      await this.initDirectMode();
    }
  }

  private initDirectModePromise: Promise<void> | null = null;

  /**
   * Crash recovery for a dead worker: fail all pending RPCs, then rebuild the
   * worker and re-open the SAME persistent (OPFS) database — schema lives in
   * the file, so the app keeps working with no data loss. Falls back to direct
   * memory mode only if the restart itself fails (rare), and notifies the UI.
   */
  private restartWorker(): Promise<void> {
    if (this.restartPromise) return this.restartPromise;
    if (this.restartAttempts >= 2 || this.isDirectMode) {
      // Restart failed too many times — degrade to direct mode (with notification).
      return this.initDirectMode();
    }
    this.restartAttempts += 1;
    this.restartPromise = (async () => {
      this.failAll("پایگاه داده موقتاً ری‌استارت شد — درخواست مجدد تلاش می‌شود.");
      if (this.worker) {
        try { this.worker.terminate(); } catch { /* ignore */ }
        this.worker = null;
      }
      await this.initLeaderWorkerOnly();
      // Let the provider/topbar update the storage badge if the mode changed.
      notifyStorageModeChanged(this.storageType, this.storageDetail);
    })()
      .catch(async (err) => {
        console.warn("Worker restart failed — switching to direct mode:", err);
        await this.initDirectMode();
      })
      .finally(() => {
        this.restartPromise = null;
      });
    return this.restartPromise;
  }

  private async initDirectMode() {
    if (this.initDirectModePromise) {
      return this.initDirectModePromise;
    }
    this.initDirectModePromise = (async () => {
      this.isDirectMode = true;
      this.storageType = "memory";
      if (this.worker) {
        try { this.worker.terminate(); } catch { /* ignore */ }
        this.worker = null;
      }
      if (this.channel) {
        try { this.channel.close(); } catch { /* ignore */ }
        this.channel = null;
      }
      this.failAll("پایگاه داده به حافظهٔ موقت منتقل شد — درخواست‌های معلق لغو شدند.");
      notifyStorageModeChanged(this.storageType, "direct-mode");

      if (!this.directDb) {
        try {
          const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
          const sqlite = await sqlite3InitModule();
          this.directDb = new sqlite.oo1.DB() as unknown as DirectSqliteDb;
          this.directDb.exec({ sql: "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;" });
        } catch (directErr) {
          console.warn("Direct SQLite WASM init error:", directErr);
        }
      }
    })();
    return this.initDirectModePromise;
  }

  private async initClient() {
    this.isLeader = false;
    try {
      this.channel = new BroadcastChannel(`testino-db-bus:${this.ownerKey}`);
      this.channel.onmessage = (event: MessageEvent<DatabaseReply>) => {
        const reply = event.data;
        if (reply && reply.id) {
          this.receive(reply);
        }
      };
    } catch {
      await this.initDirectMode();
      return;
    }

    // Background failover listener: if leader tab closes, take over as leader!
    if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
      navigator.locks.request(`testino-db-leader:${this.ownerKey}`, async (lock) => {
        if (lock && !this.isLeader && !this.isDirectMode) {
          // Promoted to Leader!
          this.isLeader = true;
          if (this.channel) {
            this.channel.close();
            this.channel = null;
          }
          await this.initLeader();
          await new Promise<void>((rel) => {
            this.releaseLeaderLock = rel;
          });
        }
      }).catch(() => undefined);
    }
  }

  async query<T extends Record<string, unknown>>(sql: string, bind: SqlStatement["bind"] = []) {
    if (this.isDirectMode) {
      if (!this.directDb) throw new StorageUnavailableError("پایگاه داده در دسترس نیست — امکان خواندن داده‌ها وجود ندارد.");
      return (this.directDb.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" }) || []) as T[];
    }
    const reply = await this.request({ id: crypto.randomUUID(), type: "query", statement: { sql, bind } });
    if (!reply.ok) throw new Error(reply.error);
    return (reply.rows || []) as T[];
  }

  async execute(sql: string, bind: SqlStatement["bind"] = []) {
    if (this.isDirectMode) {
      if (!this.directDb) throw new StorageUnavailableError("پایگاه داده در دسترس نیست — امکان ذخیره‌سازی وجود ندارد.");
      this.directDb.exec({ sql, bind });
      return;
    }
    await this.batch([{ sql, bind }]);
  }

  async batch(statements: SqlStatement[], opts?: { timeoutMs?: number }) {
    if (this.isDirectMode) {
      if (!this.directDb) throw new StorageUnavailableError("پایگاه داده در دسترس نیست — امکان ذخیره‌سازی وجود ندارد.");
      const sp = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
      this.directDb.exec({ sql: `SAVEPOINT ${sp}` });
      try {
        for (const stmt of statements) {
          this.directDb.exec(stmt);
        }
        this.directDb.exec({ sql: `RELEASE ${sp}` });
      } catch (error) {
        try {
          this.directDb.exec({ sql: `ROLLBACK TO ${sp}; RELEASE ${sp};` });
        } catch {
          // ignore
        }
        throw error;
      }
      return;
    }
    // Bulk operations (e.g. delete-all-data on a large library) can legitimately
    // run longer than the default request timeout — allow callers to extend it.
    const reply = await this.request({ id: crypto.randomUUID(), type: "batch", statements }, opts?.timeoutMs);
    if (!reply.ok) throw new Error(reply.error);
  }

  async transaction<T>(callback: (trx: DatabasePort) => Promise<T>): Promise<T> {
    // Serialize transactions: two overlapping SAVEPOINT sessions on one
    // connection interleave (e.g. pull applying a batch while restoreBackup
    // runs) and the inner RELEASE throws, committing non-atomically.
    const run = this.txChain.then(
      () => this.runExclusiveTransaction(callback),
      () => this.runExclusiveTransaction(callback)
    );
    this.txChain = run.catch(() => {});
    return run;
  }

  private async runExclusiveTransaction<T>(callback: (trx: DatabasePort) => Promise<T>): Promise<T> {
    const sp = `tx_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    await this.raw(`SAVEPOINT ${sp}`);
    try {
      const result = await callback(this);
      await this.raw(`RELEASE ${sp}`);
      return result;
    } catch (error) {
      try {
        await this.raw(`ROLLBACK TO ${sp}; RELEASE ${sp};`);
      } catch {
        // ignore rollback errors if already rolled back
      }
      throw error;
    }
  }

  private async raw(sql: string, bind: SqlStatement["bind"] = []) {
    if (this.isDirectMode) {
      if (!this.directDb) throw new StorageUnavailableError("پایگاه داده در دسترس نیست.");
      this.directDb.exec({ sql, bind });
      return;
    }
    const reply = await this.request({ id: crypto.randomUUID(), type: "raw", statement: { sql, bind } });
    if (!reply.ok) throw new Error(reply.error);
  }

  async health(): Promise<DatabaseHealth> {
    if (this.isDirectMode) {
      let schemaVer = 1;
      try {
        if (this.directDb) {
          const rows = this.directDb.exec({
            sql: "SELECT MAX(version) as ver FROM schema_migrations",
            rowMode: "object",
            returnValue: "resultRows",
          }) as Record<string, unknown>[];
          if (rows.length && rows[0].ver) schemaVer = Number(rows[0].ver);
        }
      } catch {
        schemaVer = 0;
      }
      return { ok: true, storage: "memory", schemaVersion: schemaVer };
    }

    const reply = await this.request({ id: crypto.randomUUID(), type: "health" });
    if (!reply.ok) {
      // Don't fake success: the provider uses this to pick the storage badge.
      return { ok: false, storage: this.storageType || "memory", schemaVersion: 0 };
    }
    return {
      ok: true,
      storage: reply.storage || this.storageType || "opfs",
      schemaVersion: reply.schemaVersion ?? 1,
      storageDetail: reply.storageDetail ?? this.storageDetail,
    };
  }

  close() {
    if (this.releaseLeaderLock) {
      this.releaseLeaderLock();
      this.releaseLeaderLock = null;
    }
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }
    if (this.worker) {
      // Let the worker process the close message so OPFS sync access handles
      // are released cleanly — terminating immediately would leave them held
      // and break the NEXT page load's OPFS acquisition (memory-mode fallback).
      this.worker.postMessage({ id: crypto.randomUUID(), type: "close" });
      setTimeout(() => {
        try { this.worker?.terminate(); } catch { /* ignore */ }
      }, 120);
      this.worker = null;
    }
    if (this.directDb) {
      try { this.directDb.close(); } catch { /* ignore */ }
      this.directDb = null;
    }
    this.failAll("پایگاه داده بسته شد.");
  }

  private request(request: DatabaseRequest, timeoutMs?: number): Promise<DatabaseReply> {
    if (this.isDirectMode) {
      return Promise.resolve({ id: request.id, ok: true });
    }
    if (this.worker) {
      return this.sendToWorker(request, timeoutMs);
    }
    return Promise.reject(new StorageUnavailableError("پایگاه داده هنوز باز نشده است."));
  }

  private sendToWorker(request: DatabaseRequest, timeoutMs = 6000): Promise<DatabaseReply> {
    if (!this.worker) return Promise.reject(new StorageUnavailableError("پایگاه داده هنوز باز نشده است."));
    return new Promise<DatabaseReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new OperationOutcomeUnknownError());
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      this.worker?.postMessage(request);
    });
  }

  private sendToChannel(request: DatabaseRequest, timeoutMs = 6000): Promise<DatabaseReply> {
    if (!this.channel) return Promise.reject(new StorageUnavailableError("کانال ارتباطی تب مسدود است."));
    return new Promise<DatabaseReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new OperationOutcomeUnknownError("پاسخی از تب میزبان دریافت نشد."));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      this.channel?.postMessage(request);
    });
  }

  private receive(reply: DatabaseReply) {
    const pending = this.pending.get(reply.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(reply.id);
    if (reply.ok) pending.resolve(reply);
    else pending.reject(new Error(reply.error));
  }

  private failAll(message: string) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new StorageUnavailableError(message));
    }
    this.pending.clear();
  }
}

/**
 * Lets the UI react to storage-mode changes after boot (worker crash →
 * restart landed in memory mode, etc.). AppShell listens for this and can
 * surface the amber "حافظه موقت" badge accordingly.
 */
export function notifyStorageModeChanged(
  storage: "opfs" | "native" | "memory",
  detail?: string
) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("testino:storage-mode-changed", { detail: { storage, detail } })
    );
  } catch {
    // ignore
  }
}
