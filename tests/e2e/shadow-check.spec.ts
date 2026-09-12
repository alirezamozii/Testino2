import { test } from '@playwright/test';

test('shadow verification screenshots', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, locale: 'fa-IR' });
  const page = await ctx.newPage();
  const dir = 'C:/Users/Mozart/.gemini/antigravity/brain/948f981c-d917-40b0-81b6-7cfc90dddb34';

  // Light mode dashboard
  await page.goto('http://127.0.0.1:3100/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${dir}/shadow-fix-light.png`, fullPage: true });

  // Dark mode dashboard
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${dir}/shadow-fix-dark.png`, fullPage: true });

  // Review page - dark
  await page.goto('http://127.0.0.1:3100/review', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/shadow-review-dark.png`, fullPage: true });

  // Settings page - dark
  await page.goto('http://127.0.0.1:3100/settings', { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
    document.documentElement.classList.add('dark');
  });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: `${dir}/shadow-settings-dark.png`, fullPage: true });

  await ctx.close();
});
