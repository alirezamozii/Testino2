import type { OutboxRepository } from "@/database/repositories/outbox-repository";
import type { SyncTransport, PushMutationItem } from "./ports";

export interface PushResult {
  pushedCount: number;
  conflictCount: number;
  errors: string[];
}

export async function executePush(
  ownerId: string,
  deviceId: string,
  outboxRepo: OutboxRepository,
  transport: SyncTransport,
  options?: { batchSize?: number }
): Promise<PushResult> {
  const batchSize = Math.min(options?.batchSize || 50, 100);
  const pendingRows = await outboxRepo.listPending(ownerId, batchSize);

  if (!pendingRows.length) {
    return { pushedCount: 0, conflictCount: 0, errors: [] };
  }

  const mutationIds = pendingRows.map((r) => r.mutation_id);
  await outboxRepo.markSending(ownerId, mutationIds);

  const mutationItems: PushMutationItem[] = pendingRows.map((r) => ({
    mutationId: r.mutation_id,
    entityType: r.entity_type,
    entityId: r.entity_id,
    baseVersion: r.base_version,
    payload: safeParse(r.payload_json),
  }));

  const errors: string[] = [];
  let pushedCount = 0;
  let conflictCount = 0;

  try {
    const results = await transport.push(deviceId, mutationItems);

    for (const res of results) {
      if (res.status === "accepted" || res.status === "duplicate") {
        await outboxRepo.markAcked(ownerId, res.mutationId);
        await outboxRepo.recordAppliedMutation(ownerId, res.mutationId, { status: res.status, changeSeq: res.changeSeq });
        pushedCount++;
      } else {
        const errorMsg = res.errorCode || `Mutation ${res.mutationId} rejected by server with status: ${res.status}`;
        await outboxRepo.markFailed(ownerId, res.mutationId, errorMsg);
        errors.push(errorMsg);
        if (res.status === "conflict") conflictCount += 1;
      }
    }

    // For any mutations that the server didn't return a status for, reset them for retry
    const returnedIds = new Set(results.map((r) => r.mutationId));
    for (const pending of pendingRows) {
      if (!returnedIds.has(pending.mutation_id)) {
        await outboxRepo.markPendingRetry(ownerId, pending.mutation_id, "پاسخی از سرور دریافت نشد.");
      }
    }

    await outboxRepo.updateSyncState(ownerId, {
      last_push_at: Date.now(),
      last_error_code: errors.length > 0 ? errors[0] : null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);

    // Reset sending items to pending so they can be retried later
    for (const pending of pendingRows) {
      await outboxRepo.markPendingRetry(ownerId, pending.mutation_id, message);
    }

    await outboxRepo.updateSyncState(ownerId, {
      last_error_code: message,
    });
  }

  return { pushedCount, conflictCount, errors };
}

function safeParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return {};
  }
}
