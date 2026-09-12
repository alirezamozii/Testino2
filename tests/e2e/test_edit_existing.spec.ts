import { test, expect } from '@playwright/test';

test('verify editing existing question and question detail page', async ({ page }) => {
  const dir = 'C:/Users/Mozart/.gemini/antigravity/brain/948f981c-d917-40b0-81b6-7cfc90dddb34';

  // 1. Bank page with nosplash
  await page.goto('http://127.0.0.1:3100/bank/?nosplash=1', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Switch to questions tab
  const questionsBtn = page.locator('button:has-text("سؤال‌ها")');
  if (await questionsBtn.isVisible()) {
    await questionsBtn.click();
    await page.waitForTimeout(1000);
  }

  // Screenshot question list with edit buttons
  await page.screenshot({ path: `${dir}/bank-questions-view-with-edit-btn.png`, fullPage: false });

  // Click edit button on first question
  const editBtn = page.locator('button:has-text("ویرایش")').first();
  if (await editBtn.isVisible()) {
    await editBtn.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${dir}/modal-edit-existing-question.png`, fullPage: false });

    // Switch to JSON tab to see pre-filled JSON
    const jsonTab = page.getByRole('button', { name: /ویرایش با JSON/ });
    await jsonTab.click();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${dir}/modal-edit-existing-json.png`, fullPage: false });
  }

  // Go to question detail page of question #1
  await page.goto('http://127.0.0.1:3100/bank/?nosplash=1', { waitUntil: 'networkidle' });
  await questionsBtn.click();
  await page.waitForTimeout(800);

  const firstQuestionLink = page.locator('a[href*="/bank/question/"]').first();
  if (await firstQuestionLink.isVisible()) {
    await firstQuestionLink.click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${dir}/question-detail-with-edit-btn.png`, fullPage: false });
  }

  console.log('Finished capturing all edit existing question screenshots!');
});
