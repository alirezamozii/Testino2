/// <reference lib="webworker" />
import type { DatabaseReply, DatabaseRequest, SqlStatement } from "../../protocol";

// Configure sqlite3 environment flags before importing WASM
if (typeof self !== "undefined") {
  (self as unknown as { sqlite3ApiConfig?: Record<string, unknown> }).sqlite3ApiConfig = {
    // Disable default asyncer to prevent OPFS asyncer proxy worker warnings
    defaultOpfsFlags: 0,
    warn: () => {},
  };
}

type SqliteDb = {
  exec(options: { sql: string; bind?: SqlStatement["bind"]; returnValue?: "resultRows"; rowMode?: "object" }): unknown;
  close(): void;
};

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error) => { clearTimeout(timer); reject(error); }
    );
  });
}

let database: SqliteDb | null = null;
let releaseLock: (() => void) | null = null;
let storageType: "opfs" | "memory" = "opfs";
let storageDetail: string | undefined;

/**
 * Try to become the sole holder of the canonical OPFS database.
 * Returns true when the lock was acquired (hold it until closeDatabase),
 * false when another live worker/tab currently owns the DB.
 *
 * This is authoritative — OPFS SAHPool keeps MULTIPLE copies of the DB and
 * hands each connection a different copy. If two workers hold copies
 * concurrently they can DIVERGE (one serves stale/empty data). Failing fast
 * to memory mode is far safer than opening a divergent copy.
 */
async function acquireWebLock(ownerKey = "default"): Promise<boolean> {
  if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) {
    return true; // No Web Locks API — nothing to coordinate with
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    navigator.locks.request(
      `testino-db-worker:${ownerKey}`,
      { ifAvailable: true },
      (lock) => {
        if (!lock) {
          if (!settled) {
            settled = true;
            resolve(false);
          }
          return;
        }
        if (!settled) {
          settled = true;
          resolve(true);
        }
        // Hold the lock until closeDatabase() releases it
        return new Promise<void>((release) => {
          releaseLock = release;
        });
      }
    ).catch(() => {
      if (!settled) {
        settled = true;
        resolve(true); // Lock API errored — best effort, proceed
      }
    });
  });
}

async function openDatabase(ownerKey = "default") {
  if (database) return;
  let gotLock = true;
  try {
    // Retry: on a normal reload the previous page's worker releases the lock
    // within ~150ms (graceful close). Don't fall to memory mode on the first
    // failed attempt — wait briefly for the previous tab to check its copy in.
    const lockRetryDelaysMs = [0, 250, 600, 1200];
    for (let attempt = 0; attempt < lockRetryDelaysMs.length; attempt += 1) {
      if (lockRetryDelaysMs[attempt] > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, lockRetryDelaysMs[attempt]));
      }
      gotLock = await acquireWebLock(ownerKey);
      if (gotLock) break;
    }
  } catch {
    gotLock = true; // best effort
  }

  // Another live tab/worker owns the canonical DB. Opening a second SAHPool
  // copy would create a divergent (stale) database — use memory mode instead.
  if (!gotLock) {
    storageDetail = "یک تب دیگر در حال استفاده از پایگاه داده است.";
    console.warn("Testino DB: another tab holds the database lock — using memory mode");
  }

  // 1. Try OPFS SAHPool first (for persistent storage when allowed by browser/context)
  const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
  const sqlite = await sqlite3InitModule();

  let initialized = false;

  if (!gotLock) {
    // skip OPFS entirely — another tab owns the canonical DB
  } else if (typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
    // Retry a few times: after a page reload the previous worker's sync access
    // handles can still be held for a short moment — waiting usually resolves it.
    const retryDelaysMs = [0, 500, 1200, 2500];
    for (let attempt = 0; attempt < retryDelaysMs.length && !initialized; attempt += 1) {
      if (retryDelaysMs[attempt] > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
      }
      try {
        if (typeof sqlite.installOpfsSAHPoolVfs === "function") {
          // Race with a timeout: in restricted iframes (e.g. preview embeds) OPFS
          // setup can stall for a long time before failing — fail fast instead.
          const pool = await withTimeout(
            sqlite.installOpfsSAHPoolVfs({
              name: `testino-sahpool-${ownerKey}`,
              directory: `/testino-sahpool-${ownerKey}`,
              initialCapacity: 6,
            }),
            5000,
            "opfs-sahpool-install"
          );
          database = new pool.OpfsSAHPoolDb(`/testino-${ownerKey}.sqlite3`) as SqliteDb;
          storageType = "opfs";
          storageDetail = undefined;
          initialized = true;
        }
      } catch (opfsErr) {
        storageDetail = opfsErr instanceof Error ? opfsErr.message : String(opfsErr);
        const retryable = /access handle|writable|in use|locked|busy/i.test(storageDetail);
        console.warn(`OPFS SAHPool attempt ${attempt + 1}/${retryDelaysMs.length} failed:`, opfsErr);
        if (!retryable) break;
      }
    }
  }

  // 2. Fallback to in-memory SQLite for iframe previews or unsupported storage contexts
  if (!initialized) {
    try {
      database = new sqlite.oo1.DB() as unknown as SqliteDb;
      storageType = "memory";
      initialized = true;
    } catch (fallbackErr) {
      console.error("Failed to initialize fallback SQLite DB:", fallbackErr);
      throw new Error("پایگاه داده در مرورگر قابل راه‌اندازی نیست.");
    }
  }

  requireDatabase().exec({ sql: "PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;" });
}

function requireDatabase() {
  if (!database) throw new Error("پایگاه داده هنوز آماده نیست.");
  return database;
}

function query(statement: SqlStatement) {
  return requireDatabase().exec({ ...statement, rowMode: "object", returnValue: "resultRows" }) as Record<string, unknown>[];
}

function batch(statements: SqlStatement[]) {
  const db = requireDatabase();
  const sp = `batch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  db.exec({ sql: `SAVEPOINT ${sp}` });
  try {
    for (const statement of statements) db.exec(statement);
    db.exec({ sql: `RELEASE ${sp}` });
  } catch (error) {
    try {
      db.exec({ sql: `ROLLBACK TO ${sp}; RELEASE ${sp};` });
    } catch {
      // ignore rollback errors
    }
    throw error;
  }
}

function closeDatabase() {
  if (database) {
    try { database.close(); } catch { /* ignore */ }
    database = null;
  }
  if (releaseLock) {
    releaseLock();
    releaseLock = null;
  }
}

self.onmessage = async (event: MessageEvent<DatabaseRequest>) => {
  const request = event.data;
  let reply: DatabaseReply;
  try {
    if (request.type === "open") {
      await openDatabase(request.ownerKey);
      reply = { id: request.id, ok: true, storage: storageType, storageDetail };
    } else if (request.type === "query") {
      if (/DELETE FROM|DROP TABLE|DELETE FROM profiles/i.test(request.statement.sql)) {
        console.warn("[sql-audit]", request.statement.sql.slice(0, 100));
      }
      const rows = query(request.statement);
      reply = { id: request.id, ok: true, rows };
    } else if (request.type === "raw") {
      if (/DELETE FROM|DROP TABLE/i.test(request.statement.sql)) {
        console.warn("[sql-audit]", request.statement.sql.slice(0, 100));
      }
      requireDatabase().exec(request.statement);
      reply = { id: request.id, ok: true };
    } else if (request.type === "batch") {
      for (const stmt of request.statements) {
        if (/DELETE FROM|DROP TABLE/i.test(stmt.sql)) {
          console.warn("[sql-audit]", stmt.sql.slice(0, 100));
        }
      }
      batch(request.statements);
      reply = { id: request.id, ok: true };
    } else if (request.type === "health") {
      let schemaVer = 1;
      try {
        const rows = query({ sql: "SELECT MAX(version) as ver FROM schema_migrations" });
        if (rows.length && rows[0].ver) schemaVer = Number(rows[0].ver);
      } catch {
        schemaVer = 0;
      }
      reply = { id: request.id, ok: true, storage: storageType, storageDetail, schemaVersion: schemaVer };
    } else if (request.type === "close") {
      closeDatabase();
      reply = { id: request.id, ok: true };
    } else {
      reply = { id: (request as DatabaseRequest).id, ok: false, error: "نوع درخواست نامعتبر است." };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "خطای ناشناختهٔ پایگاه داده";
    reply = { id: request.id, ok: false, error: errorMsg };
  }
  self.postMessage(reply);
};
