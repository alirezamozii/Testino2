import { expect, test } from "@playwright/test";
import { completeOnboarding, openApp } from "../helpers/app";
import {
  attachConsoleHygiene,
  expectNoFreezeOrErrors,
  expectPageResponsive,
} from "../helpers/watchdog";

/**
 * Onboarding journey — asserts REAL state transitions per step (not
 * screenshots). Also locks in the UX fixes:
 *   • «ادامه» short button label on the auth form (was a 30-char sentence)
 *   • password hint lives under the field, placeholder is neutral dots
 *   • shared-group («گروه مشترک») editor collapsed by default
 */
test.describe("onboarding journey", () => {
  test("step 1 shows short labels and local-first identity", async ({ page }) => {
    const hygiene = attachConsoleHygiene(page);
    await openApp(page, "/onboarding/");

    await expect(page.getByRole("heading", { name: "نام خود را وارد کنید" })).toBeVisible();

    // Auth form: short button label + neutral password placeholder + hint below
    await expect(page.getByRole("button", { name: "ادامه", exact: true })).toHaveCount(2); // submit + wizard
    const passwordInput = page.locator('input[type="password"]');
    await expect(passwordInput).toHaveAttribute("placeholder", "••••••");
    await expect(page.getByText("حداقل ۶ کاراکتر")).toBeVisible();

    // Cloud optional badge present (local-first promise)
    await expect(page.getByText("اختیاری").first()).toBeVisible();

    await hygiene.assertClean("onboarding-step1");
    await expectNoFreezeOrErrors(page);
  });

  test("full 4-step onboarding lands on dashboard with real subject data", async ({ page }) => {
    await completeOnboarding(page);

    // Dashboard reflects the onboarding data.
    await expect(page.getByText("مدیریت فناوری اطلاعات").first()).toBeVisible();
    await expect(page.getByText("عملکرد دروس فعال")).toBeVisible();

    // Honest empty state: no fake progress before any exam exists.
    await expect(page.getByText(/با اولین آزمون، پیشرفت واقعی/)).toBeVisible();
    await expect(page.getByText("بدون آزمون").first()).toBeVisible();

    await expectPageResponsive(page);
    await expectNoFreezeOrErrors(page);
  });

  test("profile persists across a full reload (OPFS round-trip)", async ({ page }) => {
    await completeOnboarding(page);

    // Pre-reload sanity: the DB really holds the profile on disk path.
    const before = await page.evaluate(async () => {
      const hook = (window as unknown as { __testinoDb?: { health: () => Promise<unknown>; listProfiles: () => Promise<unknown[]> } }).__testinoDb;
      return hook ? { health: await hook.health(), profiles: (await hook.listProfiles()).length } : null;
    });

    await page.reload();
    try {
      await expect(page.getByText(/سلام/).first()).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText("مدیریت فناوری اطلاعات").first()).toBeVisible();
    } catch (error) {
      // Diagnose: dump real DB state so a storage divergence is obvious.
      const after = await page.evaluate(async () => {
        const hook = (window as unknown as { __testinoDb?: { health: () => Promise<unknown>; listProfiles: () => Promise<unknown[]> } }).__testinoDb;
        return hook ? { health: await hook.health(), profiles: (await hook.listProfiles()).length } : null;
      }).catch(() => null);
      throw new Error(
        `POST-RELOAD bounce. before=${JSON.stringify(before)} after=${JSON.stringify(after)} url=${page.url()} :: ${(error as Error).message.split("\n")[0]}`
      );
    }
    await expectPageResponsive(page);
  });
});
