# راهنمای کدنویسی هر بخش
این سند روش ساخت است، نه کد اجراشده. قبل از هر بخش قرارداد مربوط در DATA_CONTRACTS.md خوانده شود. نام توابع و فایل‌ها نقطهٔ شروع مشترک‌اند؛ منطق تکراری برای وب و Android نوشته نشود.

## 1. راه‌اندازی و پوسته
**محل:** src/app، src/providers، src/components/layout.
**ورودی:** owner فعال، وضعیت DB، theme؛ **خروجی:** پوستهٔ قابل استفاده و routeهای ثابت.
**روش:**
1. Next static export و TS strict را تنظیم کن؛ فونت‌ها و WASM محلی باشند.
2. layout فارسی/RTL و providerهای Query/DB را بساز؛ DB در mount client باز شود.
3. تا DB آماده نیست صفحهٔ loading کوتاه؛ شکست storage صفحهٔ توضیح و retry، نه صفحهٔ بانک خالی.
4. routeها wrapper باشند و قابلیت در features پیاده شود.
5. desktop sidebar و mobile bottom-nav از یک navigation config استفاده کنند.
6. در جلسه running، خروج route از SessionService.pause عبور کند.
**نباید:** fetch ابری اجباری در layout؛ singleton DB در SSR؛ theme hydration mismatch.
**تست:** reload مستقیم هر مسیر، query id نامعتبر، عرض360/1280، keyboard، تم روشن/تاریک.

## 2. Database worker و Repository
**محل:** src/database/adapters/web و repositories.
**ورودی:** command typed با requestId/operationId؛ **خروجی:** result یا خطای مشخص.
**روش:**
1. worker-client یک pending map با timeout داشته باشد و reply را با schema بررسی کند.
2. DB lock قبل از open؛ adapter health checks قبل از migration.
3. تمام commandهای write در صف FIFO؛ transaction nested ممنوع مگر savepoint کنترل‌شده.
4. repository فیلتر مالک را الزامی کند؛ بدون scope signature نداشته باشد.
5. applied_mutations داخل transaction با entity/outbox ثبت شود.
6. در worker error همهٔ promiseهای pending با StorageUnavailable تمام شوند؛ UI retry را صریح انجام دهد.
**نباید:** localStorage، export کل DB برای هر پاسخ، اتصال دوم از component.
**تست:** commit/rollback واقعی، پیام دیررس، timeout بعد commit، lock تب دوم، migration دوباره، FK.

## 3. پروفایل و taxonomy
**محل:** features/profiles.
**ورودی:** فرم name/track/subjects/coefficient/target؛ **خروجی:** profile ID و ساختار فعال.
**روش:** schema مشترک فرم/service؛ هویت درس از subject-registry مرکزی و aliasهای بازبینی‌شده؛ نام سفارشی با substring مبهم خودکار به درس دیگری نگاشت نشود؛ normalized names؛ saveProfile transaction شامل membershipها؛ فصل و موضوع در editor وابسته؛ تغییر درس reset فصل/موضوع نامعتبر. scoreGroup اختیاری اجازه می‌دهد درس‌های مطالعه جدا بمانند ولی در محاسبهٔ کل یک ضریب مشترک فقط یک‌بار بگیرند؛ هدف گروه با questionCount اعضا وزن‌دار می‌شود و ضریب اعضای گروه باید یکسان باشد.
حذف از پروفایل inactive membership است، نه پاک کردن subject بانک.
Target پیش‌فرض پیشنهاد UI می‌تواند خالی باشد و save بدون مقدار نامعتبر رد شود؛ مقدار ساختگی 70٪ خودکار ذخیره نشود.
**خطا:** درس بدون bank access، ضریب منفی، هدف خارج بازه، موضوع با والد غلط.
**تست:** دو profile با یک subject، ضریب صفر، تغییر نام بدون تغییر ID، حفظ تاریخچه.

## 4. سؤال و editor
**محل:** features/questions/domain/question-schema.ts و application/save-question.ts.
**ورودی:** QuestionDraft، expectedRevision؛ **خروجی:** question ID و revision.
**روش:**
1. BlockEditor با افزودن نوع block؛ گزینه‌ها همان renderer/editor کوچک را مصرف کنند.
2. draft را بدون پاسخنامه ذخیره کن؛ انتشار validation چهار گزینه و key را اجرا کند.
3. mediaId فقط از MediaService انتخاب شود.
4. fingerprint و search text را در domain تولید کن.
5. transaction: question/options → revision snapshot → head revision → outbox.
6. conflict نسخه را کنار تغییر کاربر نشان بده؛ overwrite بی‌صدا ممنوع.
**تست:** پاسخ متعلق به سؤال دیگر، فرمول نامعتبر، edit پس از آزمون، archive با سابقه، collision سادهٔ normalized text.

## 5. Renderer
**محل:** components/rich-content.
**ورودی:** Block[] و media resolver؛ **خروجی:** UI بدون منطق پاسخ.
**روش:** exhaustive switch روی discriminated union؛ unsupported block پیام خطا، نه حذف خاموش.
Text با unicode-bidi:plaintext و direction؛ formula LTR؛ table scroll container با caption؛ chart lazy و جدول دسترس‌پذیر جایگزین.
Media Viewer lazy load، object URL lifecycle revoke، zoom/reset/close keyboard، بدون URL remote مستقیم.
**نباید:** HTML خام کاربر؛ eval؛ رنگ پاسخ در renderer مستقل قبل از reveal.
**تست:** فارسی+English+کسر، جدول بلند، media missing، alt، dark contrast، متن با script tag باید متن دیده شود.

## 6. Import
**محل:** features/imports و questions domain.
**ورودی:** فایل JSON یا متن و bank انتخابی؛ **خروجی:** ImportReport.
**روش:** pipeline سند فنی؛ parse worker؛ header validate؛ resolve defaults؛ row validation؛ dedupe؛ commit کوچک؛ گزارش streaming.
وضعیت UI: idle → validating → preview → importing → completed/cancelled/failed.
preview تعداد تقریبی validation را می‌دهد؛ commit دوباره access/revision را بررسی می‌کند.
هر issue rowIndex یک‌مبنا در UI دارد؛ داخل آرایه صفرمبناست و تبدیل تنها formatter انجام دهد.
لغو ردیف‌های قبلی را پاک نمی‌کند. صفحه refresh را با job history و hash ادامه بده.
**گروه:** context ناقص باعث خطای گروه؛ عضو معیوب باعث incomplete تا repair؛ سؤالات سالم مستقل همان فایل ادامه دارند.
**تست:** 97/3، schema ناشناخته، retry، file limit، duplicate در یک فایل و بانک، لغو در وسط، گروه ناقص.

## 7. انتخاب و ساخت جلسه
**محل:** features/exams/domain/selection.ts و application/session-service.ts.
**ورودی:** SessionConfig و eligibility snapshot؛ **خروجی:** preview ثم session CREATED.
**روش:**
1. query IDs eligible؛ واحد question/group بساز.
2. فیلتر انتخاب new/wrong/due بر مالک/پروفایل.
3. واحدها را با seed مرتب و تا count جمع کن.
4. overshoot گروه یا بانک کمتر را preview بده.
5. create با preview token و transaction snapshotها را ذخیره کند.
6. shuffle options در create، فقط safe، نتیجه در option_order.
7. برای open session start اولیه اولین واحد را append کند؛ پایان بانک graceful.
**نباید:** Math.random در render، حذف اعضای Reading، تکرار سؤال برای پر کردن count.
**تست:** count=1 با group سه‌تایی actual=3، بانک خالی، new برای مالک دیگر، همان seed همان ترتیب.

## 8. Player و ذخیرهٔ پاسخ
**محل:** session-player.tsx، answer-options.tsx، session-machine.ts.
**ورودی:** sessionId از URL؛ **خروجی:** commandهای typed و نمایش snapshot.
**روش:**
1. loader وجود session و مالک را بررسی کند.
2. CREATED صفحهٔ شروع؛ PAUSED صفحهٔ ادامه؛ FINISHED انتقال به نتیجه بدون شروع زمان.
3. answer-options هیچ correctOptionId را قبل از reveal render نکند.
4. انتخاب و confidence با یک command queue؛ pending indicator کوتاه.
5. نتیجهٔ durable وارد Query cache؛ ذخیره شکست خورد، انتخاب قبلی قطعی حفظ و انتخاب جدید به عنوان ذخیره‌نشده مشخص شود.
6. next/previous منتظر checkpoint؛ question navigation نشانگر answered/visited/unvisited/locked جدا.
7. در گروه، دکمهٔ مطالعهٔ متن مشترک active target را به group منتقل کند.
**تست:** click سریع، انتخاب مجدد، پاک کردن، پاسخ حین pause، option نامربوط، write failure و retry همان operationId.

## 9. Timer و lifecycle
**محل:** active-time.ts، checkpoint-service.ts، platform/lifecycle.ts.
**ورودی:** clock، visibility/focus/app state، active target؛ **خروجی:** delta active و state.
**روش:** state کوچک شامل lastMonotonic، activeTarget، accumulated؛ tick pure؛ browser binding جدا.
هر tick فاصلهٔ نامعتبر را تشخیص دهد؛ هنگام hide ابتدا interval بسته شود و سپس paused persist شود.
زمان visible در UI می‌تواند از saved+unsaved tick نمایش یابد ولی برچسب save وضعیت checkpoint را نشان دهد.
on reload هیچ interval قدیمی زنده نیست؛ session RUNNING persisted به PAUSED recovery تبدیل می‌شود.
حالت wall deadline قبل از هر command بررسی شود؛ UI تایمر با interval مستقل فقط نمایش دارد.
**تست:** fake timers، rollback ساعت wall، hidden 1ساعت active=بدون رشد، sleep gap، timer expiry هم‌زمان answer، group interval بدون double-count.

## 10. Finish و reveal
**محل:** finalize-session.ts و review application.
**ورودی:** sessionId، confirmation hash، command operationId؛ **خروجی:** immutable attempts و summary.
**روش:**
1. پیش‌نمایش تعداد فعلی؛ finish تأییدشده باید با همان revision match کند.
2. transaction: close time، finalize unlocked session_questions، set FINISHED، update review، enqueue mutations.
3. insert UNIQUE(session_question_id) برای پاسخ قفل‌شده قبلی duplicate نسازد.
4. scoring pure روی تمام snapshot مربوط؛ unvisited زیرمجموعه unanswered.
5. revealBatch همین finalize primitive را برای subset مصرف کند و exposedAnswer=true کند.
**نباید:** finalization در effect با render، دو نمره برای یک تلاش، finish خودکار روی خروج صفحه.
**تست:** دوبار finish، crash بعد commit، 10/50 paused، پایان50 با40ندیده، batch reveal سپس finish.

## 11. Review
**محل:** features/review/domain/scheduler-v1.ts و mastery-v1.ts.
**ورودی:** final attempt و prior state؛ **خروجی:** nextReview|null.
**روش:** pure function طبق جدول فنی، clock تزریق؛ owner/profile scope؛ idempotency با lastAttempt/replay.
listDue فقط سؤالات eligible را join کند؛ سؤال بایگانی history دارد ولی در شروع مرور نیست.
صفحه مرور به SessionBuilder config selectionMode=due می‌دهد؛ player دیگری ساخته نشود.
rebuild command از تلاش‌ها deterministic خروجی یکسان بسازد؛ migration الگوریتم در آینده rebuild explicit است.
**تست:** غلط/سفید دیده‌شده/ندیده، confidence null، streak cap30، tie sort، retry تلاش، history rebuild.

## 12. Analytics
**محل:** features/analytics.
**ورودی:** owner/profile، period، mode، policy؛ **خروجی:** typed summaries.
**روش:** aggregate counts اول، سپس percentage؛ جمع درصدهای جدا اشتباه است.
query فقط finished، حداکثر 10 جلسهٔ 30روز، policy یکسان.
wrong topic با حداقل5 sample؛ threshold برچسب ضعیف پیش‌فرض درصد زیر هدف درس است؛ اگر target موضوع تعریف نشده همان هدف درس با label به کار رود.
chart نقاط خام هر جلسه، tooltip مخرج و mode؛ خط روند مصنوعی interpolated را نتیجهٔ واقعی معرفی نکن.
**تست:** جلسه2سؤالی و100سؤالی وزن متفاوت، بدون data null، policy مختلف تفکیک، آموزشی فیلتر، group time مستقل.

## 13. AI Prompt و export
**محل:** features/ai، prompts و generated schemas.
**ورودی:** subject profile و نوع extract/generate/analyze؛ **خروجی:** یک متن کامل یا فایل JSON.
**روش:** template engine ساده فقط placeholder allowlist؛ امکان اجرای template code نداشته باشد.
Schema canonical به همراه overlay درس؛ مثال معتبر generated fixture.
subject-specific custom instructions در DB؛ base schema immutable و با سفارشی‌سازی خراب نشود.
export analysis با aliases، snapshot و group context؛ scope summary مستقل.
Copy API خطا داشت textarea readonly با انتخاب دستی؛ network لازم نیست.
**تست:** unresolved placeholder ممنوع، prompt هر درس schema یکسان، export دوباره parse/validate، حذف token/account IDs.

## 14. رسانه
**محل:** features/media و platform/media-storage.ts.
**ورودی:** File، role و انتخاب نگهداری original؛ **خروجی:** media metadata و hash.
**روش:** check signature/bytes/dimensions → normalize orientation → compress preview → user accept → write file staging → atomic metadata commit → promote file.
در crash بین file write و metadata، orphan staging با دورهٔ پاکسازی شناسایی شود؛ commit reference قبل فایل نهایی ممنوع.
reference عکس شامل گزینه‌های ثابت، flag shuffleSafe توسط کاربر فقط با تأیید معنایی روشن شود؛ importer نمی‌تواند از ظاهر متن استقلال گزینه را تضمین کند.
**تست:** MIME جعلی، zip traversal، resolution بزرگ، duplicate hash، quota، تصویر مرجع و گزینه جابه‌جا.

## 15. Backup و restore
**محل:** features/backup.
**ورودی:** owner snapshot یا ZIP؛ **خروجی:** فایل قابل بازیابی یا namespace تازه.
**روش:** read snapshot consistent؛ manifest hashes؛ ZIP streaming؛ export completeness report.
restore validate limits/schema/checksum → staging DB → migrations → FK check → counts → user confirm → active namespace switch.
فایل نامعتبر حتی یک ردیف به DB فعلی ننویسد. restore به عنوان merge مبهم اجرا نشود؛ v1 replace-owner است و قدیمی تا دورهٔ retention حفظ می‌شود.
**تست:** roundtrip، missing media، future schema، quota staging، قطع در switch، token absence، path traversal.

## 16. حساب و Sync
**محل:** features/account و src/sync و supabase.
**ورودی:** authenticated session/owner، outbox؛ **خروجی:** push/pull report.
**روش:** اول SQL RLS تست؛ بعد transport و coordinator. Client هیچ service key ندارد.
claim local owner با marker resumable، DB backup و mapping؛ retry owner جدید دوم نسازد.
push سپس pull، هر دو bounded؛ ack فقط بعد durable local apply؛ revision/conflict policy مطابق سند فنی.
logout ابتدا pause و close DB، cancel transport، clear caches، then signOut.
**تست:** دو user با API مستقیم، membership لغوشده، expired token، duplicate mutation، out-of-order pull، takeover session و recovery fork.

## 17. Web offline و Android
**محل:** scripts/build-sw، platform و database/adapters/native.
**روش وب:** build manifest خودکار؛ install همهٔ assetهای ضروری؛ UI readiness واقعی؛ آپدیت وسط running فعال نشود؛ offline reload از test تولیدی.
**روش Android:** بعد از web core cap init/add؛ native DB adapter؛ App lifecycle؛ Filesystem/picker؛ back button ابتدا pause/confirm مربوط.
نباید wrapper شبکه‌ای با server.url راه‌حل آفلاین معرفی شود. تمام app assets در بسته باشند.
**تست:** اولین بازشدن APK در airplane mode، kill/restart، فایل export در picker، فونت/wasm محلی، Android ضعیف واقعی.

## 18. قاعدهٔ تکمیل هر PR/تسک
توضیح رفتار قبل/بعد، فایل‌های اصلی، migrations، تست‌های اجراشده و نتیجه؛ بدون عبارت «کامل شد» برای بخش وابستهٔ اجرا نشده.
کد نمایشی که دکمه‌ها فقط toast موفق می‌دهند پذیرش نمی‌شود. empty state واقعی بهتر از دادهٔ ساختگی است.
در این مرحلهٔ مستندات، هیچ یک از مراحل بالا مجوز شروع نصب یا نوشتن source نیست؛ درخواست اجرای بعدی لازم است.

