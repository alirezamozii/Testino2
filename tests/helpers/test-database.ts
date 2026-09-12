import sqlite3InitModule from "@sqlite.org/sqlite-wasm";
import type { DatabaseHealth, DatabasePort } from "@/database/ports";
import type { SqlStatement } from "@/database/protocol";

type SqliteDbInstance = {
  exec(options: { sql: string; bind?: SqlStatement["bind"]; returnValue?: "resultRows"; rowMode?: "object" }): unknown;
  close(): void;
};

export class MemoryDatabaseAdapter implements DatabasePort {
  private db: SqliteDbInstance | null = null;
  private inTransaction = false;

  async open(): Promise<void> {
    if (this.db) return;
    const sqlite = await sqlite3InitModule();
    this.db = new sqlite.oo1.DB(":memory:") as unknown as SqliteDbInstance;
    this.db.exec({ sql: "PRAGMA foreign_keys=ON;" });
  }

  private requireDb(): SqliteDbInstance {
    if (!this.db) throw new Error("دیتابیس هنوز باز نشده است.");
    return this.db;
  }

  async query<T extends Record<string, unknown>>(sql: string, bind: SqlStatement["bind"] = []): Promise<T[]> {
    const db = this.requireDb();
    const rows = db.exec({ sql, bind, rowMode: "object", returnValue: "resultRows" });
    return (rows || []) as T[];
  }

  async execute(sql: string, bind: SqlStatement["bind"] = []): Promise<void> {
    const db = this.requireDb();
    db.exec({ sql, bind });
  }

  async batch(statements: SqlStatement[]): Promise<void> {
    await this.transaction(async (trx) => {
      for (const stmt of statements) {
        await trx.execute(stmt.sql, stmt.bind);
      }
    });
  }

  async transaction<T>(callback: (trx: DatabasePort) => Promise<T>): Promise<T> {
    const db = this.requireDb();
    const isOuter = !this.inTransaction;
    if (isOuter) {
      this.inTransaction = true;
      db.exec({ sql: "BEGIN IMMEDIATE;" });
    } else {
      db.exec({ sql: "SAVEPOINT sp;" });
    }

    try {
      const result = await callback(this);
      if (isOuter) {
        db.exec({ sql: "COMMIT;" });
        this.inTransaction = false;
      } else {
        db.exec({ sql: "RELEASE SAVEPOINT sp;" });
      }
      return result;
    } catch (error) {
      if (isOuter) {
        try { db.exec({ sql: "ROLLBACK;" }); } catch { /* ignore */ }
        this.inTransaction = false;
      } else {
        try { db.exec({ sql: "ROLLBACK TO SAVEPOINT sp;" }); } catch { /* ignore */ }
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      try { this.db.close(); } catch { /* ignore */ }
      this.db = null;
    }
  }

  async health(): Promise<DatabaseHealth> {
    if (!this.db) return { ok: false, storage: "memory", schemaVersion: 0 };
    let ver = 0;
    try {
      const rows = await this.query<{ ver: number }>("SELECT MAX(version) as ver FROM schema_migrations");
      if (rows.length && rows[0]?.ver) ver = Number(rows[0].ver);
    } catch {
      ver = 0;
    }
    return { ok: true, storage: "memory", schemaVersion: ver };
  }
}

export async function createTestDatabase(): Promise<MemoryDatabaseAdapter> {
  const adapter = new MemoryDatabaseAdapter();
  await adapter.open();
  return adapter;
}
