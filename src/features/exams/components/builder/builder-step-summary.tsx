"use client";

import React from "react";
import type { QuestionPoolMode } from "@/database/app-database";
import { QUESTION_POOL_CATEGORIES } from "./builder-step-pool";

export interface BuilderStepSummaryProps {
  selectedSubjects: string[];
  scopeMode: "all" | "custom";
  selectedChapters: string[];
  selectedTopics: string[];
  selectedModes: QuestionPoolMode[];
  feedbackMode: "deferred" | "instant";
  negativeMarking: boolean;
  isContinuous: boolean;
  count: number;
  isTimed: boolean;
  durationMinutes: number;
  selectedSources: Array<"EXAM" | "PERSONAL" | "AI">;
  showAnswerSheet: boolean;
  showExplanations: boolean;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
}

export function BuilderStepSummary({
  selectedSubjects,
  scopeMode,
  selectedChapters,
  selectedTopics,
  selectedModes,
  feedbackMode,
  negativeMarking,
  isContinuous,
  count,
  isTimed,
  durationMinutes,
  selectedSources,
  showAnswerSheet,
  showExplanations,
  shuffleQuestions,
  shuffleOptions,
}: BuilderStepSummaryProps) {
  return (
    <div className="space-y-5 text-center">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
          مرحله ۵ از ۵
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">تأیید و ساخت آزمون</h2>
        <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">تنظیمات را بررسی کنید و آزمون را بسازید.</p>
      </div>

      {/* Summary Card */}
      <div className="p-5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] text-right space-y-3 text-xs sm:text-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
          <span className="text-[var(--muted)] font-bold">درس‌های انتخابی ({selectedSubjects.length}):</span>
          <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
            {selectedSubjects.map((s) => (
              <span
                key={s}
                className="px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line-strong)] text-xs font-black text-[var(--ink)]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)] font-bold">محدوده سرفصل‌ها:</span>
            <strong className="font-black text-[var(--ink)]">
              {scopeMode === "all"
                ? "کل مباحث تمام درس‌های انتخابی"
                : [
                    selectedChapters.length > 0 ? `${selectedChapters.length} فصل` : "",
                    selectedTopics.length > 0 ? `${selectedTopics.length} مبحث` : "",
                  ]
                    .filter(Boolean)
                    .join(" و ") || "تمام سرفصل‌ها"}
            </strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)] font-bold">نوع سوالات:</span>
            <strong className="font-black text-[var(--ink)]">
              {selectedModes.includes("random")
                ? "همه سوالات"
                : selectedModes
                    .map((m) => QUESTION_POOL_CATEGORIES.find((c) => c.id === m)?.title)
                    .filter(Boolean)
                    .join(" + ")}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)] font-bold">شیوه بازخورد:</span>
            <strong className="font-black text-[var(--ink)]">
              {feedbackMode === "instant" ? "تمرین با تحلیل آنی" : "آزمون رسمی"}
            </strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)] font-bold">نمره منفی:</span>
            <strong className="font-black text-[var(--ink)]">
              {negativeMarking ? "دارد (۱/۳)" : "ندارد"}
            </strong>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--line)]">
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)] font-bold">تعداد سوال:</span>
            <strong className="font-black text-[var(--brand-orange)]">
              {isContinuous ? "پیوسته (نامحدود)" : `${count} سؤال`}
            </strong>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-[var(--muted)] font-bold">زمان آزمون:</span>
            <strong className="font-black text-[var(--ink)]">
              {isTimed ? `${durationMinutes} دقیقه` : "آزاد (بدون محدودیت)"}
            </strong>
          </div>
        </div>

        <div className="flex justify-between items-center pb-3 border-b border-[var(--line)]">
          <span className="text-[var(--muted)] font-bold">منبع سؤالات:</span>
          <strong className="font-black text-[var(--ink)]">
            {selectedSources.length === 3
              ? "همه منابع فعال"
              : selectedSources
                  .map((s) => (s === "EXAM" ? "کنکور سراسری" : s === "PERSONAL" ? "تألیفی و جزوات" : "شبیه‌ساز"))
                  .join(" + ")}
          </strong>
        </div>

        <div className="space-y-1 pt-1">
          <span className="text-xs font-black text-[var(--muted)] block">سایر تنظیمات:</span>
          <div className="text-xs text-[var(--ink)] font-bold grid grid-cols-2 gap-1 pr-2">
            <div>• نمایش پاسخ‌نامه: {showAnswerSheet ? "بله" : "خیر"}</div>
            <div>• نمایش تحلیل: {showExplanations ? "بله" : "خیر"}</div>
            <div>• ترتیب سوالات: {shuffleQuestions ? "مخلوط (با حفظ یکپارچگی پسیج)" : "عادی"}</div>
            <div>• ترتیب گزینه‌ها: {shuffleOptions ? "مخلوط" : "عادی"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
