import { chromium } from "@playwright/test";
import { completeOnboarding, importSampleQuestions, openApp, SPLASH_SKIP_INIT } from "../tests/helpers/app";
import { FREEZE_WATCHDOG_INIT } from "../tests/helpers/watchdog";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: process.env.TESTINO_BASE_URL ?? "http://127.0.0.1:3100" });
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error") console.log("CONSOLE-ERR:", t.slice(0, 200));
    if (/Testino DB|migration|schema|OPFS|memory mode/i.test(t)) console.log("DB-LOG:", t.slice(0, 220));
  });
  page.on("pageerror", (e) => console.log("PAGE-ERR:", e.message.slice(0, 200)));
  try {
    await completeOnboarding(page);
  } catch (e) {
    console.log("ONBOARDING FAILED:", (e as Error).message.slice(0, 300));
    console.log("URL:", page.url());
    console.log("BODY:", (await page.locator("body").innerText()).slice(0, 600).replace(/\n+/g, " | "));
    await page.screenshot({ path: "artifacts/debug-onboarding.png" });
    await browser.close();
    process.exit(2);
  }
  await importSampleQuestions(page);

  await openApp(page, "/sessions/new/");
  await page.waitForTimeout(2500);

  const tile = page.getByRole("button", { name: /مدیریت فناوری اطلاعات/ }).first();
  console.log("tile count:", await page.getByRole("button", { name: /مدیریت فناوری اطلاعات/ }).count());
  console.log("tile class before:", await tile.getAttribute("class"));
  await tile.click();
  await page.waitForTimeout(400);
  console.log("tile class after:", await tile.getAttribute("class"));
  console.log("body has 'انتخاب شده':", await page.getByText("درس انتخاب شده").count());

  const allBtn = page.getByRole("button", { name: /انتخاب تمام درس‌ها/ });
  console.log("allBtn count:", await allBtn.count());
  await allBtn.click();
  await page.waitForTimeout(400);
  console.log("after all-select, 'درس انتخاب شده' text:", await page.getByText(/درس انتخاب شده/).count());

  const cont = page.getByRole("button", { name: "ادامه" });
  console.log("continue count:", await cont.count());
  await cont.last().click();
  await page.waitForTimeout(600);
  console.log("heading now:", await page.locator("h2").first().textContent());

  await browser.close();
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
