"use client";

import React from "react";
import { Check, Clock, Infinity, ListOrdered, Sparkles, Timer, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSafeInt, sanitizeIntegerInput } from "@/lib/number-utils";

export interface BuilderStepConfigProps {
  feedbackMode: "deferred" | "instant";
  onFeedbackModeChange: (mode: "deferred" | "instant") => void;
  count: number;
  onCountChange: (count: number) => void;
  isContinuous: boolean;
  onIsContinuousChange: (cont: boolean) => void;
  presetCounts: number[];
  availableCount: number;
  isTimed: boolean;
  onIsTimedChange: (timed: boolean) => void;
  durationMinutes: number;
  onDurationMinutesChange: (mins: number) => void;
  customMinutes: string;
  onCustomMinutesChange: (val: string) => void;
  timeTouched: boolean;
  onTimeTouchedChange: (touched: boolean) => void;
  suggestedMinutes: number;
  negativeMarking: boolean;
  onNegativeMarkingChange: (val: boolean) => void;
  shuffleQuestions: boolean;
  onShuffleQuestionsChange: (val: boolean) => void;
  shuffleOptions: boolean;
  onShuffleOptionsChange: (val: boolean) => void;
  showAnswerSheet: boolean;
  onShowAnswerSheetChange: (val: boolean) => void;
  showExplanations: boolean;
  onShowExplanationsChange: (val: boolean) => void;
}

export function BuilderStepConfig({
  feedbackMode,
  onFeedbackModeChange,
  count,
  onCountChange,
  isContinuous,
  onIsContinuousChange,
  presetCounts,
  availableCount,
  isTimed,
  onIsTimedChange,
  durationMinutes,
  onDurationMinutesChange,
  customMinutes,
  onCustomMinutesChange,
  timeTouched,
  onTimeTouchedChange,
  suggestedMinutes,
  negativeMarking,
  onNegativeMarkingChange,
  shuffleQuestions,
  onShuffleQuestionsChange,
  shuffleOptions,
  onShuffleOptionsChange,
  showAnswerSheet,
  onShowAnswerSheetChange,
  showExplanations,
  onShowExplanationsChange,
}: BuilderStepConfigProps) {
  return (
    <div className="space-y-5">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
          مرحله ۴ از ۵
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">تنظیمات و شیوه برگزاری</h2>
        <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">نوع بازخورد، زمان‌بندی و تنظیمات آزمون را تعیین کنید.</p>
      </div>

      {/* 1. Feedback Mode Selector */}
      <div className="space-y-2">
        <span className="text-xs font-black text-[var(--ink)] block">شیوه پاسخ‌دهی و نمایش نتایج:</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Mode A: آزمون رسمی */}
          <button
            type="button"
            onClick={() => onFeedbackModeChange("deferred")}
            className={cn(
              "p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer",
              feedbackMode === "deferred"
                ? "border-[var(--line-strong)] bg-[var(--pastel-yellow-soft)] shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5"
                : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <Clock size={20} />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--ink)]">
                شبیه‌ساز کنکور
              </span>
            </div>
            <div>
              <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">
                آزمون رسمی
              </strong>
              <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed mt-1">
                پاسخ‌ها و کارنامه فقط پس از پایان آزمون نمایش داده می‌شود.
              </p>
            </div>
          </button>

          {/* Mode B: تمرین و تحلیل آنی */}
          <button
            type="button"
            onClick={() => onFeedbackModeChange("instant")}
            className={cn(
              "p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer",
              feedbackMode === "instant"
                ? "border-[var(--line-strong)] bg-[var(--pastel-green-soft)] shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5"
                : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
            )}
          >
            <div className="flex items-center justify-between w-full">
              <div className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <Sparkles size={20} />
              </div>
              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--ink)]">
                تمرین
              </span>
            </div>
            <div>
              <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">
                تمرین با تحلیل آنی
              </strong>
              <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed mt-1">
                پاسخ و تحلیل هر سوال بلافاصله پس از ثبت گزینه نمایش داده می‌شود.
              </p>
            </div>
          </button>
        </div>
      </div>

      {/* 2. Count & Time Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Question Count Selection */}
        <div className="p-4 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
              <ListOrdered size={16} className="text-[var(--brand-orange)]" />
              <span>تعداد سوال</span>
            </span>
            <span className="text-xs font-black px-3 py-1 rounded-xl bg-[var(--brand-orange)] text-white border-2 border-[var(--line-strong)]">
              {isContinuous ? "پیوسته (بی‌نهایت)" : `${count} سؤال`}
            </span>
          </div>

          {/* Preset numbers + Continuous Mode Button */}
          <div className="grid grid-cols-5 gap-1.5">
            {presetCounts.map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => {
                  onCountChange(num);
                  onIsContinuousChange(false);
                  if (!timeTouched) {
                    onDurationMinutesChange(Math.max(5, Math.round((num * 1.25) / 5) * 5));
                    onCustomMinutesChange("");
                  }
                }}
                className={cn(
                  "py-2.5 rounded-xl text-xs font-black transition-all border-2 cursor-pointer",
                  !isContinuous && count === num
                    ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                    : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
                )}
              >
                {num}
              </button>
            ))}

            <button
              type="button"
              onClick={() => onIsContinuousChange(true)}
              className={cn(
                "py-2.5 px-1 rounded-xl text-xs font-black transition-all border-2 flex items-center justify-center gap-1 cursor-pointer",
                isContinuous
                  ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
              )}
              title="آزمون پیوسته: بدون محدودیت تعداد سوال"
            >
              <Infinity size={13} />
              <span className="text-[10px] sm:text-xs">پیوسته</span>
            </button>
          </div>

          {isContinuous ? (
            <div className="p-2.5 rounded-xl bg-[var(--pastel-green-soft)] border border-[var(--line-strong)] text-[11px] font-bold text-[var(--ink)] leading-relaxed flex items-center gap-1.5">
              <Zap size={14} className="text-[var(--brand-orange)] shrink-0" />
              <span><strong>حالت پیوسته فعال شد:</strong> سوالات بدون محدودیت و زنجیره‌ای ادامه پیدا می‌کنند.</span>
            </div>
          ) : (
            <p className="text-[10px] text-[var(--muted)] font-bold">
              {availableCount.toLocaleString("fa-IR")} سؤال قابل انتخاب.
            </p>
          )}
        </div>

        {/* Timed Switch & Custom Minutes */}
        <div className="p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-[var(--ink)]">زمان آزمون</span>
            <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-xl border-2 border-[var(--line-strong)]">
              <button
                type="button"
                onClick={() => onIsTimedChange(true)}
                className={cn(
                  "px-3 py-1 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                  isTimed ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]" : "text-[var(--muted)]"
                )}
              >
                <span>زمان‌دار</span>
                <Timer size={13} />
              </button>
              <button
                type="button"
                onClick={() => onIsTimedChange(false)}
                className={cn(
                  "px-3 py-1 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                  !isTimed ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]" : "text-[var(--muted)]"
                )}
              >
                <span>آزاد</span>
                <Infinity size={13} />
              </button>
            </div>
          </div>

          {isTimed && (
            <div className="space-y-2.5 pt-1">
              {/* Quick Preset Minutes */}
              <div className="flex items-center gap-1.5 flex-wrap">
                {[15, 30, 45, 60, 90].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      onDurationMinutesChange(m);
                      onCustomMinutesChange("");
                      onTimeTouchedChange(true);
                    }}
                    className={cn(
                      "px-2.5 py-1 rounded-xl text-xs font-black border transition-all cursor-pointer",
                      durationMinutes === m && !customMinutes
                        ? "bg-[var(--ink)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                        : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
                    )}
                  >
                    {m} دقیقه
                  </button>
                ))}
              </div>

              {/* Auto-suggested time for the current question count */}
              {suggestedMinutes !== durationMinutes && (
                <button
                  type="button"
                  onClick={() => {
                    onDurationMinutesChange(suggestedMinutes);
                    onCustomMinutesChange("");
                    onTimeTouchedChange(false);
                  }}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)] transition-all cursor-pointer"
                >
                  <Timer size={12} />
                  <span>پیشنهاد برای {count.toLocaleString("fa-IR")} سؤال: {suggestedMinutes.toLocaleString("fa-IR")} دقیقه</span>
                </button>
              )}

              {/* Custom Minutes Input */}
              <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
                <span className="text-xs font-black text-[var(--muted)] shrink-0">مدت دلخواه:</span>
                <div className="relative flex-1">
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    placeholder="مثلاً ۲۵ یا ۷۵"
                    value={customMinutes}
                    onChange={(e) => {
                      const v = sanitizeIntegerInput(e.target.value, { max: 360 });
                      onCustomMinutesChange(v);
                      onTimeTouchedChange(true);
                      const parsed = parseSafeInt(v, 0);
                      if (parsed > 0) {
                        onDurationMinutesChange(parsed);
                      }
                    }}
                    className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-1.5 text-xs font-black text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)] text-center font-mono"
                  />
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--muted)]">
                    دقیقه
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. Neo-Brutalist Toggle Switches */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-4">
        <strong className="block text-xs font-black text-[var(--ink)] pb-2 border-b border-[var(--line)]">
          شیوه‌نامه برگزاری و قوانین آزمون
        </strong>

        <div className="space-y-3.5">
          {/* 1. نمره منفی ۱/۳ */}
          <button
            type="button"
            role="switch"
            aria-checked={negativeMarking}
            onClick={() => onNegativeMarkingChange(!negativeMarking)}
            className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
          >
            <div className="flex-1">
              <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                نمره منفی (۱/۳ کنکور)
              </span>
              <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                به ازای هر ۳ پاسخ اشتباه، ۱ پاسخ صحیح کسر می‌شود.
              </span>
            </div>
            <div
              className={cn(
                "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                negativeMarking ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
              )}
            >
              <div
                className={cn(
                  "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                  negativeMarking ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                )}
              >
                {negativeMarking ? <Check size={12} strokeWidth={3} /> : null}
              </div>
            </div>
          </button>

          {/* 2. بر هم زدن ترتیب سوالات */}
          <div className="border-t border-[var(--line)] pt-3.5">
            <button
              type="button"
              role="switch"
              aria-checked={shuffleQuestions}
              onClick={() => onShuffleQuestionsChange(!shuffleQuestions)}
              className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
            >
              <div className="flex-1">
                <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                  بر هم زدن تصادفی ترتیب سؤالات
                </span>
                <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                  ترتیب پسیج‌های درک مطلب حفظ می‌شود.
                </span>
              </div>
              <div
                className={cn(
                  "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                  shuffleQuestions ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                    shuffleQuestions ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                  )}
                >
                  {shuffleQuestions ? <Check size={12} strokeWidth={3} /> : null}
                </div>
              </div>
            </button>
          </div>

          {/* 3. بر هم زدن ترتیب گزینه‌ها */}
          <div className="border-t border-[var(--line)] pt-3.5">
            <button
              type="button"
              role="switch"
              aria-checked={shuffleOptions}
              onClick={() => onShuffleOptionsChange(!shuffleOptions)}
              className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
            >
              <div className="flex-1">
                <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                  بر هم زدن تصادفی گزینه‌ها (الف تا د)
                </span>
                <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                  جای گزینه‌ها تصادفی می‌شود.
                </span>
              </div>
              <div
                className={cn(
                  "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                  shuffleOptions ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                    shuffleOptions ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                  )}
                >
                  {shuffleOptions ? <Check size={12} strokeWidth={3} /> : null}
                </div>
              </div>
            </button>
          </div>

          {/* 4. نمایش پاسخ‌نامه */}
          <div className="border-t border-[var(--line)] pt-3.5">
            <button
              type="button"
              role="switch"
              aria-checked={showAnswerSheet}
              onClick={() => onShowAnswerSheetChange(!showAnswerSheet)}
              className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
            >
              <div className="flex-1">
                <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                  نمایش کلید پاسخ‌نامه پس از پایان
                </span>
                <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                  مقایسه پاسخ شما با کلید در کارنامه.
                </span>
              </div>
              <div
                className={cn(
                  "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                  showAnswerSheet ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                    showAnswerSheet ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                  )}
                >
                  {showAnswerSheet ? <Check size={12} strokeWidth={3} /> : null}
                </div>
              </div>
            </button>
          </div>

          {/* 5. نمایش تحلیل تشریحی */}
          <div className="border-t border-[var(--line)] pt-3.5">
            <button
              type="button"
              role="switch"
              aria-checked={showExplanations}
              onClick={() => onShowExplanationsChange(!showExplanations)}
              className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
            >
              <div className="flex-1">
                <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                  نمایش پاسخ تشریحی و تحلیل ۳ گامی
                </span>
                <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                  ایده، حل کامل و دلیل رد گزینه‌ها.
                </span>
              </div>
              <div
                className={cn(
                  "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                  showExplanations ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                )}
              >
                <div
                  className={cn(
                    "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                    showExplanations ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                  )}
                >
                  {showExplanations ? <Check size={12} strokeWidth={3} /> : null}
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
