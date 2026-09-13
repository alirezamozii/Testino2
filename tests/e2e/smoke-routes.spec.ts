import { expect, test } from "@playwright/test";
import { ROUTES, openApp } from "../helpers/app";
import { attachConsoleHygiene, expectNoFreezeOrErrors, expectPageResponsive } from "../helpers/watchdog";

/**
 * Route smoke + freeze sweep — runs on desktop, mobile AND tablet projects.
 * For every route of the app:
 *   1. the page must become interactive,
 *   2. the main thread must answer (no boot freeze / infinite loop),
 *   3. no uncaught page errors,
 *   4. no unexpected console errors.
 * A newly added route that hangs the app will fail here automatically.
 */

test.describe("route smoke & freeze sweep", () => {
  for (const route of ROUTES) {
    test(`route ${route.path} loads, responds, stays clean`, async ({ page }) => {
      const hygiene = attachConsoleHygiene(page);
      await openApp(page, route.path);

      // The app shell must render something interactive.
      await expect(page.locator("body")).toBeVisible();

      // Main thread alive? (would hang here on an infinite-loop freeze)
      await expectPageResponsive(page);

      // Give async boot (SQLite OPFS open + queries) a moment, then re-check.
      await page.waitForLoadState("networkidle").catch(() => undefined);
      await expectPageResponsive(page);

      await hygiene.assertClean(route.path);
      await expectNoFreezeOrErrors(page);
    });
  }

  test("rapid navigation across all routes never wedges the app", async ({ page }) => {
    await openApp(page, ROUTES[0].path);
    for (let pass = 0; pass < 2; pass++) {
      for (const route of ROUTES) {
        await page.goto(route.path);
        await expectPageResponsive(page, 8_000);
      }
    }
    await expectPageResponsive(page);
  });
});
