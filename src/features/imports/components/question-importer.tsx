"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileUp,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Download,
  Sparkles,
  Pin,
  RotateCcw,
  Layers,
  Edit3,
  Trash2,
  BookOpen,
  ArrowRight,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  FolderArchive,
  Calendar,
  Loader2,
} from "lucide-react";
import { parseImportJson } from "@/features/questions/domain/importer";
import { importMediaPackage, type PackageImportReport } from "@/features/media/domain/media-package";
import { MediaService } from "@/features/media/domain/media-service";
import { useDatabase } from "@/providers/database-provider";
import type { ImportBatch } from "@/database/app-database";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { QuestionEditorModal } from "@/features/questions/components/question-editor-modal";
import { checkIsOwner } from "@/lib/permissions";
import { useSync } from "@/providers/sync-provider";
import type { StoredQuestion } from "@/features/questions/domain/question-schema";

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
  const { syncNow } = useSync();
  const client = useQueryClient();
  const [source, setSource] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Edit / Delete states for questions
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<StoredQuestion | null>(null);
  const [deletingQuestion, setDeletingQuestion] = useState<{ question: StoredQuestion; batchId?: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  // Import Batches / Sessions state
  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
  const [batchQuestions, setBatchQuestions] = useState<Record<string, StoredQuestion[]>>({});
  const [loadingBatchId, setLoadingBatchId] = useState<string | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<ImportBatch | null>(null);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    void checkIsOwner().then(setIsOwner);
  }, []);

  // Fetch import batches (sessions)
  const importBatchesQuery = useQuery({
    queryKey: ["import-batches"],
    queryFn: () => db.listImportBatches(),
    enabled: status === "ready",
  });
  const batches = importBatchesQuery.data || [];

  const toggleExpandBatch = async (batchId: string) => {
    if (expandedBatchId === batchId) {
      setExpandedBatchId(null);
    } else {
      setExpandedBatchId(batchId);
      if (!batchQuestions[batchId] || batchQuestions[batchId].length === 0) {
        setLoadingBatchId(batchId);
        try {
          const qs = await db.listQuestions({ batchId, limit: 500 });
          setBatchQuestions((prev) => ({ ...prev, [batchId]: qs }));
        } finally {
          setLoadingBatchId(null);
        }
      }
    }
  };

  async function handleDeleteBatch(batch: ImportBatch) {
    setIsDeletingBatch(true);
    try {
      await db.deleteImportBatch(batch.id);
      syncNow().catch(() => {});
      await client.invalidateQueries({ queryKey: ["import-batches"] });
      await client.invalidateQueries({ queryKey: ["questions"] });
      await client.invalidateQueries({ queryKey: ["questions-all-subjects"] });
      await client.invalidateQueries({ queryKey: ["booklet-catalog"] });
      await client.invalidateQueries({ queryKey: ["analytics"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });

      setBatchQuestions((prev) => {
        const next = { ...prev };
        delete next[batch.id];
        return next;
      });
      if (expandedBatchId === batch.id) {
        setExpandedBatchId(null);
      }
      setDeletingBatch(null);
    } catch (err) {
      console.error("Failed to delete batch:", err);
      alert("خطا در حذف دسته سؤالات: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsDeletingBatch(false);
    }
  }

  async function handleDeleteSingle(questionId: string, batchId?: string) {
    setIsDeleting(true);
    try {
      await db.deleteQuestion(questionId);
      syncNow().catch(() => {});
      await client.invalidateQueries({ queryKey: ["import-batches"] });
      await client.invalidateQueries({ queryKey: ["questions"] });
      await client.invalidateQueries({ queryKey: ["questions-all-subjects"] });
      await client.invalidateQueries({ queryKey: ["booklet-catalog"] });
      await client.invalidateQueries({ queryKey: ["analytics"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });

      if (batchId) {
        setBatchQuestions((prev) => ({
          ...prev,
          [batchId]: (prev[batchId] || []).filter((q) => q.id !== questionId),
        }));
      }
      setDeletingQuestion(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleResetQuestionBank() {
    setIsResetting(true);
    try {
      await db.resetQuestionBank();
      syncNow().catch(() => {});
      await client.invalidateQueries();
      setBatchQuestions({});
      setExpandedBatchId(null);
      setShowResetConfirm(false);
    } catch (err) {
      alert("خطا در پاک‌سازی بانک سؤالات: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setIsResetting(false);
    }
  }

  async function submit() {
    setBusy(true);
    setError("");
    setReport(null);
    try {
      const parsed = parseImportJson(source);
      const next = await db.importQuestions(parsed);
      setReport(next);
      await client.invalidateQueries({ queryKey: ["import-batches"] });
      await client.invalidateQueries({ queryKey: ["questions"] });
      await client.invalidateQueries({ queryKey: ["questions-all-subjects"] });
      await client.invalidateQueries({ queryKey: ["booklet-catalog"] });
      await client.invalidateQueries({ queryKey: ["dashboard"] });

      // Automatically expand and load questions of the newly imported batch
      if (next.batchId) {
        setExpandedBatchId(next.batchId);
        const qs = await db.listQuestions({ batchId: next.batchId, limit: 500 });
        setBatchQuestions((prev) => ({ ...prev, [next.batchId!]: qs }));
      }
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
        await client.invalidateQueries({ queryKey: ["import-batches"] });
        await client.invalidateQueries({ queryKey: ["questions"] });
        await client.invalidateQueries({ queryKey: ["questions-all-subjects"] });
        await client.invalidateQueries({ queryKey: ["booklet-catalog"] });
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

  function formatJalaliDate(timestamp: number) {
    try {
      return new Intl.DateTimeFormat("fa-IR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(timestamp));
    } catch {
      return new Date(timestamp).toLocaleDateString("fa-IR");
    }
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
            {(source || report || error) && (
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setSource("");
                  setReport(null);
                  setError("");
                }}
                title="پاکسازی متن ورودی و گزارش فعلی"
              >
                <RotateCcw size={15} />
                <span>پاکسازی و شروع مجدد</span>
              </button>
            )}
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

      {/* Import Sessions & Batches Section */}
      <div className="card-neo p-5 sm:p-6 bg-[var(--surface)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-[var(--surface-cream)] border border-[var(--line)] text-[var(--testino-orange)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              <Layers size={18} />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-black text-[var(--ink)]">
                دسته‌های سؤالات وارد شده (نشست‌های ورود)
              </h2>
              <p className="text-xs text-[var(--muted)] font-bold">
                مشاهده دسته‌ای سؤالات، حذف کل یک نشست ورود یا باز کردن و حذف تکی سؤالات
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {batches.length > 0 && (
              <button
                type="button"
                onClick={() => setShowResetConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-xs font-black text-rose-700 dark:text-rose-300 transition-colors shadow-[1px_1px_0px_var(--neo-shadow)] cursor-pointer"
                title="حذف کامل تمام سوالات از دیتابیس داخلی و سرور ابری"
              >
                <Trash2 size={13} />
                <span>پاک‌سازی کامل بانک سوالات</span>
              </button>
            )}
            <Link
              href="/bank/booklet/"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface-cream)] text-xs font-black text-[var(--ink)] transition-colors shadow-[1px_1px_0px_var(--neo-shadow)]"
            >
              <span>مشاهده در دفترچه (گام ۳)</span>
              <ArrowRight size={13} />
            </Link>
            <Link
              href="/bank/"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface-cream)] text-xs font-black text-[var(--ink)] transition-colors shadow-[1px_1px_0px_var(--neo-shadow)]"
            >
              <span>مشاهده کل بانک (گام ۴)</span>
              <ArrowRight size={13} />
            </Link>
          </div>
        </div>

        {batches.length === 0 ? (
          <div className="text-center py-10 text-[var(--muted)] space-y-2">
            <BookOpen size={32} className="mx-auto text-neutral-400" />
            <p className="text-xs sm:text-sm font-black">هنوز سؤالی در بانک ثبت نشده است.</p>
            <p className="text-[11px] font-bold">
              با چسباندن JSON یا بارگذاری فایل، سؤالات شما به عنوان یک نشست جدید ثبت و در اینجا نمایش داده خواهند شد.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {batches.map((batch) => {
              const isExpanded = expandedBatchId === batch.id;
              const questions = batchQuestions[batch.id] || [];
              const isLoadingThis = loadingBatchId === batch.id;

              return (
                <div
                  key={batch.id}
                  className="rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)]/30 overflow-hidden shadow-[2px_2px_0px_var(--neo-shadow)] transition-all"
                >
                  {/* Batch Header */}
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[var(--surface)] border-b border-[var(--line)]/60">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-[var(--surface-cream)] border border-[var(--line)] text-[var(--testino-orange)] shadow-xs">
                        <FolderArchive size={20} />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-black text-[var(--ink)]">
                            {batch.title}
                          </span>
                          {batch.subject && (
                            <span className="px-2 py-0.5 rounded-md bg-[var(--surface-cream)] border border-[var(--line)] text-[var(--ink)] font-black text-[10px]">
                              {batch.subject}
                            </span>
                          )}
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-black text-[10px]">
                            {batch.questionCount} سؤال
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] font-bold mt-1">
                          <Calendar size={12} />
                          <span>{formatJalaliDate(batch.createdAt)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => setDeletingBatch(batch)}
                        className="px-3 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
                        title="حذف کل سؤالات این دسته"
                      >
                        <Trash2 size={13} />
                        <span>حذف کل دسته</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => toggleExpandBatch(batch.id)}
                        className="px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--ink)] text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
                      >
                        <span>{isExpanded ? "بستن" : "مشاهده سؤالات"}</span>
                        {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Questions List */}
                  {isExpanded && (
                    <div className="p-4 space-y-3 bg-[var(--surface-2)]/20 animate-in fade-in-50 duration-200">
                      {isLoadingThis ? (
                        <div className="flex items-center justify-center py-8 text-[var(--muted)] gap-2 text-xs font-bold">
                          <Loader2 size={16} className="animate-spin text-[var(--testino-orange)]" />
                          <span>در حال بارگذاری سؤالات این دسته…</span>
                        </div>
                      ) : questions.length === 0 ? (
                        <div className="text-center py-6 text-xs text-[var(--muted)] font-bold">
                          هیچ سؤال فعالی در این دسته باقی نمانده است.
                        </div>
                      ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                          {questions.map((q, idx) => {
                            const sNum = q.source?.number || q.externalKey.match(/q(\d+)/i)?.[1] || String(idx + 1);
                            return (
                              <div
                                key={q.id}
                                className="p-3.5 sm:p-4 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] hover:border-[var(--testino-orange)] transition-all flex flex-col sm:flex-row sm:items-start justify-between gap-3 group shadow-[1px_1px_0px_var(--neo-shadow)]"
                              >
                                <div className="flex-1 space-y-2 text-right">
                                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                    <span className="w-6 h-6 rounded-lg bg-[var(--testino-orange)] text-white font-black text-[11px] flex items-center justify-center shadow-xs">
                                      {sNum}
                                    </span>
                                    <span className="px-2 py-0.5 rounded-md bg-[var(--surface-cream)] border border-[var(--line)] text-[var(--ink)] font-black text-[10px]">
                                      {q.subject}
                                    </span>
                                    {q.chapter && (
                                      <span className="text-[10px] text-[var(--muted)] font-bold">• {q.chapter}</span>
                                    )}
                                    {q.source?.year && (
                                      <span className="px-1.5 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 font-mono text-[10px] font-bold">
                                        کنکور {q.source.year}
                                      </span>
                                    )}
                                    <span className="text-[10px] text-[var(--muted)] font-mono">
                                      ({q.externalKey})
                                    </span>
                                  </div>

                                  <div className="text-xs font-black text-[var(--ink)] line-clamp-2 leading-relaxed">
                                    <ContentRenderer blocks={q.content} />
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-start pt-1 sm:pt-0">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingQuestion(q);
                                      setEditorOpen(true);
                                    }}
                                    className="px-2.5 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--testino-orange)] hover:text-white text-[var(--ink)] text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
                                    title="ویرایش این سؤال"
                                  >
                                    <Edit3 size={13} />
                                    <span>ویرایش</span>
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() => setDeletingQuestion({ question: q, batchId: batch.id })}
                                    className="px-2.5 py-1.5 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-xs font-black flex items-center gap-1 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
                                    title="حذف این سؤال"
                                  >
                                    <Trash2 size={13} />
                                    <span>حذف</span>
                                  </button>

                                  <Link
                                    href={`/bank/question/?id=${encodeURIComponent(q.id)}`}
                                    className="p-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--muted)] transition-colors shadow-[1px_1px_0px_var(--neo-shadow)]"
                                    title="مشاهده صفحه سؤال"
                                  >
                                    <ExternalLink size={13} />
                                  </Link>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Batch Confirmation Modal */}
      {deletingBatch && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-6 space-y-4 shadow-[6px_6px_0_var(--neo-shadow)] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--ink)]">حذف کل دسته سؤالات</h3>
                <p className="text-xs text-[var(--muted)] font-bold">
                  {isOwner ? "حذف از دیتابیس کل سیستم" : "پنهان‌سازی از بانک شما"}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink)] leading-relaxed font-bold">
              آیا از حذف دسته <span className="font-black text-[var(--testino-orange)]">{deletingBatch.title}</span> شامل <span className="font-black text-rose-600">{deletingBatch.questionCount} سؤال</span> اطمینان دارید؟ تمام سؤالات این دسته حذف خواهند شد.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeletingBatch}
                onClick={() => setDeletingBatch(null)}
                className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-xs font-black text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeletingBatch}
                onClick={() => void handleDeleteBatch(deletingBatch)}
                className="px-4 py-2.5 rounded-xl border-2 border-rose-600 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white transition-colors cursor-pointer disabled:opacity-60"
              >
                {isDeletingBatch ? "در حال حذف دسته…" : "بله، حذف کل دسته"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Single Question Confirmation Modal */}
      {deletingQuestion && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-6 space-y-4 shadow-[6px_6px_0_var(--neo-shadow)] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300">
                <Trash2 size={20} />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--ink)]">حذف سؤال</h3>
                <p className="text-xs text-[var(--muted)] font-bold">
                  {isOwner ? "حذف از دیتابیس کل سیستم" : "پنهان‌سازی از بانک شما"}
                </p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink)] leading-relaxed font-bold">
              آیا از حذف این سؤال اطمینان دارید؟
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingQuestion(null)}
                className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-xs font-black text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleDeleteSingle(deletingQuestion.question.id, deletingQuestion.batchId)}
                className="px-4 py-2.5 rounded-xl border-2 border-rose-600 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white transition-colors cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? "در حال حذف…" : "بله، حذف شود"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wipe All Questions Confirmation Dialog */}
      {showResetConfirm && (
        <div className="dialog-backdrop animate-in fade-in" onClick={() => !isResetting && setShowResetConfirm(false)}>
          <div
            className="card-neo relative p-6 max-w-md w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)] text-right"
            onClick={(e) => e.stopPropagation()}
            dir="rtl"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)]">
              <Trash2 size={24} />
            </div>

            <h3 className="text-base font-black text-[var(--ink)]">
              پاک‌سازی کامل بانک سؤالات
            </h3>

            <p className="text-xs text-[var(--ink)] leading-relaxed font-bold">
              آیا مطمئن هستید که می‌خواهید <strong>تمامی سؤالات، گزینه‌ها، سشن‌ها و پاسخ‌ها</strong> را از حافظهٔ دستگاه و فضای ابری به طور کامل حذف کنید؟
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-300 dark:border-amber-700 leading-relaxed font-bold">
              پروفایل و دروس انتخابی شما حفظ خواهند شد و فقط بانک سؤالات صفر می‌شود تا بتوانید از ابتدا فایل‌های جدید را وارد کنید.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border)]">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2.5 rounded-xl border-2 border-[var(--border)] bg-[var(--surface)] text-xs font-bold text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleResetQuestionBank}
                className="px-4 py-2.5 rounded-xl border-2 border-rose-600 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white transition-colors cursor-pointer disabled:opacity-60 flex items-center gap-1.5 shadow-[2px_2px_0px_var(--neo-shadow)]"
              >
                {isResetting && <Loader2 size={14} className="animate-spin" />}
                <span>{isResetting ? "در حال پاک‌سازی…" : "بله، همه را پاک کن"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reusable Question Editor Modal (Form / JSON / Multi-Image Attachments) */}
      <QuestionEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingQuestion(null);
        }}
        initialQuestion={editingQuestion}
        onSaved={async () => {
          await client.invalidateQueries({ queryKey: ["import-batches"] });
          await client.invalidateQueries({ queryKey: ["questions"] });
          await client.invalidateQueries({ queryKey: ["questions-all-subjects"] });
          await client.invalidateQueries({ queryKey: ["booklet-catalog"] });
          await client.invalidateQueries({ queryKey: ["dashboard"] });
          if (expandedBatchId) {
            const qs = await db.listQuestions({ batchId: expandedBatchId, limit: 500 });
            setBatchQuestions((prev) => ({ ...prev, [expandedBatchId]: qs }));
          }
          setEditorOpen(false);
          setEditingQuestion(null);
        }}
      />
    </section>
  );
}
