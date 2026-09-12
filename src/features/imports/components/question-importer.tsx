"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FileUp, CheckCircle2, AlertCircle, FileCode, Download, Sparkles, Pin } from "lucide-react";
import { parseImportJson } from "@/features/questions/domain/importer";
import { importMediaPackage, type PackageImportReport } from "@/features/media/domain/media-package";
import { MediaService } from "@/features/media/domain/media-service";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";

const sample = JSON.stringify(
  {
    schemaVersion: "1.0",
    defaults: { subject: "درس نمونه", chapter: "فصل نمونه" },
    questions: [
      {
        key: "q-1",
        content: [{ type: "text", value: "صورت سؤال را اینجا بنویسید", direction: "rtl" }],
        options: ["الف", "ب", "ج", "د"].map((value, index) => ({
          key: `o-${index + 1}`,
          content: [{ type: "text", value }],
        })),
        correctOptionKey: "o-1",
        explanation: [],
        shuffleSafe: true,
      },
    ],
  },
  null,
  2
);

type Report = Awaited<ReturnType<ReturnType<typeof useDatabase>["db"]["importQuestions"]>> | PackageImportReport;

export function QuestionImporter() {
  const { db, status } = useDatabase();
  const client = useQueryClient();
  const [source, setSource] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const parsed = parseImportJson(source);
      const next = await db.importQuestions(parsed);
      setReport(next);
      await client.invalidateQueries({ queryKey: ["questions"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ورود انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  async function readFile(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("حجم فایل بیشتر از ۲۰ مگابایت است.");
      return;
    }

    if (file.name.endsWith(".zip") || file.type.includes("zip")) {
      setBusy(true);
      setError("");
      setReport(null);
      try {
        const buffer = await file.arrayBuffer();
        const mediaService = new MediaService(db.getClient());
        const pkgReport = await importMediaPackage(new Uint8Array(buffer), db, mediaService);
        setReport(pkgReport);
        await client.invalidateQueries({ queryKey: ["questions"] });
        await client.invalidateQueries({ queryKey: ["dashboard"] });
      } catch (err) {
        setError(err instanceof Error ? err.message : "خطا در پردازش بسته فشرده");
      } finally {
        setBusy(false);
      }
      return;
    }

    file
      .text()
      .then(setSource)
      .catch(() => setError("فایل خوانده نشد."));
  }

  function exportIssues() {
    if (!report || report.issues.length === 0) return;
    const blob = new Blob([JSON.stringify(report.issues, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `testino-import-issues-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="page space-y-6 max-w-5xl mx-auto pb-12">
      {/* 4-Step Pipeline Navigation */}
      <BankNavTabs activeTab="import" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] tracking-tight">
            ورود سؤالات و داده‌ها (JSON / ZIP)
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] font-bold mt-1">
            چسباندن متن خروجی هوش مصنوعی، بارگذاری فایل‌های json. یا بسته‌های فشرده zip. برای ثبت فوری در بانک سؤالات.
          </p>
        </div>
      </div>

      <div className="grid split gap-6">
          <div className="card space-y-4">
          <div className="field">
            <label htmlFor="json-file" className="flex items-center gap-1.5">
              <FileUp size={16} className="text-neutral-500" />
              <span>انتخاب فایل JSON یا بسته ZIP رسانه</span>
            </label>
            <input
              id="json-file"
              type="file"
              accept="application/json,.json,application/zip,.zip"
              className="text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 dark:file:bg-emerald-950 dark:file:text-emerald-300"
              onChange={(event) => readFile(event.target.files?.[0])}
            />
          </div>

          <div className="field">
            <div className="flex items-center justify-between mb-1">
              <label htmlFor="json-source" className="flex items-center gap-1.5">
                <FileCode size={16} className="text-neutral-500" />
                <span>یا متن JSON</span>
              </label>
              <button
                type="button"
                className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline"
                onClick={() => setSource(sample)}
              >
                جای‌گذاری نمونه
              </button>
            </div>
            <textarea
              id="json-source"
              rows={15}
              dir="ltr"
              spellCheck={false}
              className="font-mono text-xs leading-relaxed"
              value={source}
              onChange={(event) => setSource(event.target.value)}
              placeholder={sample}
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2" role="alert">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <button
              className="button"
              disabled={busy || !source.trim() || status !== "ready"}
              onClick={submit}
            >
              <FileUp size={16} />
              <span>{busy ? "در حال بررسی و ذخیره…" : "بررسی و ورود"}</span>
            </button>
            <button className="button secondary" onClick={() => setSource(sample)}>
              <Sparkles size={16} />
              <span>نمونهٔ آموزشی</span>
            </button>
          </div>
        </div>

        <aside className="card space-y-4">
          <h2 className="text-base font-bold">قواعد مهم استاندارد تستیونو</h2>
          <p className="text-xs text-neutral-500 leading-relaxed">
            نسخهٔ قرارداد باید 1.0 باشد. هر سؤال معمولاً چهار گزینه دارد و پاسخ صحیح با شناسهٔ گزینه مشخص می‌شود.
          </p>

          <div className="notice flex items-start gap-2">
            <Pin size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <span>سؤال بدون پاسخ صحیح به‌صورت پیش‌نویس ذخیره می‌شود و وارد آزمون‌های رسمی نمی‌شود.</span>
          </div>

          {report && (
            <div className="import-report space-y-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={18} className="text-emerald-500" />
                <h3 className="font-bold text-sm">گزارش ورود</h3>
              </div>

              <div className="report-grid">
                <div>
                  <strong>{report.added}</strong>
                  <small>افزوده</small>
                </div>
                <div>
                  <strong>{report.drafts}</strong>
                  <small>پیش‌نویس</small>
                </div>
                <div>
                  <strong>{report.duplicates}</strong>
                  <small>تکراری</small>
                </div>
                <div>
                  <strong>{report.failed}</strong>
                  <small>خطا</small>
                </div>
              </div>

              {report.issues.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-rose-600 dark:text-rose-400">خطاهای یافت‌شده:</span>
                    <button
                      type="button"
                      onClick={exportIssues}
                      className="text-xs text-rose-700 dark:text-rose-300 hover:underline flex items-center gap-1 font-bold"
                    >
                      <Download size={13} />
                      <span>دانلود خطاها (JSON)</span>
                    </button>
                  </div>
                  <ul className="text-xs text-rose-600 dark:text-rose-400 space-y-1 max-h-48 overflow-y-auto">
                    {report.issues.slice(0, 20).map((issue, index) => (
                      <li key={index} className="list-disc list-inside">
                        ردیف {issue.rowIndex}، {issue.path}: {issue.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
    </section>
  );
}
