"use client";

import React from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface ExamBottomBarProps {
  index: number;
  totalQuestions: number;
  pending: boolean;
  isOpenEnded: boolean;
  poolExhausted: boolean;
  isInstantFeedback: boolean;
  isCurrentRevealed: boolean;
  hasSelectedOption: boolean;
  onPrev: () => void;
  onNext: () => void;
  onRevealAnswer: () => void;
  onOpenFinishConfirm: () => void;
}

export function ExamBottomBar({
  index,
  totalQuestions,
  pending,
  isOpenEnded,
  poolExhausted,
  isInstantFeedback,
  isCurrentRevealed,
  hasSelectedOption,
  onPrev,
  onNext,
  onRevealAnswer,
  onOpenFinishConfirm,
}: ExamBottomBarProps) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 pt-2">
      <button
        type="button"
        onClick={onPrev}
        disabled={index === 0 || pending}
        className="py-3 sm:py-3.5 px-3.5 sm:px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs sm:text-sm font-black shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
      >
        <ChevronRight size={17} />
        <span>سؤال قبلی</span>
      </button>

      {/* Instant Feedback: Submit & Reveal button if option selected but not revealed */}
      {isInstantFeedback && !isCurrentRevealed && hasSelectedOption ? (
        <NeoButton
          variant="primary"
          size="lg"
          icon={Sparkles}
          disabled={pending}
          onClick={onRevealAnswer}
          className="flex-1 text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)]"
        >
          ثبت و بررسی پاسخ
        </NeoButton>
      ) : index < totalQuestions - 1 ? (
        <NeoButton
          variant="primary"
          size="lg"
          disabled={pending}
          onClick={onNext}
          className="flex-1 text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-center gap-1.5 sm:gap-2"
        >
          <span>{isCurrentRevealed ? "ادامه و سؤال بعدی" : "سؤال بعدی"}</span>
          <ChevronLeft size={17} />
        </NeoButton>
      ) : isOpenEnded && !poolExhausted ? (
        <div className="flex-1 flex gap-2">
          <NeoButton
            variant="primary"
            size="lg"
            disabled={pending}
            onClick={onNext}
            className="flex-1 text-xs sm:text-sm font-black flex items-center justify-center gap-1.5 sm:gap-2"
          >
            <span>{pending ? "دریافت سؤال…" : "سؤال بعدی"}</span>
            <ChevronLeft size={17} />
          </NeoButton>
          <NeoButton
            variant="success"
            size="lg"
            disabled={pending}
            onClick={onOpenFinishConfirm}
            className="text-xs sm:text-sm font-black shrink-0"
          >
            تحویل آزمون
          </NeoButton>
        </div>
      ) : (
        <NeoButton
          variant="success"
          size="lg"
          icon={CheckCircle2}
          disabled={pending}
          onClick={onOpenFinishConfirm}
          className="flex-1 text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)]"
        >
          تحویل آزمون
        </NeoButton>
      )}
    </div>
  );
}
