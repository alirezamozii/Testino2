"use client";

import React from "react";
import {
  Bookmark,
  BookOpen,
  Check,
  HelpCircle,
  RotateCcw,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { cn } from "@/lib/utils";
import type { SessionView } from "@/database/app-database";
import type { ContentBlock } from "@/features/questions/domain/question-schema";

const PERSIAN_LETTERS = ["الف", "ب", "ج", "د"];

export interface ExamActiveQuestionProps {
  current: SessionView["questions"][number];
  index: number;
  fontSize: "normal" | "large" | "xlarge";
  isFlagged: boolean;
  onToggleFlag: (index: number) => void;
  displayQuestionContent?: ContentBlock[];
  options: Array<{ id: string; content: ContentBlock[] }>;
  isCurrentRevealed: boolean;
  displayExplanation?: ContentBlock[];
  isPaused?: boolean;
  onSaveAnswer: (optionId: string | null, confidence: "sure" | "doubtful" | "guess" | null) => void;
}

export function ExamActiveQuestion({
  current,
  index,
  fontSize,
  isFlagged,
  onToggleFlag,
  displayQuestionContent,
  options,
  isCurrentRevealed,
  displayExplanation,
  isPaused = false,
  onSaveAnswer,
}: ExamActiveQuestionProps) {
  return (
    <>
      {/* Question Statement Card (Wireframe 09 Phone 2 & 4) */}
      <div className="card-neo p-5 sm:p-6 space-y-4 bg-[var(--surface)]">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="inline-block text-[11px] font-black px-3 py-1 rounded-xl bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              {current.snapshot.subject} {current.snapshot.chapter ? `• ${current.snapshot.chapter}` : ""}
            </span>
            {current.confidence === "doubtful" ? (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 text-amber-950 dark:text-amber-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                <HelpCircle size={12} />
                <span>با شک</span>
              </span>
            ) : current.confidence === "guess" ? (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-[var(--brand-purple)]/20 dark:bg-purple-950/60 border-2 border-[var(--brand-purple)] text-purple-950 dark:text-purple-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                <Zap size={12} />
                <span>حدس زدم</span>
              </span>
            ) : current.selectedOptionId ? (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 text-emerald-950 dark:text-emerald-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                <Check size={12} />
                <span>مطمئن</span>
              </span>
            ) : (
              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                <XCircle size={12} />
                <span>بی‌پاسخ</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={isPaused}
              onClick={() => {
                if (isPaused) return;
                onToggleFlag(index);
              }}
              className={cn(
                "p-2 rounded-xl border-2 transition-all cursor-pointer",
                isPaused && "opacity-50 pointer-events-none cursor-not-allowed",
                isFlagged
                  ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
              )}
              title="نشان‌گذاری سؤال برای مرور بعدی"
            >
              <Bookmark size={16} fill={isFlagged ? "currentColor" : "none"} />
            </button>
          </div>
        </div>

        <div
          className={cn(
            "font-bold leading-relaxed text-[var(--ink)] transition-all",
            fontSize === "large"
              ? "text-base sm:text-lg"
              : fontSize === "xlarge"
              ? "text-lg sm:text-xl"
              : "text-sm sm:text-base"
          )}
        >
          <ContentRenderer blocks={displayQuestionContent || current.snapshot.content} />
        </div>
      </div>

      {/* 4 Interactive Option Cards (الف, ب, ج, د) */}
      <div className="space-y-2.5">
        {options.map((option, optIdx) => {
          if (!option) return null;
          const isSelected = current.selectedOptionId === option.id;
          const letter = PERSIAN_LETTERS[optIdx] || String(optIdx + 1);

          // Instant feedback evaluated view
          if (isCurrentRevealed) {
            const isCorrect = option.id === current.snapshot.correctOptionId;
            const isUserWrong = isSelected && !isCorrect;

            return (
              <div
                key={option.id}
                className={cn(
                  "w-full p-4 rounded-2xl border-2 text-right transition-all flex items-center gap-3.5",
                  isCorrect
                    ? "border-emerald-500 bg-[var(--pastel-green-soft)] text-emerald-950 dark:text-emerald-100 shadow-[3px_3px_0px_#10b981]"
                    : isUserWrong
                    ? "border-red-500 bg-[var(--pastel-red-soft)] text-red-950 dark:text-red-100 shadow-[3px_3px_0px_#ef4444]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] opacity-60"
                )}
              >
                {/* Persian Letter Badge */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-xl border-2 flex items-center justify-center font-black text-xs flex-shrink-0",
                    isCorrect
                      ? "bg-emerald-500 text-white border-emerald-600"
                      : isUserWrong
                      ? "bg-red-500 text-white border-red-600"
                      : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)]"
                  )}
                >
                  {letter}
                </div>

                {/* Option Content */}
                <div
                  className={cn(
                    "flex-1 text-right font-bold",
                    fontSize === "large" ? "text-base sm:text-lg" : fontSize === "xlarge" ? "text-lg sm:text-xl" : "text-sm sm:text-base",
                    isCorrect ? "text-emerald-950 dark:text-emerald-100 font-black" : isUserWrong ? "text-red-950 dark:text-red-100 font-black" : "text-[var(--ink)]"
                  )}
                >
                  <ContentRenderer blocks={option.content} />
                </div>

                {/* Status Badge */}
                {isCorrect && (
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
                    <Check size={14} className="stroke-[3]" />
                    <span>پاسخ صحیح</span>
                  </span>
                )}
                {isUserWrong && (
                  <span className="px-2.5 py-1 rounded-xl bg-red-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
                    <X size={14} className="stroke-[3]" />
                    <span>انتخاب شما</span>
                  </span>
                )}
              </div>
            );
          }

          // Normal interactive option button
          return (
            <button
              key={option.id}
              type="button"
              disabled={isPaused}
              onClick={() => {
                if (isPaused) return;
                if (isSelected) {
                  onSaveAnswer(null, null);
                } else {
                  const nextConf = current.confidence === "doubtful" ? "doubtful" : current.confidence === "guess" ? "guess" : "sure";
                  onSaveAnswer(option.id, nextConf);
                }
              }}
              className={cn(
                "w-full p-3.5 sm:p-4 rounded-2xl border-2 text-right transition-colors flex items-center gap-3 sm:gap-3.5 cursor-pointer active:scale-[0.99]",
                isPaused && "opacity-40 pointer-events-none cursor-not-allowed select-none",
                isSelected
                  ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[3px_3px_0px_var(--neo-shadow)]"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-cream)]"
              )}
            >
              {/* Persian Letter Badge */}
              <div
                className={cn(
                  "w-8 h-8 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center font-black text-xs flex-shrink-0 transition-colors",
                  isSelected ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)]" : "bg-[var(--surface-cream)] text-[var(--ink-on-color)]"
                )}
              >
                {letter}
              </div>

              {/* Option Content */}
              <div
                className={cn(
                  "flex-1 text-right font-bold text-[var(--ink)]",
                  fontSize === "large" ? "text-base sm:text-lg" : fontSize === "xlarge" ? "text-lg sm:text-xl" : "text-sm sm:text-base"
                )}
              >
                <ContentRenderer blocks={option.content} />
              </div>

              {/* Radio Indicator */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full border-2 border-[var(--line-strong)] flex items-center justify-center flex-shrink-0 transition-all",
                  isSelected ? "bg-[var(--ink)]" : "bg-[var(--surface)]"
                )}
              >
                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[var(--surface)]" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Instant Feedback: شناسنامه تست و پاسخ تشریحی ۳ گامی */}
      {isCurrentRevealed && (
        <div className="card-neo p-5 space-y-4 bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
          {/* Header: شناسنامه تست */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--line)] flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <BookOpen size={16} />
              </div>
              <div>
                <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                  شناسنامه و تحلیل تست کنکور
                </strong>
                <span className="text-[10px] text-[var(--muted)] font-bold">
                  بررسی مفهومی، دام‌های تستی و راهبرد حل
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-black">
              <span className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--ink)] shadow-sm">
                درس: {current.snapshot.subject}
              </span>
              {current.snapshot.chapter && (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--muted)] shadow-sm">
                  فصل: {current.snapshot.chapter}
                </span>
              )}
              {current.snapshot.topic && (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--pastel-blue-soft)] border border-[var(--line-strong)] text-[var(--ink)] shadow-sm">
                  مبحث: {current.snapshot.topic}
                </span>
              )}
              {current.snapshot.externalKey && (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)]">
                  شناسه: {current.snapshot.externalKey}
                </span>
              )}
            </div>
          </div>

          {/* Explanation Content */}
          {current.snapshot.explanation && current.snapshot.explanation.length > 0 ? (
            <div className="pt-1 text-right text-xs sm:text-sm font-bold leading-relaxed text-[var(--ink)] space-y-2">
              <ContentRenderer blocks={displayExplanation || []} />
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[var(--surface-2)] text-xs text-[var(--muted)] font-bold text-right">
              پاسخ تشریحی برای این سؤال ثبت نشده است.
            </div>
          )}
        </div>
      )}

      {/* Confidence Action Pills & Clear Selection (only when not yet revealed): شک دارم | حدس زدم | پاک کردن */}
      {!isCurrentRevealed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 pt-1 w-full">
          {/* 1. شک دارم */}
          <button
            type="button"
            disabled={isPaused}
            onClick={() => {
              if (isPaused) return;
              const nextConf = current.confidence === "doubtful" ? (current.selectedOptionId ? "sure" : null) : "doubtful";
              onSaveAnswer(current.selectedOptionId ?? null, nextConf);
            }}
            className={cn(
              "w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 text-xs sm:text-sm font-black transition-all cursor-pointer active:scale-[0.98]",
              isPaused && "opacity-40 pointer-events-none cursor-not-allowed select-none",
              current.confidence === "doubtful"
                ? "bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-500 shadow-[2px_2px_0px_#f59e0b]"
                : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
            title="اگر بین دو یا سه گزینه تردید دارید"
          >
            <HelpCircle size={16} />
            <span>{current.confidence === "doubtful" ? "با شک" : "شک دارم"}</span>
          </button>

          {/* 2. حدس زدم */}
          <button
            type="button"
            disabled={isPaused}
            onClick={() => {
              if (isPaused) return;
              const nextConf = current.confidence === "guess" ? (current.selectedOptionId ? "sure" : null) : "guess";
              onSaveAnswer(current.selectedOptionId ?? null, nextConf);
            }}
            className={cn(
              "w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 text-xs sm:text-sm font-black transition-all cursor-pointer active:scale-[0.98]",
              isPaused && "opacity-40 pointer-events-none cursor-not-allowed select-none",
              current.confidence === "guess"
                ? "bg-purple-100 dark:bg-purple-950/70 text-purple-950 dark:text-purple-200 border-purple-500 shadow-[2px_2px_0px_#a855f7]"
                : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
            title="اگر بدون اطمینان علمی و صرفاً بر پایه شانس گزینه زده‌اید"
          >
            <Zap size={16} />
            <span>{current.confidence === "guess" ? "حدسی" : "حدس زدم"}</span>
          </button>

          {/* 3. پاک کردن انتخاب گزینه */}
          {current.selectedOptionId ? (
            <button
              type="button"
              disabled={isPaused}
              onClick={() => {
                if (isPaused) return;
                onSaveAnswer(null, null);
              }}
              className={cn(
                "col-span-2 sm:col-span-1 w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-rose-600 shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer active:scale-[0.98]",
                isPaused && "opacity-40 pointer-events-none cursor-not-allowed select-none"
              )}
              title="پاک کردن انتخاب گزینه"
            >
              <RotateCcw size={15} />
              <span>پاک کردن انتخاب</span>
            </button>
          ) : (
            <div className="hidden sm:block" />
          )}
        </div>
      )}
    </>
  );
}
