"use client";

import { useEffect } from "react";
import { isCapacitorNative, isDesktopApp } from "@/platform/detection";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

    // Native shells serve the bundle themselves (Capacitor assets / Electron
    // app:// protocol). Registering the SW there double-caches everything:
    // after an app update, stale HTML/chunks kept answering from CacheStorage.
    if (isCapacitorNative() || isDesktopApp()) return;

    if (process.env.NODE_ENV === "production") {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                // Defer update activation if user is actively in an exam session
                const isExamActive =
                  window.location.pathname.includes("/sessions/run") ||
                  sessionStorage.getItem("testino_session_running") === "true";

                if (!isExamActive) {
                  newWorker.postMessage({ type: "SKIP_WAITING" });
                }
              }
            });
          });
        })
        .catch(() => {
          // Storage status remains accurate even if shell caching is unavailable.
        });
    }
  }, []);

  return null;
}
