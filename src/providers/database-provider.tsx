"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { AppDatabase, getAppDatabase } from "@/database/app-database";

type DatabaseState =
  | { status: "loading"; db: AppDatabase }
  | { status: "ready"; db: AppDatabase }
  | { status: "error"; db: AppDatabase; message: string };

const DatabaseContext = createContext<DatabaseState | null>(null);

export function DatabaseProvider({ children }: { children: React.ReactNode }) {
  const db = useMemo(() => getAppDatabase(), []);
  const [state, setState] = useState<DatabaseState>({ status: "loading", db });

  useEffect(() => {
    let active = true;
    db.open().then(() => active && setState({ status: "ready", db })).catch((error) => {
      if (active) setState({ status: "error", db, message: error instanceof Error ? error.message : "ذخیره‌سازی آماده نشد." });
    });
    return () => { active = false; };
  }, [db]);

  return <DatabaseContext.Provider value={state}>{children}</DatabaseContext.Provider>;
}

export function useDatabase() {
  const value = useContext(DatabaseContext);
  if (!value) throw new Error("DatabaseProvider نصب نشده است.");
  return value;
}
