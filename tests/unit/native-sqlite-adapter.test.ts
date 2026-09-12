import { describe, expect, it } from "vitest";
import {
  NativeSqliteAdapter,
  type NativeSqliteConnection,
} from "@/database/adapters/native/native-sqlite-adapter";

class MockNativeConnection implements NativeSqliteConnection {
  isOpen = false;
  executedQueries: string[] = [];
  store = new Map<string, unknown[]>();

  async open(): Promise<void> {
    this.isOpen = true;
  }

  async close(): Promise<void> {
    this.isOpen = false;
  }

  async run(statement: string, values: unknown[] = []): Promise<unknown> {
    this.executedQueries.push(statement);
    this.store.set(statement, values);
    return { changes: 1 };
  }

  async execute(query: string): Promise<unknown> {
    this.executedQueries.push(query);
    return { changes: 1 };
  }

  async query(statement: string, _values: unknown[] = []): Promise<{ values?: unknown[] }> {
    void _values;
    this.executedQueries.push(statement);
    if (statement.includes("SELECT 1")) {
      return { values: [{ res: 1 }] };
    }
    return { values: [] };
  }
}

describe("NativeSqliteAdapter (TASK-035.2)", () => {
  it("opens connection, executes statements, batches, and reports health as native", async () => {
    const conn = new MockNativeConnection();
    const adapter = new NativeSqliteAdapter(conn, "test_device.db");

    await adapter.open("owner-native-1");
    expect(conn.isOpen).toBe(true);

    // Health check
    const health = await adapter.health();
    expect(health.ok).toBe(true);
    expect(health.storage).toBe("native");
    expect(health.schemaVersion).toBe(6);

    // Execute statement
    await adapter.execute("INSERT INTO profiles(id, name) VALUES(?, ?)", ["p1", "تست بومی"]);
    expect(conn.executedQueries.length).toBe(1);

    // Batch statements
    await adapter.batch([
      { sql: "UPDATE profiles SET name=? WHERE id=?", bind: ["نام جدید", "p1"] },
      { sql: "DELETE FROM profiles WHERE id=?", bind: ["p1"] },
    ]);
    expect(conn.executedQueries.length).toBe(3);

    // Query
    const rows = await adapter.query<{ res: number }>("SELECT 1 as res");
    expect(rows.length).toBe(1);
    expect(rows[0].res).toBe(1);

    await adapter.close();
    expect(conn.isOpen).toBe(false);
  });

  it("handles transactions with automatic rollback on failure", async () => {
    const conn = new MockNativeConnection();
    const adapter = new NativeSqliteAdapter(conn);

    await adapter.open();

    // Successful transaction
    await adapter.transaction(async (trx) => {
      await trx.execute("INSERT INTO test(a) VALUES(1)");
    });

    expect(conn.executedQueries).toContain("BEGIN TRANSACTION;");
    expect(conn.executedQueries).toContain("COMMIT;");

    // Failing transaction triggering rollback
    await expect(
      adapter.transaction(async (trx) => {
        await trx.execute("INSERT INTO test(a) VALUES(2)");
        throw new Error("خطای عمدی در تراکنش");
      })
    ).rejects.toThrow("خطای عمدی در تراکنش");

    expect(conn.executedQueries).toContain("ROLLBACK;");

    await adapter.close();
  });

  it("throws clear error when queried or executed before open", async () => {
    const conn = new MockNativeConnection();
    const adapter = new NativeSqliteAdapter(conn);

    await expect(adapter.execute("SELECT 1")).rejects.toThrow("Native database is not open.");
    await expect(adapter.query("SELECT 1")).rejects.toThrow("Native database is not open.");
  });
});
