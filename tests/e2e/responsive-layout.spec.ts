import { expect, test } from "@playwright/test";

const routes = [
  { name: "home", path: "/" },
  { name: "onboarding", path: "/onboarding/" },
  { name: "bank", path: "/bank/" },
  { name: "bank-subjects", path: "/bank/subjects/" },
  { name: "bank-subject", path: "/bank/subject/" },
  { name: "bank-topic", path: "/bank/topic/" },
  { name: "bank-question", path: "/bank/question/" },
  { name: "import", path: "/import/" },
  { name: "sessions", path: "/sessions/" },
  { name: "session-new", path: "/sessions/new/" },
  { name: "session-run", path: "/sessions/run/" },
  { name: "review", path: "/review/" },
  { name: "analytics", path: "/analytics/" },
  { name: "history", path: "/history/" },
  { name: "goals", path: "/goals/" },
  { name: "ai", path: "/ai/" },
  { name: "settings", path: "/settings/" },
];

for (const viewport of [
  { name: "mobile", width: 360, height: 800 },
  { name: "laptop", width: 1280, height: 800 },
]) {
  test(`${viewport.name} routes fit without page overflow`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const runtimeErrors: string[] = [];
    page.on("pageerror", (error) => runtimeErrors.push(error.message));

    for (const route of routes) {
      await page.goto(route.path);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("body")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        page: document.documentElement.scrollWidth,
      }));
      expect(dimensions.page, `${route.path} creates horizontal overflow`).toBeLessThanOrEqual(dimensions.viewport + 1);
      await page.screenshot({
        path: `artifacts/responsive/${viewport.name}-${route.name}.png`,
        fullPage: true,
      });
    }

    expect(runtimeErrors).toEqual([]);
  });
}
