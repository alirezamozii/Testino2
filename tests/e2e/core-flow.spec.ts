import { expect, test } from "@playwright/test";
import { openApp } from "../helpers/app";
import { expectPageResponsive } from "../helpers/watchdog";

/**
 * Fresh-visitor journey: the app must route a profileless user into
 * onboarding automatically (app-shell redirect) with the identity form
 * rendering. Deep flows live in journey-* specs.
 */
test("fresh visitor is routed into onboarding automatically", async ({ page }) => {
  await openApp(page, "/");

  // Profileless users are auto-redirected to /onboarding by the app shell.
  await page.waitForURL(/onboarding/, { timeout: 20_000 });

  // Onboarding step 1 must render its identity form.
  await expect(page.getByRole("heading", { name: "نام خود را وارد کنید" })).toBeVisible({ timeout: 20_000 });
  await expectPageResponsive(page);
});
