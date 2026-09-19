"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  Edit,
  Play,
  Search,
  Sparkles,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { EmptyState, LoadingState } from "@/components/ui/testino-ui";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";
import { QuestionEditorModal } from "@/features/questions/components/question-editor-modal";
import { QuestionTrustActions } from "@/features/questions/components/question-trust-actions";
import { useDatabase } from "@/providers/database-provider";
import type { StoredQuestion } from "@/features/questions/domain/question-schema";
import { cn } from "@/lib/utils";

export function TopicQuestions({ subject, topic }: { subject: string; topic: string }) {
  const { db, status } = useDatabase();
  const queryClient = useQueryClient();

  const [activeFilter, setActiveFilter] = useState<"all" | "unsolved" | "wrong" | "doubtful" | "correct">("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Edit question modal state
  const [editingQuestion, setEditingQuestion] = useState<StoredQuestion | null>(null);

  // Delete question confirmation modal state
  const [deletingQuestion, setDeletingQuestion] = useState<StoredQuestion | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const handleDeleteQuestion = async () => {
    if (!deletingQuestion) return;
    setIsDeleting(true);
    try {
      await db.deleteQuestion(deletingQuestion.id);
      await queryClient.invalidateQueries({ queryKey: ["topic-questions", subject, topic] });
      await queryClient.invalidateQueries({ queryKey: ["subject-browser-questions"] });
      await queryClient.invalidateQueries({ queryKey: ["subject-stats"] });
      setDeletingQuestion(null);
    } catch (err) {
      console.error("Failed to delete question:", err);
      alert("خطا در حذف سؤال. لطفاً مجدداً تلاش کنید.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (query.isLoading) {
    return <LoadingState label="در حال بارگذاری سؤال‌های این موضوع…" />;
  }

  return (
    <div className="page topic-questions-page max-w-5xl mx-auto space-y-6 pb-16">
      {/* 1. Global Bank Navigation Tabs */}
      <BankNavTabs activeTab="bank" />

      {/* 2. Top Header & Breadcrumb */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-2 text-xs font-black text-[var(--muted)] flex-wrap">
          <Link
            href="/bank/"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            <ChevronRight size={16} />
            <span>بانک سؤالات</span>
          </Link>
          <span>/</span>
          <Link
            href={`/bank/subject/?name=${encodeURIComponent(subject)}`}
            className="hover:text-[var(--brand-orange)] transition-colors underline decoration-dotted underline-offset-4"
          >
            {subject}
          </Link>
          <span>/</span>
          <span className="text-[var(--ink)] font-black">موضوع: {topic}</span>
        </div>

        <Link
          href={`/sessions/new/?subject=${encodeURIComponent(subject)}&topic=${encodeURIComponent(topic)}`}
          className="btn-neo-orange py-2 px-4 text-xs font-black flex items-center gap-1.5"
        >
          <Play size={14} className="fill-current" />
          <span>شروع آزمون از این مبحث</span>
        </Link>
      </div>

      {/* 3. Neo-Brutalism Topic Banner */}
      <div className="card-neo p-5 bg-gradient-to-r from-[var(--pastel-yellow)]/30 via-[var(--surface)] to-[var(--surface)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
                درس {subject}
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                {questions.length} سؤال در این مبحث
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-[var(--ink)] mt-2">
              {topic}
            </h1>
            <p className="text-xs text-[var(--muted)] font-bold mt-1">
              فهرست کامل تست‌های این مبحث به همراه مشاهده گزینه‌ها، پاسخ صحیح، ویرایش و تمرین سریع
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)] flex-shrink-0">
            <Compass size={28} />
          </div>
        </div>
      </div>

      {/* 4. Filter & Search Controls */}
      <div className="card-neo p-4 space-y-3 bg-[var(--surface)]">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 sm:max-w-md">
            <Search size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="جستجو در متن سؤالات این موضوع..."
              className="w-full pr-10 pl-3 py-2 text-xs font-bold rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)]"
            />
          </div>

          {/* Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {([
              { id: "all", label: "همه" },
              { id: "correct", label: "منتشر شده" },
              { id: "unsolved", label: "پیش‌نویس" },
            ] as const).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id)}
                className={cn(
                  "py-1.5 px-3.5 rounded-xl text-xs font-black border-2 border-[var(--line-strong)] transition-all whitespace-nowrap",
                  activeFilter === f.id
                    ? "bg-[var(--brand-orange)] text-white shadow-[2px_2px_0px_var(--neo-shadow)] -translate-x-[1px] -translate-y-[1px]"
                    : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 5. Questions Feed */}
      <div className="space-y-4">
        {filteredQuestions.length === 0 ? (
          <div className="card-neo p-8 text-center bg-[var(--surface)]">
            <EmptyState
              icon={Search}
              title="سؤالی در این موضوع یافت نشد"
              description="می‌توانید فیلتر جستجو را تغییر دهید یا سؤال جدیدی به این موضوع اضافه کنید."
            />
          </div>
        ) : (
          filteredQuestions.map((q, idx) => (
            <div
              key={q.id}
              className="card-neo p-5 space-y-4 bg-[var(--surface)] hover:border-[var(--brand-orange)] transition-colors"
            >
              {/* Question Card Top Bar */}
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] font-black text-xs flex items-center justify-center shrink-0 border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                    {idx + 1}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full border border-[var(--line-strong)] bg-[var(--surface-2)] text-[11px] font-black text-[var(--ink)]">
                    {q.chapter || "فصل عمومی"}
                  </span>
                  <QuestionTrustActions question={q} compact />
                </div>

                {/* Actions: Practice, Edit, Delete */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPracticingIndex(idx);
                      setSelectedOptionId(null);
                      setHasRevealedAnswer(false);
                    }}
                    className="py-1.5 px-3 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--pastel-green-soft)] hover:bg-[var(--brand-green)] hover:text-white text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] transition-all flex items-center gap-1.5"
                    title="حل و سنجش سریع سؤال"
                  >
                    <Play size={13} className="fill-current" />
                    <span>حل آزمایشی</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setEditingQuestion(q)}
                    className="py-1.5 px-3 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--pastel-blue)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] transition-all flex items-center gap-1.5"
                    title="ویرایش متن، گزینه‌ها یا پاسخ سؤال"
                  >
                    <Edit size={13} />
                    <span>ویرایش</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeletingQuestion(q)}
                    className="py-1.5 px-2.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--pastel-red-soft)] hover:bg-rose-500 hover:text-white text-xs font-black text-rose-600 shadow-[2px_2px_0px_var(--neo-shadow)] transition-all flex items-center gap-1"
                    title="حذف سؤال از بانک"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {/* Question Text */}
              <div className="p-3.5 rounded-2xl bg-[var(--surface-2)]/60 border border-[var(--line)] text-xs sm:text-sm font-bold text-[var(--ink)] leading-relaxed">
                <ContentRenderer blocks={q.content} />
              </div>

              {/* Options Grid Preview */}
              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                  {q.options.map((opt, oIdx) => {
                    const isCorrect = opt.id === q.correctOptionId;
                    return (
                      <div
                        key={opt.id}
                        className={cn(
                          "p-2.5 rounded-xl border-2 text-xs font-bold flex items-center justify-between gap-2.5 transition-all",
                          isCorrect
                            ? "bg-[var(--pastel-green-soft)] border-emerald-600 text-emerald-950 font-black shadow-[1px_1px_0px_var(--neo-shadow)]"
                            : "bg-[var(--surface)] border-[var(--line-strong)] text-[var(--ink)]"
                        )}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={cn(
                              "w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 border",
                              isCorrect
                                ? "bg-emerald-600 text-white border-emerald-700"
                                : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line-strong)]"
                            )}
                          >
                            {["الف", "ب", "ج", "د"][oIdx] || oIdx + 1}
                          </span>
                          <div className="truncate">
                            <ContentRenderer blocks={opt.content} />
                          </div>
                        </div>

                        {isCorrect && (
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-emerald-600 text-white shrink-0">
                            پاسخ صحیح
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Quick Practice Modal */}
      {currentPracticeQ && practicingIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-neo bg-[var(--surface)] max-w-xl w-full p-5 sm:p-6 space-y-5 max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line-strong)]">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center font-black text-xs text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                  {practicingIndex + 1}
                </span>
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-[var(--ink)]">
                    حل تمرینی و سنجش سؤال
                  </h3>
                  <span className="text-[10px] text-[var(--muted)] font-bold">
                    {subject} • {topic}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPracticingIndex(null)}
                className="w-8 h-8 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] flex items-center justify-center text-[var(--ink)]"
              >
                <X size={16} />
              </button>
            </div>

            {/* Question Body */}
            <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-xs sm:text-sm font-bold text-[var(--ink)] leading-relaxed">
              <ContentRenderer blocks={currentPracticeQ.content} />
            </div>

            {/* Options Interactive */}
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
                    disabled={hasRevealedAnswer}
                    onClick={() => setSelectedOptionId(opt.id)}
                    className={cn(
                      "w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] text-right transition-all flex items-center justify-between gap-3",
                      showSuccess
                        ? "bg-[var(--pastel-green-soft)] border-emerald-600 text-emerald-950 font-black shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : showWrong
                        ? "bg-[var(--pastel-red-soft)] border-rose-500 text-rose-950 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : isSelected
                        ? "bg-[var(--pastel-yellow-soft)] border-[var(--brand-orange)] shadow-[2px_2px_0px_var(--neo-shadow)] -translate-y-0.5"
                        : "bg-[var(--surface)] hover:bg-[var(--surface-2)] text-[var(--ink)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "w-7 h-7 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border-2 border-[var(--line-strong)]",
                          showSuccess
                            ? "bg-emerald-600 text-white"
                            : showWrong
                            ? "bg-rose-500 text-white"
                            : isSelected
                            ? "bg-[var(--brand-orange)] text-white"
                            : "bg-[var(--surface-2)] text-[var(--ink)]"
                        )}
                      >
                        {["الف", "ب", "ج", "د"][oIdx] || oIdx + 1}
                      </span>
                      <div className="text-xs sm:text-sm font-bold text-[var(--ink)]">
                        <ContentRenderer blocks={opt.content} />
                      </div>
                    </div>

                    {showSuccess && <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />}
                    {showWrong && <XCircle size={20} className="text-rose-600 shrink-0" />}
                  </button>
                );
              })}
            </div>

            {/* Answer Explanation */}
            {hasRevealedAnswer && (
              <div className="p-4 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)] space-y-3">
                <div className="flex items-center gap-2 text-emerald-900 font-black text-xs sm:text-sm">
                  <CheckCircle2 size={18} />
                  <span>
                    پاسخ صحیح گزینهٔ {["الف", "ب", "ج", "د"][currentPracticeQ.options.findIndex((o) => o.id === currentPracticeQ.correctOptionId)] || "اول"} است.
                  </span>
                </div>

                {currentPracticeQ.explanation && currentPracticeQ.explanation.length > 0 && (
                  <div className="text-xs font-bold text-[var(--ink)] space-y-1 pt-1 border-t border-[var(--line-strong)]/30">
                    <strong className="block text-emerald-950 font-black">توضیح تشریحی:</strong>
                    <ContentRenderer blocks={currentPracticeQ.explanation} />
                  </div>
                )}
              </div>
            )}

            {/* Modal Bottom Controls */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t-2 border-[var(--line-strong)]">
              <button
                type="button"
                disabled={practicingIndex === 0}
                onClick={() => {
                  setPracticingIndex(practicingIndex - 1);
                  setSelectedOptionId(null);
                  setHasRevealedAnswer(false);
                }}
                className="py-2 px-3 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-xs font-black text-[var(--ink)] flex items-center gap-1 disabled:opacity-40"
              >
                <ArrowRight size={14} />
                <span>سؤال قبل</span>
              </button>

              {!hasRevealedAnswer ? (
                <button
                  type="button"
                  disabled={!selectedOptionId}
                  onClick={() => setHasRevealedAnswer(true)}
                  className="btn-neo-orange py-2 px-5 text-xs font-black disabled:opacity-40"
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
                  className="btn-neo-orange py-2 px-5 text-xs font-black flex items-center gap-1 disabled:opacity-40"
                >
                  <span>سؤال بعدی</span>
                  <ArrowLeft size={14} />
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <QuestionEditorModal
          isOpen={Boolean(editingQuestion)}
          onClose={() => setEditingQuestion(null)}
          initialQuestion={editingQuestion}
          defaultSubject={subject}
          onSaved={async () => {
            await queryClient.invalidateQueries({ queryKey: ["topic-questions", subject, topic] });
            await queryClient.invalidateQueries({ queryKey: ["subject-browser-questions"] });
            await queryClient.invalidateQueries({ queryKey: ["subject-stats"] });
            setEditingQuestion(null);
          }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingQuestion && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="card-neo bg-[var(--surface)] max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-2.5 text-rose-600 font-black text-sm">
              <Trash2 size={18} />
              <span>حذف سؤال از بانک</span>
            </div>
            <p className="text-xs font-bold text-[var(--ink)] leading-relaxed">
              آیا از حذف این سؤال اطمینان دارید؟ این عملیات قابل بازگشت نخواهد بود.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingQuestion(null)}
                className="py-2 px-4 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-xs font-black text-[var(--ink)]"
              >
                انصراف
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteQuestion}
                className="py-2 px-4 rounded-xl border-2 border-[var(--line-strong)] bg-rose-600 text-white text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-rose-700 disabled:opacity-50"
              >
                {isDeleting ? "در حال حذف..." : "بله، حذف کن"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
