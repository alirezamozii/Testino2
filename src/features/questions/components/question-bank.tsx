"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Plus, Search, BookOpen, ChevronLeft, Layers, Edit3, Trash2, AlertTriangle } from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";
import { QuestionEditorModal } from "./question-editor-modal";
import { QuestionTrustActions } from "./question-trust-actions";
import { getSupabaseClient } from "@/platform/auth/supabase-client";
import type { StoredQuestion } from "@/features/questions/domain/question-schema";

export function QuestionBank() {
  const database = useDatabase();
  const cache = useQueryClient();

  const [viewMode, setViewMode] = useState<"subjects" | "questions">("subjects");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedChapter, setSelectedChapter] = useState<string>("all");
  const [selectedTopic, setSelectedTopic] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedSources, setSelectedSources] = useState<Array<"EXAM" | "PERSONAL" | "AI">>([
    "EXAM",
    "PERSONAL",
    "AI",
  ]);
  const [selectedReviewFilter, setSelectedReviewFilter] = useState<string>("all");

  function toggleSource(s: "EXAM" | "PERSONAL" | "AI") {
    setSelectedSources((prev) => {
      if (prev.includes(s)) {
        if (prev.length === 1) return prev; // keep at least one
        return prev.filter((item) => item !== s);
      }
      return [...prev, s];
    });
  }

  // Question Editor Modal State (Supports both New Question & Edit Existing with multi-images & JSON)
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<StoredQuestion | null>(null);

  // Deletion States
  const [deletingQuestion, setDeletingQuestion] = useState<StoredQuestion | null>(null);
  const [bulkDeleteModalOpen, setBulkDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleDeleteSingle(questionId: string) {
    setIsDeleting(true);
    try {
      await database.db.deleteQuestion(questionId);
      const supabase = getSupabaseClient();
      if (supabase) {
        try {
          await supabase.from("questions").delete().eq("id", questionId);
        } catch {
          // cloud delete failure shouldn't block local
        }
      }
      await cache.invalidateQueries({ queryKey: ["questions"] });
      await cache.invalidateQueries({ queryKey: ["questions-all-subjects"] });
      await cache.invalidateQueries({ queryKey: ["analytics"] });
      setDeletingQuestion(null);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleBulkDelete(onlyCurrentFilter: boolean) {
    setIsDeleting(true);
    try {
      if (onlyCurrentFilter && selectedSubject !== "all") {
        await database.db.deleteAllQuestions({ subject: selectedSubject });
      } else {
        await database.db.resetQuestionBank();
      }
      await cache.invalidateQueries({ queryKey: ["questions"] });
      await cache.invalidateQueries({ queryKey: ["questions-all-subjects"] });
      await cache.invalidateQueries({ queryKey: ["analytics"] });
      await cache.invalidateQueries({ queryKey: ["sessions"] });
      setBulkDeleteModalOpen(false);
    } catch (e) {
      console.error(e);
    } finally {
      setIsDeleting(false);
    }
  }

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });
  const profileId = profilesQuery.data?.[0]?.id;

  const analyticsQuery = useQuery({
    queryKey: ["analytics", profileId],
    queryFn: () => database.db.analytics(profileId!),
    enabled: Boolean(profileId),
  });

  const query = useQuery({
    queryKey: ["questions", { query: searchTerm, subject: selectedSubject, chapter: selectedChapter, topic: selectedTopic, status: selectedStatus }],
    queryFn: () =>
      database.db.listQuestions({
        query: searchTerm.trim() || undefined,
        subject: selectedSubject !== "all" ? selectedSubject : undefined,
        chapter: selectedChapter !== "all" ? selectedChapter : undefined,
        topic: selectedTopic !== "all" ? selectedTopic : undefined,
        status: selectedStatus !== "all" ? (selectedStatus as "draft" | "published") : undefined,
      }),
    enabled: database.status === "ready",
  });

  const catalogQuery = useQuery({
    queryKey: ["questions-all-subjects"],
    queryFn: async () => {
      return database.db.listQuestions({ limit: 10_000 });
    },
    enabled: database.status === "ready",
  });

  const dueReviewsQuery = useQuery({
    queryKey: ["due-reviews-bank"],
    queryFn: () => database.db.listDueReviews(),
    enabled: database.status === "ready",
  });
  const dueQuestionIds = useMemo(
    () => new Set((dueReviewsQuery.data ?? []).map((r) => r.questionId)),
    [dueReviewsQuery.data]
  );

  const subjects = useMemo(() => [...new Set((catalogQuery.data || []).map((q) => q.subject))], [catalogQuery.data]);
  const chapters = useMemo(() => [...new Set((catalogQuery.data || []).filter((q) => selectedSubject === "all" || q.subject === selectedSubject).map((q) => q.chapter).filter((value): value is string => Boolean(value)))], [catalogQuery.data, selectedSubject]);

  const displayedQuestions = useMemo(() => {
    return (query.data || []).filter((q) => {
      if (selectedSources.length < 3) {
        const kind = q.source?.kind || "PERSONAL";
        if (!selectedSources.includes(kind)) return false;
      }
      if (selectedReviewFilter === "due" && !dueQuestionIds.has(q.id)) return false;
      if (selectedReviewFilter === "not_due" && dueQuestionIds.has(q.id)) return false;
      return true;
    });
  }, [query.data, selectedSources, selectedReviewFilter, dueQuestionIds]);

  const totalBankQuestions = catalogQuery.data?.length ?? 0;
  const solvedCount = analyticsQuery.data?.totals?.total ?? 0;
  const solvedPercentage = totalBankQuestions > 0 ? Math.min(100, Math.round((solvedCount / totalBankQuestions) * 100)) : 0;

  return (
    <div className="page bank-page space-y-6 pb-28 sm:pb-16 max-w-4xl mx-auto">
      {/* 4-Step Pipeline Navigation */}
      <BankNavTabs activeTab="bank" />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)]">بانک سؤالات</h1>
          <p className="text-xs sm:text-sm text-[var(--muted)] font-bold mt-0.5">مدیریت، جست‌وجو و دسته‌بندی سؤال‌های چهارگزینه‌ای</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full sm:w-auto">
          <button
            type="button"
            className="h-11 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--testino-orange)] text-white text-xs sm:text-sm font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
            onClick={() => {
              setEditingQuestion(null);
              setEditorOpen(true);
            }}
          >
            <Plus size={18} className="shrink-0" />
            <span>افزودن دستی سؤال</span>
          </button>
          {totalBankQuestions > 0 && (
            <button
              type="button"
              className="h-11 px-4 rounded-2xl border-2 border-red-500 bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300 text-xs sm:text-sm font-black shadow-[2px_2px_0px_#EF4444] hover:bg-red-100 dark:hover:bg-red-900/50 hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer w-full sm:w-auto"
              onClick={() => setBulkDeleteModalOpen(true)}
              title="پاک‌سازی گروهی سؤالات"
            >
              <Trash2 size={17} className="shrink-0" />
              <span>پاک‌سازی سؤالات ({totalBankQuestions})</span>
            </button>
          )}
        </div>
      </div>

      {/* Top 3 Stat Cards (Matching Wireframe 05 Phone 1) */}
      <div className="grid grid-cols-3 gap-3">
        <div className="card-neo p-3.5 sm:p-4 bg-[var(--surface)] text-center">
          <span className="block text-[11px] font-black text-[var(--muted)]">کل سؤالات</span>
          <strong className="text-xl sm:text-2xl font-black text-[var(--ink)] my-0.5 block">{totalBankQuestions}</strong>
          <span className="text-[10px] text-[var(--muted)] font-bold">در بانک شخصی</span>
        </div>
        <div className="card-neo p-3.5 sm:p-4 bg-[var(--surface)] text-center">
          <span className="block text-[11px] font-black text-[var(--muted)]">حل شده</span>
          <strong className="text-xl sm:text-2xl font-black text-[var(--brand-green)] my-0.5 block">{solvedCount}</strong>
          <span className="text-[10px] text-[var(--muted)] font-bold">پاسخ ثبت‌شده</span>
        </div>
        <div className="card-neo p-3.5 sm:p-4 bg-[var(--surface)] text-center">
          <span className="block text-[11px] font-black text-[var(--muted)]">پیشرفت</span>
          <strong className="text-xl sm:text-2xl font-black text-[var(--brand-orange)] my-0.5 block">{solvedPercentage}٪</strong>
          <span className="text-[10px] text-[var(--muted)] font-bold">پوشش کل بانک</span>
        </div>
      </div>

      {/* View Switcher (Matching Wireframe 05) */}
      <div className="flex items-center gap-2 p-1.5 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
        <button
          type="button"
          onClick={() => setViewMode("subjects")}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 flex items-center justify-center gap-1.5",
            viewMode === "subjects"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          <BookOpen size={16} />
          <span>دسته‌بندی درس‌ها ({subjects.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setViewMode("questions")}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 flex items-center justify-center gap-1.5",
            viewMode === "questions"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          <Layers size={16} />
          <span>فهرست کل سؤال‌ها ({totalBankQuestions})</span>
        </button>
      </div>

      {/* VIEW 1: SUBJECTS GRID (Matching Wireframe 05 Phone 1) */}
      {viewMode === "subjects" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-black text-[var(--ink)]">دروس آزمون شما</span>
            <span className="text-[11px] text-[var(--muted)] font-bold">{subjects.length} درس فعال</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {subjects.map((sub, idx) => {
              const countInSubject = (catalogQuery.data || []).filter((q) => q.subject === sub).length;
              const tileColors = ["bg-[var(--pastel-blue)]", "bg-[var(--pastel-yellow)]", "bg-[var(--brand-green)]", "bg-[var(--pastel-orange)]/30", "bg-[var(--pastel-teal)]/30"];
              const tileColor = tileColors[idx % tileColors.length];

              return (
                <div
                  key={sub}
                  className="card-neo p-3.5 sm:p-4 bg-[var(--surface)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className={cn("w-10 h-10 sm:w-11 sm:h-11 rounded-2xl border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center font-black text-sm shrink-0", tileColor)}>
                      {idx + 1}
                    </div>
                    <Link href={`/bank/subject/?name=${encodeURIComponent(sub)}`} className="hover:underline flex-1 min-w-0">
                      <strong className="block text-xs sm:text-sm font-black text-[var(--ink)] truncate">{sub}</strong>
                      <span className="text-[11px] text-[var(--muted)] font-bold">{countInSubject} سؤال موجود • مشاهده جزئیات</span>
                    </Link>
                  </div>

                  <div className="flex items-center gap-2 w-full sm:w-auto self-end sm:self-center shrink-0">
                    <Link
                      href={`/bank/subject/?name=${encodeURIComponent(sub)}`}
                      className="flex-1 sm:flex-none justify-center py-2 sm:py-1.5 px-3 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-[11px] font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1 transition-all"
                    >
                      <span>جزئیات درس</span>
                      <ChevronLeft size={14} />
                    </Link>
                    <Link
                      href={`/sessions/new/?subject=${encodeURIComponent(sub)}`}
                      className="flex-1 sm:flex-none justify-center py-2 sm:py-1.5 px-3.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--brand-orange)] text-white text-[11px] font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all text-center"
                    >
                      آزمون
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* VIEW 2: QUESTIONS LIST WITH ADVANCED FILTERS (Matching Wireframe 05 Phone 4) */}
      {viewMode === "questions" && (
        <div className="space-y-4">
          {/* Search and Filters */}
          <div className="card-neo p-4 bg-[var(--surface)] space-y-3">
            <div className="relative">
              <input
                type="text"
                className="w-full pr-10 pl-4 py-2.5 text-xs font-black rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                placeholder="جست‌وجو در صورت سؤال یا درس..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink)]" />
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <select
                value={selectedSubject}
                onChange={(e) => { setSelectedSubject(e.target.value); setSelectedChapter("all"); setSelectedTopic("all"); }}
                className="text-xs font-black p-2 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none"
              >
                <option value="all">همهٔ درس‌ها</option>
                {subjects.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}
                  </option>
                ))}
              </select>

              {chapters.length > 0 && (
                <select
                  value={selectedChapter}
                  onChange={(e) => { setSelectedChapter(e.target.value); setSelectedTopic("all"); }}
                  className="text-xs font-black p-2 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none"
                >
                  <option value="all">همهٔ فصل‌ها</option>
                  {chapters.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
                </select>
              )}

              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="text-xs font-black p-2 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none"
              >
                <option value="all">همهٔ وضعیت‌ها</option>
                <option value="published">آمادهٔ آزمون</option>
                <option value="draft">پیش‌نویس</option>
              </select>

              {/* Multi-select source filter checkboxes */}
              <div className="flex items-center gap-1.5 bg-[var(--surface-2)] p-1 rounded-xl border-2 border-[var(--line-strong)]">
                <span className="text-[10px] font-black text-[var(--muted)] px-1">منبع:</span>
                {[
                  { id: "EXAM" as const, label: "کنکور سراسری" },
                  { id: "PERSONAL" as const, label: "تألیفی" },
                  { id: "AI" as const, label: "شبیه‌ساز" },
                ].map((s) => {
                  const isChecked = selectedSources.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSource(s.id)}
                      className={cn(
                        "px-2 py-1 rounded-lg text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
                        isChecked
                          ? "bg-[var(--brand-orange)] text-white shadow-[1px_1px_0px_var(--neo-shadow)]"
                          : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
                      )}
                    >
                      <div
                        className={cn(
                          "w-3.5 h-3.5 rounded border flex items-center justify-center text-[9px]",
                          isChecked
                            ? "border-white bg-white/20 text-white"
                            : "border-[var(--line-strong)] bg-transparent text-transparent"
                        )}
                      >
                        ✓
                      </div>
                      <span>{s.label}</span>
                    </button>
                  );
                })}
              </div>

              <select
                value={selectedReviewFilter}
                onChange={(e) => setSelectedReviewFilter(e.target.value)}
                className="text-xs font-black p-2 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none"
              >
                <option value="all">همهٔ سؤال‌ها</option>
                <option value="due">در نوبت مرور ({dueQuestionIds.size})</option>
                <option value="not_due">بدون مرور معوق</option>
              </select>
            </div>
          </div>

          {/* Action Bar (Count + Bulk Delete) */}
          {displayedQuestions.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-1 text-xs">
              <span className="font-bold text-[var(--muted)]">
                نمایش {displayedQuestions.length} سؤال از بانک
              </span>
              <button
                type="button"
                onClick={() => setBulkDeleteModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50/80 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 hover:bg-rose-100 font-black cursor-pointer transition-all shadow-[1px_1px_0px_var(--neo-shadow)]"
                title="پاک‌سازی گروهی سؤالات"
              >
                <Trash2 size={13} />
                <span>{selectedSubject !== "all" ? `پاک‌سازی سؤالات ${selectedSubject}` : "پاک‌سازی سؤالات"}</span>
              </button>
            </div>
          )}

          {/* Question Cards List */}
          <div className="space-y-3">
            {query.isLoading ? (
              <LoadingState label="در حال بارگذاری بانک سؤال…" />
            ) : query.isError ? (
              <ErrorState message="بانک سؤال خوانده نشد." retry={() => void query.refetch()} />
            ) : !displayedQuestions.length ? (
              <div className="card-neo p-8 text-center bg-[var(--surface)]">
                <EmptyState
                  icon={BookOpen}
                  tone="purple"
                  title="سؤالی پیدا نشد"
                  description={searchTerm || selectedSubject !== "all" || selectedSources.length < 3 || selectedReviewFilter !== "all" ? "عبارت یا فیلتر را تغییر بده؛ سؤال‌ها حذف نشده‌اند." : "با فایل JSON یا فرم دستی، اولین سؤال بانک شخصی‌ات را اضافه کن."}
                  action={!searchTerm && selectedSubject === "all" ? <Link className="btn-neo-orange py-2.5 px-4 text-xs font-black" href="/import/"><FileUp size={16} /> ورود سؤال</Link> : undefined}
                />
              </div>
            ) : (
              displayedQuestions.map((question) => (
                <div
                  key={question.id}
                  className="card-neo p-4 bg-[var(--surface)] flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:-translate-y-0.5 transition-all group"
                >
                  <Link
                    href={`/bank/question/?id=${question.id}`}
                    className="space-y-2 flex-1 text-right block"
                  >
                    <div className="text-xs sm:text-sm font-black leading-relaxed text-[var(--ink)]">
                      <ContentRenderer blocks={question.content} />
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-[var(--muted)] font-bold">
                      <span className="px-2 py-0.5 rounded-md bg-[var(--surface-cream)] border border-[var(--line-strong)] text-[var(--ink)] font-black">
                        {question.subject}
                      </span>
                      {question.chapter && <span>• {question.chapter}</span>}
                      {question.topic && <span>• {question.topic}</span>}
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-start">
                    <QuestionTrustActions question={question} compact />
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setEditingQuestion(question);
                        setEditorOpen(true);
                      }}
                      className="px-2.5 py-1 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] hover:bg-[var(--surface-cream)] hover:border-[var(--testino-orange)] text-[var(--ink)] text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
                      title="ویرایش این سؤال (دستی یا با JSON)"
                    >
                      <Edit3 size={12} className="text-[var(--testino-orange)]" />
                      <span>ویرایش</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        setDeletingQuestion(question);
                      }}
                      className="px-2.5 py-1 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/60 text-rose-700 dark:text-rose-300 text-[11px] font-black flex items-center gap-1 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
                      title="حذف این سؤال از بانک"
                    >
                      <Trash2 size={12} />
                      <span>حذف</span>
                    </button>

                    <span
                      className={cn(
                        "text-[10px] font-black px-2.5 py-1 rounded-xl border-2 border-[var(--line-strong)]",
                        question.status === "published"
                          ? "bg-[var(--brand-green)] text-[var(--ink-on-color)] dark:text-[var(--ink-on-color)]"
                          : "bg-[var(--pastel-blue)] text-[var(--ink-on-color)] dark:text-[var(--ink-on-color)]"
                      )}
                    >
                      {question.status === "published" ? "آمادهٔ آزمون" : "پیش‌نویس"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Global Question Editor Modal (Multi-Image + Dual Mode Form & JSON) */}
      <QuestionEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingQuestion(null);
        }}
        initialQuestion={editingQuestion}
        defaultSubject={selectedSubject !== "all" ? selectedSubject : subjects[0] || ""}
      />

      {/* Single Question Delete Confirmation Modal */}
      {deletingQuestion && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-6 space-y-4 shadow-[6px_6px_0_var(--neo-shadow)] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--ink)]">حذف سؤال از بانک</h3>
                <p className="text-xs text-[var(--muted)] font-bold">این عملیات غیرقابل بازگشت است.</p>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)] space-y-1.5 text-xs">
              <div className="font-black text-[var(--ink)]">
                درس: {deletingQuestion.subject} {deletingQuestion.chapter ? `• ${deletingQuestion.chapter}` : ""}
              </div>
              <div className="text-[var(--muted)] line-clamp-2">
                <ContentRenderer blocks={deletingQuestion.content} />
              </div>
            </div>

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
                onClick={() => void handleDeleteSingle(deletingQuestion.id)}
                className="px-4 py-2.5 rounded-xl border-2 border-rose-600 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white transition-colors cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? "در حال حذف…" : "بله، حذف شود"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Delete Confirmation Modal */}
      {bulkDeleteModalOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-6 space-y-4 shadow-[6px_6px_0_var(--neo-shadow)] animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-2.5 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border border-rose-300">
                <AlertTriangle size={22} />
              </div>
              <div>
                <h3 className="text-base font-black text-[var(--ink)]">پاک‌سازی گروهی سؤالات</h3>
                <p className="text-xs text-[var(--muted)] font-bold">تمامی سؤالات انتخابی از بانک حذف خواهند شد.</p>
              </div>
            </div>

            <p className="text-xs text-[var(--ink)] leading-relaxed font-bold">
              {selectedSubject !== "all"
                ? `آیا مطمئن هستید که می‌خواهید تمام سؤالات مربوط به درس «${selectedSubject}» را پاک‌سازی کنید؟`
                : "آیا مطمئن هستید که می‌خواهید کلیه سؤالات موجود در بانک را حذف و پاک‌سازی کنید؟"}
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setBulkDeleteModalOpen(false)}
                className="px-4 py-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-xs font-black text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              >
                انصراف
              </button>
              {selectedSubject !== "all" && (
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => void handleBulkDelete(true)}
                  className="px-4 py-2.5 rounded-xl border-2 border-amber-600 bg-amber-600 hover:bg-amber-700 text-xs font-black text-white transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isDeleting ? "در حال پاک‌سازی…" : `فقط سؤالات ${selectedSubject}`}
                </button>
              )}
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => void handleBulkDelete(false)}
                className="px-4 py-2.5 rounded-xl border-2 border-rose-600 bg-rose-600 hover:bg-rose-700 text-xs font-black text-white transition-colors cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? "در حال پاک‌سازی…" : "پاک‌سازی تمام سؤالات"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
