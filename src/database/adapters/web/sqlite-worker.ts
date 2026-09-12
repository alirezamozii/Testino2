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

let database: SqliteDb | null = null;
let releaseLock: (() => void) | null = null;
let storageType: "opfs" | "memory" = "opfs";

async function acquireWebLock(ownerKey = "default"): Promise<void> {
  if (typeof navigator === "undefined" || !("locks" in navigator) || !navigator.locks) {
    return; // Fallback if Web Locks API not available in environment
  }

  return new Promise((resolve) => {
    let settled = false;
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve();
      }
    }, 150);

    navigator.locks.request(
      `testino-db-worker:${ownerKey}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          if (!settled) {
            settled = true;
            clearTimeout(timeout);
            resolve();
          }
          return;
        }

        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve();
        }

        // Hold the lock until releaseLock is called
        await new Promise<void>((release) => {
          releaseLock = release;
        });
      }
    ).catch(() => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve();
      }
    });
  });
}

async function openDatabase(ownerKey = "default") {
  if (database) return;

  try {
    await acquireWebLock(ownerKey);
  } catch {
    // Ignore lock errors
  }

  const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
  const sqlite = await sqlite3InitModule();

  let initialized = false;

  // 1. Try OPFS SAHPool first (for persistent storage when allowed by browser/context)
  if (typeof navigator !== "undefined" && "storage" in navigator && typeof navigator.storage?.getDirectory === "function") {
    try {
      if (typeof sqlite.installOpfsSAHPoolVfs === "function") {
        const pool = await sqlite.installOpfsSAHPoolVfs({
          name: `testino-sahpool-${ownerKey}`,
          directory: `/testino-sahpool-${ownerKey}`,
          initialCapacity: 6,
        });
        database = new pool.OpfsSAHPoolDb(`/testino-${ownerKey}.sqlite3`) as SqliteDb;
        storageType = "opfs";
        initialized = true;
      }
    } catch (opfsErr) {
      console.warn("OPFS SAHPool unavailable (e.g. iframe permissions policy or cross-origin isolation), falling back to in-memory SQLite:", opfsErr);
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
      reply = { id: request.id, ok: true, storage: storageType };
    } else if (request.type === "query") {
      reply = { id: request.id, ok: true, rows: query(request.statement) };
    } else if (request.type === "raw") {
      requireDatabase().exec(request.statement);
      reply = { id: request.id, ok: true };
    } else if (request.type === "batch") {
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
      reply = { id: request.id, ok: true, storage: storageType, schemaVersion: schemaVer };
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
