import type { DatabaseHealth, DatabasePort } from "../../ports";
import type { DatabaseReply, DatabaseRequest, SqlStatement } from "../../protocol";
import { OperationOutcomeUnknownError, StorageUnavailableError } from "@/lib/errors";

interface PendingRequest {
  resolve: (reply: DatabaseReply) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class SqliteWorkerClient implements DatabasePort {
  private worker: Worker | null = null;
  private channel: BroadcastChannel | null = null;
  private isLeader = false;
  private releaseLeaderLock: (() => void) | null = null;
  private ownerKey = "default";
  private pending = new Map<string, PendingRequest>();

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
    return new Promise<boolean>((resolve) => {
        let settled = false;
        navigator.locks.request(
          `testino-db-leader:${ownerKey}`,
          { ifAvailable: true },
          async (lock) => {
            if (!lock) {
              settled = true;
              resolve(false);
              return;
            }
            this.isLeader = true;
            settled = true;
            resolve(true);

            // Hold lock until window closes or close() is called
            await new Promise<void>((rel) => {
              this.releaseLeaderLock = rel;
            });
          }
        ).catch(() => {
          if (!settled) resolve(false);
        });
      });
  }

  private async initLeader() {
    this.isLeader = true;
    await this.initLeaderWorkerOnly();

    // Open channel to serve queries from other open tabs
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
  }

  private async initLeaderWorkerOnly() {
    if (!this.worker) {
      this.worker = new Worker(new URL("./sqlite-worker.ts", import.meta.url), { type: "module" });
      this.worker.onmessage = (event: MessageEvent<DatabaseReply>) => this.receive(event.data);
      this.worker.onerror = () => this.failAll("ارتباط با پایگاه داده قطع شد.");
    }
    const reply = await this.sendToWorker({ id: crypto.randomUUID(), type: "open", ownerKey: this.ownerKey });
    if (!reply.ok) {
      throw new StorageUnavailableError(reply.error);
    }
  }

  private async initClient() {
    this.isLeader = false;
    this.channel = new BroadcastChannel(`testino-db-bus:${this.ownerKey}`);
    this.channel.onmessage = (event: MessageEvent<DatabaseReply>) => {
      const reply = event.data;
      if (reply && reply.id) {
        this.receive(reply);
      }
    };

    // Background failover listener: if leader tab closes, take over as leader!
    if (typeof navigator !== "undefined" && "locks" in navigator && navigator.locks) {
      navigator.locks.request(`testino-db-leader:${this.ownerKey}`, async (lock) => {
        if (lock && !this.isLeader) {
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
    const reply = await this.request({ id: crypto.randomUUID(), type: "query", statement: { sql, bind } });
    if (!reply.ok) throw new Error(reply.error);
    return (reply.rows || []) as T[];
  }

  async execute(sql: string, bind: SqlStatement["bind"] = []) {
    await this.batch([{ sql, bind }]);
  }

  async batch(statements: SqlStatement[]) {
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
    const reply = await this.request({ id: crypto.randomUUID(), type: "raw", statement: { sql, bind } });
    if (!reply.ok) throw new Error(reply.error);
  }

  async health(): Promise<DatabaseHealth> {
    const reply = await this.request({ id: crypto.randomUUID(), type: "health" });
    if (!reply.ok) {
      return { ok: false, storage: "opfs", schemaVersion: 0 };
    }
    return {
      ok: true,
      storage: reply.storage || "opfs",
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
    this.failAll("پایگاه داده بسته شد.");
  }

  private request(request: DatabaseRequest): Promise<DatabaseReply> {
    if (this.isLeader && this.worker) {
      return this.sendToWorker(request);
    }
    if (this.channel) {
      return this.sendToChannel(request);
    }
    return Promise.reject(new StorageUnavailableError("پایگاه داده هنوز باز نشده است."));
  }

  private sendToWorker(request: DatabaseRequest): Promise<DatabaseReply> {
    if (!this.worker) return Promise.reject(new StorageUnavailableError("پایگاه داده هنوز باز نشده است."));
    return new Promise<DatabaseReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new OperationOutcomeUnknownError());
      }, 15_000);
      this.pending.set(request.id, { resolve, reject, timer });
      this.worker?.postMessage(request);
    });
  }

  private sendToChannel(request: DatabaseRequest): Promise<DatabaseReply> {
    if (!this.channel) return Promise.reject(new StorageUnavailableError("کانال ارتباطی تب مسدود است."));
    return new Promise<DatabaseReply>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new OperationOutcomeUnknownError("پاسخی از تب میزبان دریافت نشد."));
      }, 15_000);
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
