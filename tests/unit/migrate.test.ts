import { describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-database";
import { MigrationRunner } from "@/database/migrate";
import { MIGRATIONS } from "@/database/migrations";
import { UnsupportedSchemaError } from "@/lib/errors";

describe("MigrationRunner (TASK-004.4)", () => {
  it("applies migrations successfully and is idempotent", async () => {
    const db = await createTestDatabase();

    const runner = new MigrationRunner();
    const result1 = await runner.run(db);

    expect(result1.appliedCount).toBe(MIGRATIONS.length);
    expect(result1.currentVersion).toBe(MIGRATIONS.length);

    // Second run should do nothing
    const result2 = await runner.run(db);
    expect(result2.appliedCount).toBe(0);
    expect(result2.currentVersion).toBe(MIGRATIONS.length);

    await db.close();
  });

  it("throws UnsupportedSchemaError on future-version database", async () => {
    const db = await createTestDatabase();

    // Simulate database that was migrated by a newer version (e.g. version 99)
    await db.execute(`
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT, applied_at INTEGER NOT NULL);
      INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(99, 'future-hash', 123456);
    `);

    const runner = new MigrationRunner();
    await expect(runner.run(db)).rejects.toThrowError(UnsupportedSchemaError);

    await db.close();
  });

  it("throws UnsupportedSchemaError on checksum mismatch", async () => {
    const db = await createTestDatabase();

    // Insert version 1 with a tampered checksum
    await db.execute(`
      CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY, checksum TEXT, applied_at INTEGER NOT NULL);
      INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(1, 'tampered-checksum', 123456);
    `);

    const runner = new MigrationRunner();
    await expect(runner.run(db)).rejects.toThrowError(UnsupportedSchemaError);

    await db.close();
  });

  it("rolls back failed migration without harming existing schema", async () => {
    const db = await createTestDatabase();

    // Apply baseline
    const runner = new MigrationRunner([
      {
        version: 1,
        name: "baseline",
        checksum: "sum1",
        statements: [{ sql: "CREATE TABLE test_table(id TEXT PRIMARY KEY, val TEXT);" }],
      },
    ]);
    await runner.run(db);

    // Now attempt a broken migration (version 2 has syntax error or bad statement)
    const brokenRunner = new MigrationRunner([
      {
        version: 1,
        name: "baseline",
        checksum: "sum1",
        statements: [{ sql: "CREATE TABLE test_table(id TEXT PRIMARY KEY, val TEXT);" }],
      },
      {
        version: 2,
        name: "broken",
        checksum: "sum2",
        statements: [
          { sql: "CREATE TABLE intermediate_table(id TEXT PRIMARY KEY);" },
          { sql: "INVALID SQL SYNTAX HERE;" },
        ],
      },
    ]);

    await expect(brokenRunner.run(db)).rejects.toThrow();

    // Verify intermediate_table was NOT created due to rollback
    const tables = await db.query<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='intermediate_table'"
    );
    expect(tables.length).toBe(0);

    // Verify version is still 1
    const ver = await db.query<{ ver: number }>("SELECT MAX(version) as ver FROM schema_migrations");
    expect(ver[0].ver).toBe(1);

    await db.close();
  });

  it("enforces foreign key constraints and rejects invalid references", async () => {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    // Attempting to insert a subject with non-existent profile_id should fail
    await expect(
      db.execute(
        "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at) VALUES(?, ?, ?, ?, ?, ?)",
        ["sub-1", "non-existent-profile", "ریاضی", 2, 70, Date.now()]
      )
    ).rejects.toThrow();

    await db.close();
  });

  it("invokes backup gate before destructive migration", async () => {
    const db = await createTestDatabase();
    let backupCalled = false;

    const runner = new MigrationRunner([
      {
        version: 1,
        name: "destructive_migration",
        checksum: "destr-sum",
        destructive: true,
        statements: [{ sql: "CREATE TABLE safe_table(id INT);" }],
      },
    ]);

    await runner.run(db, {
      backupGate: async () => {
        backupCalled = true;
      },
    });

    expect(backupCalled).toBe(true);
    await db.close();
  });

  it("applies migration 7 and adds question_count column with default 25", async () => {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    const profileId = crypto.randomUUID();
    const now = Date.now();
    await db.execute(
      "INSERT INTO profiles(id, name, created_at) VALUES(?, ?, ?)",
      [profileId, "پروفایل تست", now]
    );

    // Insert subject without specifying question_count (should take default 25)
    await db.execute(
      "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, created_at) VALUES(?, ?, ?, ?, ?, ?)",
      ["sub-test", profileId, "زیست", 4, 80, now]
    );

    const rows = await db.query<{ name: string; question_count: number }>(
      "SELECT name, question_count FROM subjects WHERE id='sub-test'"
    );

    expect(rows.length).toBe(1);
    expect(rows[0].question_count).toBe(25);

    await db.close();
  });

  it("applies migration 9 and keeps score groups optional", async () => {
    const db = await createTestDatabase();
    const runner = new MigrationRunner();
    await runner.run(db);

    const profileId = crypto.randomUUID();
    await db.execute("INSERT INTO profiles(id, name, created_at) VALUES(?, ?, ?)", [profileId, "پروفایل", Date.now()]);
    await db.execute(
      "INSERT INTO subjects(id, profile_id, name, coefficient, target_percentage, question_count, score_group, created_at) VALUES(?, ?, ?, ?, ?, ?, ?, ?)",
      [crypto.randomUUID(), profileId, "اقتصاد خرد", 2, 60, 10, "اقتصاد", Date.now()]
    );

    const [row] = await db.query<{ score_group: string }>("SELECT score_group FROM subjects LIMIT 1");
    expect(row.score_group).toBe("اقتصاد");
    await db.close();
  });
});
