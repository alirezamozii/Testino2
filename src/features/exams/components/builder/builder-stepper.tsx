"use client";

import React from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BuilderStepperProps {
  currentStep: number;
}

const BUILDER_STEPS = [
  { num: 1, label: "درس‌ها" },
  { num: 2, label: "سرفصل‌ها" },
  { num: 3, label: "منبع سؤال" },
  { num: 4, label: "تنظیمات آزمون" },
  { num: 5, label: "پیش‌نمایش" },
];

export function BuilderStepper({ currentStep }: BuilderStepperProps) {
  return (
    <div className="card-neo p-4 bg-[var(--surface)]">
      <div className="flex items-center justify-between px-1">
        {BUILDER_STEPS.map((s, idx) => {
          const isCurrent = currentStep === s.num;
          const isDone = currentStep > s.num;
          return (
            <div key={s.num} className="flex items-center flex-1 last:flex-initial">
              <div className="flex flex-col items-center flex-1">
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all border-2",
                    isCurrent
                      ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] scale-110"
                      : isDone
                      ? "bg-[var(--brand-green)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                      : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line)]"
                  )}
                >
                  {isDone ? <Check size={16} className="stroke-[3]" /> : s.num}
                </div>
                <span
                  className={cn(
                    "text-[10px] sm:text-xs font-black mt-1.5 transition-colors whitespace-nowrap",
                    isCurrent ? "text-[var(--brand-orange)]" : isDone ? "text-[var(--ink)]" : "text-[var(--muted)]"
                  )}
                >
                  {s.label}
                </span>
              </div>
              {idx < BUILDER_STEPS.length - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-1 mb-5 transition-colors rounded-full",
                    currentStep > idx + 1 ? "bg-[var(--brand-green)]" : "bg-[var(--line)]"
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
