import { test, expect } from "@playwright/test";

test("verify question editor modal and multi-image support", async ({ page }) => {
  const dir = "C:/Users/Mozart/.gemini/antigravity/brain/948f981c-d917-40b0-81b6-7cfc90dddb34";

  // 1. Go to Bank Page with nosplash=1
  await page.goto("http://127.0.0.1:3100/bank/?nosplash=1", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Take screenshot of bank list
  await page.screenshot({ path: dir + "/bank-list-with-clean-btn.png", fullPage: false });

  // 2. Click "افزودن دستی" button
  const addBtn = page.getByRole("button", { name: /^افزودن دستی$/ });
  await expect(addBtn).toBeVisible();
  await addBtn.click();
  await page.waitForTimeout(600);

  // Fill in some details
  await page.locator('input[placeholder*="ریاضی"]').fill("ریاضیات گسسته");
  await page.locator('textarea[placeholder*="صورت سؤال"]').fill("با توجه به جدول زیر، مقدار ماتریس مجاورت گراف را مشخص کنید:");

  // Take screenshot of New Question Modal with table/image upload section
  await page.screenshot({ path: dir + "/modal-manual-form-clean.png", fullPage: false });

  // 3. Switch to JSON Mode Tab
  const jsonTab = page.getByRole("button", { name: /ویرایش با JSON/ });
  await expect(jsonTab).toBeVisible();
  await jsonTab.click();
  await page.waitForTimeout(400);

  // Screenshot of JSON Tab
  await page.screenshot({ path: dir + "/modal-json-tab-clean.png", fullPage: false });

  console.log("Screenshots captured successfully!");
});
