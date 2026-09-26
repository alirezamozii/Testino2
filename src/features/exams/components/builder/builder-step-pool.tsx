"use client";

import React from "react";
import {
  AlertCircle,
  Bookmark,
  Check,
  FastForward,
  HelpCircle,
  RotateCcw,
  Shuffle,
  Sparkles,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuestionPoolMode } from "@/database/app-database";

export interface QuestionPoolCategory {
  id: QuestionPoolMode;
  title: string;
  desc: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  color: string;
  textColor: string;
  borderActive: string;
}

export const QUESTION_POOL_CATEGORIES: QuestionPoolCategory[] = [
  {
    id: "new",
    title: "سوالات جدید",
    desc: "پاسخ نداده‌اید",
    icon: Sparkles,
    color: "bg-[var(--pastel-green)]",
    textColor: "text-[var(--ink-on-color)]",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "wrong",
    title: "غلط‌ها",
    desc: "پاسخ نادرست داده‌اید",
    icon: AlertCircle,
    color: "bg-[var(--pastel-red)]",
    textColor: "text-white",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "doubtful",
    title: "شک‌دارها",
    desc: "مردد بوده‌اید",
    icon: HelpCircle,
    color: "bg-[var(--pastel-yellow)]",
    textColor: "text-[var(--ink-on-color)]",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "guess",
    title: "حدسی‌ها",
    desc: "بدون اطمینان زده‌اید",
    icon: Zap,
    color: "bg-[var(--brand-purple)]",
    textColor: "text-white",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "bookmarked",
    title: "نشانه‌دارها",
    desc: "ذخیره کرده‌اید",
    icon: Bookmark,
    color: "bg-[var(--surface-3)]",
    textColor: "text-[var(--ink)]",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "due",
    title: "مرور لایتنر",
    desc: "نوبت مرور رسیده",
    icon: RotateCcw,
    color: "bg-[var(--pastel-teal)]",
    textColor: "text-[var(--ink-on-color)]",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "skipped",
    title: "بی‌پاسخ",
    desc: "بدون پاسخ رد شده",
    icon: FastForward,
    color: "bg-[var(--pastel-orange)]",
    textColor: "text-[var(--ink-on-color)]",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
  {
    id: "random",
    title: "همه سوالات",
    desc: "بدون فیلتر",
    icon: Shuffle,
    color: "bg-[var(--pastel-blue)]",
    textColor: "text-[var(--ink-on-color)]",
    borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
  },
];

export interface BuilderStepPoolProps {
  selectedModes: QuestionPoolMode[];
  onToggleQuestionMode: (modeId: QuestionPoolMode) => void;
  availableCount: number;
  selectedSources: Array<"EXAM" | "PERSONAL" | "AI">;
  onToggleSource: (src: "EXAM" | "PERSONAL" | "AI") => void;
  sourceCounts: { EXAM: number; PERSONAL: number; AI: number };
  poolCounts: Record<string, number>;
}

export function BuilderStepPool({
  selectedModes,
  onToggleQuestionMode,
  availableCount,
  selectedSources,
  onToggleSource,
  sourceCounts,
  poolCounts,
}: BuilderStepPoolProps) {
  return (
    <div className="space-y-4">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
          مرحله ۳ از ۵
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">نوع سوالات</h2>
        <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">
          دسته‌های موردنظر را انتخاب کنید.
        </p>
      </div>

      {/* Selection Status Banner */}
      <div className="p-3 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          {selectedModes.includes("random") ? (
            <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
              همه سوالات
            </span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {selectedModes.map((m) => {
                const cat = QUESTION_POOL_CATEGORIES.find((c) => c.id === m);
                return (
                  <span
                    key={m}
                    className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)]"
                  >
                    {cat?.title}
                  </span>
                );
              })}
            </div>
          )}
        </div>
        <span className="text-xs font-black text-[var(--brand-orange)]">
          {availableCount.toLocaleString("fa-IR")} سؤال قابل انتخاب
        </span>
      </div>

      {/* Source Selection Checkboxes */}
      <div className="p-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-right">
          <div>
            <h3 className="text-xs sm:text-sm font-black text-[var(--ink)]">منبع سؤالات آزمون</h3>
            <p className="text-[11px] text-[var(--muted)] font-medium">
              با تیک زدن گزینه‌ها مشخص کنید سؤالات از کدام منابع انتخاب شوند (امکان انتخاب همزمان چند مورد)
            </p>
          </div>
          <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)] self-start sm:self-auto">
            {selectedSources.length === 3 ? "همه منابع فعال" : `${selectedSources.length} منبع انتخابی`}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          {[
            {
              id: "EXAM" as const,
              title: "کنکور سراسری",
              desc: "سؤالات رسمی سازمان سنجش",
              count: sourceCounts.EXAM,
            },
            {
              id: "PERSONAL" as const,
              title: "تألیفی و جزوات",
              desc: "تست‌های تألیفی و دست‌نویس اساتید",
              count: sourceCounts.PERSONAL,
            },
            {
              id: "AI" as const,
              title: "شبیه‌ساز هوش مصنوعی",
              desc: "سؤالات مفهومی و تمرینی",
              count: sourceCounts.AI,
            },
          ].map((src) => {
            const isChecked = selectedSources.includes(src.id);
            return (
              <button
                key={src.id}
                type="button"
                onClick={() => onToggleSource(src.id)}
                className={cn(
                  "p-3 rounded-xl border-2 text-right transition-all flex items-center justify-between gap-2 cursor-pointer select-none",
                  isChecked
                    ? "border-[var(--brand-orange)] bg-[var(--surface-cream)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] opacity-70 hover:opacity-100"
                )}
              >
                <div className="space-y-0.5 min-w-0">
                  <strong className="block text-xs font-black text-[var(--ink)]">{src.title}</strong>
                  <span className="block text-[10px] text-[var(--muted)] font-medium truncate">{src.desc}</span>
                  <span className="inline-block text-[10px] font-black text-[var(--brand-orange)] pt-0.5">
                    {src.count.toLocaleString("fa-IR")} سؤال
                  </span>
                </div>
                <div
                  className={cn(
                    "w-5 h-5 rounded-md border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 transition-all",
                    isChecked ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface)] text-transparent"
                  )}
                >
                  <Check size={12} className="stroke-[3]" />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 8 Categories Multi-Select Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {QUESTION_POOL_CATEGORIES.map((t) => {
          const Icon = t.icon;
          const isSelected = selectedModes.includes(t.id);
          const countInPool = poolCounts[t.id] ?? 0;

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onToggleQuestionMode(t.id)}
              className={cn(
                "w-full p-4 rounded-2xl border-2 text-right transition-all flex items-center justify-between gap-3 cursor-pointer",
                isSelected
                  ? cn("shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5", t.borderActive)
                  : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
              )}
            >
              <div className="flex items-center gap-3">
                <div className={cn("w-12 h-12 rounded-2xl border-2 border-[var(--line-strong)] flex items-center justify-center font-black shrink-0", t.color, t.textColor)}>
                  <Icon size={22} />
                </div>
                <div className="space-y-0.5">
                  <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">{t.title}</strong>
                  <span className="text-[11px] text-[var(--muted)] font-medium line-clamp-1">{t.desc}</span>
                  <div className="pt-0.5">
                    <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)]">
                      {countInPool.toLocaleString("fa-IR")} سؤال
                    </span>
                  </div>
                </div>
              </div>

              {/* Checkbox Box */}
              <div
                className={cn(
                  "w-6 h-6 rounded-lg border-2 border-[var(--line-strong)] flex items-center justify-center transition-all shrink-0",
                  isSelected ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface)] text-transparent"
                )}
              >
                <Check size={14} className="stroke-[3]" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
