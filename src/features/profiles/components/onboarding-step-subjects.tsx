"use client";

import React, { useRef, useState } from "react";
import {
  Check,
  GripVertical,
  Link2,
  Loader2,
  Plus,
  Sparkles,
  Target,
  Trash2,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { sanitizeIntegerInput } from "@/lib/number-utils";
import { NeoButton, NeoInput } from "@/components/ui/neo-primitives";

export interface OnboardingSubjectItem {
  name: string;
  coefficient: number;
  selected: boolean;
  targetPercentage: number;
  questionCount: number;
  scoreGroup: string;
}

export interface OnboardingStepSubjectsProps {
  newSubjName: string;
  onNewSubjNameChange: (val: string) => void;
  newSubjCoeff: number;
  onNewSubjCoeffChange: (val: number) => void;
  newSubjTarget: number;
  onNewSubjTargetChange: (val: number) => void;
  newSubjQuestions: number;
  onNewSubjQuestionsChange: (val: number) => void;
  subjectError: string;
  suggestions: string[];
  showSuggestions: boolean;
  suggestionsLoading: boolean;
  popularSubjects: string[];
  onSelectSuggestion: (name: string) => void;
  onAddCustomSubject: () => void;
  selectedSubjects: OnboardingSubjectItem[];
  onToggleSubject: (index: number) => void;
  onRemoveSubject: (index: number) => void;
  onMergeSubjects: (sourceIdx: number, targetIdx: number) => void;
  onUngroupSubject: (index: number) => void;
  onUpdateSubjectTarget: (index: number, target: number) => void;
  weightedAverage: number;
  activeSelectedSubjects: OnboardingSubjectItem[];
}

export function OnboardingStepSubjects({
  newSubjName,
  onNewSubjNameChange,
  newSubjCoeff,
  onNewSubjCoeffChange,
  newSubjTarget,
  onNewSubjTargetChange,
  newSubjQuestions,
  onNewSubjQuestionsChange,
  subjectError,
  suggestions,
  showSuggestions,
  suggestionsLoading,
  popularSubjects,
  onSelectSuggestion,
  onAddCustomSubject,
  selectedSubjects,
  onToggleSubject,
  onRemoveSubject,
  onMergeSubjects,
  onUngroupSubject,
  onUpdateSubjectTarget,
  weightedAverage,
  activeSelectedSubjects,
}: OnboardingStepSubjectsProps) {
  const [draggedSubjectIndex, setDraggedSubjectIndex] = useState<number | null>(null);
  const [dragOverTargetIndex, setDragOverTargetIndex] = useState<number | null>(null);
  const [mergePickerForIndex, setMergePickerForIndex] = useState<number | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-4">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#6CCB7F] text-[var(--ink)] border-2 border-[var(--line)]">
          مرحله ۳ از ۳ • درس‌ها و هدف
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">
          درس‌های فعال آزمون
        </h2>
        <p className="text-xs text-[var(--muted)] font-bold">
          درس‌های واقعی خود را همراه با ضریب و درصد هدف تعریف کنید.
        </p>
      </div>

      {/* Inline Add Subject Form with Autocomplete & Community Suggestions */}
      <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] space-y-3">
        <div className="flex items-center justify-between">
          <strong className="text-xs font-black text-[var(--ink)] block">
            + افزودن درس جدید:
          </strong>
          <span className="text-[10px] font-bold text-[var(--muted)]">
            جستجو در بانک دروس
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
          {/* Autocomplete Input */}
          <div className="sm:col-span-4 relative" ref={suggestionsRef}>
            <NeoInput
              placeholder="نام درس (مثلاً: زیست، آمار...)"
              value={newSubjName}
              onChange={(e) => onNewSubjNameChange(e.target.value)}
              className="w-full"
            />
            {suggestionsLoading && (
              <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none">
                <Loader2 size={13} className="animate-spin text-[var(--testino-orange)]" />
              </div>
            )}

            {/* Autocomplete Dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute top-full right-0 left-0 mt-1 z-30 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl shadow-[3px_3px_0px_var(--neo-shadow)] max-h-52 overflow-y-auto divide-y divide-[var(--line)]/15 neo-scrollbar">
                <div className="p-2 text-[10px] font-black text-[var(--muted)] bg-[var(--surface-2)] flex items-center justify-between sticky top-0 z-10">
                  <span className="flex items-center gap-1">
                    <Sparkles size={11} className="text-amber-500" />
                    دروس موجود در بانک:
                  </span>
                  <span className="text-[9px] text-[var(--testino-orange)]">کلیک برای انتخاب</span>
                </div>
                {suggestions.map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => onSelectSuggestion(item)}
                    className="w-full text-right px-3 py-2 text-xs font-bold text-[var(--ink)] hover:bg-[var(--surface-cream)] hover:text-[var(--testino-orange)] transition-colors flex items-center justify-between cursor-pointer"
                  >
                    <span>{item}</span>
                    <span className="text-[10px] text-[var(--muted)]">انتخاب ↵</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Coefficient */}
          <div className="sm:col-span-2">
            <input
              type="text"
              inputMode="numeric"
              placeholder="ضریب"
              value={newSubjCoeff || ""}
              onChange={(e) => {
                const val = sanitizeIntegerInput(e.target.value, { min: 1, max: 100 });
                onNewSubjCoeffChange(val === "" ? 1 : Number(val));
              }}
              className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-2 py-2 text-xs font-black text-center text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--testino-orange)]"
              title="ضریب این درس در آزمون"
            />
          </div>

          {/* Question Count */}
          <div className="sm:col-span-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder="تعداد سؤال"
              value={newSubjQuestions || ""}
              onChange={(e) => {
                const val = sanitizeIntegerInput(e.target.value, { min: 1, max: 500 });
                onNewSubjQuestionsChange(val === "" ? 1 : Number(val));
              }}
              className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-2 py-2 text-xs font-bold text-center text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--testino-orange)]"
              title="تعداد سوالات این درس در دفترچه"
            />
          </div>

          {/* Target Percentage */}
          <div className="sm:col-span-3">
            <input
              type="text"
              inputMode="numeric"
              placeholder="هدف ٪"
              value={newSubjTarget || ""}
              onChange={(e) => {
                const val = sanitizeIntegerInput(e.target.value, { min: 0, max: 100 });
                onNewSubjTargetChange(val === "" ? 0 : Number(val));
              }}
              className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-2 py-2 text-xs font-black text-center text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--testino-orange)]"
              title="درصد هدف شما برای این درس"
            />
          </div>
        </div>

        {/* Popular / Community Subjects Chips */}
        {popularSubjects.length > 0 && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[10px] font-black text-[var(--muted)] flex items-center gap-1">
              <Sparkles size={11} className="text-amber-500" />
              پیشنهادات سریع بر اساس دروس محبوب:
            </span>
            <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)]/40 neo-scrollbar">
              {popularSubjects.map((subName) => {
                const isAdded = selectedSubjects.some(
                  (s) => s.name.toLowerCase() === subName.toLowerCase()
                );
                const isCurrentlyInInput = newSubjName.trim().toLowerCase() === subName.toLowerCase();
                return (
                  <button
                    key={subName}
                    type="button"
                    onClick={() => onSelectSuggestion(subName)}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all select-none cursor-pointer",
                      isCurrentlyInInput
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] scale-105"
                        : isAdded
                        ? "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
                        : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--testino-orange)] hover:bg-[var(--surface-cream)] shadow-[1px_1px_0px_var(--neo-shadow)] active:translate-y-0.5"
                    )}
                    title={
                      isCurrentlyInInput
                        ? "در فرم درج شده است (ضریب و هدف را تنظیم کنید)"
                        : isAdded
                        ? "قبلاً به لیست اضافه شده — کلیک برای ویرایش مجدد"
                        : "کلیک برای درج در فرم و تنظیم ضریب"
                    }
                  >
                    <span>{subName}</span>
                    {isCurrentlyInInput ? (
                      <span className="text-[10px] bg-white/30 px-1 rounded">درج شد</span>
                    ) : isAdded ? (
                      <Check size={12} className="text-emerald-600" />
                    ) : (
                      <span className="text-[10px] text-[var(--muted)]">↵</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <NeoButton
          variant="primary"
          size="md"
          icon={Plus}
          onClick={onAddCustomSubject}
          className="w-full text-xs font-black shadow-[2px_2px_0px_var(--line)]"
        >
          افزودن این درس به آزمون
        </NeoButton>
        {subjectError && (
          <p className="text-[11px] text-red-600 font-bold">{subjectError}</p>
        )}
      </div>

      {/* List of Active Subjects */}
      <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
        {selectedSubjects.length === 0 ? (
          <div className="p-6 text-center rounded-2xl border-2 border-dashed border-[var(--line-strong)] text-xs text-[var(--muted)] font-bold">
            هنوز درسی اضافه نکرده‌اید. با فرم بالا اولین درس را اضافه کنید.
          </div>
        ) : (
          selectedSubjects.map((s, idx) => {
            const isDraggingThis = draggedSubjectIndex === idx;
            const isDragTarget = dragOverTargetIndex === idx;
            const otherSubjects = selectedSubjects
              .map((other, oIdx) => ({ ...other, originalIdx: oIdx }))
              .filter((other) => other.originalIdx !== idx);

            return (
              <div
                key={s.name}
                draggable={true}
                onDragStart={(e) => {
                  e.dataTransfer.setData("text/plain", String(idx));
                  e.dataTransfer.effectAllowed = "move";
                  setDraggedSubjectIndex(idx);
                }}
                onDragEnd={() => {
                  setDraggedSubjectIndex(null);
                  setDragOverTargetIndex(null);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedSubjectIndex !== null && draggedSubjectIndex !== idx) {
                    setDragOverTargetIndex(idx);
                  }
                }}
                onDragLeave={() => {
                  if (dragOverTargetIndex === idx) {
                    setDragOverTargetIndex(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedSubjectIndex !== null && draggedSubjectIndex !== idx) {
                    onMergeSubjects(draggedSubjectIndex, idx);
                    setDraggedSubjectIndex(null);
                    setDragOverTargetIndex(null);
                  }
                }}
                onClick={() => onToggleSubject(idx)}
                className={cn(
                  "p-3 rounded-2xl border-2 text-right transition-all select-none cursor-pointer space-y-2",
                  isDraggingThis && "opacity-40 border-dashed border-sky-400",
                  isDragTarget
                    ? "border-sky-500 bg-sky-500/10 shadow-[3px_3px_0px_#0284c7] scale-[1.01]"
                    : s.selected
                    ? "border-[var(--line-strong)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                    : "border-[var(--line-strong)]/30 bg-[var(--surface-2)] opacity-70 hover:opacity-100"
                )}
              >
                {isDragTarget && (
                  <div className="py-1 px-2 rounded-lg bg-sky-500 text-white text-center text-[10px] font-black animate-pulse">
                    رها کنید تا با «{s.name}» در یک گروه کنکوری ادغام شوند
                  </div>
                )}

                <div className="flex items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    {/* Drag Handle */}
                    <div
                      draggable={true}
                      onDragStart={(e) => {
                        e.stopPropagation();
                        e.dataTransfer.setData("text/plain", String(idx));
                        e.dataTransfer.effectAllowed = "move";
                        setDraggedSubjectIndex(idx);
                      }}
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded-lg bg-[var(--surface-2)] hover:bg-sky-500 hover:text-white border border-[var(--line-strong)]/20 cursor-grab active:cursor-grabbing text-[var(--muted)] transition-colors shrink-0"
                      title="این دستگیره را بکشید و روی درس دیگر رها کنید تا ادغام شوند"
                    >
                      <GripVertical size={14} />
                    </div>

                    {/* Custom Checkbox */}
                    <div
                      className={cn(
                        "w-5 h-5 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all shadow-sm",
                        s.selected
                          ? "bg-[#6CCB7F] border-[var(--line-strong)] text-white"
                          : "bg-[var(--surface)] border-[var(--line-strong)]/60 text-transparent"
                      )}
                    >
                      <Check size={12} className={s.selected ? "stroke-[3]" : "opacity-0"} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <strong className="text-xs sm:text-sm font-black text-[var(--ink)] truncate">
                          {s.name}
                        </strong>
                        {s.scoreGroup && (
                          <span className="text-[10px] font-black text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/50 border border-sky-300 dark:border-sky-800 shrink-0">
                            گروه: {s.scoreGroup}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)] flex flex-wrap items-center gap-1.5 mt-0.5">
                        <span className="text-[var(--ink)] font-black">ضریب: {s.coefficient}</span>
                        <span>•</span>
                        <span>{s.questionCount} سؤال</span>
                        <span>•</span>
                        <span>هدف: {s.targetPercentage}٪</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {s.scoreGroup && (
                      <button
                        type="button"
                        onClick={() => onUngroupSubject(idx)}
                        className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-[var(--surface-2)] text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-100 transition-colors shadow-sm cursor-pointer"
                        title="خروج از گروه مشترک"
                      >
                        <Unlink size={11} className="text-amber-500" />
                        <span className="hidden sm:inline">انفصال</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => onRemoveSubject(idx)}
                      className="w-7 h-7 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-red-600 dark:text-red-400 flex items-center justify-center hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors shadow-sm cursor-pointer"
                      title="حذف درس"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {/* Quick merge toggle on card */}
                <div className="pt-1 border-t border-[var(--line-strong)]/10" onClick={(e) => e.stopPropagation()}>
                  {mergePickerForIndex === idx ? (
                    <div className="p-2 rounded-xl bg-[var(--surface-2)] border border-[var(--line-strong)]/20 space-y-1.5 animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black text-[var(--ink)]">
                          ادغام با:
                        </span>
                        <button
                          type="button"
                          onClick={() => setMergePickerForIndex(null)}
                          className="text-[9px] font-bold text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                        >
                          انصراف
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                        {otherSubjects.map((other) => (
                          <button
                            key={other.name}
                            type="button"
                            onClick={() => {
                              onMergeSubjects(idx, other.originalIdx);
                              setMergePickerForIndex(null);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-[var(--surface)] hover:bg-sky-500 hover:text-white border border-[var(--line-strong)]/20 transition-colors cursor-pointer"
                          >
                            <Link2 size={10} />
                            <span>{other.name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[10px]">
                      <button
                        type="button"
                        aria-label="گروه مشترک با درس دیگر"
                        onClick={() => setMergePickerForIndex(idx)}
                        className="inline-flex items-center gap-1 font-bold text-[var(--muted)] hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer"
                      >
                        <Link2 size={11} className="text-sky-500 shrink-0" />
                        <span>ادغام با درس دیگر...</span>
                      </button>
                      <span className="text-[9px] text-[var(--muted)]">یا درگ روی درس دیگر</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Per-subject target adjustment (inline) */}
      {activeSelectedSubjects.length > 0 && (
        <div className="space-y-3 pt-3 border-t-2 border-[var(--line-strong)]/20">
          {/* Overall Live Calculated Average Card */}
          <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] shadow-[3px_3px_0px_var(--line)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--testino-orange)] text-white border-2 border-[var(--line)] flex items-center justify-center shrink-0">
                <Target size={20} />
              </div>
              <div>
                <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                  میانگین هدف کل (محاسبه خودکار):
                </strong>
                <span className="text-[10px] text-[var(--muted)] font-bold">
                  ابتدا اعضای گروه بر اساس تعداد سؤال ترکیب می‌شوند؛ سپس ضریب گروه یک‌بار اعمال می‌شود
                </span>
              </div>
            </div>
            <span className="text-lg sm:text-2xl font-black px-3 py-1 rounded-xl bg-[var(--testino-orange)] text-white border-2 border-[var(--line)] shadow-[2px_2px_0px_var(--line)]">
              {weightedAverage}٪
            </span>
          </div>

          {/* Subject sliders */}
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {selectedSubjects.map((s, idx) => {
              if (!s.selected) return null;
              return (
                <div
                  key={s.name}
                  className="p-3 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line)] shadow-[2px_2px_0px_var(--line)] space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--pastel-blue)]/40 text-[var(--ink-on-color)] border border-[var(--line)] shrink-0">
                        ضریب {s.coefficient}
                      </span>
                      <strong className="text-xs font-black text-[var(--ink)] truncate">
                        {s.name}
                      </strong>
                    </div>
                    <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)] shrink-0">
                      {s.targetPercentage}٪
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="range"
                      min="10"
                      max="100"
                      step="5"
                      value={s.targetPercentage}
                      onChange={(e) => onUpdateSubjectTarget(idx, Number(e.target.value))}
                      className="flex-1 accent-[var(--testino-orange)] cursor-pointer h-2 bg-[var(--surface-3)] rounded-lg border border-[var(--line)]"
                    />
                    <div className="flex items-center gap-1 shrink-0">
                      {[50, 70, 85].map((pct) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => onUpdateSubjectTarget(idx, pct)}
                          className={cn(
                            "px-2 py-0.5 text-[10px] font-black rounded-lg border transition-all cursor-pointer",
                            s.targetPercentage === pct
                              ? "bg-[var(--testino-orange)] text-white border-[var(--line)]"
                              : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line-strong)] hover:border-[var(--line)]"
                          )}
                        >
                          {pct}٪
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
