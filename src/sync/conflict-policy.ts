export type ResolutionStrategy = "keep_local" | "apply_remote" | "merge" | "fork";

export interface ConflictContext {
  entityType: string;
  localVersion?: number;
  remoteVersion?: number;
  localState?: string;
  remoteState?: string;
  hasDivergentLocalChanges?: boolean;
}

export class ConflictPolicy {
  /**
   * Resolves conflicting incoming remote change against local state.
   */
  resolve(context: ConflictContext): ResolutionStrategy {
    const { entityType, localState, remoteState, localVersion = 1, remoteVersion = 1, hasDivergentLocalChanges } = context;

    // 1. Attempts and AttemptEvents are immutable — deduplicate and keep
    if (entityType === "attempt" || entityType === "attemptEvent") {
      return "apply_remote";
    }

    // 2. Finished sessions are terminal and cannot be overridden by non-finished remote state
    if (entityType === "session") {
      if (localState === "FINISHED" && remoteState !== "FINISHED") {
        return "keep_local";
      }
      if (remoteState === "FINISHED") {
        return "apply_remote";
      }
      // If both branches progressed concurrently and cannot be trivially merged -> Recovery Fork
      if (hasDivergentLocalChanges && (localState === "RUNNING" || localState === "PAUSED")) {
        return "fork";
      }
      // If both are in-progress and versions conflict, remote server lease takes precedence
      return remoteVersion >= localVersion ? "apply_remote" : "keep_local";
    }

    // 3. Questions: revisions are immutable snapshots
    if (entityType === "questionRevision") {
      return "apply_remote";
    }

    // 4. Profiles & Settings: higher server version wins (LWW)
    if (remoteVersion >= localVersion) {
      return "apply_remote";
    }

    return "keep_local";
  }
}
