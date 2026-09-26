"use client";

import React, { useState } from "react";
import { List, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeoCard } from "@/components/ui/neo-primitives";
import type { SessionView } from "@/database/app-database";

export interface ExamNavSheetProps {
  isOpen: boolean;
  onClose: () => void;
  questions: SessionView["questions"];
  currentIndex: number;
  totalQuestions: number;
  onSelectQuestion: (index: number) => void;
  onOpenAbandonConfirm: () => void;
  onOpenFinishConfirm: () => void;
}

export function ExamNavSheet({
  isOpen,
  onClose,
  questions,
  currentIndex,
  totalQuestions,
  onSelectQuestion,
  onOpenAbandonConfirm,
  onOpenFinishConfirm,
}: ExamNavSheetProps) {
  const [navFilter, setNavFilter] = useState<"all" | "sure" | "doubtful" | "guess" | "skipped" | "unvisited">("all");

  if (!isOpen) return null;

  const sureCount = questions.filter(
    (q) => q.selectedOptionId && (q.confidence === "sure" || !q.confidence)
  ).length;
  const doubtfulCount = questions.filter(
    (q) => q.selectedOptionId && q.confidence === "doubtful"
  ).length;
  const guessCount = questions.filter(
    (q) => q.selectedOptionId && q.confidence === "guess"
  ).length;
  const skippedCount = questions.filter(
    (q) => !q.selectedOptionId && q.visited
  ).length;
  const unvisitedCount = questions.filter((q) => !q.visited).length;

  return (
    <NeoCard className="p-5 sm:p-6 space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] animate-in fade-in duration-150">
      <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)]">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
            <List size={16} />
          </div>
          <div>
            <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
              پاسخ‌برگ و ناوبری سؤالات
            </strong>
            <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-bold">
              برای پرش به هر سؤال روی شماره آن کلیک کنید
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="px-3 py-1.5 rounded-xl border-2 border-[var(--line)] hover:border-[var(--line-strong)] bg-[var(--surface-2)] text-xs font-black text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1.5 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
        >
          <span>بستن</span>
          <X size={14} />
        </button>
      </div>

      {/* Filter Tabs Grid */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {([
          { id: "all", label: "همه سؤالات", count: totalQuestions, badgeTone: "bg-[var(--line)] text-[var(--ink)]" },
          { id: "sure", label: "مطمئن", count: sureCount, badgeTone: "bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100" },
          { id: "doubtful", label: "با شک", count: doubtfulCount, badgeTone: "bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100" },
          { id: "guess", label: "حدس", count: guessCount, badgeTone: "bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-100" },
          { id: "skipped", label: "رد شده", count: skippedCount, badgeTone: "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100" },
          { id: "unvisited", label: "دیده‌نشده", count: unvisitedCount, badgeTone: "bg-[var(--surface-3)] text-[var(--muted)]" },
        ] as const).map((flt) => {
          const isSelected = navFilter === flt.id;
          return (
            <button
              key={flt.id}
              type="button"
              onClick={() => setNavFilter(flt.id)}
              className={cn(
                "py-2 px-2.5 rounded-xl text-xs font-black border-2 transition-all flex items-center justify-between gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] cursor-pointer",
                isSelected
                  ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] -translate-y-0.5"
                  : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
              )}
            >
              <span className="truncate">{flt.label}</span>
              <span
                className={cn(
                  "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md leading-none",
                  isSelected ? "bg-white/25 text-white" : flt.badgeTone
                )}
              >
                {new Intl.NumberFormat("fa-IR").format(flt.count)}
              </span>
            </button>
          );
        })}
      </div>

      {/* Number Grid */}
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2.5 max-h-72 overflow-y-auto p-1 pr-1.5 neo-scrollbar">
        {questions.map((q, qIdx) => {
          const answered = Boolean(q.selectedOptionId);
          const isDoubtful = answered && q.confidence === "doubtful";
          const isGuess = answered && q.confidence === "guess";
          const isSure = answered && !isDoubtful && !isGuess;
          const isSkipped = !answered && q.visited;
          const isUnvisited = !q.visited;
          const isCurrent = qIdx === currentIndex;

          if (navFilter === "sure" && !isSure) return null;
          if (navFilter === "doubtful" && !isDoubtful) return null;
          if (navFilter === "guess" && !isGuess) return null;
          if (navFilter === "skipped" && !isSkipped) return null;
          if (navFilter === "unvisited" && !isUnvisited) return null;

          return (
            <button
              key={q.id}
              type="button"
              onClick={() => {
                onSelectQuestion(qIdx);
                onClose();
              }}
              className={cn(
                "min-h-[52px] rounded-xl text-xs font-black transition-all border-2 flex flex-col items-center justify-center gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer",
                isCurrent
                  ? "border-[var(--line-strong)] bg-[var(--brand-orange)] text-white scale-105 ring-2 ring-[var(--brand-orange)]/40"
                  : isDoubtful
                  ? "border-[var(--line-strong)] bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200"
                  : isGuess
                  ? "border-[var(--line-strong)] bg-purple-100 dark:bg-purple-950/60 text-purple-950 dark:text-purple-200"
                  : isSure
                  ? "border-[var(--line-strong)] bg-[var(--pastel-green)] text-[var(--ink-on-color)]"
                  : isSkipped
                  ? "border-[var(--line-strong)] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
              )}
            >
              <span className="text-sm font-black font-mono">{qIdx + 1}</span>
              <span className="text-[10px] leading-none font-black opacity-80">
                {isDoubtful ? "شک" : isGuess ? "حدس" : isSure ? "✓" : isSkipped ? "رد" : "—"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sheet Footer */}
      <div className="pt-3 border-t-2 border-[var(--line)] flex items-center justify-between flex-wrap gap-2 text-xs font-black">
        <div className="text-[var(--muted)]">
          پاسخ داده‌شده: <strong className="text-[var(--ink)]">{sureCount + doubtfulCount + guessCount}</strong> از{" "}
          <strong className="text-[var(--ink)]">{totalQuestions}</strong>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenAbandonConfirm();
            }}
            className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-black text-xs border-2 border-red-300 dark:border-red-900/60 shadow-[2px_2px_0px_var(--neo-shadow)] transition-all cursor-pointer"
            title="انصراف بدون ثبت"
          >
            انصراف
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenFinishConfirm();
            }}
            className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] transition-all cursor-pointer"
          >
            تحویل آزمون
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-xl bg-[var(--surface)] text-[var(--ink)] font-black text-xs border-2 border-[var(--line)] hover:border-[var(--line-strong)] transition-all cursor-pointer"
          >
            بستن
          </button>
        </div>
      </div>
    </NeoCard>
  );
}
