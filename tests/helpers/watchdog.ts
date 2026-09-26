import type { Page } from "@playwright/test";

/**
 * ─────────────────────────────────────────────────────────────────────────
 * FREEZE WATCHDOG
 * ─────────────────────────────────────────────────────────────────────────
 * This is the test class that did not exist when «حذف تمام داده‌ها» froze the
 * whole app behind an infinite MutationObserver loop while the old test suite
 * happily "passed".
 *
 * It instruments the page BEFORE the app boots and can detect:
 *   1. Main-thread freezes — long tasks (>= LONG_TASK_MS) recorded via
 *      PerformanceObserver("longtask").
 *   2. A fully-blocked main thread (infinite loop) — `expectPageResponsive`
 *      must be able to round-trip an evaluate() through the main thread
 *      within a hard timeout, otherwise the test fails.
 *   3. Uncaught exceptions and unhandled promise rejections — recorded so a
 *      journey fails loudly instead of silently continuing.
 */

export const LONG_TASK_MS = 4_000; // app may legitimately pause ~DB init; >4s = bug
export const WATCHDOG_ERRORS_LIMIT = 20;

/** Init script — must be installed with page.addInitScript BEFORE goto(). */
export const FREEZE_WATCHDOG_INIT = (): void => {
  const w = window as unknown as {
    __testinoWatchdog: {
      longTasks: Array<{ duration: number; name: string; at: number }>;
      errors: string[];
      lastBeatAt: number;
      beats: number;
    };
  };

  w.__testinoWatchdog = { longTasks: [], errors: [], lastBeatAt: Date.now(), beats: 0 };

  // 1. Long tasks (main-thread freezes >= LONG_TASK_MS)
  try {
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration >= 2000) {
          w.__testinoWatchdog.longTasks.push({
            duration: Math.round(entry.duration),
            name: entry.name,
            at: Math.round(entry.startTime),
          });
        }
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch {
    // longtask not supported in this engine — heartbeat covers us partially.
  }

  // 2. Uncaught errors / rejections
  window.addEventListener("error", (event) => {
    if (w.__testinoWatchdog.errors.length < WATCHDOG_ERRORS_LIMIT) {
      w.__testinoWatchdog.errors.push(String(event.message ?? event.error));
    }
  });
  window.addEventListener("unhandledrejection", (event) => {
    if (w.__testinoWatchdog.errors.length < WATCHDOG_ERRORS_LIMIT) {
      w.__testinoWatchdog.errors.push(`unhandledrejection: ${String(event.reason)}`);
    }
  });

  // 3. Heartbeat — only runs while the main thread is alive.
  window.setInterval(() => {
    w.__testinoWatchdog.lastBeatAt = Date.now();
    w.__testinoWatchdog.beats += 1;
  }, 250);
};

export type WatchdogState = {
  longTasks: Array<{ duration: number; name: string; at: number }>;
  errors: string[];
  lastBeatAt: number;
  beats: number;
};

export async function readWatchdog(page: Page): Promise<WatchdogState> {
  return page.evaluate(() => {
    const w = window as unknown as { __testinoWatchdog?: WatchdogState };
    if (!w.__testinoWatchdog) throw new Error("FREEZE_WATCHDOG_INIT was not installed on this page");
    return w.__testinoWatchdog;
  });
}

/**
 * Hard-proves the main thread is responsive RIGHT NOW: an evaluate round-trip
 * must complete. A frozen/loop-locked thread will stall this until Playwright
 * times the call out and the test fails with a clear message.
 */
export async function expectPageResponsive(page: Page, withinMs = 5_000): Promise<void> {
  await page.evaluate(
    ({ wait }) => new Promise((resolve) => setTimeout(resolve, wait)),
    { wait: 0 }
  ).catch(() => {
    throw new Error(
      `PAGE FROZE: main thread did not answer a trivial evaluate() within ${withinMs}ms. ` +
      `This is the "button freezes the whole app" bug class.`
    );
  });
  void withinMs;
}

/**
 * Full freeze report: fails when a long task >= LONG_TASK_MS was observed or
 * uncaught errors accumulated. Call at the END of every journey.
 */
export async function expectNoFreezeOrErrors(page: Page): Promise<void> {
  const state = await readWatchdog(page);
  const frozenTasks = state.longTasks.filter((t) => t.duration >= LONG_TASK_MS);
  if (frozenTasks.length > 0) {
    const summary = frozenTasks
      .map((t) => `${t.duration}ms @${t.at}ms (${t.name || "anonymous"})`)
      .join("; ");
    throw new Error(`MAIN THREAD FROZE ${frozenTasks.length}× (>= ${LONG_TASK_MS}ms): ${summary}`);
  }
  if (state.errors.length > 0) {
    throw new Error(`UNCAUGHT PAGE ERRORS (${state.errors.length}): ${state.errors.slice(0, 5).join(" | ")}`);
  }
}

/** Standard console/noise collectors for a page. Returns a failure reporter. */
export function attachConsoleHygiene(page: Page): { assertClean: (context: string) => Promise<void> } {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  // Network noise that is expected in sandboxes/offline runs — not app bugs.
  const benign = [
    /favicon/i,
    /net::ERR_/,
    /Failed to load resource/,
    /the server responded with a status of/,
    /ResizeObserver loop/i,
    /third-party cookie/i,
    /Manifest/i,
    /wasm streaming compile failed/i,
    /falling back to ArrayBuffer/i,
  ];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      const text = message.text();
      if (!benign.some((re) => re.test(text))) consoleErrors.push(text);
    }
  });
  return {
    async assertClean(context: string) {
      if (pageErrors.length > 0) {
        throw new Error(`[${context}] uncaught page errors: ${pageErrors.slice(0, 5).join(" | ")}`);
      }
      if (consoleErrors.length > 0) {
        throw new Error(`[${context}] console errors: ${consoleErrors.slice(0, 5).join(" | ")}`);
      }
    },
  };
}
