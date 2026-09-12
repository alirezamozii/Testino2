"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

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
                  window.location.pathname.includes("/sessions/play") ||
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
