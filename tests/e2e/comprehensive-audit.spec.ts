import { test } from "@playwright/test";
import path from "node:path";

const artifactDir = "C:/Users/Mozart/.gemini/antigravity/brain/4cee78b9-76a5-4475-ad72-482d915f5e48";

test.describe("Testino 100% Comprehensive Audit & Interactive Test Suite", () => {
  test.setTimeout(180000);

  test("Desktop Interactive Audit (1280x800) - Light & Dark Mode", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.addInitScript(() => sessionStorage.setItem("testino_seen_splash", "true"));

    // -------------------------------------------------------------
    // 1. Landing / Initial Page (Before or after profile)
    // -------------------------------------------------------------
    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactDir, "audit_01_desktop_home_light.png") });

    // -------------------------------------------------------------
    // 2. Test Hover Navigation Rail on Desktop
    // -------------------------------------------------------------
    const rail = page.locator(".desktop-rail");
    if (await rail.isVisible()) {
      // Hover the rail to see smooth expansion
      await rail.hover();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactDir, "audit_02_desktop_rail_hovered.png") });

      // Move mouse away to collapse
      await page.mouse.move(500, 300);
      await page.waitForTimeout(400);
    }

    // -------------------------------------------------------------
    // 3. Onboarding Flow (Full 5 steps test)
    // -------------------------------------------------------------
    await page.goto("/onboarding/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_03_onboarding_step1_light.png") });

    // Test Google Connection Modal inside Step 1
    const googleModalBtn = page.getByRole("button", { name: "اتصال با گوگل" });
    if (await googleModalBtn.isVisible()) {
      await googleModalBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(artifactDir, "audit_03b_google_modal.png") });
      // Fill google modal
      const emailInput = page.locator('input[placeholder="name@gmail.com"]');
      if (await emailInput.isVisible()) {
        await emailInput.fill("ali.rezaei@gmail.com");
      }
      const nameInput = page.locator('input[placeholder="مثلاً: امیررضا حسینی"]');
      if (await nameInput.isVisible()) {
        await nameInput.fill("علی رضایی");
      }
      await page.getByRole("button", { name: "تأیید و اتصال به گوگل" }).click();
      await page.waitForTimeout(500);
    }

    // Enter display name if not already filled
    const displayNameInput = page.locator('input[placeholder="نام یا نام خانوادگی خود را وارد کنید..."]');
    if (await displayNameInput.isVisible()) {
      await displayNameInput.fill("علی رضایی");
    }
    // Continue to Step 2
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "audit_04_onboarding_step2_light.png") });

    // Step 2: Select Exam & Track
    const arshadBtn = page.getByRole("button", { name: /کارشناسی ارشد/ });
    if (await arshadBtn.isVisible()) {
      await arshadBtn.click();
    }
    const trackInput = page.locator('input[placeholder*="مهندسی کامپیوتر"]');
    if (await trackInput.isVisible()) {
      await trackInput.fill("مدیریت فناوری اطلاعات");
    }
    // Continue to Step 3
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "audit_05_onboarding_step3_light.png") });

    // Step 3: Subjects & Coefficients - Add custom subject test
    const newSubjName = page.locator('input[placeholder*="زیست‌شناسی"]');
    if (await newSubjName.isVisible()) {
      await newSubjName.fill("پایگاه داده پیشرفته");
      await page.getByRole("button", { name: "افزودن این درس" }).click();
      await page.waitForTimeout(400);
    }
    // Continue to Step 4
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "audit_06_onboarding_step4_light.png") });

    // Step 4: Study timeline - Select 6 months
    const sixMonthsBtn = page.getByRole("button", { name: "۶ ماه" });
    if (await sixMonthsBtn.isVisible()) {
      await sixMonthsBtn.click();
    }
    // Continue to Step 5
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "audit_07_onboarding_step5_summary_light.png") });

    // Step 5: Final Submission -> Enter Dashboard
    const finishOnboardingBtn = page.getByRole("button", { name: /ورود به داشبورد/ });
    if (await finishOnboardingBtn.isVisible()) {
      await finishOnboardingBtn.click();
      await page.waitForTimeout(2000);
    }

    // -------------------------------------------------------------
    // 4. Active Dashboard Verification
    // -------------------------------------------------------------
    await page.goto("/");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactDir, "audit_08_dashboard_active_light.png") });

    // Test Theme Toggle (Light -> Dark)
    const themeToggleBtn = page.locator('button[aria-label="تغییر حالت نمایش"]');
    if (await themeToggleBtn.isVisible()) {
      await themeToggleBtn.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactDir, "audit_09_dashboard_active_dark.png") });
      // Toggle back to light for continued test
      await themeToggleBtn.click();
      await page.waitForTimeout(400);
    }

    // -------------------------------------------------------------
    // 5. Question Bank & Search Audit
    // -------------------------------------------------------------
    await page.goto("/bank/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_10_bank_overview_light.png") });

    // Switch to all questions tab
    const allQuestionsTab = page.getByRole("button", { name: /فهرست کل سؤال‌ها/ });
    if (await allQuestionsTab.isVisible()) {
      await allQuestionsTab.click();
      await page.waitForTimeout(600);
      await page.screenshot({ path: path.join(artifactDir, "audit_11_bank_all_questions.png") });
    }

    // -------------------------------------------------------------
    // 6. JSON Import Pipeline
    // -------------------------------------------------------------
    await page.goto("/import/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_12_import_page.png") });

    const sampleBtn = page.getByRole("button", { name: "نمونهٔ آموزشی" });
    if (await sampleBtn.isVisible()) {
      await sampleBtn.click();
      await page.waitForTimeout(400);
    }
    const checkAndImportBtn = page.getByRole("button", { name: "بررسی و ورود" });
    if (await checkAndImportBtn.isVisible()) {
      await checkAndImportBtn.click();
      await page.waitForTimeout(1500);
      await page.screenshot({ path: path.join(artifactDir, "audit_13_import_success.png") });
    }

    // -------------------------------------------------------------
    // 7. Exam Session Builder (5 Steps)
    // -------------------------------------------------------------
    await page.goto("/sessions/new/");
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(artifactDir, "audit_14_session_builder_step1.png") });

    // Select Comprehensive Exam (تمام درس‌ها)
    const allSubjectsBtn = page.getByRole("button", { name: /تمام درس‌ها/ });
    if (await allSubjectsBtn.isVisible()) {
      await allSubjectsBtn.click();
    }
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);

    // Step 2: Scope
    await page.screenshot({ path: path.join(artifactDir, "audit_15_session_builder_step2.png") });
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);

    // Step 3: Question Types
    await page.screenshot({ path: path.join(artifactDir, "audit_16_session_builder_step3.png") });
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);

    // Step 4: Settings (Count, Timer, Negative Score)
    await page.screenshot({ path: path.join(artifactDir, "audit_17_session_builder_step4.png") });
    await page.getByRole("button", { name: "ادامه" }).click();
    await page.waitForTimeout(600);

    // Step 5: Summary & Create
    await page.screenshot({ path: path.join(artifactDir, "audit_18_session_builder_step5.png") });
    await page.getByRole("button", { name: "ساخت آزمون" }).click();
    await page.waitForTimeout(2000);

    // -------------------------------------------------------------
    // 8. Session Player & Interactive Test Solving
    // -------------------------------------------------------------
    await page.screenshot({ path: path.join(artifactDir, "audit_19_session_preview.png") });
    const startExamBtn = page.getByRole("button", { name: "شروع آزمون" });
    if (await startExamBtn.isVisible()) {
      await startExamBtn.click();
      await page.waitForTimeout(1000);
    }
    await page.screenshot({ path: path.join(artifactDir, "audit_20_session_running.png") });

    // Click option الف
    const optionA = page.getByRole("button", { name: /^الف/ }).first();
    if (await optionA.isVisible()) {
      await optionA.click();
      await page.waitForTimeout(400);
    }

    // Toggle Doubtful / Confidence flag
    const doubtBtn = page.getByRole("button", { name: /شک/ });
    if (await doubtBtn.isVisible()) {
      await doubtBtn.click();
      await page.waitForTimeout(300);
    }

    await page.screenshot({ path: path.join(artifactDir, "audit_21_session_answered.png") });

    // Finish Session
    const finishDirectBtn = page.getByRole("button", { name: "پایان و ثبت آزمون" });
    if (await finishDirectBtn.isVisible()) {
      await finishDirectBtn.click();
    } else {
      const toolsBtn = page.locator('button[title="ابزارهای آزمون"]');
      if (await toolsBtn.isVisible()) {
        await toolsBtn.click();
        await page.waitForTimeout(300);
        const toolsFinishBtn = page.getByRole("button", { name: /پایان و تحویل آزمون/ });
        if (await toolsFinishBtn.isVisible()) {
          await toolsFinishBtn.click();
        }
      }
    }
    await page.waitForTimeout(600);
    await page.screenshot({ path: path.join(artifactDir, "audit_22_session_finish_modal.png") });
    const confirmFinishBtn = page.getByRole("button", { name: "پایان آزمون" });
    if (await confirmFinishBtn.isVisible()) {
      await confirmFinishBtn.click();
      await page.waitForTimeout(1500);
    }

    // -------------------------------------------------------------
    // 9. Exam Result Page & Tab Switching
    // -------------------------------------------------------------
    await page.screenshot({ path: path.join(artifactDir, "audit_23_session_result_breakdown.png") });
    const reviewAnswersTab = page.getByRole("button", { name: "مرور پاسخ‌ها" });
    if (await reviewAnswersTab.isVisible()) {
      await reviewAnswersTab.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(artifactDir, "audit_24_session_result_review_tab.png") });
    }

    // -------------------------------------------------------------
    // 10. Review & Leitner Page
    // -------------------------------------------------------------
    await page.goto("/review/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_25_review_page_light.png") });

    // Test priority tabs
    const wrongTab = page.getByRole("button", { name: /اشتباهات/ });
    if (await wrongTab.isVisible()) {
      await wrongTab.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(artifactDir, "audit_26_review_page_wrong_filter.png") });
    }

    // -------------------------------------------------------------
    // 11. History Page & Activity Calendar
    // -------------------------------------------------------------
    await page.goto("/history/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_27_history_page_light.png") });

    // -------------------------------------------------------------
    // 12. Analytics Page
    // -------------------------------------------------------------
    await page.goto("/analytics/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_28_analytics_page_light.png") });

    // -------------------------------------------------------------
    // 13. Settings Page (Desktop 2-Column)
    // -------------------------------------------------------------
    await page.goto("/settings/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_29_settings_page_light.png") });

    // Test About Modal
    const aboutBtn = page.getByRole("button", { name: /درباره تستینو/ });
    if (await aboutBtn.isVisible()) {
      await aboutBtn.click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(artifactDir, "audit_30_settings_about_modal.png") });
      await page.getByRole("button", { name: "بستن" }).click();
      await page.waitForTimeout(300);
    }

    // Test Dark Mode on Settings
    if (await themeToggleBtn.isVisible()) {
      await themeToggleBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(artifactDir, "audit_31_settings_page_dark.png") });
    }

    // -------------------------------------------------------------
    // 14. AI Generator Page
    // -------------------------------------------------------------
    await page.goto("/ai/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_32_ai_generator_dark.png") });

    // -------------------------------------------------------------
    // 15. Goals and Study Path (Wireframe 15)
    // -------------------------------------------------------------
    await page.goto("/goals/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_41_goals_study_path.png") });

    // -------------------------------------------------------------
    // 16. Subject Browser & Detail (Wireframe 06)
    // -------------------------------------------------------------
    await page.goto("/bank/subjects/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_42_bank_subjects.png") });

    await page.goto("/bank/subject/?name=%D8%AF%D8%B1%D8%B3%20%D9%86%D9%85%D9%88%D9%86%D9%87");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_43_bank_subject_detail.png") });

    // -------------------------------------------------------------
    // 17. Topic Questions & Practice (Wireframe 07)
    // -------------------------------------------------------------
    await page.goto("/bank/topic/?subject=%D8%AF%D8%B1%D8%B3%20%D9%86%D9%85%D9%88%D9%86%D9%87&topic=%D9%81%D8%B5%D9%84%20%D9%86%D9%85%D9%88%D9%86%D9%87");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_44_bank_topic_practice.png") });
  });

  // ---------------------------------------------------------------
  // Mobile Interactive Audit (375x812)
  // ---------------------------------------------------------------
  test("Mobile Interactive Audit (375x812) - Native Feel & Bottom Nav", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => sessionStorage.setItem("testino_seen_splash", "true"));

    // Mobile Home
    await page.goto("/");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(artifactDir, "audit_33_mobile_home_light.png") });

    // Test Mobile Bottom Navigation
    const bankBottomNav = page.locator(".mobile-bottom-nav a[href='/bank/']");
    if (await bankBottomNav.isVisible()) {
      await bankBottomNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(artifactDir, "audit_34_mobile_bank_light.png") });
    }

    const sessionsBottomNav = page.locator(".mobile-bottom-nav a[href='/sessions/']");
    if (await sessionsBottomNav.isVisible()) {
      await sessionsBottomNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(artifactDir, "audit_35_mobile_sessions_light.png") });
    }

    const analyticsBottomNav = page.locator(".mobile-bottom-nav a[href='/analytics/']");
    if (await analyticsBottomNav.isVisible()) {
      await analyticsBottomNav.click();
      await page.waitForTimeout(1000);
      await page.screenshot({ path: path.join(artifactDir, "audit_37_mobile_analytics_light.png") });
    }

    // Mobile Review
    await page.goto("/review/");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "audit_46_mobile_review.png") });

    // Mobile History via Bell
    await page.goto("/history/");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "audit_47_mobile_history.png") });

    // Mobile Goals
    await page.goto("/goals/");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "audit_45_mobile_goals.png") });

    // Mobile Settings
    await page.goto("/settings/");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "audit_38_mobile_settings_light.png") });

    // Mobile Dark Mode Toggle
    const themeBtn = page.locator('button[aria-label="تغییر حالت نمایش"]').first();
    if (await themeBtn.isVisible()) {
      await themeBtn.click();
      await page.waitForTimeout(500);
      await page.screenshot({ path: path.join(artifactDir, "audit_39_mobile_settings_dark.png") });
    }

    // Mobile Home in Dark Mode
    await page.goto("/");
    await page.waitForTimeout(1000);
    await page.screenshot({ path: path.join(artifactDir, "audit_40_mobile_home_dark.png") });
  });
});
