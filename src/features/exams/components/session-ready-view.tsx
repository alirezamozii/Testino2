"use client";

import React from "react";
import Link from "next/link";
import { BookOpen, ChevronRight, ClipboardList, Laptop, Play, Timer } from "lucide-react";
import { NeoButton } from "@/components/ui/neo-primitives";
import type { SessionConfig } from "@/database/app-database";

export interface SessionReadyViewProps {
  config?: SessionConfig | null;
  totalQuestions: number;
  isStarting: boolean;
  onBegin: () => void;
}

export function SessionReadyView({
  config,
  totalQuestions,
  isStarting,
  onBegin,
}: SessionReadyViewProps) {
  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6 text-center animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/sessions/"
          className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
        >
          <ChevronRight size={20} />
        </Link>
        <span className="text-xs font-black text-[var(--muted)]">پیش‌نمایش آزمون</span>
        <div className="w-10" />
      </div>

      {/* Hero Vector Illustration: Exam Sheet + Stopwatch (Matching Wireframe 09 Phone 1) */}
      <div className="w-28 h-28 mx-auto relative flex items-center justify-center">
        <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
          {/* Radiating sunburst rays */}
          <circle cx="50" cy="50" r="44" fill="#FFE173" opacity="0.4" />
          {/* Paper sheet */}
          <rect x="22" y="16" width="46" height="60" rx="8" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2.5" />
          {/* Checklist items */}
          <line x1="30" y1="28" x2="42" y2="28" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 48 26 L 52 30 L 60 22" fill="none" stroke="#6CCB7F" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="30" y1="40" x2="42" y2="40" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 48 38 L 52 42 L 60 34" fill="none" stroke="#6CCB7F" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="30" y1="52" x2="42" y2="52" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <path d="M 48 50 L 52 54 L 60 46" fill="none" stroke="#6CCB7F" strokeWidth="2.5" strokeLinecap="round" />
          {/* Stopwatch on bottom right */}
          <circle cx="68" cy="68" r="18" fill="#BAC4FE" stroke="#0F172A" strokeWidth="2.5" />
          <line x1="68" y1="50" x2="68" y2="46" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="68" y1="68" x2="68" y2="58" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
          <line x1="68" y1="68" x2="76" y2="68" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>

      <div>
        <h1 className="text-2xl font-black text-[var(--ink)]">آماده‌ای شروع کنیم؟</h1>
        <p className="text-xs text-[var(--muted)] font-bold mt-1.5 leading-relaxed">
          همه‌چیز آماده‌ست! همه تمرکزت رو پاسخ بده و بهترین خودت باش.
        </p>
      </div>

      {/* Test Parameters Card (Matching Wireframe 09 Phone 1) */}
      <div className="card-neo p-5 space-y-3.5 text-right bg-[var(--surface)]">
        <div className="flex items-center justify-between text-xs pb-2.5 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
              <Laptop size={18} />
            </div>
            <span className="text-[var(--muted)] font-bold">عنوان آزمون</span>
          </div>
          <strong className="font-black text-[var(--ink)]">
            {config?.subjectFilter ? `آزمون ${config.subjectFilter}` : "جامع شبیه‌ساز آزمون"}
          </strong>
        </div>

        <div className="flex items-center justify-between text-xs pb-2.5 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
              <ClipboardList size={18} />
            </div>
            <span className="text-[var(--muted)] font-bold">تعداد سؤال</span>
          </div>
          <strong className="font-black text-[var(--brand-orange)]">{totalQuestions} سؤال</strong>
        </div>

        <div className="flex items-center justify-between text-xs pb-2.5 border-b border-[var(--line)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
              <Timer size={18} />
            </div>
            <span className="text-[var(--muted)] font-bold">مدت زمان</span>
          </div>
          <strong className="font-black text-[var(--ink)]">
            {config?.durationMinutes
              ? `${config.durationMinutes.toLocaleString("fa-IR")} دقیقه`
              : "بدون محدودیت زمانی"}
          </strong>
        </div>

        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--pastel-orange-soft)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)]">
              <BookOpen size={18} />
            </div>
            <span className="text-[var(--muted)] font-bold">موضوعات</span>
          </div>
          <strong className="font-black text-[var(--ink)] max-w-[180px] truncate">
            {config?.subjectFilter || "تمام دروس"}
          </strong>
        </div>
      </div>

      <NeoButton
        variant="primary"
        size="lg"
        className="w-full text-base font-black"
        isLoading={isStarting}
        icon={Play}
        onClick={onBegin}
      >
        شروع آزمون
      </NeoButton>
    </div>
  );
}
