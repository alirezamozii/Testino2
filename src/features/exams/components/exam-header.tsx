"use client";

import React from "react";
import { AlertCircle, BookOpen, List, LogOut, Pause, Play } from "lucide-react";
import { ExamTimerChip } from "./exam-timer-chip";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface ExamHeaderProps {
  isOpenEnded: boolean;
  index: number;
  totalQuestions: number;
  isRunning: boolean;
  onTogglePlayPause: () => void;
  sessionId: string;
  durationMinutes: number | null;
  persistedSeconds: number;
  isCurrentRevealed: boolean;
  onGapDetected: () => void;
  onAutoPause: () => void;
  onOpenSourceModal: () => void;
  onToggleNavSheet: () => void;
  onOpenFinishConfirm: () => void;
  isPaused: boolean;
  gapNotice: boolean;
  onResumeFromGap: () => void;
}

export function ExamHeader({
  isOpenEnded,
  index,
  totalQuestions,
  isRunning,
  onTogglePlayPause,
  sessionId,
  durationMinutes,
  persistedSeconds,
  isCurrentRevealed,
  onGapDetected,
  onAutoPause,
  onOpenSourceModal,
  onToggleNavSheet,
  onOpenFinishConfirm,
  isPaused,
  gapNotice,
  onResumeFromGap,
}: ExamHeaderProps) {
  return (
    <>
      {/* Top Slim Progress Bar (Neo Style) */}
      <div className="w-full bg-[var(--surface-3)] h-3 rounded-full overflow-hidden border-2 border-[var(--line-strong)]">
        <div
          className="bg-[var(--brand-orange)] h-full transition-all duration-300 ease-out"
          style={{
            width: isOpenEnded
              ? `${Math.min(100, Math.max(10, ((index + 1) / Math.max(totalQuestions, index + 1)) * 100))}%`
              : `${((index + 1) / totalQuestions) * 100}%`,
          }}
        />
      </div>

      {/* Top Nav Bar (Timer, Pause, Counter, Exam Paper Toggle, Tools, Nav Grid) */}
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-0.5">
        {/* Pause & Timer */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onTogglePlayPause}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all shrink-0 cursor-pointer"
            title={isRunning ? "توقف موقت" : "ادامه"}
          >
            {isRunning ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <ExamTimerChip
            sessionId={sessionId}
            durationMinutes={durationMinutes}
            persistedSeconds={persistedSeconds}
            isRunning={isRunning}
            isRevealed={isCurrentRevealed}
            onGapDetected={onGapDetected}
            onAutoPause={onAutoPause}
          />
        </div>

        {/* Counter & Action Drawers */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <span className="text-[11px] sm:text-xs font-black text-[var(--ink-on-color)] bg-[var(--pastel-yellow)] px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] whitespace-nowrap shrink-0">
            {isOpenEnded ? `سؤال ${index + 1}` : `${index + 1} از ${totalQuestions}`}
          </span>

          {/* Source Button (منبع سؤال) */}
          <button
            type="button"
            onClick={onOpenSourceModal}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-[11px] sm:text-xs font-black flex items-center gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
            title="مشاهده منبع و مشخصات این سؤال"
          >
            <BookOpen size={14} className="text-[var(--brand-orange)]" />
            <span className="hidden xs:inline">منبع</span>
          </button>

          <button
            type="button"
            onClick={onToggleNavSheet}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all shrink-0 cursor-pointer"
            title="پاسخ‌برگ و ناوبری سؤالات"
          >
            <List size={16} />
          </button>

          <button
            type="button"
            onClick={onOpenFinishConfirm}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-[11px] sm:text-xs font-black flex items-center gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
            title="خروج یا پایان آزمون"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">خروج</span>
          </button>
        </div>
      </div>

      {/* Paused / Inactivity Notice */}
      {(isPaused || gapNotice) && (
        <div
          onClick={onResumeFromGap}
          className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 text-amber-900 dark:text-amber-200 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-[2px_2px_0px_var(--neo-shadow)] cursor-pointer hover:bg-amber-100/60 dark:hover:bg-amber-900/40 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-center sm:text-right justify-center sm:justify-start">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
            <span>
              {gapNotice
                ? "به‌خاطر ترک صفحه، آزمون موقتاً متوقف شد تا زمانی ثبت نشود. (برای ادامه کلیک کنید)"
                : "آزمون در وضعیت توقف موقت قرار دارد. زمان‌سنج متوقف شده است. (برای ادامه کلیک کنید)"}
            </span>
          </div>
          <div className="w-full sm:w-auto flex items-center justify-center">
            <NeoButton
              variant="primary"
              size="sm"
              icon={Play}
              onClick={(e) => {
                e.stopPropagation();
                onResumeFromGap();
              }}
              className="text-xs sm:text-sm font-black w-full sm:w-auto cursor-pointer"
            >
              ادامه آزمون
            </NeoButton>
          </div>
        </div>
      )}
    </>
  );
}
