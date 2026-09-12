# معماری کامل پوشه‌ها
این درخت معماری هدف پروژه است. بخش‌هایی که در `TASKS.md` تیک نخورده‌اند هنوز تعهد پیاده‌سازی‌شده محسوب نمی‌شوند؛ وضعیت واقعی فقط از همان فایل و شواهد `VERIFICATION.md` خوانده می‌شود.

## 1. درخت هدف
```text
testino/
├── README.md
├── AGENTS.md
├── TASKS.md
├── docs/
│   ├── TESTINO_PRODUCT_BLUEPRINT.md
│   ├── TESTINO_TECHNICAL_IMPLEMENTATION.md
│   ├── DATA_CONTRACTS.md
│   ├── FOLDER_ARCHITECTURE.md
│   ├── FEATURE_IMPLEMENTATION_GUIDE.md
│   ├── TESTINO_UI_UX_SYSTEM.md
│   ├── DEVELOPER_HANDOFF.md
│   ├── VERIFICATION.md
│   └── adr/                         # تصمیم‌های تغییریافته، با شماره و دلیل
├── prompts/
│   ├── README.md
│   ├── extract.md
│   ├── generate.md
│   ├── analyze.md
│   └── subject-overlays.md
├── src/
│   ├── app/                         # تنها route wrapper و layout
│   │   ├── layout.tsx
│   │   ├── page.tsx
│   │   ├── globals.css
│   │   ├── error.tsx
│   │   ├── not-found.tsx
│   │   ├── onboarding/page.tsx
│   │   ├── bank/page.tsx
│   │   ├── bank/question/page.tsx
│   │   ├── import/page.tsx
│   │   ├── sessions/page.tsx
│   │   ├── sessions/new/page.tsx
│   │   ├── sessions/run/page.tsx
│   │   ├── sessions/result/page.tsx
│   │   ├── review/page.tsx
│   │   ├── analytics/page.tsx
│   │   ├── ai/page.tsx
│   │   └── settings/page.tsx
│   ├── components/
│   │   ├── ui/                      # shadcn primitives، بدون منطق محصول
│   │   ├── layout/
│   │   │   ├── app-shell.tsx
│   │   │   ├── desktop-sidebar.tsx
│   │   │   ├── mobile-nav.tsx
│   │   │   └── storage-status.tsx
│   │   ├── feedback/                # empty/error/save/pending state
│   │   └── rich-content/
│   │       ├── content-renderer.tsx
│   │       ├── text-block.tsx
│   │       ├── formula-block.tsx
│   │       ├── table-block.tsx
│   │       ├── chart-block.tsx
│   │       └── media-viewer.tsx
│   ├── features/
│   │   ├── profiles/
│   │   │   ├── domain/              # profile-schema، policy validation
│   │   │   ├── application/         # save-profile، activate-subject
│   │   │   ├── queries/             # profile query keys/hooks
│   │   │   └── components/          # onboarding، hierarchy editor
│   │   ├── questions/
│   │   │   ├── domain/              # block/schema، normalize، fingerprint
│   │   │   ├── application/         # save/archive/version question
│   │   │   ├── queries/             # paginated bank/detail
│   │   │   └── components/          # bank list/editor/detail
│   │   ├── imports/
│   │   │   ├── domain/              # envelope validation، default resolver
│   │   │   ├── application/         # import pipeline، report، resume
│   │   │   ├── workers/             # parse/validate worker protocol
│   │   │   └── components/          # upload، preview، report rows
│   │   ├── exams/
│   │   │   ├── domain/
│   │   │   │   ├── session-schema.ts
│   │   │   │   ├── session-machine.ts
│   │   │   │   ├── selection.ts
│   │   │   │   ├── shuffle.ts
│   │   │   │   ├── active-time.ts
│   │   │   │   └── scoring.ts
│   │   │   ├── application/
│   │   │   │   ├── session-service.ts
│   │   │   │   ├── checkpoint-service.ts
│   │   │   │   └── finalize-session.ts
│   │   │   ├── queries/
│   │   │   └── components/
│   │   │       ├── session-builder.tsx
│   │   │       ├── session-player.tsx
│   │   │       ├── question-navigation.tsx
│   │   │       ├── answer-options.tsx
│   │   │       └── session-result.tsx
│   │   ├── review/
│   │   │   ├── domain/              # scheduler-v1، mastery-v1
│   │   │   ├── application/         # apply/rebuild/list due
│   │   │   ├── queries/
│   │   │   └── components/
│   │   ├── analytics/
│   │   │   ├── domain/              # weighted percentages/sample policy
│   │   │   ├── application/         # subject/topic/time aggregations
│   │   │   ├── queries/
│   │   │   └── components/          # target cards/trends/history
│   │   ├── ai/
│   │   │   ├── domain/              # template/render/export schema
│   │   │   ├── application/         # build prompt/export analysis
│   │   │   └── components/
│   │   ├── media/
│   │   │   ├── domain/              # MIME/hash/limits
│   │   │   ├── application/         # ingest/compress/resolve
│   │   │   └── components/
│   │   ├── backup/
│   │   │   ├── domain/              # archive manifest/schema
│   │   │   ├── application/         # export/stage/verify/switch
│   │   │   └── components/
│   │   └── account/
│   │       ├── application/         # login/logout/claim-local-owner
│   │       └── components/
│   ├── database/
│   │   ├── ports.ts                 # DatabasePort و transaction context
│   │   ├── repositories/
│   │   │   ├── profiles.ts
│   │   │   ├── questions.ts
│   │   │   ├── sessions.ts
│   │   │   ├── attempts.ts
│   │   │   ├── review.ts
│   │   │   └── outbox.ts
│   │   ├── adapters/
│   │   │   ├── web/
│   │   │   │   ├── sqlite-worker.ts
│   │   │   │   ├── worker-client.ts
│   │   │   │   ├── worker-protocol.ts
│   │   │   │   └── database-lock.ts
│   │   │   └── native/sqlite-adapter.ts
│   │   ├── migrate.ts
│   │   └── mappers.ts               # JSON parse/row validation
│   ├── sync/
│   │   ├── ports.ts
│   │   ├── coordinator.ts
│   │   ├── push.ts
│   │   ├── pull.ts
│   │   ├── retry-policy.ts
│   │   ├── conflict-policy.ts
│   │   └── supabase-transport.ts
│   ├── platform/
│   │   ├── clock.ts
│   │   ├── lifecycle.ts
│   │   ├── files.ts
│   │   ├── media-storage.ts
│   │   └── detect.ts
│   ├── providers/
│   │   ├── app-providers.tsx
│   │   ├── database-provider.tsx
│   │   └── query-provider.tsx
│   └── lib/
│       ├── errors.ts
│       ├── ids.ts
│       ├── utils.ts
│       └── format.ts
├── migrations/
│   └── sqlite/                      # 0001_core.sql و بعدی‌ها + checksum
├── supabase/
│   ├── migrations/                  # schema، RLS، RPC، Storage policy
│   └── tests/                       # user isolation / sync integration
├── schemas/                         # generated از Zod، ویرایش دستی ممنوع
│   ├── question-import.v1.schema.json
│   ├── session-analysis.v1.schema.json
│   └── backup.v1.schema.json
├── tests/
│   ├── unit/                        # pure domain
│   ├── contracts/                   # DB adapter common suite
│   ├── integration/                 # service + DB
│   ├── e2e/                         # browser scenarios
│   └── fixtures/                    # synthetic، معتبر/نامعتبر/گروهی
├── public/
│   ├── fonts/
│   ├── icons/
│   └── wasm/                        # copied from installed package، local
├── scripts/
│   ├── prepare-assets.mjs
│   ├── generate-schemas.mjs
│   ├── build-sw.mjs
│   └── verify-doc-links.mjs
├── android/                         # فقط بعد از فاز native توسط Capacitor
├── .github/workflows/ci.yml          # پس از setup؛ بدون deploy خودکار
├── capacitor.config.ts
├── next.config.ts
├── tsconfig.json
├── eslint.config.mjs
├── vitest.config.ts
├── playwright.config.ts
├── package.json
└── package-lock.json
```

## 2. قانون وارد کردن ماژول
- app → features/components/providers مجاز.
- feature component → application/query hook خودش مجاز.
- application → domain و port/repository مجاز.
- domain → فقط domain عمومی و typeها؛ import از React، Supabase، Capacitor، window ممنوع.
- adapter → port و vendor SDK؛ feature component از adapter import نکند.
- feature دیگر فقط از public export index.ts استفاده کند؛ چرخهٔ imports در lint/check منع شود.
- features/exams هیچ منطق مرور را inline نمی‌کند؛ finalize از ReviewService port استفاده می‌کند.
- مبدل SQL row به type در mapper، نه در UI.
- lib محل ریختن منطق نامرتبط نیست؛ هر قانون محصول در feature مربوط.

## 3. الگوی ساخت یک feature
1. domain/types و schema را با invariantهای سند قرارداد بنویس.
2. خطاها و interface service را مشخص کن.
3. pure functionها و unit testهای رفتاری را بنویس.
4. repository transaction و mapper typed را اضافه کن.
5. application use case با dependency injection بساز.
6. query key/hook با scope مالک و پروفایل اضافه کن.
7. component دارای loading/empty/error بساز.
8. integration و E2E اصلی را اجرا و نتیجه ثبت کن.
برای بخش کوچک فایل‌های بی‌محتوا تولید نکن؛ فایل وقتی مسئولیت واقعی دارد ساخته شود.

## 4. نمونهٔ تقسیم کار
برای «تغییر جواب»:
- answer-options.tsx فقط option ID را به command می‌دهد.
- session-service.ts مجوز state/lock را بررسی و transaction را باز می‌کند.
- session-machine.ts first/last selection و changeCount جدید را محاسبه می‌کند.
- sessions repository draft و attempt_events و outbox را اتمیک ثبت می‌کند.
- query hook پس از commit snapshot جدید را به UI می‌دهد.
- آزمون unit اثر انتخاب مجدد/clear را کنترل می‌کند؛ آزمون integration rollback را.

## 5. فضای دادهٔ کاربر با پوشهٔ کد فرق دارد
طرح منطقی export:
```text
Testino-backup-<date>.zip
├── manifest.json
├── data.json
└── media/<sha256>.<ext>
```
دیتابیس live وب داخل OPFS و native داخل sandbox است. فولدر Windows به نام Testino/Database بدون permission و API پشتیبانی‌شده ساخته نمی‌شود.
node_modules، out، .next، local DB، رسانهٔ خصوصی، token و backup در Git نباشند.


