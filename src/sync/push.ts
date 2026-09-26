import type { OutboxRepository } from "@/database/repositories/outbox-repository";
import type { SyncTransport, PushMutationItem } from "./ports";

export interface PushResult {
  pushedCount: number;
  conflictCount: number;
  errors: string[];
}

const MAX_BATCH_BYTES = 700_000;
const DEFAULT_BATCH_COUNT = 40;

export async function executePush(
  ownerId: string,
  deviceId: string,
  outboxRepo: OutboxRepository,
  transport: SyncTransport,
  options?: { batchSize?: number }
): Promise<PushResult> {
  const maxCount = Math.min(options?.batchSize || DEFAULT_BATCH_COUNT, 60);
  const candidateRows = await outboxRepo.listPending(ownerId, maxCount);

  if (!candidateRows.length) {
    return { pushedCount: 0, conflictCount: 0, errors: [] };
  }

  // Slice candidates so total JSON byte length stays strictly under server limits (1MB)
  const pendingRows: typeof candidateRows = [];
  let accumulatedBytes = 0;
  for (const row of candidateRows) {
    const rowBytes = (row.payload_json ? row.payload_json.length : 0) + 200;
    if (pendingRows.length > 0 && accumulatedBytes + rowBytes > MAX_BATCH_BYTES) {
      break;
    }
    pendingRows.push(row);
    accumulatedBytes += rowBytes;
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
    const pendingMap = new Map(pendingRows.map((r) => [r.mutation_id, r]));

    for (const res of results) {
      const pendingRow = pendingMap.get(res.mutationId);
      const isTombstone =
        pendingRow?.mutation_id.startsWith("tombstone:") ||
        (pendingRow?.payload_json && pendingRow.payload_json.includes('"is_tombstone":true'));

      if (res.status === "accepted" || res.status === "duplicate") {
        await outboxRepo.markAcked(ownerId, res.mutationId);
        await outboxRepo.recordAppliedMutation(ownerId, res.mutationId, { status: res.status, changeSeq: res.changeSeq });
        pushedCount++;
      } else if (res.errorCode === "FINISHED_TERMINAL" && isTombstone) {
        // If server reported FINISHED_TERMINAL on a tombstone, the session is already terminated on server.
        await outboxRepo.markAcked(ownerId, res.mutationId);
        await outboxRepo.recordAppliedMutation(ownerId, res.mutationId, { status: "accepted", changeSeq: res.changeSeq });
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
