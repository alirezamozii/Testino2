"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Registers Capacitor native listeners ONCE for the app's lifetime.
 *
 * Previously this effect re-ran on EVERY route change ([pathname] dep). If a
 * navigation happened before the async dynamic imports resolved, cleanup ran
 * with the disposer still undefined and the in-flight setup registered its
 * listeners afterwards → one leaked pair per navigation. Symptom on Android:
 * the back button fired N confirm dialogs and N× history.back().
 */
export function CapacitorLifecycle() {
  // Read the live route through a ref so the listeners stay registered once.
  const pathnameRef = useRef<string>("/");
  const pathname = usePathname();

  // Keep the ref current after each render (writing refs during render is unsafe)
  useEffect(() => {
    pathnameRef.current = pathname || "/";
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;
    let dispose: (() => void) | null = null;

    async function setupCapacitor() {
      try {
        const { Capacitor } = await import("@capacitor/core");
        if (!Capacitor.isNativePlatform() || cancelled) return;

        const { App } = await import("@capacitor/app");

        const backListener = await App.addListener("backButton", ({ canGoBack }) => {
          const pathname = pathnameRef.current;
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

        if (cancelled) {
          void backListener.remove();
          return;
        }

        const stateListener = await App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            // App went to background - dispatch event for active timers to pause/checkpoint
            window.dispatchEvent(new CustomEvent("testino:app-background"));
          } else {
            // App returned to foreground
            window.dispatchEvent(new CustomEvent("testino:app-foreground"));
          }
        });

        // OAuth return path: Google finishes in the system browser and
        // re-opens the app via app.testino.mobile://auth/callback. Route the
        // URL through the SPA so supabase-js detectSessionInUrl completes the
        // PKCE exchange in-app (without this the browser dead-ended).
        const urlListener = await App.addListener("appUrlOpen", ({ url: openedUrl }) => {
          // Close the Custom Tabs view the sign-in flow opened.
          try {
            void import("@capacitor/browser").then(({ Browser }) => Browser.close()).catch(() => {});
          } catch {
            // plugin not available — ignore
          }
          try {
            const parsed = new URL(openedUrl);
            const path = `${parsed.host || ""}${parsed.pathname}`.replace(/\/+$/, "");
            const query = parsed.search || "";
            window.location.assign(`/${path}${query}` || "/");
          } catch {
            window.location.assign("/");
          }
        });

        if (cancelled) {
          void backListener.remove();
          void stateListener.remove();
          void urlListener.remove();
          return;
        }

        dispose = () => {
          void backListener.remove();
          void stateListener.remove();
          void urlListener.remove();
        };
      } catch {
        // Fallback silently if not in Capacitor native container
      }
    }

    setupCapacitor();

    return () => {
      cancelled = true;
      if (dispose) dispose();
      dispose = null;
    };
  }, []);

  return null;
}
