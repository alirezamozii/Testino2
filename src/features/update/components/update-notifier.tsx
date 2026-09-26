"use client";

import { useEffect, useState } from "react";
import { checkAppUpdate, getDismissedUpdateVersion, type UpdateCheckResult } from "../domain/update-service";
import { UpdateDialog } from "./update-dialog";

export function UpdateNotifier() {
  const [availableUpdate, setAvailableUpdate] = useState<UpdateCheckResult | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function initUpdateCheck() {
      if (isCancelled) return;

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
    }, 2000);

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
