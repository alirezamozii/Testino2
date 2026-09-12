export type SyncStatus =
  | "idle"
  | "syncing"
  | "pushing"
  | "pulling"
  | "merging"
  | "offline"
  | "unconfigured"
  | "error";

export interface PushMutationItem {
  mutationId: string;
  entityType: string;
  entityId: string;
  baseVersion?: number;
  payload: unknown;
}

export interface PushMutationResult {
  mutationId: string;
  status: "accepted" | "duplicate" | "conflict" | "rejected";
  serverVersion?: number;
  changeSeq?: string;
  errorCode?: string;
}

export interface PullChangeItem {
  changeSeq: string;
  entityType: string;
  entityId: string;
  serverVersion: number;
  isTombstone: boolean;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface PullChangesResult {
  changes: PullChangeItem[];
  nextCursor: string;
  hasMore: boolean;
}

export interface SyncTransport {
  isConfigured(): boolean;
  isAuthenticated(): Promise<boolean>;
  push(deviceId: string, mutations: PushMutationItem[]): Promise<PushMutationResult[]>;
  pull(cursor: string, limit?: number): Promise<PullChangesResult>;
  downloadSubjects?(
    subjectNames: string[],
    cursor: string,
    limit?: number
  ): Promise<PullChangesResult>;
  uploadMedia?(input: { sha256: string; mime: string; bytes: Uint8Array }): Promise<string>;
  downloadMedia?(remotePath: string): Promise<Uint8Array>;
  claimLocalOwner?(localOwnerId: string, displayName: string): Promise<{
    ownerId: string;
    displayName: string;
    kind: "local" | "account";
    isNew: boolean;
  }>;
}

export interface SyncReport {
  pushedCount: number;
  pulledCount: number;
  errors: string[];
  hasConflicts: boolean;
  reconciledCount?: number;
  uploadedMediaCount?: number;
  downloadedMediaCount?: number;
  completedAt: number;
}

export interface SyncConfig {
  autoSyncIntervalMs?: number;
  batchSize?: number;
}
