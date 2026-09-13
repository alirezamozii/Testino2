import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import { FREEZE_WATCHDOG_INIT } from "./watchdog";

/**
 * Shared real-user navigation helpers.
 * Everything goes through the actual UI (no localStorage shortcuts for state)
 * so the journeys fail exactly where a real user would hit a problem.
 */

export const SPLASH_SKIP_INIT = (): void =>
  sessionStorage.setItem("testino_seen_splash", "true");

/** Standard page boot: watchdog installed first, splash skipped. */
export async function openApp(page: Page, path = "/"): Promise<void> {
  await page.addInitScript(FREEZE_WATCHDOG_INIT);
  await page.addInitScript(SPLASH_SKIP_INIT);
  // Node-side console capture — includes WORKER console messages (SQL audit,
  // restart warnings) which page-init hooks cannot see.
  const pageAny = page as Page & { __testinoLogs?: string[] };
  if (!pageAny.__testinoLogs) {
    pageAny.__testinoLogs = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (/sql-audit|Testino DB|Worker|OPFS|restart|storage/i.test(text)) {
        pageAny.__testinoLogs!.push(`${msg.type()}: ${text.slice(0, 200)}`);
        if (pageAny.__testinoLogs!.length > 40) pageAny.__testinoLogs!.shift();
      }
    });
  }
  await page.goto(path);
}

export const ROUTES = [
  { name: "home", path: "/" },
  { name: "onboarding", path: "/onboarding/" },
  { name: "bank", path: "/bank/" },
  { name: "bank-subjects", path: "/bank/subjects/" },
  { name: "import", path: "/import/" },
  { name: "sessions", path: "/sessions/" },
  { name: "session-new", path: "/sessions/new/" },
  { name: "review", path: "/review/" },
  { name: "analytics", path: "/analytics/" },
  { name: "history", path: "/history/" },
  { name: "goals", path: "/goals/" },
  { name: "ai", path: "/ai/" },
  { name: "settings", path: "/settings/" },
] as const;

/**
 * Completes the full 4-step onboarding through the real UI and lands on the
 * dashboard. Uses the local-only (no cloud) path so tests never depend on
 * Supabase availability.
 */
export async function completeOnboarding(page: Page, subjectName = "مدیریت فناوری اطلاعات"): Promise<void> {
  await openApp(page, "/onboarding/");

  // Step 1 — identity (local profile; cloud is optional by design)
  const nameInput = page.locator('input[placeholder*="نام یا نام خانوادگی"]');
  await nameInput.fill("دانش‌آموز تست");
  // NOTE: both the auth-form submit and the wizard nav button are labelled
  // «ادامه» — .last() targets the wizard nav button deterministically.
  const wizardContinue = page.getByRole("button", { name: "ادامه", exact: true }).last();
  await wizardContinue.click();

  // A previous owner may exist on reused storage — keep it, continue.
  const existingDialog = page.getByText("حساب قبلی شناسایی شد");
  if (await existingDialog.isVisible().catch(() => false)) {
    await page.getByRole("button", { name: /وارد حساب/ }).click();
    await wizardContinue.click();
  }

  // Step 2 — exam & track
  await page.locator('input[placeholder*="کنکور سراسری"]').fill("کنکور ارشد مدیریت");
  await page.locator('input[placeholder*="علوم تجربی"]').fill("مدیریت فناوری اطلاعات");
  await page.getByRole("button", { name: "ادامه", exact: true }).last().click();

  // Step 3 — subjects: add one real subject through the form
  await page.locator('input[placeholder*="زیست"]').fill(subjectName);
  await page.getByRole("button", { name: /افزودن این درس/ }).click();
  await expect(page.getByText(subjectName).first()).toBeVisible();

  // The shared-group editor must be COLLAPSED by default (UX fix regression test)
  await expect(page.getByText("این درس با درس دیگری یک گروه است؟")).toBeVisible();

  await page.getByRole("button", { name: "ادامه", exact: true }).last().click();

  // Step 4 — plan & finish
  await page.getByRole("button", { name: "۶ ماه" }).click();
  await page.getByRole("button", { name: /ورود به داشبورد/ }).click();

  try {
    await expect(page.getByText(/سلام/).first()).toBeVisible({ timeout: 30_000 });
  } catch (error) {
    // Diagnose the dashboard↔onboarding bounce with REAL DB + console state.
    const diag = await page.evaluate(async () => {
      const w = window as unknown as {
        __testinoDb?: { health: () => Promise<unknown>; listProfiles: () => Promise<unknown[]> };
      };
      return w.__testinoDb
        ? { health: await w.__testinoDb.health(), profiles: (await w.__testinoDb.listProfiles()).length }
        : "no-hook";
    }).catch((e) => `hook-failed: ${String(e).slice(0, 80)}`);
    const logs = ((page as Page & { __testinoLogs?: string[] }).__testinoLogs ?? []).slice(-8);
    throw new Error(
      `POST-ONBOARDING bounce: url=${page.url()} db=${JSON.stringify(diag)} logs=[${logs.join(" || ")}] :: ${(error as Error).message.split("\n")[0]}`
    );
  }
}

/**
 * Imports real questions for the profile subject through the actual importer
 * UI (JSON paste path) so exam journeys have enough data to build a session.
 */
export async function importSampleQuestions(page: Page, subject = "مدیریت فناوری اطلاعات", count = 6): Promise<void> {
  const pkg = {
    schemaVersion: "1.0",
    defaults: { subject, chapter: "فصل تست" },
    questions: Array.from({ length: count }, (_, i) => ({
      key: `q-${i + 1}`,
      content: [{ type: "text", value: `سؤال تستی شمارهٔ ${i + 1} چیست؟`, direction: "rtl" }],
      options: ["الف", "ب", "ج", "د"].map((value, index) => ({
        key: `o-${index + 1}`,
        content: [{ type: "text", value }],
      })),
      correctOptionKey: `o-${(i % 4) + 1}`,
      explanation: [],
      shuffleSafe: true,
    })),
  };

  await openApp(page, "/import/");
  // Use the built-in sample first (tests the button), then replace with our
  // multi-question package for the profile subject.
  await page.getByRole("button", { name: "نمونهٔ آموزشی" }).click();
  await page.locator("textarea#json-source").fill(JSON.stringify(pkg));
  await page.getByRole("button", { name: "بررسی و ورود" }).click();
  await expect(page.getByText("گزارش ورود")).toBeVisible();
  await expect(page.getByText(`${count}`).first()).toBeVisible();
}
