"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useDatabase } from "./database-provider";
import { SyncCoordinator } from "@/sync/coordinator";
import type { SyncStatus, SyncReport } from "@/sync/ports";
import { OutboxRepository } from "@/database/repositories/outbox-repository";
import { syncCommunityQuestionsForSubjects } from "@/platform/community-questions";
import { OfflineLibraryService } from "@/features/offline/domain/offline-library-service";

// SSR-safe online status via useSyncExternalStore: server snapshot is optimistic
// (true), client snapshot reads navigator.onLine and re-reads on online/offline
// events — no effect, no hydration mismatch.
function subscribeOnline(onChange: () => void) {
  window.addEventListener("online", onChange);
  window.addEventListener("offline", onChange);
  return () => {
    window.removeEventListener("online", onChange);
    window.removeEventListener("offline", onChange);
  };
}
const getOnlineSnapshot = () => navigator.onLine;
const getServerOnlineSnapshot = () => true;

export interface SyncContextValue {
  status: SyncStatus;
  isOnline: boolean;
  isSyncing: boolean;
  lastReport: SyncReport | null;
  pendingCount: number;
  syncNow: () => Promise<SyncReport>;
  refreshPendingCount: () => Promise<void>;
  coordinator: SyncCoordinator | null;
}

const SyncContext = createContext<SyncContextValue | null>(null);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const isOnline = useSyncExternalStore(subscribeOnline, getOnlineSnapshot, getServerOnlineSnapshot);

  const coordinator = useMemo(() => {
    if (database.status !== "ready") return null;
    return new SyncCoordinator(database.db.getClient());
  }, [database.status, database.db]);

  const refreshPendingCount = useCallback(async () => {
    if (database.status !== "ready") return;
    try {
      const outbox = new OutboxRepository(database.db.getClient());
      const owner = await database.db.getCurrentOwner();
      let ownerId = owner?.id;
      if (!ownerId) {
        const rows = await database.db.getClient().query<{ id: string }>(
          "SELECT id FROM owners WHERE inactive_at IS NULL ORDER BY created_at ASC LIMIT 1"
        );
        ownerId = rows[0]?.id;
      }
      if (ownerId) {
        const count = await outbox.countPending(ownerId);
        setPendingCount(count);
      }
    } catch {
      // ignore
    }
  }, [database.status, database.db]);

  const syncCommunity = useCallback(async (): Promise<number> => {
    if (database.status !== "ready") return 0;
    try {
      const profiles = await database.db.listProfiles();
      const activeSubjects = profiles?.[0]?.subjects?.map((s) => s.name) || [];
      if (activeSubjects.length > 0) {
        const res = await syncCommunityQuestionsForSubjects(activeSubjects, database.db);
        if (res.addedCount > 0) {
          void queryClient.invalidateQueries({ queryKey: ["questions"] });
          void queryClient.invalidateQueries({ queryKey: ["questions-all-subjects"] });
        }
        return res.addedCount;
      }
    } catch {
      // offline fallback
    }
    return 0;
  }, [database.status, database.db, queryClient]);

  const syncOfflineLibrary = useCallback(async () => {
    if (database.status !== "ready") return;
    try {
      const owner = await database.db.getCurrentOwner();
      const profiles = await database.db.listProfiles();
      const profileId = profiles?.[0]?.id;
      if (owner && profileId) {
        const offlineService = new OfflineLibraryService(database.db.getClient());
        await offlineService.downloadEnabled(owner.id, profileId);
        void queryClient.invalidateQueries({ queryKey: ["offline-library", owner.id, profileId] });
      }
    } catch {
      // silent offline fallback
    }
  }, [database.status, database.db, queryClient]);

  useEffect(() => {
    if (!coordinator) return;

    const unsubscribe = coordinator.subscribe((newStatus, report) => {
      setStatus(newStatus);
      if (report) {
        setLastReport(report);
        void refreshPendingCount();
        if (report.pulledCount > 0 || report.pushedCount > 0) {
          void queryClient.invalidateQueries();
        }
      }
    });

    // Start auto sync and fetch initial pending count for active owner
    database.db
      .getCurrentOwner()
      .then(async (owner) => {
        if (owner) {
          coordinator.startAutoSync(owner.id);
          try {
            const outbox = new OutboxRepository(database.db.getClient());
            const count = await outbox.countPending(owner.id);
            setPendingCount(count);
          } catch {
            // ignore
          }
        } else {
          coordinator.startAutoSync();
        }
      })
      .catch(() => {
        coordinator.startAutoSync();
      });

    // Run community sync & offline library download immediately on startup
    void syncCommunity();
    void syncOfflineLibrary();

    // Periodic sync for community and enabled offline subjects (every 60 seconds)
    const communityInterval = setInterval(() => {
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (typeof document !== "undefined" && document.hidden) return;
      void syncCommunity();
      void syncOfflineLibrary();
    }, 60_000);

    return () => {
      unsubscribe();
      clearInterval(communityInterval);
      coordinator.destroy();
    };
  }, [coordinator, database.db, refreshPendingCount, syncCommunity, syncOfflineLibrary, queryClient]);

  const syncNow = useCallback(async (): Promise<SyncReport> => {
    if (!coordinator) {
      return {
        pushedCount: 0,
        pulledCount: 0,
        errors: ["دیتابیس هنوز آماده نیست."],
        hasConflicts: false,
        completedAt: Date.now(),
      };
    }

    try {
      const owner = await database.db.getCurrentOwner();
      const report = await coordinator.syncNow(owner?.id);
      
      // Also run community sync & offline library download during manual sync fallback
      try {
        const addedCommunityCount = await syncCommunity();
        if (addedCommunityCount > 0) {
          report.pulledCount += addedCommunityCount;
        }
        await syncOfflineLibrary();
      } catch {
        // silent
      }

      setLastReport(report);
      await refreshPendingCount();
      void queryClient.invalidateQueries();
      return report;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        pushedCount: 0,
        pulledCount: 0,
        errors: [message],
        hasConflicts: false,
        completedAt: Date.now(),
      };
    }
  }, [coordinator, database.db, refreshPendingCount, syncCommunity, syncOfflineLibrary, queryClient]);

  const isSyncing = status === "syncing" || status === "pushing" || status === "pulling" || status === "merging";

  const contextValue = useMemo<SyncContextValue>(
    () => ({
      status,
      isOnline,
      isSyncing,
      lastReport,
      pendingCount,
      syncNow,
      refreshPendingCount,
      coordinator,
    }),
    [status, isOnline, isSyncing, lastReport, pendingCount, syncNow, refreshPendingCount, coordinator]
  );

  return <SyncContext.Provider value={contextValue}>{children}</SyncContext.Provider>;
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) {
    // Fallback safe value if rendered outside provider
    return {
      status: "idle",
      isOnline: typeof navigator !== "undefined" ? navigator.onLine : true,
      isSyncing: false,
      lastReport: null,
      pendingCount: 0,
      syncNow: async () => ({
        pushedCount: 0,
        pulledCount: 0,
        errors: [],
        hasConflicts: false,
        completedAt: Date.now(),
      }),
      refreshPendingCount: async () => {},
      coordinator: null,
    };
  }
  return ctx;
}
