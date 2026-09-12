# کتابخانهٔ پرامپت تستیونو
این فایل‌ها متن قابل استفاده برای AI بیرونی‌اند، نه دستور به عامل حاضر برای اجرای پروژه.

## فایل‌ها
- [استخراج](extract.md): تبدیل متن/PDF/تصویر داده‌شده به JSON.
- [تولید](generate.md): ساخت سؤال تازهٔ آموزشی.
- [تحلیل](analyze.md): تحلیل عملکرد بدون ادعای رتبه.
- [راهنمای اختصاصی درس‌ها](subject-overlays.md): ضمیمهٔ محتوایی؛ بدون تغییر schema.

## روش استفادهٔ دستی اکنون
1. فایل مربوط را باز کن.
2. مقادیر داخل {{...}} را با نام درس، فصل، موضوع و تنظیمات خودت جایگزین کن.
3. متن بخش «پرامپت قابل کپی» را همراه قرارداد JSON از docs/DATA_CONTRACTS.md و محتوای موردنظر به AI بده.
4. در استخراج از تصویر، کلید رسانه را فقط اگر واقعاً فایلش را داری مشخص کن.
5. پاسخ AI باید قبل از ورود با validator برنامهٔ آینده کنترل شود؛ این بسته در حال حاضر importer اجرایی ندارد.

## روش پیاده‌سازی PromptService در برنامه
ورودی renderer:
kind، subjectName، chapterName|null، topicName|null، source object، count|null، language، customInstructions، subjectOverlay، schemaText، exampleJson، inputContext.
schemaText از generated Zod JSON Schema؛ exampleJson از fixture معتبر همان schema؛ قابل ویرایش با customInstructions نیستند.
placeholder ناشناخته یا unresolved باعث خطای render شود؛ undefined/string "null" به متن نریزد.
count=null در prompt به «تعداد ثابت ندارم؛ فقط مواردی که با اطمینان کامل قابل استخراج/تولیدند» تبدیل شود.
در استخراج sourceKind=EXAM تنها وقتی ورودی واقعی آن منبع داده شده؛ تولید همواره sourceKind=AI.
برای هر subject سه رکورد تنظیم kind ساخته شود؛ هیچ فهرست درس hardcode نشود.
overlay از family دلخواه کاربر انتخاب می‌شود و متنش editable است.
بخش analyze هیچ schema ورودی سؤال تازه برای پاسخ لازم ندارد؛ خروجی گزارش انسانی است و به بانک import نمی‌شود.

## قاعدهٔ مصرف توکن
defaultهای subject/chapter/source فقط یک بار؛ context گروه فقط یک بار؛ سؤال‌ها groupKey می‌دهند.
پاسخ تشریحی کوتاه اما کافی؛ metadataهای بدون مصرف، خودستایی و متن قبل/بعد JSON ممنوع.
انتخاب تعداد کمتر هرگز مجوز سؤال ناقص یا پاسخ حدسی نیست.
هیچ تماس API، کلید مدل، پرداخت یا بارگذاری خودکار فایل بیرونی در برنامه ساخته نمی‌شود.

