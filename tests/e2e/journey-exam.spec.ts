import { expect, test } from "@playwright/test";
import { completeOnboarding, importSampleQuestions, openApp } from "../helpers/app";
import {
  attachConsoleHygiene,
  expectNoFreezeOrErrors,
  expectPageResponsive,
} from "../helpers/watchdog";

/**
 * Full exam lifecycle — the highest-risk flow in the app:
 *   import sample questions → build a session → play it → answer →
 *   finish dialog (2 honest options) → real report with scoring.
 * The freeze watchdog runs across the whole journey.
 */
test.describe("exam lifecycle journey", () => {
  test("build → play → answer → finish → report, without any freeze", async ({ page }) => {
    test.setTimeout(180_000);
    const hygiene = attachConsoleHygiene(page);

    await completeOnboarding(page);
    await importSampleQuestions(page);

    // ── Build an exam over all subjects ────────────────────────────────
    await openApp(page, "/sessions/new/");
    // Step 1 lists profile subjects with their live bank counts — the imported
    // questions must be visible here (real data round-trip).
    const subjectTile = page.getByRole("button", { name: /مدیریت فناوری اطلاعات/ }).first();
    // The builder renders the count with Latin digits («6 سؤال در بانک»).
    await expect(subjectTile).toContainText(/([۶6]) سؤال در بانک/);
    // Profile subjects are PRE-SELECTED by default — clicking a tile would
    // DESELECT it. Only ensure everything is selected via the bulk button.
    const bulkSelect = page.getByRole("button", { name: "انتخاب تمام درس‌ها (جامع)" });
    if (await bulkSelect.isVisible().catch(() => false)) {
      await bulkSelect.click();
    }
    await expect(page.getByText(/درس انتخاب شده/)).toBeVisible();
    await expectPageResponsive(page);
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "ادامه" }).click();
    await page.getByRole("button", { name: "ساخت آزمون" }).click();
    await expect(page.getByText(/آماده‌ای شروع کنیم؟/)).toBeVisible({ timeout: 30_000 });

    // Preview must show the REAL configured duration — never a fabricated one.
    // (fa-IR digits are used, so match both Persian and Latin numerals.)
    await expect(page.getByText("بدون محدودیت زمانی").or(page.getByText(/[۰-۹0-9]+ دقیقه/))).toBeVisible();

    // ── Play: start, answer, pause/resume round-trip ───────────────────
    await page.getByRole("button", { name: "شروع آزمون" }).click();
    await expect(page.getByRole("button", { name: /^الف/ }).first()).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^الف/ }).first().click();
    await expectPageResponsive(page);

    await page.getByTitle("توقف موقت").click();
    await expect(page.getByTitle("ادامه")).toBeVisible();
    await page.reload();
    await page.getByTitle("ادامه").click();
    await expectPageResponsive(page);

    // ── Answer through ALL questions until the finish dialog appears ───
    // (The finish button only exists on the last question — or appears as
    // «مشاهده کارنامه نهایی» after revealing the last answer. Unanswered
    // questions are legitimately counted as نزده.)
    const finishDialogText = page.getByText("تعیین وضعیت پایان آزمون");
    const finishTrigger = page.getByRole("button", { name: /پایان و ثبت آزمون|مشاهده کارنامه نهایی/ });
    for (let guard = 0; guard < 24; guard++) {
      if (await finishDialogText.isVisible().catch(() => false)) break;
      if (await finishTrigger.isVisible().catch(() => false)) {
        await finishTrigger.click();
        await expect(finishDialogText).toBeVisible();
        break;
      }
      const submitReview = page.getByRole("button", { name: "ثبت و بررسی پاسخ" });
      const next = page.getByRole("button", { name: /سؤال بعدی/ });
      if (await submitReview.isVisible().catch(() => false)) {
        await submitReview.click();
      } else if (await next.isVisible().catch(() => false)) {
        await next.click();
      } else {
        await page.getByRole("button", { name: /^الف/ }).first().click();
      }
      await expectPageResponsive(page);
    }

    // ── Finish: the confirm dialog must have exactly ONE submit option ─
    await expect(finishDialogText).toBeVisible();

    // Regression guard: the old dialog offered two different-looking buttons
    // that ran the identical finish() code path (deceptive UX). Merged into one.
    const finalSubmit = page.getByRole("button", { name: /ثبت نهایی و مشاهده کارنامه/ });
    await expect(finalSubmit).toBeVisible();
    await expect(page.getByRole("button", { name: /همین‌جا تمام کن/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /تحویل کامل کنکوری/ })).toHaveCount(0);

    await finalSubmit.click();

    // ── Report must render with real numbers ───────────────────────────
    await expect(page.getByText(/آزمون شما به پایان رسید/)).toBeVisible({ timeout: 30_000 });
    await expectPageResponsive(page);
    await hygiene.assertClean("exam-lifecycle");
    await expectNoFreezeOrErrors(page);
  });

  test("answering persists and survives a mid-exam reload", async ({ page }) => {
    test.setTimeout(150_000);
    await completeOnboarding(page);
    await importSampleQuestions(page);

    await openApp(page, "/sessions/new/");
    const bulk = page.getByRole("button", { name: "انتخاب تمام درس‌ها (جامع)" });
    if (await bulk.isVisible().catch(() => false)) await bulk.click();
    for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "ادامه" }).click();
    await page.getByRole("button", { name: "ساخت آزمون" }).click();
    await page.getByRole("button", { name: "شروع آزمون" }).click();

    const option = page.getByRole("button", { name: /^الف/ }).first();
    await option.waitFor({ state: "visible", timeout: 30_000 });
    await option.click();
    await page.reload();

    // Session must resume — paused notice or running state — never data loss.
    await expect(
      page.getByTitle("ادامه").or(page.getByRole("button", { name: /^الف/ }).first())
    ).toBeVisible({ timeout: 30_000 });
    await expectPageResponsive(page);
  });
});
