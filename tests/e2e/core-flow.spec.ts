import { expect, test } from "@playwright/test";

test("imports questions and resumes a saved session", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("testino_seen_splash", "true"));
  await page.goto("/");
  await expect(page.getByText("ذخیره‌سازی محلی آماده")).toBeVisible();
  await page.getByRole("link", { name: "ساخت اولین پروفایل" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "مدیریت فناوری اطلاعات" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ورود به داشبورد" }).click();
  await expect(page.getByText("هدف دروس فعال")).toBeVisible();

  await page.goto("/import/");
  await page.getByRole("button", { name: "نمونهٔ آموزشی" }).click();
  await page.getByRole("button", { name: "بررسی و ورود" }).click();
  await expect(page.getByText("گزارش ورود")).toBeVisible();
  await expect(page.getByText("1", { exact: true })).toBeVisible();

  await page.goto("/sessions/new/");
  await page.getByRole("button", { name: /تمام درس‌ها/ }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ادامه" }).click();
  await page.getByRole("button", { name: "ساخت آزمون" }).click();

  await page.getByRole("button", { name: "شروع آزمون" }).click();
  await page.getByRole("button", { name: /^الف/ }).first().click();
  await page.getByTitle("توقف موقت").click();
  await expect(page.getByTitle("ادامه")).toBeVisible();
  await page.reload();
  await page.getByTitle("ادامه").click();
  await page.getByRole("button", { name: "پایان و ثبت آزمون" }).click();
  await page.getByRole("button", { name: "پایان آزمون" }).click();
  await expect(page.getByText("آزمون شما به پایان رسید!")).toBeVisible();
});
