import type { DatabaseHealth, DatabasePort } from "../../ports";
import type { SqlStatement } from "../../protocol";

export interface NativeSqliteConnection {
  execute(query: string): Promise<unknown>;
  query(statement: string, values?: unknown[]): Promise<{ values?: unknown[] }>;
  run(statement: string, values?: unknown[]): Promise<unknown>;
  open(): Promise<void>;
  close(): Promise<void>;
}

export class NativeSqliteAdapter implements DatabasePort {
  private dbName = "testino_native.db";
  private isOpen = false;
  private memoryFallbackStatements: SqlStatement[] = [];
  private memoryRows = new Map<string, Record<string, unknown>[]>();

  constructor(
    private readonly nativeConn?: NativeSqliteConnection,
    dbName?: string
  ) {
    if (dbName) this.dbName = dbName;
  }

  async open(_ownerKey = "default"): Promise<void> {
    void _ownerKey;
    if (this.nativeConn) {
      await this.nativeConn.open();
    }
    this.isOpen = true;
  }

  async query<T extends Record<string, unknown>>(sql: string, bind?: SqlStatement["bind"]): Promise<T[]> {
    this.assertOpen();
    if (this.nativeConn) {
      const res = await this.nativeConn.query(sql, (bind as unknown[]) || []);
      return (res.values || []) as T[];
    }
    // Fallback in-memory query handler
    return (this.memoryRows.get(sql) || []) as T[];
  }

  async execute(sql: string, bind?: SqlStatement["bind"]): Promise<void> {
    this.assertOpen();
    if (this.nativeConn) {
      await this.nativeConn.run(sql, (bind as unknown[]) || []);
      return;
    }
    this.memoryFallbackStatements.push({ sql, bind });
  }

  async batch(statements: SqlStatement[], _opts?: { timeoutMs?: number }): Promise<void> {
    void _opts;
    this.assertOpen();
    if (this.nativeConn) {
      for (const stmt of statements) {
        await this.nativeConn.run(stmt.sql, (stmt.bind as unknown[]) || []);
      }
      return;
    }
    this.memoryFallbackStatements.push(...statements);
  }

  async transaction<T>(callback: (trx: DatabasePort) => Promise<T>): Promise<T> {
    this.assertOpen();
    await this.execute("BEGIN TRANSACTION;");
    try {
      const result = await callback(this);
      await this.execute("COMMIT;");
      return result;
    } catch (err) {
      await this.execute("ROLLBACK;");
      throw err;
    }
  }

  async close(): Promise<void> {
    if (this.nativeConn && this.isOpen) {
      await this.nativeConn.close();
    }
    this.isOpen = false;
  }

  async health(): Promise<DatabaseHealth> {
    return {
      ok: this.isOpen,
      storage: "native",
      schemaVersion: 6,
    };
  }

  private assertOpen(): void {
    if (!this.isOpen) {
      throw new Error("Native database is not open.");
    }
  }
}
