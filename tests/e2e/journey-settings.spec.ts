import { expect, test } from "@playwright/test";
import { completeOnboarding, openApp } from "../helpers/app";
import {
  attachConsoleHygiene,
  expectNoFreezeOrErrors,
  expectPageResponsive,
} from "../helpers/watchdog";

/**
 * Settings journeys — includes THE regression test for the original
 * «حذف تمام داده‌ها» freeze (infinite MutationObserver loop that locked the
 * app whenever any modal opened).
 *
 * Every modal open + every destructive action is followed by a hard
 * `expectPageResponsive` round-trip: if the UI ever locks again, the test
 * fails here — not in front of a user.
 */

test.describe("settings & destructive actions", () => {
  test.beforeEach(async ({ page }) => {
    await completeOnboarding(page);
  });

  test("subject edit inputs persist to the database and back", async ({ page }) => {
    await openApp(page, "/settings/");

    // The settings subject manager shows our onboarding subject.
    const subjectRow = page.getByText("مدیریت فناوری اطلاعات").first();
    await expect(subjectRow).toBeVisible();

    // The shared-group input must NOT be visible by default (UX fix):
    // only a small "گروه مشترک" toggle button is shown.
    const groupToggle = page.getByRole("button", { name: /گروه مشترک با درس دیگر/ });
    await expect(groupToggle).toBeVisible();

    // Opening the editor reveals the input — and it round-trips.
    await groupToggle.click();
    const groupInput = page.getByLabel(/گروه مشترک مدیریت/);
    await expect(groupInput).toBeVisible();
    await groupInput.fill("مدیریت");
    await groupInput.blur();
    await expect(page.getByText("گروه ذخیره شد.")).toBeVisible();
    await expectPageResponsive(page);
  });

  test("delete-all-data modal opens, stays interactive, and resets the app", async ({ page }) => {
    await openApp(page, "/settings/");

    // Open the dangerous modal — the exact action that used to freeze the app.
    await page.getByRole("button", { name: /حذف تمام داده‌ها/ }).click();

    // Modal must be up AND the main thread must still answer.
    await expect(page.getByText("آیا از حذف تمام داده‌ها مطمئن هستید؟")).toBeVisible();
    await expectPageResponsive(page);

    await page.getByRole("button", { name: "بله، همه داده‌ها را پاک کن" }).click();

    // The reset must actually happen: redirected to onboarding within 25s…
    await page.waitForURL(/onboarding/, { timeout: 25_000 });

    // …and the app must remain fully responsive afterwards (no zombie lock).
    await expectPageResponsive(page);
    await expect(page.locator("body")).toBeVisible();
  });

  test("cancel path of delete-all-data keeps profile intact", async ({ page }) => {
    await openApp(page, "/settings/");
    await page.getByRole("button", { name: /حذف تمام داده‌ها/ }).click();
    await expectPageResponsive(page);

    const cancelButton = page.getByRole("button", { name: /انصراف|لغو/ }).first();
    await cancelButton.click();
    await expect(cancelButton).toBeHidden();

    // Profile data survived.
    await expect(page.getByText("مدیریت فناوری اطلاعات").first()).toBeVisible();
    await expectPageResponsive(page);
  });

  test("theme toggle + persistence section remain interactive", async ({ page }) => {
    const hygiene = attachConsoleHygiene(page);
    await openApp(page, "/settings/");

    const nightBtn = page.getByRole("button", { name: /شب/ }).first();
    await nightBtn.click();
    await expectPageResponsive(page);
    const dayBtn = page.getByRole("button", { name: /روز/ }).first();
    await dayBtn.click();
    await expectPageResponsive(page);

    // Storage-persistence row renamed without engine jargon (UX fix regression).
    await expect(page.getByText("حافظهٔ دائمی روی دستگاه")).toBeVisible();
    await expect(page.getByText(/SQLite|OPFS/)).toHaveCount(0);

    await hygiene.assertClean("settings-interactions");
    await expectNoFreezeOrErrors(page);
  });
});
