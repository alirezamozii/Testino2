"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useMemo } from "react";
import { useDatabase } from "./database-provider";
import { SyncCoordinator } from "@/sync/coordinator";
import type { SyncStatus, SyncReport } from "@/sync/ports";
import { OutboxRepository } from "@/database/repositories/outbox-repository";

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
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [lastReport, setLastReport] = useState<SyncReport | null>(null);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isOnline, setIsOnline] = useState<boolean>(() => {
    if (typeof navigator !== "undefined") return navigator.onLine;
    return true;
  });

  const coordinator = useMemo(() => {
    if (database.status !== "ready") return null;
    return new SyncCoordinator(database.db.getClient());
  }, [database.status, database.db]);

  const refreshPendingCount = useCallback(async () => {
    if (database.status !== "ready") return;
    try {
      const outbox = new OutboxRepository(database.db.getClient());
      const owner = await database.db.getCurrentOwner();
      if (owner) {
        const count = await outbox.countPending(owner.id);
        setPendingCount(count);
      }
    } catch {
      // ignore
    }
  }, [database.status, database.db]);

  useEffect(() => {
    if (!coordinator) return;

    const unsubscribe = coordinator.subscribe((newStatus, report) => {
      setStatus(newStatus);
      if (report) setLastReport(report);
    });

    // Track online/offline browser state
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

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

    return () => {
      unsubscribe();
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      coordinator.destroy();
    };
  }, [coordinator, database.db, refreshPendingCount]);

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
      setLastReport(report);
      await refreshPendingCount();
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
  }, [coordinator, database.db, refreshPendingCount]);

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
