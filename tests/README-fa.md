# تست‌های تستینو — راهنمای فارسی

## فلسفهٔ این تست‌ها: «تست الکی» ممنوع

قبلاً یک فایل `comprehensive-audit.spec.ts` داشتیم که فقط اسکرین‌شات می‌گرفت و
همه‌چیز را داخل `if (isVisible)` می‌گذاشت؛ یعنی اگر دکمه‌ای کار نمی‌کرد یا صفحه
کل app قفل می‌شد، تست **بی‌صدا رد می‌شد و «پاس» گزارش می‌شد**. نتیجه‌اش شد باگ
فریز «حذف تمام داده‌ها» که کاربر واقعی کشفش کرد، نه تست‌ها.

قواعد فعلی:

1. **هیچ تعاملی بدون assertion نیست.** هر تست باید نتیجهٔ واقعی (تغییر صفحه،
   ذخیرهٔ دیتابیس، ظاهر شدن پیام) را چک کند.
2. **تست فریز (Freeze Watchdog)** — قبل از بوت اپ، یک ناظر داخل صفحه نصب
   می‌شود که:
   - تسک‌های سنگین ترد اصلی (>= ۴ ثانیه) را ثبت می‌کند (`PerformanceObserver/longtask`)؛
   - با یک round-trip واقعی به ترد اصلی ثابت می‌کند صفحه «زنده» است — اگر جایی
     حلقهٔ بی‌نهایت (مثل باگ MutationObserver قبلی) ترد را قفل کند، همان‌جا تست
     fail می‌شود نه جلوی کاربر؛
   - خطاهای uncaught و promiseهای رد‌شده را جمع می‌کند.
3. **بهداشت کنسول:** هر `console.error` یا خطای صفحه در مسیرهای اصلی = fail.
   (چند نویزِ بی‌خطر مثل favicon استثنا شده‌اند.)
4. **سفرهای کامل (Journey):** آنبوردینگ ۴ مرحله‌ای، چرخهٔ کامل آزمون (ساخت ←
   پاسخ ← پایان ← کارنامه)، و سناریوهای مخرب تنظیمات (حذف تمام داده‌ها) — همه
   از راه UI واقعی، نه میان‌بر localStorage.
5. **ریسپانسیو:** صفحات کلیدی در ۳ سایز (موبایل ۳۶۰ / تبلت ۷۶۸ / دسکتاپ ۱۲۸۰)
   نباید overflow افقی داشته باشند.

## اجرا

```bash
# کامل (بیلد production + اجرا روی :3100) — همان کاری که CI می‌کند
npx playwright test

# سریع، روی سرور dev در حال اجرا
TESTINO_BASE_URL=http://localhost:3000 npx playwright test

# فقط یک پروژه
npx playwright test --project=desktop
npx playwright test --project=mobile      # smoke + overflow (سفرها فقط دسکتاپ)
npx playwright test tests/e2e/journey-settings.spec.ts
```

## ساختار

```
playwright.config.ts          ← پروژه‌ها: desktop / mobile / tablet
tests/
  helpers/
    watchdog.ts               ← ناظر فریز + بهداشت کنسول (قلب سیستم)
    app.ts                    ← باز کردن اپ، آنبوردینگ واقعی، مسیرها
  e2e/
    smoke-routes.spec.ts      ← همهٔ مسیرها: لود، پاسخ‌گویی، خطای صفر
    journey-onboarding.spec.ts
    journey-exam.spec.ts
    journey-settings.spec.ts  ← تست رگرسیون فریز «حذف تمام داده‌ها»
    responsive-layout.spec.ts ← overflow در سایزهای مختلف
    core-flow.spec.ts         ← سفر قدیمی import+آزمون (نگه داشته شد)
  unit/                       ← تست‌های واحد vitest (لایهٔ دیتابیس/سینک)
```

## وقتی فیچر جدید اضافه می‌کنید (چک‌لیست)

1. مسیر جدید؟ به `ROUTES` در `tests/helpers/app.ts` اضافه شود — خودکار در
   smoke + overflow تست می‌شود.
2. مودال/دکمهٔ جدید؟ در یک journey، بعد از کلیک، حتماً
   `expectPageResponsive(page)` و یک assertion نتیجه واقعی بگذارید.
3. اکشن مخرب (حذف/ریست)؟ الگوی `journey-settings.spec.ts` را کپی کنید: باز شدن
   مودال + پاسخ‌گویی ترد اصلی + مسیر لغو + مسیر تأیید.
4. عنوان/لیبل فارسی جدید؟ اگر بیشتر از ~۳۵ کاراکتر است، کوتاهش کنید — تست
   آنبوردینگ روی چند لیبل کلیدی قفل است تا دوباره شلخته نشود.

## CI

`.github/workflows/ci.yml` روی هر push/PR:
`lint + typecheck + unit tests` ← سپس `build` ← سپس `E2E دسکتاپ` ← سپس
`E2E موبایل/تبلت`. آرتیفکت خطاها (trace/video) آپلود می‌شود.

## پوشش پلتفرم‌ها

| پلتفرم | پوشش |
|---|---|
| وب دسکتاپ | کامل (سفرها + smoke) |
| وب موبایل/تبلت | smoke + overflow + رندر |
| Electron | همان باند وب داخل Electron اجرا می‌شود؛ سفرهای وب = منطق مشترک. برای تست پوستهٔ Electron می‌توان با `_electron` از Playwright یک spec جدا افزود. |
| Capacitor (اندروید/iOS) | WebView همان باند وب را لود می‌کند؛ سفرهای وب = منطق مشترک. تست on-device با `adb` + Chrome DevTools دستی است. |
| استقرار Vercel | چون خروجی `next build` در CI تست می‌شود، همان آرتیفکت دپلوی می‌شود. |
