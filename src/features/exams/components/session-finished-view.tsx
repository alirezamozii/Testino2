"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  BarChart3,
  Check,
  ChevronRight,
  Download,
  HelpCircle,
  Lightbulb,
  Sparkles,
  X,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { calculateScore } from "../domain/scoring";
import { remapExplanationForShuffle } from "../domain/explanation-remapper";
import { buildSessionExport } from "@/features/ai/domain/export-builder";
import { simulateOverallConfidence } from "@/features/analytics/domain/confidence-simulation";
import { SignedNumber, SignedPercent, formatSignedPercentString } from "@/components/ui/signed-number";
import { NeoButton, NeoCard } from "@/components/ui/neo-primitives";
import { cn } from "@/lib/utils";
import type { SessionView } from "@/database/app-database";

const PERSIAN_LETTERS = ["الف", "ب", "ج", "د"];

export interface SessionFinishedViewProps {
  session: SessionView;
}

export function SessionFinishedView({ session: sData }: SessionFinishedViewProps) {
  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "wrong" | "unanswered">("all");
  const [finishedTab, setFinishedTab] = useState<"breakdown" | "questions" | "confidence">("breakdown");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);

  const totalQuestions = sData.questions.length;
  const attempts = sData.questions.map((q) => {
    const isAnswered = Boolean(q.selectedOptionId);
    const isCorrect = q.selectedOptionId === q.snapshot.correctOptionId;
    return {
      result: (!isAnswered ? "unanswered" : isCorrect ? "correct" : "wrong") as "correct" | "wrong" | "unanswered",
      visited: q.visited,
    };
  });
  const score = calculateScore(attempts, sData.config?.scorePolicy ?? { penaltyNumerator: 1, penaltyDenominator: 3 });
  const percentage = score.percentage ?? 0;

  const penaltyNum = sData.config?.scorePolicy?.penaltyNumerator ?? 1;
  const penaltyDen = sData.config?.scorePolicy?.penaltyDenominator ?? 3;

  // Subject breakdown calculation
  const subjectStats: Record<
    string,
    {
      total: number;
      correct: number;
      wrong: number;
      unanswered: number;
      rawPct: number;
      penalizedPct: number;
    }
  > = {};

  for (const q of sData.questions) {
    const subj = q.snapshot.subject || "عمومی";
    if (!subjectStats[subj]) {
      subjectStats[subj] = { total: 0, correct: 0, wrong: 0, unanswered: 0, rawPct: 0, penalizedPct: 0 };
    }
    subjectStats[subj].total += 1;
    if (!q.selectedOptionId) {
      subjectStats[subj].unanswered += 1;
    } else if (q.selectedOptionId === q.snapshot.correctOptionId) {
      subjectStats[subj].correct += 1;
    } else {
      subjectStats[subj].wrong += 1;
    }
  }

  for (const subj of Object.keys(subjectStats)) {
    const s = subjectStats[subj];
    if (s.total > 0) {
      s.rawPct = Math.round((s.correct / s.total) * 100);
      const net = penaltyNum > 0 ? s.correct - (s.wrong * penaltyNum) / penaltyDen : s.correct;
      s.penalizedPct = Math.round((net / s.total) * 100 * 10) / 10;
    }
  }

  // Confidence breakdown calculation: 4 cognitive states
  const sureAttempts = sData.questions.filter((q) => q.selectedOptionId && (q.confidence === "sure" || !q.confidence));
  const doubtfulAttempts = sData.questions.filter((q) => q.selectedOptionId && q.confidence === "doubtful");
  const guessAttempts = sData.questions.filter((q) => q.selectedOptionId && q.confidence === "guess");
  const skippedAttempts = sData.questions.filter((q) => !q.selectedOptionId && q.visited);

  const sureCorrect = sureAttempts.filter((q) => q.selectedOptionId === q.snapshot.correctOptionId).length;
  const doubtfulCorrect = doubtfulAttempts.filter((q) => q.selectedOptionId === q.snapshot.correctOptionId).length;
  const guessCorrect = guessAttempts.filter((q) => q.selectedOptionId === q.snapshot.correctOptionId).length;

  const sureAccuracy = sureAttempts.length ? Math.round((sureCorrect / sureAttempts.length) * 100) : 0;
  const doubtfulAccuracy = doubtfulAttempts.length ? Math.round((doubtfulCorrect / doubtfulAttempts.length) * 100) : 0;
  const guessAccuracy = guessAttempts.length ? Math.round((guessCorrect / guessAttempts.length) * 100) : 0;

  const sessionAttemptsForSim = sData.questions.map((q) => ({
    subject: q.snapshot.subject,
    result: !q.selectedOptionId
      ? ("unanswered" as const)
      : q.selectedOptionId === q.snapshot.correctOptionId
      ? ("correct" as const)
      : ("wrong" as const),
    confidence: q.confidence,
  }));

  const sessionSim = simulateOverallConfidence(
    sessionAttemptsForSim,
    Object.keys(subjectStats).map((subj) => ({
      name: subj,
      coefficient: 1,
      questionCount: subjectStats[subj].total,
    }))
  );

  // Filter questions based on selected tab in review
  const filteredQuestions = sData.questions.filter((q) => {
    const isAnswered = Boolean(q.selectedOptionId);
    const isCorrect = q.selectedOptionId === q.snapshot.correctOptionId;
    if (resultFilter === "correct") return isAnswered && isCorrect;
    if (resultFilter === "wrong") return isAnswered && !isCorrect;
    if (resultFilter === "unanswered") return !isAnswered;
    return true;
  });

  return (
    <div className="result-page max-w-4xl mx-auto space-y-6 pb-12 animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/sessions/"
          className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
        >
          <ChevronRight size={20} />
        </Link>
        <h1 className="text-base sm:text-lg font-black text-[var(--ink)]">نتیجه آزمون</h1>
        <div className="w-10" />
      </div>

      {/* 1. Trophy Celebration Card (Matching Wireframe 11 Phone 1) */}
      <NeoCard tone="cream" className="p-6 text-center space-y-4">
        {/* Trophy Graphic */}
        <div className="w-20 h-20 mx-auto relative flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            <circle cx="50" cy="50" r="44" fill="#FFE173" opacity="0.4" />
            <path d="M 28 26 L 72 26 L 66 58 Q 50 72 34 58 Z" fill="#FFE173" stroke="#0F172A" strokeWidth="2.5" />
            <path d="M 28 32 Q 16 32 18 44 Q 20 54 32 52" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 72 32 Q 84 32 82 44 Q 80 54 68 52" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <rect x="42" y="66" width="16" height="12" fill="#0F172A" />
            <rect x="30" y="78" width="40" height="8" rx="3" fill="#FFE173" stroke="#0F172A" strokeWidth="2.5" />
            <polygon points="50,36 53,44 61,44 54,49 57,57 50,52 43,57 46,49 39,44 47,44" fill="var(--brand-orange)" stroke="var(--line-strong)" strokeWidth="1" />
          </svg>
        </div>

        <div>
          <h2 className="text-2xl font-black text-[var(--ink)]">آزمون شما به پایان رسید!</h2>
          <p className="text-xs text-[var(--muted)] font-bold mt-1">
            کار بزرگی انجام دادی! حالا وقت دیدن نتیجه و تحلیل عملکرد است.
          </p>
        </div>

        {/* Donut Percentage Badge */}
        <div className="inline-flex flex-col items-center justify-center p-4 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)]">
          <span className="text-[11px] font-black text-[var(--muted)]">درصد کل کسب‌شده</span>
          <div className="text-4xl font-black text-[var(--brand-orange)] my-1">
            <SignedPercent value={percentage} showPlus={false} />
          </div>
        </div>

        {/* 3 Stats in Row (صحیح, غلط, نزده) */}
        <div className="grid grid-cols-3 gap-2.5 pt-2">
          <div className="p-3 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            <span className="block text-[11px] font-black text-[var(--ink)]">پاسخ صحیح</span>
            <strong className="text-xl font-black text-[var(--ink)]">{score.correct}</strong>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            <span className="block text-[11px] font-black text-[var(--pastel-red)]">پاسخ غلط</span>
            <strong className="text-xl font-black text-[var(--pastel-red)]">{score.wrong}</strong>
          </div>
          <div className="p-3 rounded-2xl bg-[var(--pastel-blue-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            <span className="block text-[11px] font-black text-[var(--ink)]">بدون پاسخ</span>
            <strong className="text-xl font-black text-[var(--ink)]">{score.unanswered}</strong>
          </div>
        </div>
      </NeoCard>

      {/* 2. Three Tabs (عملکرد در درس‌ها, مرور پاسخ‌نامه, تحلیل اطمینان) */}
      <div className="flex items-center gap-2 p-1.5 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
        <button
          type="button"
          onClick={() => setFinishedTab("breakdown")}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 cursor-pointer",
            finishedTab === "breakdown"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          عملکرد درس‌ها
        </button>
        <button
          type="button"
          onClick={() => setFinishedTab("questions")}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 cursor-pointer",
            finishedTab === "questions"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          مرور پاسخ‌ها
        </button>
        <button
          type="button"
          onClick={() => setFinishedTab("confidence")}
          className={cn(
            "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 cursor-pointer",
            finishedTab === "confidence"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          تحلیل اطمینان
        </button>
      </div>

      {/* TAB 1: عملکرد در درس‌ها (Wireframe 11 Phone 2) */}
      {finishedTab === "breakdown" && (
        <NeoCard className="p-5 space-y-4">
          <div>
            <h3 className="text-sm sm:text-base font-black text-[var(--ink)]">عملکرد تفکیکی درس‌ها</h3>
            <p className="text-[11px] text-[var(--muted)] font-bold mt-0.5">
              محاسبهٔ درصدهای دقیق هر درس با احتساب نمره منفی
            </p>
          </div>

          <div className="space-y-3.5">
            {Object.entries(subjectStats).map(([subj, data]) => {
              const correctPct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
              const wrongPct = data.total > 0 ? Math.round((data.wrong / data.total) * 100) : 0;
              const unansweredPct = data.total > 0 ? Math.round((data.unanswered / data.total) * 100) : 0;

              return (
                <div
                  key={subj}
                  className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-3 shadow-[2px_2px_0px_var(--neo-shadow)]"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <strong className="font-black text-sm text-[var(--ink)]">{subj}</strong>
                    <div className="flex items-center gap-2">
                      <span
                        className="px-2.5 py-0.5 rounded-xl text-xs font-black bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                        title={`درصد با نمره منفی: ${formatSignedPercentString(data.penalizedPct, false)} (درصد خام: ${data.rawPct}٪)`}
                      >
                        <SignedPercent value={data.penalizedPct} showPlus={false} />
                        <span className="text-[9px] mr-1 font-normal opacity-80">با نمره منفی</span>
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="py-1 px-1.5 rounded-xl bg-[var(--pastel-green-soft)] border border-emerald-400 text-[var(--ink)]">
                      <span className="block text-[10px] font-bold">صحیح</span>
                      <strong className="text-xs sm:text-sm font-black">{data.correct}</strong>
                      <span className="text-[9px] block text-emerald-700 dark:text-emerald-300 font-bold">
                        {correctPct}٪
                      </span>
                    </div>
                    <div className="py-1 px-1.5 rounded-xl bg-[var(--pastel-red-soft)] border border-rose-400 text-[var(--pastel-red)]">
                      <span className="block text-[10px] font-bold">غلط</span>
                      <strong className="text-xs sm:text-sm font-black">{data.wrong}</strong>
                      <span className="text-[9px] block text-rose-700 dark:text-rose-300 font-bold">
                        {wrongPct}٪
                      </span>
                    </div>
                    <div className="py-1 px-1.5 rounded-xl bg-[var(--surface-3)] border border-[var(--line)] text-[var(--ink)]">
                      <span className="block text-[10px] font-bold">نزده</span>
                      <strong className="text-xs sm:text-sm font-black">{data.unanswered}</strong>
                      <span className="text-[9px] block text-[var(--muted)] font-bold">
                        {unansweredPct}٪
                      </span>
                    </div>
                  </div>

                  <div className="space-y-1 pt-0.5">
                    <div className="w-full h-3 bg-[var(--surface-3)] rounded-full border border-[var(--line-strong)] overflow-hidden flex shadow-inner">
                      {data.correct > 0 && (
                        <div
                          className="h-full bg-emerald-500 transition-all duration-500"
                          style={{ width: `${correctPct}%` }}
                          title={`صحیح: ${data.correct} (${correctPct}٪)`}
                        />
                      )}
                      {data.wrong > 0 && (
                        <div
                          className="h-full bg-rose-500 transition-all duration-500"
                          style={{ width: `${wrongPct}%` }}
                          title={`غلط: ${data.wrong} (${wrongPct}٪)`}
                        />
                      )}
                      {data.unanswered > 0 && (
                        <div
                          className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-500"
                          style={{ width: `${unansweredPct}%` }}
                          title={`بی‌پاسخ: ${data.unanswered} (${unansweredPct}٪)`}
                        />
                      )}
                    </div>

                    <div className="flex justify-between items-center text-[10px] text-[var(--muted)] font-bold px-0.5">
                      <span>کل سؤالات: {data.total}</span>
                      <span>درصد خام: {data.rawPct}٪</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </NeoCard>
      )}

      {/* TAB 2: مرور پاسخ‌نامه (Wireframe 11 Phone 3 & 4) */}
      {finishedTab === "questions" && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)]">
            <button
              type="button"
              onClick={() => setResultFilter("all")}
              className={cn(
                "py-2 rounded-xl transition-all cursor-pointer",
                resultFilter === "all"
                  ? "bg-[var(--ink)] text-[var(--surface)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              همه ({totalQuestions})
            </button>
            <button
              type="button"
              onClick={() => setResultFilter("correct")}
              className={cn(
                "py-2 rounded-xl transition-all cursor-pointer",
                resultFilter === "correct"
                  ? "bg-[var(--brand-green)] text-[var(--ink-on-color)]"
                  : "text-emerald-700 hover:bg-emerald-50"
              )}
            >
              صحیح ({score.correct})
            </button>
            <button
              type="button"
              onClick={() => setResultFilter("wrong")}
              className={cn(
                "py-2 rounded-xl transition-all cursor-pointer",
                resultFilter === "wrong"
                  ? "bg-[var(--pastel-red)] text-white"
                  : "text-[var(--pastel-red)] hover:bg-red-50"
              )}
            >
              غلط ({score.wrong})
            </button>
            <button
              type="button"
              onClick={() => setResultFilter("unanswered")}
              className={cn(
                "py-2 rounded-xl transition-all cursor-pointer",
                resultFilter === "unanswered"
                  ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)]"
                  : "text-[var(--muted)] hover:bg-slate-100"
              )}
            >
              نزده ({score.unanswered})
            </button>
          </div>

          <div className="space-y-2.5">
            {filteredQuestions.map((q) => {
              const isAnswered = Boolean(q.selectedOptionId);
              const isCorrect = q.selectedOptionId === q.snapshot.correctOptionId;
              const originalIndex = sData.questions.findIndex((item) => item.id === q.id) + 1;

              return (
                <NeoCard key={q.id} className="p-4 space-y-3">
                  <button
                    type="button"
                    onClick={() => setExpandedResultId(expandedResultId === q.id ? null : q.id)}
                    className="flex items-center justify-between gap-3 w-full text-right cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "w-9 h-9 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center font-black text-xs",
                          !isAnswered
                            ? "bg-[var(--surface-2)] text-[var(--muted)]"
                            : isCorrect
                            ? "bg-[var(--brand-green)] text-[var(--ink-on-color)]"
                            : "bg-[var(--pastel-red)] text-white"
                        )}
                      >
                        {!isAnswered ? (
                          "—"
                        ) : isCorrect ? (
                          <Check size={16} className="stroke-[3]" />
                        ) : (
                          <X size={16} className="stroke-[3]" />
                        )}
                      </div>
                      <div>
                        <strong className="block text-xs font-black text-[var(--ink)]">
                          سؤال {originalIndex}
                        </strong>
                        <span className="text-[10px] text-[var(--muted)] font-bold">
                          {q.snapshot.subject} {q.snapshot.chapter ? `• ${q.snapshot.chapter}` : ""}
                        </span>
                      </div>
                    </div>

                    {(() => {
                      if (!isAnswered) {
                        if (!q.visited) {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-slate-300 bg-slate-100 dark:bg-slate-900/40 text-slate-500">
                              دیده‌نشده —
                            </span>
                          );
                        }
                        return (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            رد شده (نزده) ⏭️
                          </span>
                        );
                      }
                      if (isCorrect) {
                        if (q.confidence === "doubtful") {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-amber-400 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200">
                              صحیح با شک
                            </span>
                          );
                        }
                        if (q.confidence === "guess") {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-purple-400 bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200">
                              شانس تصادفی (حدس)
                            </span>
                          );
                        }
                        return (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200">
                            تسلط مطمئن
                          </span>
                        );
                      }
                      if (q.confidence === "doubtful") {
                        return (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-amber-400 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200">
                            خطای تردید (شک)
                          </span>
                        );
                      }
                      if (q.confidence === "guess") {
                        return (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-rose-400 bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200">
                            ریسک غلط (حدس منفی)
                          </span>
                        );
                      }
                      return (
                        <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-rose-500 bg-rose-200 dark:bg-rose-950 text-rose-950 dark:text-rose-100 shadow-[1px_1px_0px_#e11d48]">
                          تله علمی (غلط مطمئن)
                        </span>
                      );
                    })()}
                  </button>

                  {expandedResultId === q.id && (
                    <div className="pt-3 border-t border-[var(--line)] space-y-3 text-right">
                      <div className="text-xs font-bold leading-relaxed text-[var(--ink)]">
                        <ContentRenderer blocks={q.snapshot.content} />
                      </div>
                      <div className="space-y-1.5 pt-1">
                        {(() => {
                          const orderedOptions = q.optionOrder?.length
                            ? q.optionOrder
                                .map((optId) => q.snapshot.options.find((o) => o.id === optId))
                                .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
                            : q.snapshot.options;

                          return (
                            <>
                              {orderedOptions.map((option, optionIndex) => {
                                const isOptionCorrect = option.id === q.snapshot.correctOptionId;
                                const isOptionSelected = option.id === q.selectedOptionId;
                                return (
                                  <div
                                    key={option.id}
                                    className={cn(
                                      "p-2.5 rounded-xl border-2 text-xs font-bold flex items-center gap-2",
                                      isOptionCorrect
                                        ? "bg-[var(--pastel-green-soft)] border-[var(--line-strong)] text-[var(--ink)]"
                                        : isOptionSelected && !isOptionCorrect
                                        ? "bg-[var(--pastel-red-soft)] border-[var(--line-strong)] text-[var(--pastel-red)]"
                                        : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)]"
                                    )}
                                  >
                                    <span className="w-5 h-5 rounded-md bg-[var(--surface)] border border-[var(--line-strong)] flex items-center justify-center font-black text-[10px]">
                                      {PERSIAN_LETTERS[optionIndex]}
                                    </span>
                                    <div className="flex-1">
                                      <ContentRenderer blocks={option.content} />
                                    </div>
                                  </div>
                                );
                              })}
                              {q.snapshot.explanation.length > 0 && (
                                <div className="p-3 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-xs font-bold text-[var(--ink)] space-y-1 mt-2">
                                  <strong className="block font-black text-[var(--brand-orange)]">پاسخ تشریحی:</strong>
                                  <ContentRenderer blocks={remapExplanationForShuffle(q.snapshot.explanation, q.snapshot.options, orderedOptions)} />
                                </div>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </NeoCard>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: تحلیل اطمینان (Wireframe 12 Phone 4) */}
      {finishedTab === "confidence" && (
        <NeoCard className="p-5 space-y-4">
          <h3 className="text-sm font-black text-[var(--ink)]">تحلیل میزان اطمینان و شبیه‌ساز اثر شک و حدس</h3>
          <div className="space-y-2.5">
            <div className="p-3.5 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-green)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center font-black">
                  <Check size={20} className="stroke-[3]" />
                </div>
                <div>
                  <strong className="block text-xs font-black text-[var(--ink)]">مطمئن بودم</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">{sureAttempts.length} سؤال</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-[var(--ink)]">{sureAccuracy}٪ دقت</span>
                <span className="block text-[10px] text-[var(--muted)] font-bold">{sureCorrect} صحیح</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[var(--brand-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center font-black">
                  <AlertCircle size={20} />
                </div>
                <div>
                  <strong className="block text-xs font-black text-[var(--ink)]">شک داشتم</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">{doubtfulAttempts.length} سؤال</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-[var(--ink)]">{doubtfulAccuracy}٪ دقت</span>
                <span className="block text-[10px] text-[var(--muted)] font-bold">{doubtfulCorrect} صحیح</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-rose-500 border-2 border-[var(--line-strong)] text-white flex items-center justify-center font-black">
                  <HelpCircle size={20} />
                </div>
                <div>
                  <strong className="block text-xs font-black text-rose-700 dark:text-rose-400">حدس زدم</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">{guessAttempts.length} سؤال</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-base font-black text-rose-700 dark:text-rose-400">{guessAccuracy}٪ دقت</span>
                <span className="block text-[10px] text-[var(--muted)] font-bold">{guessCorrect} صحیح</span>
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border-2 border-[var(--line-strong)] flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center font-black">
                  <span className="text-base">⏭️</span>
                </div>
                <div>
                  <strong className="block text-xs font-black text-[var(--ink)]">رد کردن / بلد نبودم</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">{skippedAttempts.length} سؤال</span>
                </div>
              </div>
              <div className="text-right">
                <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">
                  <SignedNumber value={Math.round((skippedAttempts.length * (penaltyNum / penaltyDen)) * 10) / 10} showPlus={true} /> نمره ذخیره شد
                </span>
                <span className="block text-[10px] text-[var(--muted)] font-bold">اجتناب هوشمندانه از نمره منفی</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-2 border-t border-[var(--line-strong)]/20">
            <strong className="text-xs font-black text-[var(--ink)] block">
              شبیه‌ساز رفتار تستی در این آزمون («اگه نمی‌زدم چی می‌شد؟»):
            </strong>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
              <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                <span className="text-[10px] font-bold text-[var(--muted)] block">درصد کسب‌شده</span>
                <strong className="text-base font-black font-mono text-[var(--ink)]">
                  <SignedPercent value={percentage} showPlus={false} />
                </strong>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                <span className="text-[10px] font-bold text-amber-600 block">بدون شک‌ها</span>
                <strong className="text-base font-black font-mono text-[var(--ink)]">
                  <SignedPercent value={sessionSim.totals.overallWithoutDoubt} showPlus={false} />
                </strong>
                <span className={cn("text-[9px] font-black block font-mono", sessionSim.totals.totalDoubtfulNetGain >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                  <SignedPercent value={sessionSim.totals.totalDoubtfulNetGain} showPlus={true} /> اثر
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                <span className="text-[10px] font-bold text-rose-600 block">بدون حدس‌ها</span>
                <strong className="text-base font-black font-mono text-[var(--ink)]">
                  <SignedPercent value={sessionSim.totals.overallWithoutGuess} showPlus={false} />
                </strong>
                <span className={cn("text-[9px] font-black block font-mono", sessionSim.totals.totalGuessNetGain >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                  <SignedPercent value={sessionSim.totals.totalGuessNetGain} showPlus={true} /> اثر
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                <span className="text-[10px] font-bold text-[var(--brand-green)] block">فقط مطمئن‌ها</span>
                <strong className="text-base font-black font-mono text-[var(--ink)]">
                  <SignedPercent value={sessionSim.totals.overallOnlySure} showPlus={false} />
                </strong>
                <span className="text-[9px] font-bold text-[var(--muted)] block">{sureAccuracy}٪ دقت</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[var(--brand-orange)] border-2 border-[var(--line-strong)] flex items-center justify-center flex-shrink-0 text-white">
              <Lightbulb size={20} />
            </div>
            <p className="text-[11px] font-bold text-[var(--ink)] leading-relaxed">
              {doubtfulAttempts.length === 0 && guessAttempts.length === 0
                ? "در تمام پاسخ‌ها با اطمینان کامل عمل کرده‌اید. تمرکز بسیار خوبی داشته‌اید!"
                : sessionSim.totals.totalDoubtfulNetGain > 0
                ? `پاسخ به سؤالات شک‌دار در این آزمون ${formatSignedPercentString(sessionSim.totals.totalDoubtfulNetGain, true)} به درصد شما اضافه کرده است. به شک‌های ۵۰-۵۰ خود اعتماد کنید.`
                : sessionSim.totals.totalDoubtfulNetGain < 0
                ? `پاسخ به سؤالات شک‌دار باعث نمره منفی و افت درصد شما (${formatSignedPercentString(sessionSim.totals.totalDoubtfulNetGain, false)}) شده است. تا اطمینان نیافته‌اید علامت نزنید.`
                : "سؤالات شک‌دار و حدسی اثر متعادلی بر درصد شما داشته‌اند."}
            </p>
          </div>
        </NeoCard>
      )}

      {/* AI Analysis Export Card (TASK-026) */}
      <NeoCard className="p-4 sm:p-5 rounded-3xl space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/50 border-2 border-[var(--line-strong)] text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
            <Sparkles size={16} />
          </div>
          <div>
            <h4 className="text-xs sm:text-sm font-black text-[var(--ink)]">خروجی هوشمند برای تحلیل هوش مصنوعی</h4>
            <p className="text-[11px] text-[var(--muted)] font-bold">دانلود فایل استاندارد جلسه با حفظ حریم خصوصی و بدون شناسه شخصی</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            onClick={() => {
              try {
                const exportData = buildSessionExport(sData, "mistakes");
                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                  type: "application/json;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `testino-session-${sData.id.slice(0, 8)}-analysis-mistakes.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                alert(err instanceof Error ? err.message : "خطا در استخراج خروجی جلسه");
              }
            }}
            className="py-2.5 px-3 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Download size={15} />
            <span>فقط سؤالات اشتباه و شک‌دار</span>
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                const exportData = buildSessionExport(sData, "full");
                const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                  type: "application/json;charset=utf-8",
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `testino-session-${sData.id.slice(0, 8)}-analysis-full.json`;
                a.click();
                URL.revokeObjectURL(url);
              } catch (err) {
                alert(err instanceof Error ? err.message : "خطا در استخراج خروجی جلسه");
              }
            }}
            className="py-2.5 px-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <Download size={15} />
            <span>تمام سؤالات و گزینه‌ها</span>
          </button>
        </div>
      </NeoCard>

      {/* 3. Action Buttons */}
      <div className="space-y-2 pt-2">
        <Link href="/analytics/" className="block">
          <NeoButton variant="primary" size="lg" className="w-full text-sm font-black" icon={BarChart3}>
            مشاهده تحلیل کامل و روندها
          </NeoButton>
        </Link>
        <Link href="/" className="block">
          <NeoButton variant="surface" size="md" className="w-full text-xs font-black">
            بازگشت به خانه
          </NeoButton>
        </Link>
      </div>
    </div>
  );
}
