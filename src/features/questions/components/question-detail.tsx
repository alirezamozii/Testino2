"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Lightbulb,
  Play,
  Edit3,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { EmptyState, LoadingState } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { QuestionEditorModal } from "./question-editor-modal";
import { QuestionTrustActions } from "./question-trust-actions";

export function QuestionDetail({ id }: { id: string }) {
  const { db, status } = useDatabase();
  const [editorOpen, setEditorOpen] = useState(false);

  const query = useQuery({
    queryKey: ["question", id],
    queryFn: () => db.getQuestion(id),
    enabled: status === "ready" && Boolean(id),
  });

  if (query.isLoading) {
    return <LoadingState label="در حال بازکردن و خواندن سؤال از بانک…" />;
  }

  const question = query.data;

  if (!question) {
    return (
      <div className="testino-card max-w-2xl mx-auto p-8 text-center">
        <EmptyState
          icon={BookOpen}
          tone="orange"
          title="سؤال مورد نظر پیدا نشد"
          description="ممکن است شناسه سؤال نامعتبر باشد یا سؤال از دیتابیس محلی حذف شده باشد."
          action={
            <Link href="/bank/" className="btn-secondary-clean py-2 px-4 text-xs font-bold">
              <ArrowRight size={16} /> بازگشت به بانک سؤالات
            </Link>
          }
        />
      </div>
    );
  }

  const isPublished = question.status === "published";

  return (
    <div className="page question-detail-page max-w-4xl mx-auto space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/bank/"
          className="btn-secondary-clean py-2 px-3.5 text-xs font-black flex items-center gap-1.5"
        >
          <ArrowRight size={16} />
          <span>بازگشت به بانک سؤالات</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setEditorOpen(true)}
            className="btn-neo-orange py-2 px-3.5 text-xs font-black flex items-center gap-1.5 shadow-[2px_2px_0px_var(--neo-shadow)] cursor-pointer"
            title="ویرایش این سؤال (دستی یا با JSON)"
          >
            <Edit3 size={14} />
            <span>ویرایش سؤال</span>
          </button>

          <Link
            href={`/sessions/new/?subject=${encodeURIComponent(question.subject)}`}
            className="btn-primary-orange py-2 px-4 text-xs font-black flex items-center gap-1.5 shadow-sm"
          >
            <Play size={14} className="fill-current" />
            <span>آزمون از درس {question.subject}</span>
          </Link>
        </div>
      </div>

      {/* Main Question Card */}
      <div className="testino-card p-6 sm:p-8 space-y-6">
        {/* Meta Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-2">
            <span className="testino-chip bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 text-xs font-black">
              {question.subject}
            </span>
            {question.chapter && (
              <span className="testino-chip bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 text-xs font-bold">
                {question.chapter}
              </span>
            )}
            {question.topic && (
              <span className="testino-chip bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 text-xs font-bold">
                {question.topic}
              </span>
            )}
          </div>

          <span
            className={cn(
              "testino-chip text-xs font-black",
              isPublished
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                : "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
            )}
          >
            {isPublished ? "آمادهٔ آزمون" : "پیش‌نویس (فاقد کلید رسمی)"}
          </span>
          <QuestionTrustActions question={question} />
        </div>

        {/* Question Stem Content */}
        <div className="space-y-3">
          <span className="text-xs font-black text-[var(--muted)]">صورت سؤال:</span>
          <div className="text-sm sm:text-base font-black text-[var(--ink)] leading-relaxed bg-[var(--surface-2)]/60 p-4 rounded-2xl border border-[var(--line)]">
            <ContentRenderer blocks={question.content} />
          </div>
        </div>

        {/* 4 Options */}
        <div className="space-y-3 pt-2">
          <span className="text-xs font-black text-[var(--muted)]">گزینه‌های پاسخ:</span>
          <div className="space-y-2.5">
            {question.options.map((option, idx) => {
              const isCorrect = option.id === question.correctOptionId;

              return (
                <div
                  key={option.id}
                  className={cn(
                    "p-4 rounded-2xl border transition-all flex items-center justify-between gap-3",
                    isCorrect
                      ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 shadow-sm"
                      : "bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink)]"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "w-8 h-8 rounded-xl flex items-center justify-center font-black text-xs shrink-0 border",
                        isCorrect
                          ? "bg-emerald-500 text-white border-emerald-500 shadow-sm"
                          : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]"
                      )}
                    >
                      {["الف", "ب", "ج", "د"][idx] || idx + 1}
                    </span>
                    <div className="text-xs sm:text-sm font-bold">
                      <ContentRenderer blocks={option.content} />
                    </div>
                  </div>

                  {isCorrect && (
                    <span className="testino-chip bg-emerald-600 text-white text-[11px] font-black flex items-center gap-1">
                      <CheckCircle2 size={14} />
                      <span>گزینهٔ صحیح</span>
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Detailed Explanation */}
        {question.explanation && question.explanation.length > 0 && (
          <div className="p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 space-y-2.5">
            <h4 className="text-xs sm:text-sm font-black text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
              <BookOpen size={16} />
              <span>پاسخ تشریحی و تحلیل جامع:</span>
            </h4>
            <div className="text-xs sm:text-sm font-bold text-[var(--ink)] leading-relaxed pt-1">
              <ContentRenderer blocks={question.explanation} />
            </div>
          </div>
        )}

        {/* Educational Tip */}
        <div className="p-4 rounded-2xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <Lightbulb size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <strong className="font-black text-amber-900 dark:text-amber-200 block">
              نکته آموزشی تستیونو:
            </strong>
            <p className="font-bold text-amber-800 dark:text-amber-300 leading-relaxed">
              ثبت اشتباهات و بازخوانی نکات کلیدی هر سؤال، سرعت یادآوری شما را در جلسهٔ اصلی کنکور تا ۳ برابر افزایش می‌دهد.
            </p>
          </div>
        </div>
      </div>

      {/* Question Editor Modal */}
      <QuestionEditorModal
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        initialQuestion={question}
      />
    </div>
  );
}
