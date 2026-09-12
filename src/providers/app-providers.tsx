"use client";

import { DatabaseProvider } from "./database-provider";
import { SyncProvider } from "./sync-provider";
import { QueryProvider } from "./query-provider";
import { ThemeProvider } from "./theme-provider";
import { CapacitorLifecycle } from "@/platform/capacitor-lifecycle";
import { UpdateNotifier } from "@/features/update/components/update-notifier";

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryProvider>
        <DatabaseProvider>
          <SyncProvider>
            <CapacitorLifecycle />
            <UpdateNotifier />
            {children}
          </SyncProvider>
        </DatabaseProvider>
      </QueryProvider>
    </ThemeProvider>
  );
}
