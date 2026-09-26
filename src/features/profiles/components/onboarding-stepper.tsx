"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface OnboardingStepperProps {
  currentStep: number;
}

const STEPS = [
  { num: 1, label: "هویت و حساب" },
  { num: 2, label: "آزمون و رشته" },
  { num: 3, label: "درس‌ها و هدف" },
];

export function OnboardingStepper({ currentStep }: OnboardingStepperProps) {
  return (
    <div className="card-neo p-4 sm:p-5 bg-[var(--surface)]">
      <div className="flex items-center justify-between max-w-2xl mx-auto">
        {STEPS.map((s, idx) => {
          const isCurrent = currentStep === s.num;
          const isDone = currentStep > s.num;
          return (
            <div key={s.num} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-black text-xs transition-all border-2",
                    isCurrent
                      ? "bg-[var(--testino-orange)] text-white border-[var(--line)] shadow-[2px_2px_0px_var(--line)] scale-110"
                      : isDone
                      ? "bg-[var(--brand-green)] text-[var(--ink-on-color)] border-[var(--line)]"
                      : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line-strong)]"
                  )}
                >
                  {isDone ? <Check size={16} strokeWidth={3} /> : s.num}
                </div>

                <span
                  className={cn(
                    "text-[10px] sm:text-xs font-black mt-1.5 transition-colors whitespace-nowrap",
                    isCurrent
                      ? "text-[var(--testino-orange)] font-black"
                      : isDone
                      ? "text-[var(--ink)]"
                      : "text-[var(--muted)]"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1.5 mb-5 transition-colors rounded-full",
                    currentStep > idx + 1 ? "bg-[var(--brand-green)]" : "bg-[var(--surface-3)]"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
