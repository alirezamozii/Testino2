import type { DatabasePort } from "../ports";
import type { OutboxRow } from "../mappers";
import { UnauthorizedError } from "@/lib/errors";

export interface OutboxMutation {
  mutationId: string;
  entityType: string;
  entityId: string;
  baseVersion?: number;
  payload: unknown;
}

export type SyncStateRow = {
  owner_id: string;
  remote_cursor: string;
  last_pull_at: number | null;
  last_push_at: number | null;
  last_error_code: string | null;
};

export class OutboxRepository {
  constructor(private db: DatabasePort) {}

  private assertOwner(ownerId: string): void {
    if (!ownerId || typeof ownerId !== "string" || !ownerId.trim()) {
      throw new UnauthorizedError("شناسهٔ مالک الزامی است و نمی‌تواند خالی باشد.");
    }
  }

  async isMutationApplied(ownerId: string, mutationId: string, trx?: DatabasePort): Promise<boolean> {
    this.assertOwner(ownerId);
    const executor = trx || this.db;
    const rows = await executor.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM applied_mutations WHERE owner_id=? AND mutation_id=?",
      [ownerId.trim(), mutationId]
    );
    return Boolean(rows.length && rows[0].count > 0);
  }

  async recordAppliedMutation(
    ownerId: string,
    mutationId: string,
    result: unknown = null,
    trx?: DatabasePort
  ): Promise<void> {
    this.assertOwner(ownerId);
    const executor = trx || this.db;
    await executor.execute(
      "INSERT OR IGNORE INTO applied_mutations(owner_id, mutation_id, result_json, created_at) VALUES(?, ?, ?, ?)",
      [ownerId.trim(), mutationId, JSON.stringify(result), Date.now()]
    );
  }

  async enqueue(
    ownerId: string,
    mutation: OutboxMutation,
    trx?: DatabasePort
  ): Promise<void> {
    this.assertOwner(ownerId);
    const executor = trx || this.db;
    const id = crypto.randomUUID();
    await executor.execute(
      `INSERT INTO outbox(id, owner_id, mutation_id, entity_type, entity_id, base_version, payload_json, state, attempt_count, created_at)
       VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)`,
      [
        id,
        ownerId.trim(),
        mutation.mutationId,
        mutation.entityType,
        mutation.entityId,
        mutation.baseVersion ?? 1,
        JSON.stringify(mutation.payload),
        Date.now(),
      ]
    );
  }

  async enqueueIfAbsent(
    ownerId: string,
    mutation: OutboxMutation,
    trx?: DatabasePort
  ): Promise<boolean> {
    this.assertOwner(ownerId);
    const executor = trx || this.db;
    const existing = await executor.query<{ id: string }>(
      "SELECT id FROM outbox WHERE mutation_id=? LIMIT 1",
      [mutation.mutationId]
    );
    if (existing.length) return false;
    await this.enqueue(ownerId, mutation, executor);
    return true;
  }

  async listPending(ownerId: string, limit = 50): Promise<OutboxRow[]> {
    this.assertOwner(ownerId);
    const now = Date.now();
    return this.db.query<OutboxRow>(
      "SELECT * FROM outbox WHERE (owner_id IS NULL OR owner_id=?) AND state='pending' AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at ASC LIMIT ?",
      [ownerId.trim(), now, Math.min(limit, 100)]
    );
  }

  async countPending(ownerId: string): Promise<number> {
    this.assertOwner(ownerId);
    const rows = await this.db.query<{ total: number }>(
      "SELECT COUNT(*) as total FROM outbox WHERE (owner_id IS NULL OR owner_id=?) AND state='pending'",
      [ownerId.trim()]
    );
    return rows[0]?.total ? Number(rows[0].total) : 0;
  }

  async markSending(ownerId: string, mutationIds: string[]): Promise<void> {
    if (!mutationIds.length) return;
    this.assertOwner(ownerId);
    const placeholders = mutationIds.map(() => "?").join(",");
    await this.db.execute(
      `UPDATE outbox SET state='sending' WHERE (owner_id IS NULL OR owner_id=?) AND mutation_id IN (${placeholders})`,
      [ownerId.trim(), ...mutationIds]
    );
  }

  async markAcked(ownerId: string, mutationId: string): Promise<void> {
    this.assertOwner(ownerId);
    await this.db.execute(
      "UPDATE outbox SET state='acked' WHERE (owner_id IS NULL OR owner_id=?) AND mutation_id=?",
      [ownerId.trim(), mutationId]
    );
  }

  async markFailed(ownerId: string, mutationId: string, errorCode?: string, nextAttemptAt?: number): Promise<void> {
    this.assertOwner(ownerId);
    await this.db.execute(
      "UPDATE outbox SET state='failed', attempt_count=attempt_count+1, last_error_code=?, next_attempt_at=? WHERE (owner_id IS NULL OR owner_id=?) AND mutation_id=?",
      [errorCode || null, nextAttemptAt || null, ownerId.trim(), mutationId]
    );
  }

  async markPendingRetry(ownerId: string, mutationId: string, errorCode?: string, nextAttemptAt?: number): Promise<void> {
    this.assertOwner(ownerId);
    await this.db.execute(
      "UPDATE outbox SET state='pending', attempt_count=attempt_count+1, last_error_code=?, next_attempt_at=? WHERE (owner_id IS NULL OR owner_id=?) AND mutation_id=?",
      [errorCode || null, nextAttemptAt || null, ownerId.trim(), mutationId]
    );
  }

  async getSyncState(ownerId: string): Promise<SyncStateRow | null> {
    this.assertOwner(ownerId);
    const rows = await this.db.query<SyncStateRow>(
      "SELECT * FROM sync_state WHERE owner_id=? LIMIT 1",
      [ownerId.trim()]
    );
    return rows[0] || null;
  }

  async updateSyncState(ownerId: string, updates: Partial<SyncStateRow>, trx?: DatabasePort): Promise<void> {
    this.assertOwner(ownerId);
    const executor = trx || this.db;
    const existing = await this.getSyncState(ownerId);
    if (existing) {
      await executor.execute(
        `UPDATE sync_state SET 
           remote_cursor = COALESCE(?, remote_cursor),
           last_pull_at = COALESCE(?, last_pull_at),
           last_push_at = COALESCE(?, last_push_at),
           last_error_code = ?
         WHERE owner_id=?`,
        [
          updates.remote_cursor ?? null,
          updates.last_pull_at ?? null,
          updates.last_push_at ?? null,
          updates.last_error_code !== undefined ? updates.last_error_code : existing.last_error_code,
          ownerId.trim(),
        ]
      );
    } else {
      await executor.execute(
        `INSERT INTO sync_state(owner_id, remote_cursor, last_pull_at, last_push_at, last_error_code)
         VALUES(?, ?, ?, ?, ?)`,
        [
          ownerId.trim(),
          updates.remote_cursor || "0",
          updates.last_pull_at || null,
          updates.last_push_at || null,
          updates.last_error_code || null,
        ]
      );
    }
  }
}
