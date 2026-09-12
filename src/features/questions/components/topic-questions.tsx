"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  Compass,
  Lightbulb,
  Play,
  Search,
  Sparkles,
  X,
  XCircle,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { EmptyState, LoadingState } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";

export function TopicQuestions({ subject, topic }: { subject: string; topic: string }) {
  const { db, status } = useDatabase();

  const [activeFilter, setActiveFilter] = useState<"all" | "unsolved" | "wrong" | "doubtful" | "correct">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Quick Practice Modal State
  const [practicingIndex, setPracticingIndex] = useState<number | null>(null);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [hasRevealedAnswer, setHasRevealedAnswer] = useState(false);

  const query = useQuery({
    queryKey: ["topic-questions", subject, topic],
    queryFn: async () => {
      const all = await db.listQuestions({ subject, limit: 10_000 });
      return all.filter((item) => (item.topic || "بدون موضوع") === topic);
    },
    enabled: status === "ready" && Boolean(subject),
  });

  const questionsData = query.data;
  const questions = useMemo(() => questionsData ?? [], [questionsData]);

  // Filter questions
  const filteredQuestions = useMemo(() => {
    return questions.filter((q) => {
      if (searchTerm.trim()) {
        const text = q.content.map((b) => (b.type === "text" ? b.value : "")).join(" ");
        if (!text.includes(searchTerm.trim())) return false;
      }
      if (activeFilter === "all") return true;
      if (activeFilter === "correct") return q.status === "published";
      if (activeFilter === "unsolved") return q.status !== "published";
      return true;
    });
  }, [questions, activeFilter, searchTerm]);

  // Current active practicing question
  const currentPracticeQ = practicingIndex !== null ? questions[practicingIndex] : null;

  if (query.isLoading) {
    return <LoadingState label="در حال بارگذاری سؤال‌های این موضوع…" />;
  }

  return (
    <div className="page topic-questions-page space-y-6 pb-12">
      {/* Top Navigation */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/bank/subjects/"
          className="btn-secondary-clean py-2 px-3.5 text-xs font-black flex items-center gap-1.5"
        >
          <ArrowRight size={16} />
          <span>بازگشت به درس‌ها</span>
        </Link>

        <Link
          href={`/sessions/new/?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`}
          className="btn-primary-orange py-2 px-4 text-xs font-black flex items-center gap-1.5 shadow-sm"
        >
          <Play size={14} className="fill-current" />
          <span>شروع آزمون از این مبحث</span>
        </Link>
      </div>

      {/* Topic Overview Card (Wireframe 7/20 - Sheet 01) */}
      <div className="testino-card p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 flex items-center justify-center font-black text-xl shadow-inner">
              <Compass size={26} />
            </div>
            <div>
              <span className="text-xs font-bold text-[var(--muted)]">{subject}</span>
              <h1 className="text-lg sm:text-xl font-black text-[var(--ink)] mt-0.5">{topic}</h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="testino-chip bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 text-xs font-black">
              سطح سختی: متوسط
            </span>
            <span className="testino-chip bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300 text-xs font-black">
              {new Intl.NumberFormat("fa-IR").format(questions.length)} سؤال
            </span>
          </div>
        </div>

        {/* 3 Stats from Wireframe 7 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="p-3 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
            <span className="block text-[11px] font-bold text-[var(--muted)]">تعداد سؤال</span>
            <strong className="block text-base font-black text-[var(--ink)] mt-0.5">
              {new Intl.NumberFormat("fa-IR").format(questions.length)}
            </strong>
          </div>
          <div className="p-3 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
            <span className="block text-[11px] font-bold text-[var(--muted)]">درصد حل‌شده</span>
            <strong className="block text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
              ۶۲٪
            </strong>
          </div>
          <div className="p-3 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
            <span className="block text-[11px] font-bold text-[var(--muted)]">سطح سختی</span>
            <strong className="block text-base font-black text-[var(--brand-orange)] mt-0.5">
              متوسط
            </strong>
          </div>
        </div>

        {/* Practice Launcher Action */}
        {questions.length > 0 && (
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setPracticingIndex(0);
                setSelectedOptionId(null);
                setHasRevealedAnswer(false);
              }}
              className="btn-primary-orange py-2.5 px-5 text-xs font-black shadow-sm flex items-center gap-1.5"
            >
              <Sparkles size={16} />
              <span>شروع حل فوری سؤال به سؤال</span>
            </button>
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="testino-card p-4 space-y-3">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در متن سؤالات این موضوع..."
              className="w-full pr-9 pl-3 py-2 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand-orange)]"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 scrollbar-none">
            {([
              { id: "all", label: "همه" },
              { id: "correct", label: "درست‌ها" },
              { id: "wrong", label: "غلط‌ها" },
              { id: "doubtful", label: "شک‌دار" },
              { id: "unsolved", label: "نزده‌ها" },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "py-1.5 px-3 rounded-xl text-xs font-bold transition-all whitespace-nowrap",
                  activeFilter === f.id
                    ? "bg-[var(--brand-orange)] text-white shadow-sm"
                    : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Questions Feed */}
      <div className="space-y-3">
        {filteredQuestions.length === 0 ? (
          <div className="testino-card p-6 text-center">
            <EmptyState
              icon={Search}
              title="سؤالی در این موضوع یافت نشد"
              description="فیلترها را تغییر بده یا به نمای کلی درس‌ها برگرد."
            />
          </div>
        ) : (
          filteredQuestions.map((q, idx) => (
            <div
              key={q.id}
              className="testino-card p-4.5 space-y-3 hover:border-[var(--brand-orange)] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="w-7 h-7 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-black text-xs flex items-center justify-center shrink-0 border border-[var(--line)]">
                    {new Intl.NumberFormat("fa-IR").format(idx + 1)}
                  </span>
                  <span className="testino-chip bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 text-[10px] font-bold">
                    {idx % 3 === 0 ? "متوسط" : idx % 3 === 1 ? "سخت" : "آسان"}
                  </span>
                  <span className="text-[11px] font-bold text-[var(--muted)]">
                    {q.chapter || "بدون فصل"}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPracticingIndex(idx);
                      setSelectedOptionId(null);
                      setHasRevealedAnswer(false);
                    }}
                    className="btn-secondary-clean py-1 px-2.5 text-[11px] font-bold flex items-center gap-1"
                  >
                    <Play size={12} className="fill-current" />
                    <span>حل آزمایشی</span>
                  </button>
                  <Link
                    href={`/bank/question/?id=${q.id}`}
                    className="p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)]"
                    title="مشاهده جزئیات سؤال"
                  >
                    <ChevronLeft size={18} />
                  </Link>
                </div>
              </div>

              {/* Question Text Snippet */}
              <div className="text-xs sm:text-sm font-bold text-[var(--ink)] leading-relaxed line-clamp-3">
                <ContentRenderer blocks={q.content} />
              </div>
            </div>
          ))
        )}
      </div>

      {/* Interactive Quick Practice Modal (Wireframe 7/20 - Sheet 04 & 05) */}
      {currentPracticeQ && practicingIndex !== null && (
        <div
          data-modal="true"
          role="dialog"
          aria-modal="true"
          className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] bg-black/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="testino-card w-full max-w-2xl p-5 sm:p-6 space-y-5 shadow-2xl border-2 border-[var(--brand-orange)] bg-[var(--surface)] max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <div className="flex items-center gap-2">
                <span className="testino-chip bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 text-xs font-black">
                  سؤال {practicingIndex + 1} از {questions.length}
                </span>
                <span className="text-xs font-bold text-[var(--muted)]">{topic}</span>
              </div>
              <button
                type="button"
                onClick={() => setPracticingIndex(null)}
                className="p-1 text-[var(--muted)] hover:text-[var(--ink)] rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Question Stem */}
            <div className="text-sm sm:text-base font-black text-[var(--ink)] leading-relaxed">
              <ContentRenderer blocks={currentPracticeQ.content} />
            </div>

            {/* Options */}
            <div className="space-y-2.5">
              {currentPracticeQ.options.map((opt, oIdx) => {
                const isSelected = selectedOptionId === opt.id;
                const isCorrect = opt.id === currentPracticeQ.correctOptionId;
                const showSuccess = hasRevealedAnswer && isCorrect;
                const showWrong = hasRevealedAnswer && isSelected && !isCorrect;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (!hasRevealedAnswer) setSelectedOptionId(opt.id);
                    }}
                    className={cn(
                      "w-full p-3.5 rounded-2xl border text-right transition-all flex items-center justify-between gap-3",
                      showSuccess
                        ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100"
                        : showWrong
                        ? "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-100"
                        : isSelected
                        ? "bg-orange-50 dark:bg-orange-950/30 border-[var(--brand-orange)] shadow-sm"
                        : "bg-[var(--surface-2)] border-[var(--line)] hover:border-[var(--brand-orange)]/40"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border",
                          showSuccess
                            ? "bg-emerald-500 text-white border-emerald-500"
                            : showWrong
                            ? "bg-red-500 text-white border-red-500"
                            : isSelected
                            ? "bg-[var(--brand-orange)] text-white border-[var(--brand-orange)]"
                            : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]"
                        )}
                      >
                        {["الف", "ب", "ج", "د"][oIdx] || oIdx + 1}
                      </span>
                      <div className="text-xs sm:text-sm font-bold text-[var(--ink)]">
                        <ContentRenderer blocks={opt.content} />
                      </div>
                    </div>

                    {showSuccess && <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />}
                    {showWrong && <XCircle size={20} className="text-red-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Answer Reveal & Explanation Box */}
            {hasRevealedAnswer && (
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-200 font-black text-xs sm:text-sm">
                  <CheckCircle2 size={18} />
                  <span>پاسخ صحیح گزینهٔ {["الف", "ب", "ج", "د"][currentPracticeQ.options.findIndex((o) => o.id === currentPracticeQ.correctOptionId)] || "اول"} است.</span>
                </div>

                {currentPracticeQ.explanation && currentPracticeQ.explanation.length > 0 && (
                  <div className="text-xs font-bold text-[var(--ink)] space-y-1 pt-1 border-t border-emerald-200/60 dark:border-emerald-800/60">
                    <strong className="block text-emerald-900 dark:text-emerald-300">توضیح تشریحی:</strong>
                    <ContentRenderer blocks={currentPracticeQ.explanation} />
                  </div>
                )}

                <div className="flex items-start gap-2 pt-2 text-[11px] font-bold text-amber-800 dark:text-amber-300 bg-amber-50/80 dark:bg-amber-950/40 p-2.5 rounded-xl border border-amber-200 dark:border-amber-800">
                  <Lightbulb size={16} className="shrink-0 mt-0.5 text-amber-600" />
                  <span>نکته آموزشی: در این نوع سؤالات، بررسی شرایط مرزی و دامنه تابع، سریع‌ترین راه حذف گزینه‌های نادرست است.</span>
                </div>
              </div>
            )}

            {/* Modal Navigation Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[var(--line)]">
              <button
                type="button"
                disabled={practicingIndex === 0}
                onClick={() => {
                  setPracticingIndex(practicingIndex - 1);
                  setSelectedOptionId(null);
                  setHasRevealedAnswer(false);
                }}
                className="btn-secondary-clean py-2 px-3 text-xs font-bold flex items-center gap-1 disabled:opacity-40"
              >
                <ArrowRight size={14} />
                <span>سؤال قبل</span>
              </button>

              {!hasRevealedAnswer ? (
                <button
                  type="button"
                  disabled={!selectedOptionId}
                  onClick={() => setHasRevealedAnswer(true)}
                  className="btn-primary-orange py-2 px-5 text-xs font-black shadow-sm disabled:opacity-40"
                >
                  ثبت و نمایش پاسخ
                </button>
              ) : (
                <button
                  type="button"
                  disabled={practicingIndex >= questions.length - 1}
                  onClick={() => {
                    setPracticingIndex(practicingIndex + 1);
                    setSelectedOptionId(null);
                    setHasRevealedAnswer(false);
                  }}
                  className="btn-primary-orange py-2 px-5 text-xs font-black shadow-sm flex items-center gap-1 disabled:opacity-40"
                >
                  <span>سؤال بعدی</span>
                  <ArrowLeft size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
