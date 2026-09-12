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
      let gotLeaderLock = false;
      for (let attempt = 0; attempt < 2 && !gotLeaderLock; attempt += 1) {
        gotLeaderLock = await this.tryAcquireLeaderLock(ownerKey);
        if (!gotLeaderLock && attempt < 1) {
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
      }

      if (gotLeaderLock) {
        await this.initLeader();
      } else {
        // Ping channel to confirm an active leader is truly responding
        let isLeaderAlive = false;
        try {
          const pingChannel = new BroadcastChannel(`testino-db-bus:${ownerKey}`);
          isLeaderAlive = await new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
              try {
                pingChannel.removeEventListener("message", handler);
                pingChannel.close();
              } catch {
                // ignore
              }
              resolve(false);
            }, 120);

            const handler = (event: MessageEvent) => {
              if (event.data?.id === "ping-leader" || event.data?.type === "pong") {
                clearTimeout(timeout);
                try {
                  pingChannel.removeEventListener("message", handler);
                  pingChannel.close();
                } catch {
                  // ignore
                }
                resolve(true);
              }
            };
            pingChannel.addEventListener("message", handler);
            pingChannel.postMessage({ id: "ping-leader", type: "ping" });
          });
        } catch {
          isLeaderAlive = false;
        }

        if (isLeaderAlive) {
          await this.initClient();
        } else {
          this.isLeader = true;
          await this.initLeaderWorkerOnly();
        }
      }
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
          console.warn("Worker error detected, falling back to direct mode:", err);
          void this.initDirectMode();
        };
      }
      if (this.worker) {
        const reply = await this.sendToWorker({ id: crypto.randomUUID(), type: "open", ownerKey: this.ownerKey }, 3000);
        if (!reply.ok) {
          await this.initDirectMode();
        } else {
          this.storageType = reply.storage || "opfs";
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
      if (!this.directDb) return [] as T[];
      return (this.directDb.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" }) || []) as T[];
    }
    const reply = await this.request({ id: crypto.randomUUID(), type: "query", statement: { sql, bind } });
    if (!reply.ok) throw new Error(reply.error);
    return (reply.rows || []) as T[];
  }

  async execute(sql: string, bind: SqlStatement["bind"] = []) {
    if (this.isDirectMode) {
      if (this.directDb) {
        this.directDb.exec({ sql, bind });
      }
      return;
    }
    await this.batch([{ sql, bind }]);
  }

  async batch(statements: SqlStatement[]) {
    if (this.isDirectMode) {
      if (!this.directDb) return;
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
    const reply = await this.request({ id: crypto.randomUUID(), type: "batch", statements });
    if (!reply.ok) throw new Error(reply.error);
  }

  async transaction<T>(callback: (trx: DatabasePort) => Promise<T>): Promise<T> {
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
      if (this.directDb) {
        this.directDb.exec({ sql, bind });
      }
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
      return { ok: true, storage: "memory", schemaVersion: 0 };
    }
    return {
      ok: true,
      storage: reply.storage || this.storageType || "opfs",
      schemaVersion: reply.schemaVersion ?? 1,
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
      this.worker.postMessage({ id: crypto.randomUUID(), type: "close" });
      this.worker.terminate();
      this.worker = null;
    }
    if (this.directDb) {
      try { this.directDb.close(); } catch { /* ignore */ }
      this.directDb = null;
    }
    this.failAll("پایگاه داده بسته شد.");
  }

  private request(request: DatabaseRequest): Promise<DatabaseReply> {
    if (this.isDirectMode) {
      return Promise.resolve({ id: request.id, ok: true });
    }
    if (this.isLeader && this.worker) {
      return this.sendToWorker(request);
    }
    if (this.channel) {
      return this.sendToChannel(request);
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
