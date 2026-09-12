"use client";

import { useEffect, useState } from "react";
import { checkAppUpdate, getDismissedUpdateVersion, type UpdateCheckResult } from "../domain/update-service";
import { UpdateDialog } from "./update-dialog";

export function UpdateNotifier() {
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    // Only show automatic update pop-ups on native apps (Desktop/Android) where binaries must be updated.
    // On the web, browsers seamlessly fetch the latest deployment on visit without disturbing the user.
    let isCancelled = false;

    async function initUpdateCheck() {
      const { checkIsNative } = await import("@/platform/detection");
      const isNative = await checkIsNative();
      if (!isNative || isCancelled) return;

      try {
        const result = await checkAppUpdate();
        if (!isCancelled && result.hasUpdate) {
          const dismissed = getDismissedUpdateVersion();
          // Show dialog if not previously dismissed for this specific version
          if (dismissed !== result.latestVersion) {
            setAvailableUpdate(result);
          }
        }
      } catch {
        // Fail silently in offline mode
      }
    }

    const timer = setTimeout(() => {
      initUpdateCheck();
    }, 3000);

    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, []);

  if (!availableUpdate) return null;

  return (
    <UpdateDialog
      update={availableUpdate}
      onClose={() => setAvailableUpdate(null)}
    />
  );
}
