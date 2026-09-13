"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppDatabase, getAppDatabase } from "@/database/app-database";
import type { DatabaseHealth } from "@/database/ports";

type DatabaseState =
  | { status: "loading"; db: AppDatabase; storage?: undefined }
  | { status: "ready"; db: AppDatabase; storage: "opfs" | "native" | "memory" }
  | { status: "error"; db: AppDatabase; message: string; storage?: undefined };

const DatabaseContext = createContext<DatabaseState | null>(null);

async function probeStorage(db: AppDatabase): Promise<"opfs" | "native" | "memory"> {
  try {
    const health: DatabaseHealth = await db.health();
    // A failing health probe used to be reported as opfs-ready (faked success);
    // trust ok===false and fall through to memory so the amber badge shows.
    if (health.ok === false) return "memory";
    return health.storage;
  } catch {
    return "memory";
  }
}

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const db = useMemo(() => getAppDatabase(), []);
  const [state, setState] = useState<DatabaseState>({ status: "loading", db });

  useEffect(() => {
    let active = true;

    /**
     * Divergent-copy guard (silent data loss class):
     * A worker restart / SAHPool reopen can hand back a fresh, EMPTY but
     * migrated copy (observed in E2E: onboarding write verified, then
     * profiles=0 with healthy opfs). When the onboarding-completed marker
     * exists but the DB suddenly holds neither profiles nor owners, reopen
     * once (a fresh open usually re-associates the correct pool slot) and if
     * the data is still gone, fail LOUDLY instead of showing a wiped app.
     */
    async function guardAgainstDivergentCopy(): Promise<string | null> {
      if (typeof window === "undefined") return null;
      let completedMarker = false;
      try {
        completedMarker = window.localStorage.getItem("testino_onboarding_completed") === "true";
      } catch { /* ignore */ }
      if (!completedMarker) return null;

      try {
        const [profiles, owner] = await Promise.all([db.listProfiles(), db.getCurrentOwner()]);
        if (profiles.length > 0 || owner) return null; // data intact

        // One reopen-and-recheck cycle before alarming the user.
        db.close();
        await db.open();
        const [profiles2, owner2] = await Promise.all([db.listProfiles(), db.getCurrentOwner()]);
        if (profiles2.length > 0 || owner2) return null;

        return (
          "حافظهٔ اصلی برنامه در دسترس نیست و نسخهٔ خالی بارگذاری شده است. " +
          "برای جلوگیری از از دست رفتن داده‌ها، صفحه را دوباره باز کنید یا از تنظیمات پشتیبان بگیرید."
        );
      } catch {
        return null; // probe failure must not block boot; actions will surface errors
      }
    }

    db.open()
      .then(async () => {
        if (!active) return;
        const storage = await probeStorage(db);
        if (!active) return;
        const divergence = storage === "opfs" ? await guardAgainstDivergentCopy() : null;
        if (!active) return;
        if (divergence) {
          setState({ status: "error", db, message: divergence });
          return;
        }
        setState({ status: "ready", db, storage });
      })
      .catch((error) => {
        if (active) setState({ status: "error", db, message: error instanceof Error ? error.message : "ذخیره‌سازی آماده نشد." });
      });

    // Graceful shutdown: release OPFS sync access handles on page unload so the
    // next load (reload/new tab) can acquire them immediately without falling
    // back to volatile memory storage.
    const handleUnload = () => {
      try { db.close(); } catch { /* ignore */ }
    };

    // bfcache restore (Safari/Firefox back-nav, iOS PWA resume): the pagehide
    // handler CLOSED the database, but the provider effect does not re-run on
    // restore — every action then failed with StorageUnavailableError while
    // the UI looked "ready". Re-open and refresh the storage badge instead.
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      db.open()
        .then(async () => {
          if (!active) return;
          const storage = await probeStorage(db);
          if (active) setState({ status: "ready", db, storage });
        })
        .catch(() => {
          // keep previous state; individual actions will surface errors
        });
    };

    // Worker crash recovery may change the storage mode after boot (restart
    // landed in memory mode etc.) — keep the badge honest AND re-run the
    // divergent-copy guard: a mid-session restart is exactly when a stale
    // pool slot can silently replace the user's database.
    const handleStorageModeChanged = (event: Event) => {
      if (!active) return;
      const detail = (event as CustomEvent<{ storage?: "opfs" | "native" | "memory" }>).detail;
      if (!detail?.storage) return;
      void (async () => {
        if (detail.storage === "opfs") {
          const divergence = await guardAgainstDivergentCopy();
          if (!active) return;
          if (divergence) {
            setState({ status: "error", db, message: divergence });
            return;
          }
        }
        setState((prev) => (prev.status === "ready" ? { ...prev, storage: detail.storage! } : prev));
      })();
    };

    window.addEventListener("pagehide", handleUnload);
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("testino:storage-mode-changed", handleStorageModeChanged);

    // Testability hook — lets E2E tests assert on real DB state (health,
    // schema version, profiles) instead of guessing from the UI.
    if (typeof window !== "undefined") {
      (window as unknown as { __testinoDb?: unknown }).__testinoDb = {
        health: () => db.health(),
        listProfiles: () => db.listProfiles(),
      };
    }

    return () => {
      active = false;
      delete (window as unknown as { __testinoDb?: unknown }).__testinoDb;
      window.removeEventListener("pagehide", handleUnload);
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("testino:storage-mode-changed", handleStorageModeChanged);
    };
  }, [db]);

  return <DatabaseContext.Provider value={state}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const value = useContext(DatabaseContext);
  if (!value) throw new Error("DatabaseProvider نصب نشده است.");
  return value;
}
