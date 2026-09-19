import type { DatabasePort } from "./ports";
import { UnsupportedSchemaError } from "@/lib/errors";
import { MIGRATIONS, type Migration } from "./migrations";

export interface MigrationOptions {
  backupGate?: () => Promise<void>;
  targetVersion?: number;
}

export interface MigrationResult {
  appliedCount: number;
  currentVersion: number;
  appliedVersions: number[];
}

export class MigrationRunner {
  private migrations: Migration[];

  constructor(migrations: Migration[] = MIGRATIONS) {
    this.migrations = [...migrations].sort((a, b) => a.version - b.version);
  }

  async run(db: DatabasePort, options?: MigrationOptions): Promise<MigrationResult> {
    // 1. Ensure schema_migrations table exists with version, checksum, and applied_at
    await db.execute(`
      CREATE TABLE IF NOT EXISTS schema_migrations(
        version INTEGER PRIMARY KEY,
        checksum TEXT,
        applied_at INTEGER NOT NULL
      );
    `);

    // 2. Fetch applied migrations
    const appliedRows = await db.query<{ version: number; checksum: string | null; applied_at: number }>(
      "SELECT version, checksum, applied_at FROM schema_migrations ORDER BY version ASC"
    );

    const maxKnownVersion = this.migrations.length > 0 
      ? Math.max(...this.migrations.map((m) => m.version))
      : 0;

    // 3. Future-version error check: if DB has version higher than code knows about
    for (const applied of appliedRows) {
      if (applied.version > maxKnownVersion) {
        throw new UnsupportedSchemaError(
          `این پایگاه داده با نسخهٔ جدیدتری (${applied.version}) ساخته شده است، درحالی‌که حداکثر نسخهٔ پشتیبانی‌شده (${maxKnownVersion}) است. لطفاً برنامه را به‌روزرسانی کنید.`
        );
      }
    }

    const appliedVersions = new Set(appliedRows.map((r) => r.version));
    let appliedCount = 0;
    const newlyApplied: number[] = [];

    // 4. Verify checksums of existing migrations to detect corruption
    for (const applied of appliedRows) {
      const known = this.migrations.find((m) => m.version === applied.version);
      if (known && applied.checksum && known.checksum) {
        if (applied.checksum !== known.checksum) {
          throw new UnsupportedSchemaError(
            `عدم تطابق چکسام در مهاجرت نسخهٔ ${applied.version} (${known.name}). ساختار دیتابیس ممکن است تغییر یافته باشد.`
          );
        }
      }
    }

    // 5. Determine target migrations to apply
    const targetVersion = options?.targetVersion ?? maxKnownVersion;
    const pendingMigrations = this.migrations.filter(
      (m) => !appliedVersions.has(m.version) && m.version <= targetVersion
    );

    for (const migration of pendingMigrations) {
      // Backup gate for destructive migrations
      if (migration.destructive && options?.backupGate) {
        await options.backupGate();
      }

      // Execute migration inside a transaction for atomic rollback on failure.
      // ON CONFLICT DO NOTHING makes the bookkeeping row idempotent: if a
      // concurrent runner (second tab / racing open) already applied this
      // version, we skip instead of crashing with a PRIMARY KEY violation.
      await db.transaction(async (trx) => {
        for (const stmt of migration.statements) {
          await trx.execute(stmt.sql, stmt.bind);
        }
        await trx.execute(
          "INSERT INTO schema_migrations(version, checksum, applied_at) VALUES(?, ?, ?) ON CONFLICT(version) DO NOTHING",
          [migration.version, migration.checksum, Date.now()]
        );
      });

      appliedCount++;
      newlyApplied.push(migration.version);
    }

    const finalRows = await db.query<{ ver: number }>(
      "SELECT MAX(version) as ver FROM schema_migrations"
    );
    const currentVersion = finalRows.length && finalRows[0]?.ver ? Number(finalRows[0].ver) : 0;

    return {
      appliedCount,
      currentVersion,
      appliedVersions: newlyApplied,
    };
  }
}

export async function runMigrations(
  db: DatabasePort,
  options?: MigrationOptions
): Promise<MigrationResult> {
  const runner = new MigrationRunner();
  return runner.run(db, options);
}
