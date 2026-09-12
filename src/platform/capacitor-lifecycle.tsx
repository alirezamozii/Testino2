"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

export function CapacitorLifecycle() {
  const pathname = usePathname();

  useEffect(() => {
    let removeListener: (() => void) | undefined;

    async function setupCapacitor() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform()) return;

        const { App } = await import("@capacitor/app");

        const backListener = await App.addListener("backButton", ({ canGoBack }) => {
          // If currently inside an active test run, confirm before exiting
          if (pathname.includes("/sessions/run")) {
            const confirmLeave = window.confirm("آیا می‌خواهید از آزمون جاری خارج شوید؟");
            if (!confirmLeave) return;
          }

          if (canGoBack && pathname !== "/") {
            window.history.back();
          } else {
            App.exitApp();
          }
        });

        const stateListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            // App went to background - dispatch event for active timers to pause/checkpoint
            window.dispatchEvent(new CustomEvent("testino:app-background"));
          } else {
            // App returned to foreground
            window.dispatchEvent(new CustomEvent("testino:app-foreground"));
          }
        });

        removeListener = () => {
          backListener.remove();
          stateListener.remove();
        };
      } catch {
        // Fallback silently if not in Capacitor native container
      }
    }

    setupCapacitor();

    return () => {
      if (removeListener) removeListener();
    };
  }, [pathname]);

  return null;
}
