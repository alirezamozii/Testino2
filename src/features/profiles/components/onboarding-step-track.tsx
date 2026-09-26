"use client";

import React from "react";
import { NeoInput } from "@/components/ui/neo-primitives";

export interface OnboardingStepTrackProps {
  examType: string;
  onExamTypeChange: (val: string) => void;
  trackName: string;
  onTrackNameChange: (val: string) => void;
}

export function OnboardingStepTrack({
  examType,
  onExamTypeChange,
  trackName,
  onTrackNameChange,
}: OnboardingStepTrackProps) {
  return (
    <div className="space-y-5">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border-2 border-[var(--line)]">
          مرحله ۲ از ۴
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">
          نوع آزمون و رشتهٔ شما چیست؟
        </h2>
        <p className="text-xs text-[var(--muted)] font-bold">
          نوع آزمون و رشتهٔ تحصیلی خود را دستی بنویسید.
        </p>
      </div>

      {/* Manual Exam Type Input */}
      <div className="space-y-3">
        <div className="space-y-1.5">
          <label className="text-xs font-black text-[var(--ink)] block">
            نوع آزمون شما:
          </label>
          <NeoInput
            value={examType}
            onChange={(e) => onExamTypeChange(e.target.value)}
            placeholder="مثلاً: کنکور سراسری، کارشناسی ارشد، استخدامی، المپیاد..."
            className="w-full"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-black text-[var(--ink)] block">
            عنوان دقیق رشته یا گرایش شما:
          </label>
          <NeoInput
            value={trackName}
            onChange={(e) => onTrackNameChange(e.target.value)}
            placeholder="مثلاً: علوم تجربی، مهندسی کامپیوتر، حقوق، پزشکی..."
            className="w-full"
          />
        </div>
      </div>
    </div>
  );
}
