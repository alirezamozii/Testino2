import { test } from "@playwright/test";
import path from "node:path";

const artifactDir = "C:/Users/Mozart/.gemini/antigravity/brain/4cee78b9-76a5-4475-ad72-482d915f5e48";

test("capture full screenshots of Testino app", async ({ page }) => {
  test.setTimeout(90000);
  await page.addInitScript(() => sessionStorage.setItem("testino_seen_splash", "true"));
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. Landing
  await page.goto("/");
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_01_landing.png") });

  // 2. Onboarding
  const createProfileBtn = page.getByRole("link", { name: "ساخت اولین پروفایل" });
  if (await createProfileBtn.isVisible()) {
    await createProfileBtn.click();
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "screenshot_02_onboarding_welcome.png") });

    // Step 1: continue to field selection
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "screenshot_03_field_selection.png") });

    // Step 2: select field & continue
    await page.getByRole("button", { name: "مدیریت فناوری اطلاعات" }).click();
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "screenshot_04_subjects_coefficients.png") });

    // Step 3: subjects confirmed, continue to targets
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "screenshot_05_targets.png") });

    // Step 4: targets confirmed, continue to summary/ready
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "screenshot_05b_summary.png") });

    // Step 5: enter dashboard
    await page.getByRole("button", { name: "ورود به داشبورد" }).click();
    await page.waitForTimeout(1500);
  }

  // 3. Dashboard
  await page.screenshot({ path: path.join(artifactDir, "screenshot_06_dashboard.png") });

  // 4. Bank
  await page.goto("/bank/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_07_bank.png") });

  // 5. Import questions
  await page.goto("/import/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_08_import_page.png") });
  await page.getByRole("button", { name: "نمونهٔ آموزشی" }).click();
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: "بررسی و ورود" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_09_import_success.png") });

  // 6. New Session (Wizard 5 steps)
  await page.goto("/sessions/new/");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_10_session_setup_step1.png") });
  await page.getByRole("button", { name: /تمام درس‌ها/ }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_10b_session_scope_step2.png") });
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_10c_session_types_step3.png") });
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_10d_session_settings_step4.png") });
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_10e_session_confirm_step5.png") });

  await page.getByRole("button", { name: "ساخت آزمون" }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_11_session_preview.png") });

  // 7. Session Active
  await page.getByRole("button", { name: "شروع آزمون" }).click();
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /^الف/ }).first().click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_12_session_active.png") });

  // 8. Result
  await page.getByRole("button", { name: "پایان و ثبت آزمون" }).click();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_12b_session_confirm_finish.png") });
  await page.getByRole("button", { name: "پایان آزمون" }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_13_session_result.png") });

  // 9. Analytics
  await page.goto("/analytics/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_14_analytics.png") });

  // 10. Review
  await page.goto("/review/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_15_review.png") });

  // 11. Settings
  await page.goto("/settings/");
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_16_settings.png") });

  // 12. Hover Rail Test on Desktop
  await page.goto("/");
  await page.waitForTimeout(1000);
  // Hover over the desktop rail on the right side
  await page.locator(".desktop-rail").hover();
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_06b_dashboard_rail_hovered.png") });

  // 13. Dark Mode Test
  // Toggle theme button
  await page.getByRole("button", { name: "تغییر حالت نمایش" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_06c_dashboard_dark.png") });

  // Dark Mode Session Builder
  await page.goto("/sessions/new/");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_10_session_setup_dark.png") });

  // Dark Mode Bank
  await page.goto("/bank/");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_07b_bank_dark.png") });

  // 14. Mobile Responsive Views (iPhone 14)
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_17_mobile_dashboard.png") });

  // Mobile Light Mode
  await page.getByRole("button", { name: "تغییر حالت نمایش" }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(artifactDir, "screenshot_17b_mobile_dashboard_light.png") });
});
