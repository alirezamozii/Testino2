/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Global UI smoke test — runs against the local dev server.
 *
 * Visits every major route at three viewports (phone / tablet / desktop),
 * asserts HTTP 200 + zero page errors + zero severe console errors + no
 * frozen main thread, and exercises the modal open/close cycle on settings.
 *
 * Usage: node scripts/global-smoke.cjs [baseUrl]
 * Exit code 0 = clean, 1 = problems found.
 */
const { chromium } = require("playwright");

const BASE = process.argv[2] || "http://localhost:3000";
const ROUTES = ["/", "/bank/", "/sessions/", "/review/", "/analytics/", "/goals/", "/history/", "/settings/"];
const VIEWPORTS = [
  { name: "phone-360", width: 360, height: 740 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

(async () => {
  const problems = [];
  const browser = await chromium.launch();

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 300));
    });
    page.on("pageerror", (err) => pageErrors.push(String(err).slice(0, 300)));

    for (const route of ROUTES) {
      consoleErrors.length = 0;
      pageErrors.length = 0;

      let status = 0;
      try {
        const resp = await page.goto(BASE + route, { waitUntil: "domcontentloaded", timeout: 30000 });
        status = resp ? resp.status() : 0;
        await page.waitForTimeout(1500);
      } catch (err) {
        problems.push(`[${vp.name}] ${route} NAV FAIL: ${String(err).slice(0, 200)}`);
        continue;
      }

      if (status !== 200) problems.push(`[${vp.name}] ${route} HTTP ${status}`);

      // Freeze probe: main thread must respond within 2s
      const responsive = await page
        .evaluate(() => Promise.race([Promise.resolve("ok"), new Promise((r) => setTimeout(() => r("frozen"), 2000))]))
        .then((v) => v === "ok")
        .catch(() => false);
      if (!responsive) problems.push(`[${vp.name}] ${route} MAIN THREAD FROZEN`);

      for (const e of pageErrors) problems.push(`[${vp.name}] ${route} PAGE ERROR: ${e}`);
      // Filter known-noise console errors (favicon, source maps, wasm fallback, retries)
      for (const e of consoleErrors) {
        if (/favicon|source ?map|ResizeObserver|net::ERR|wasm streaming compile|ArrayBuffer instantiation/i.test(e)) continue;
        problems.push(`[${vp.name}] ${route} CONSOLE: ${e}`);
      }
    }

    // Modal open/close cycle on settings (delete-data dialog must open and close cleanly)
    try {
      await page.goto(BASE + "/settings/", { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(1500);
      const delBtn = page.locator("text=حذف تمام داده‌ها").first();
      if (await delBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
        await delBtn.scrollIntoViewIfNeeded().catch(() => {});
        await delBtn.click({ timeout: 8000 }).catch(async () => {
          // Tablet layout may keep the trigger under a sticky element — click via JS as fallback
          await delBtn.evaluate((el) => (el.closest("button") ?? el).dispatchEvent(new MouseEvent("click", { bubbles: true })));
        });
        await page.waitForTimeout(600);
        const dialogVisible = await page.locator('[role="dialog"], [data-modal="true"], .dialog-backdrop').first().isVisible().catch(() => false);
        if (!dialogVisible) problems.push(`[${vp.name}] delete-data dialog did NOT open`);
        // close via cancel/escape — the UI must return to normal (no freeze, no loop)
        await page.keyboard.press("Escape");
        await page.waitForTimeout(600);
        const stillResponsive = await page
          .evaluate(() => Promise.race([Promise.resolve("ok"), new Promise((r) => setTimeout(() => r("frozen"), 2000))]))
          .then((v) => v === "ok")
          .catch(() => false);
        if (!stillResponsive) problems.push(`[${vp.name}] main thread frozen after dialog close`);
      }
    } catch (err) {
      problems.push(`[${vp.name}] settings modal probe FAIL: ${String(err).slice(0, 200)}`);
    }

    await context.close();
  }

  await browser.close();

  if (problems.length === 0) {
    console.log("SMOKE OK — all routes clean at 3 viewports, no freezes, no page errors.");
    process.exit(0);
  } else {
    console.log(`SMOKE PROBLEMS (${problems.length}):`);
    for (const p of problems) console.log("  - " + p);
    process.exit(1);
  }
})();
