"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Award,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Download,
  Flame,
  Sparkles,
  Target,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { ErrorState, LoadingState } from "@/components/ui/testino-ui";
import { SignedPercent } from "@/components/ui/signed-number";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";

export function AnalyticsPage() {
  const { db, status } = useDatabase();
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
  const profile = profiles.data?.[0];
  const query = useQuery({
    queryKey: ["analytics", profile?.id],
    queryFn: () => db.analytics(profile!.id),
    enabled: Boolean(profile),
  });

  if (profiles.isLoading || query.isLoading) {
    return <LoadingState label="در حال محاسبهٔ تحلیل عملکرد و نقاط قوت و ضعف…" />;
  }

  if (profiles.isError || query.isError) {
    return (
      <ErrorState
        message="داده‌های تحلیل خوانده نشد."
        retry={() => {
          void profiles.refetch();
          void query.refetch();
        }}
      />
    );
  }

  if (!profile) {
    return (
      <div className="card-neo p-8 max-w-lg mx-auto text-center rounded-3xl bg-[var(--surface)] dark:bg-slate-900 space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-[var(--border)] flex items-center justify-center text-amber-600 shadow-[4px_4px_0px_var(--neo-shadow)] mx-auto">
          <Target size={32} />
        </div>
        <h2 className="text-lg font-black text-[var(--foreground)]">پروفایلی برای تحلیل نیست</h2>
        <p className="text-xs text-[var(--muted-foreground)] font-medium">
          ابتدا درس‌ها و رشتهٔ تحصیلی خود را مشخص کنید تا گزارش‌های دقیق تحلیلی ساخته شوند.
        </p>
        <Link href="/onboarding/" className="btn-neo-orange inline-flex items-center gap-2 text-xs font-black px-5 py-2.5 shadow-[3px_3px_0px_var(--neo-shadow)]">
          ساخت پروفایل
        </Link>
      </div>
    );
  }

  const data = query.data;
  const totals = data?.totals;
  const bySubject = data?.bySubject ?? [];
  const weakTopics = data?.weakTopics ?? [];
  const confidenceSimulation = data?.confidenceSimulation;
  const profileName = profile.name;
  const percentage = totals?.total ? Math.round((totals.correct / totals.total) * 100) : null;

  function exportAnalysis() {
    if (!data) return;
    const blob = new Blob(
      [
        JSON.stringify(
          {
            app: "Testino",
            schemaVersion: "1.0",
            exportedAt: new Date().toISOString(),
            profile: profileName,
            ...data,
          },
          null,
          2
        ),
      ],
      { type: "application/json;charset=utf-8" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `testino-analysis-${Date.now().toString(36)}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="page analytics-page max-w-4xl mx-auto space-y-6 pb-12">
      {/* 1. Header Intro */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[var(--pastel-blue)] border-2 border-[var(--border)] text-[var(--foreground)] shadow-[2px_2px_0px_var(--neo-shadow)] mb-1.5">
            <BarChart3 size={13} />
            بر اساس آزمون‌های نهایی ثبت‌شده
          </span>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--foreground)] tracking-tight">
            تحلیل عملکرد و نقاط قوت
          </h1>
          <p className="text-xs sm:text-sm text-[var(--muted-foreground)] font-medium mt-1">
            آمار و درصدهای واقعی استخراج‌شده از تک‌تک پاسخ‌های شما در جلسات آزمون.
          </p>
        </div>

        <button
          type="button"
          onClick={exportAnalysis}
          disabled={!totals?.total}
          className="btn-neo-blue inline-flex items-center gap-2 text-xs font-black px-4 py-2.5 shadow-[3px_3px_0px_var(--neo-shadow)] self-start sm:self-center disabled:opacity-50"
        >
          <Download size={15} />
          <span>خروجی تحلیلی JSON</span>
        </button>
      </div>

      {!totals?.total ? (
        <div className="card-neo p-8 text-center rounded-3xl bg-[var(--surface)] dark:bg-slate-900 flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border-2 border-[var(--border)] flex items-center justify-center text-sky-600 shadow-[4px_4px_0px_var(--neo-shadow)]">
            <TrendingUp size={32} />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base sm:text-lg font-black text-[var(--foreground)]">
              هنوز داده‌ای برای تحلیل نیست
            </h3>
            <p className="text-xs sm:text-sm text-[var(--muted-foreground)] font-medium">
              حداقل یک آزمون را تا پایان انجام دهید تا نمودار درصدها، میانگین زمان و نقاط ضعف در اینجا شکل بگیرند.
            </p>
          </div>
          <Link href="/sessions/new/" className="btn-neo-orange text-xs font-black px-5 py-2.5 shadow-[3px_3px_0px_var(--neo-shadow)]">
            شروع اولین آزمون
          </Link>
        </div>
      ) : (
        <>
          {/* 2. Hero Overview Card with Donut & Stat Grid (Wireframe 14 Top Card) */}
          <div className="card-neo p-5 sm:p-6 rounded-3xl bg-[var(--surface)] dark:bg-slate-900 flex flex-col md:flex-row items-center justify-between gap-6 shadow-[4px_4px_0px_var(--neo-shadow)]">
            {/* Score Ring */}
            <div className="flex flex-col items-center justify-center flex-shrink-0">
              <div className="relative w-36 h-36 flex items-center justify-center">
                <svg className="w-full h-full -rotate-90 transform" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="var(--line)"
                    strokeWidth="10"
                    className="dark:stroke-slate-800"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    fill="transparent"
                    stroke="#FF6B3D"
                    strokeWidth="10"
                    strokeDasharray={251.2}
                    strokeDashoffset={251.2 - (251.2 * (percentage ?? 0)) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-1000 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                  <span className="text-3xl font-black text-[var(--foreground)] tracking-tight">
                    {percentage !== null ? `${percentage}٪` : "—"}
                  </span>
                  <span className="text-[10px] font-black text-[var(--muted-foreground)]">درصد کل صحیح</span>
                </div>
              </div>
            </div>

            {/* Metrics Breakdown */}
            <div className="flex-1 w-full space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-black text-[var(--foreground)]">
                    نمای کلی دقت و زمان
                  </h2>
                  <p className="text-xs text-[var(--muted-foreground)] font-medium">
                    مخرج کل محاسبات: {totals.total} پاسخ نهایی ثبت‌شده روی این دستگاه
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                  <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-1">
                    <span className="text-[11px] font-black">صحیح</span>
                    <CheckCircle2 size={16} />
                  </div>
                  <span className="text-xl font-black text-[var(--foreground)]">{totals.correct}</span>
                </div>

                <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/30 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                  <div className="flex items-center justify-between text-red-700 dark:text-red-400 mb-1">
                    <span className="text-[11px] font-black">غلط</span>
                    <XCircle size={16} />
                  </div>
                  <span className="text-xl font-black text-[var(--foreground)]">{totals.wrong}</span>
                </div>

                <div className="p-3 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                  <div className="flex items-center justify-between text-amber-800 dark:text-amber-400 mb-1">
                    <span className="text-[11px] font-black">بی‌پاسخ</span>
                    <AlertTriangle size={16} />
                  </div>
                  <span className="text-xl font-black text-[var(--foreground)]">{totals.unanswered}</span>
                </div>

                <div className="p-3 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                  <div className="flex items-center justify-between text-sky-800 dark:text-sky-400 mb-1">
                    <span className="text-[11px] font-black">میانگین زمان</span>
                    <Clock3 size={16} />
                  </div>
                  <span className="text-xl font-black text-[var(--foreground)]">
                    {data?.averageTimePerQuestionSec ?? 0}
                    <small className="text-[10px] font-normal mr-0.5">ث</small>
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Columns: Subject Breakdown + Weak Topics */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Subject Breakdown Card */}
            <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] dark:bg-slate-900 space-y-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
              <div className="flex items-center justify-between border-b border-[var(--border)]/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--border)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)]">
                    <Award size={16} className="text-[var(--brand-orange)]" />
                  </span>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-[var(--foreground)]">
                      عملکرد در درس‌ها
                    </h3>
                    <p className="text-[11px] text-[var(--muted-foreground)] font-bold">
                      محاسبهٔ درصد دقیق با احتساب نمرهٔ منفی و تفکیک پاسخ‌ها
                    </p>
                  </div>
                </div>
              </div>

              {bySubject.length === 0 ? (
                <div className="p-6 text-center text-xs font-bold text-[var(--muted-foreground)] bg-slate-50 dark:bg-slate-800/50 rounded-2xl border-2 border-dashed border-[var(--border)]">
                  هنوز آزمونی در این درس‌ها ثبت نشده است.
                </div>
              ) : (
                <div className="space-y-4">
                  {bySubject.map((item) => {
                    const subjectTarget = profile.subjects?.find((s) => s.name === item.subject)?.targetPercentage ?? 70;
                    const pct = item.percentage !== null ? Math.round(item.percentage) : 0;
                    const rawPct = item.rawPercentage !== null
                      ? Math.round(item.rawPercentage)
                      : item.total > 0
                      ? Math.round((item.correct / item.total) * 100)
                      : 0;
                    const unanswered = Math.max(0, item.total - item.correct - item.wrong);
                    const isAboveTarget = pct >= subjectTarget;

                    const correctPct = item.total > 0 ? Math.round((item.correct / item.total) * 100) : 0;
                    const wrongPct = item.total > 0 ? Math.round((item.wrong / item.total) * 100) : 0;
                    const unansweredPct = item.total > 0 ? Math.round((unanswered / item.total) * 100) : 0;

                    return (
                      <div
                        key={item.subject}
                        className="p-3.5 rounded-2xl bg-[var(--surface-2)] dark:bg-slate-800/60 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-2.5"
                      >
                        {/* Header: Subject Name, Coefficient, Target & Final Percentage */}
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <div className="flex items-center gap-2">
                            <span className="font-black text-sm text-[var(--foreground)]">{item.subject}</span>
                            <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[var(--surface)] border border-[var(--border)] text-[var(--muted-foreground)]">
                              ضریب {item.coefficient}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[var(--muted-foreground)]">
                              هدف: {subjectTarget}٪
                            </span>
                            <span
                              className={cn(
                                "px-2.5 py-0.5 rounded-xl text-xs font-black border-2 shadow-[1px_1px_0px_var(--neo-shadow)]",
                                isAboveTarget
                                  ? "bg-emerald-100 text-emerald-900 border-emerald-500 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-700"
                                  : "bg-amber-100 text-amber-900 border-amber-500 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-700"
                              )}
                              title={`درصد با نمره منفی: ${pct}٪ (درصد خام بدون نمره منفی: ${rawPct}٪)`}
                            >
                              {pct}٪
                              <span className="text-[9px] mr-1 font-normal opacity-80">خالص</span>
                            </span>
                          </div>
                        </div>

                        {/* 3 Metric Badges: Correct, Wrong, Unanswered */}
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="py-1 px-1.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300">
                            <span className="block text-[10px] font-bold">صحیح</span>
                            <strong className="text-xs sm:text-sm font-black">{item.correct}</strong>
                            <span className="text-[9px] block text-emerald-600 dark:text-emerald-400 font-bold">
                              {correctPct}٪
                            </span>
                          </div>
                          <div className="py-1 px-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-300">
                            <span className="block text-[10px] font-bold">غلط</span>
                            <strong className="text-xs sm:text-sm font-black">{item.wrong}</strong>
                            <span className="text-[9px] block text-rose-600 dark:text-rose-400 font-bold">
                              {wrongPct}٪
                            </span>
                          </div>
                          <div className="py-1 px-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300">
                            <span className="block text-[10px] font-bold">نزده</span>
                            <strong className="text-xs sm:text-sm font-black">{unanswered}</strong>
                            <span className="text-[9px] block text-slate-500 font-bold">
                              {unansweredPct}٪
                            </span>
                          </div>
                        </div>

                        {/* Segmented Progress Bar: Green (Correct) + Rose (Wrong) + Muted (Unanswered) */}
                        <div className="space-y-1 pt-0.5">
                          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full border border-[var(--border)] overflow-hidden flex shadow-inner">
                            {item.correct > 0 && (
                              <div
                                className="h-full bg-emerald-500 transition-all duration-500"
                                style={{ width: `${correctPct}%` }}
                                title={`صحیح: ${item.correct} (${correctPct}٪)`}
                              />
                            )}
                            {item.wrong > 0 && (
                              <div
                                className="h-full bg-rose-500 transition-all duration-500"
                                style={{ width: `${wrongPct}%` }}
                                title={`غلط: ${item.wrong} (${wrongPct}٪)`}
                              />
                            )}
                            {unanswered > 0 && (
                              <div
                                className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-500"
                                style={{ width: `${unansweredPct}%` }}
                                title={`بی‌پاسخ: ${unanswered} (${unansweredPct}٪)`}
                              />
                            )}
                          </div>

                          <div className="flex justify-between items-center text-[10px] text-[var(--muted-foreground)] font-bold px-0.5">
                            <span>کل سؤالات: {item.total}</span>
                            <span>درصد خام: {rawPct}٪</span>
                            <span
                              className={
                                item.targetGap !== null && item.targetGap >= 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : "text-amber-600 dark:text-amber-400"
                              }
                            >
                              {item.targetGap !== null
                                ? item.targetGap >= 0
                                  ? `+${item.targetGap}٪ از هدف`
                                  : `${item.targetGap}٪ تا هدف`
                                : ""}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Confidence Simulation & Konkur Negative Marking Deep Dive */}
            {confidenceSimulation && confidenceSimulation.totals.totalAttempts > 0 && (
              <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] dark:bg-slate-900 space-y-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
                <div className="flex items-center justify-between border-b border-[var(--border)]/20 pb-3 flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--border)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)]">
                      <Sparkles size={16} className="text-[var(--brand-orange)]" />
                    </span>
                    <div>
                      <h3 className="text-sm sm:text-base font-black text-[var(--foreground)]">
                        شبیه‌ساز اثر شک و حدس در کنکور («اگه نمی‌زدم چی می‌شد؟»)
                      </h3>
                      <p className="text-[11px] text-[var(--muted-foreground)] font-bold">
                        محاسبه اثر پاسخ‌های شک‌دار و حدسی بر اساس فرمول رسمی سازمان سنجش
                      </p>
                    </div>
                  </div>
                </div>

                {/* 4 Summary Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                  <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border-2 border-[var(--border)] space-y-1">
                    <span className="text-[10px] font-black text-[var(--muted-foreground)] block">درصد واقعی کل</span>
                    <strong className="text-xl font-black text-[var(--foreground)] font-mono">
                      {confidenceSimulation.totals.overallActualPercentage}٪
                    </strong>
                    <span className="text-[9px] font-bold text-[var(--muted-foreground)] block">با احتساب همه پاسخ‌ها</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border-2 border-[var(--border)] space-y-1">
                    <span className="text-[10px] font-black text-amber-700 dark:text-amber-400 block">بدون شک‌ها</span>
                    <strong className="text-xl font-black text-[var(--foreground)] font-mono">
                      <SignedPercent value={confidenceSimulation.totals.overallWithoutDoubt} showPlus={false} />
                    </strong>
                    <span className={cn("text-[9px] font-black block font-mono", confidenceSimulation.totals.totalDoubtfulNetGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                      <SignedPercent value={confidenceSimulation.totals.totalDoubtfulNetGain} showPlus={true} /> {confidenceSimulation.totals.totalDoubtfulNetGain >= 0 ? "سود شک" : "زیان شک"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-rose-50/70 dark:bg-rose-950/30 border-2 border-[var(--border)] space-y-1">
                    <span className="text-[10px] font-black text-rose-700 dark:text-rose-400 block">بدون حدس‌ها</span>
                    <strong className="text-xl font-black text-[var(--foreground)] font-mono">
                      <SignedPercent value={confidenceSimulation.totals.overallWithoutGuess} showPlus={false} />
                    </strong>
                    <span className={cn("text-[9px] font-black block font-mono", confidenceSimulation.totals.totalGuessNetGain >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500")}>
                      <SignedPercent value={confidenceSimulation.totals.totalGuessNetGain} showPlus={true} /> {confidenceSimulation.totals.totalGuessNetGain >= 0 ? "سود حدس" : "زیان حدس"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border-2 border-[var(--border)] space-y-1">
                    <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-400 block">فقط مطمئن‌ها</span>
                    <strong className="text-xl font-black text-[var(--foreground)] font-mono">
                      <SignedPercent value={confidenceSimulation.totals.overallOnlySure} showPlus={false} />
                    </strong>
                    <span className="text-[9px] font-bold text-[var(--muted-foreground)] block">بدون ریسک خطا</span>
                  </div>
                </div>

                {/* Per-Subject Detailed Simulation Cards */}
                <div className="space-y-3 pt-2">
                  <h4 className="text-xs font-black text-[var(--foreground)]">
                    تحلیل تفکیکی و استراتژی هر درس:
                  </h4>

                  {confidenceSimulation.subjects.map((sub) => (
                    <div
                      key={sub.subject}
                      className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border-2 border-[var(--border)] space-y-3 shadow-sm"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-black text-[var(--foreground)]">{sub.subject}</strong>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-slate-850 border border-[var(--border)]">
                            ضریب {sub.coefficient}
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-white dark:bg-slate-850 border border-[var(--border)]">
                            {sub.questionCount} سؤال در کنکور
                          </span>
                        </div>
                        <div className="text-xs font-mono font-bold flex items-center gap-3">
                          <span className="text-emerald-600 dark:text-emerald-400">
                            ارزش تست: <SignedPercent value={sub.pointValuePerCorrect} showPlus={true} />
                          </span>
                          <span className="text-red-500">
                            نمره منفی: <SignedPercent value={-sub.penaltyPerWrong} showPlus={false} />
                          </span>
                        </div>
                      </div>

                      {/* 4 Percentages Comparison */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-[var(--border)]">
                          <span className="text-[10px] text-[var(--muted-foreground)] font-bold block">درصد واقعی</span>
                          <strong className="text-sm font-black font-mono text-[var(--foreground)]">
                            <SignedPercent value={sub.actualPercentage} showPlus={false} />
                          </strong>
                        </div>
                        <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-[var(--border)]">
                          <span className="text-[10px] text-amber-700 dark:text-amber-400 font-bold block">بدون شک‌ها</span>
                          <strong className="text-sm font-black font-mono text-[var(--foreground)]">
                            <SignedPercent value={sub.percentageWithoutDoubt} showPlus={false} />
                          </strong>
                          <span className={cn("text-[9px] font-bold block font-mono", sub.doubtful.netPercentageImpact >= 0 ? "text-emerald-600" : "text-red-500")}>
                            <SignedPercent value={sub.doubtful.netPercentageImpact} showPlus={true} /> اثر
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-[var(--border)]">
                          <span className="text-[10px] text-rose-700 dark:text-rose-400 font-bold block">بدون حدس‌ها</span>
                          <strong className="text-sm font-black font-mono text-[var(--foreground)]">
                            <SignedPercent value={sub.percentageWithoutGuess} showPlus={false} />
                          </strong>
                          <span className={cn("text-[9px] font-bold block font-mono", sub.guess.netPercentageImpact >= 0 ? "text-emerald-600" : "text-red-500")}>
                            <SignedPercent value={sub.guess.netPercentageImpact} showPlus={true} /> اثر
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white dark:bg-slate-800 border border-[var(--border)]">
                          <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold block">فقط مطمئن‌ها</span>
                          <strong className="text-sm font-black font-mono text-[var(--foreground)]">
                            <SignedPercent value={sub.percentageOnlySure} showPlus={false} />
                          </strong>
                          <span className="text-[9px] text-[var(--muted-foreground)] font-bold block">{sub.sure.accuracy}٪ دقت</span>
                        </div>
                      </div>

                      {/* Strategic Recommendation Banner */}
                      <div className="p-3 rounded-xl bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[10px] font-black border",
                            sub.strategicAdvice.recommendationTag === "trust_doubt"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300"
                              : sub.strategicAdvice.recommendationTag === "avoid_doubt" || sub.strategicAdvice.recommendationTag === "avoid_guess"
                              ? "bg-rose-100 text-rose-800 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300"
                              : "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300"
                          )}>
                            {sub.strategicAdvice.recommendationLabel}
                          </span>
                          <strong className="text-xs font-black text-[var(--foreground)]">
                            توصیه استراتژیک برای کنکور:
                          </strong>
                        </div>
                        <p className="text-[11px] leading-relaxed text-[var(--muted-foreground)] font-medium">
                          {sub.strategicAdvice.overallSubjectAdvice}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Weak Topics / Areas for Focus */}
            <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] dark:bg-slate-900 space-y-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
              <div className="flex items-center justify-between border-b border-[var(--border)]/20 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-red-100 dark:bg-red-950/40 border-2 border-[var(--border)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)]">
                    <Flame size={16} className="text-red-600 dark:text-red-400" />
                  </span>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-[var(--foreground)]">
                      موضوع‌های نیازمند تمرکز
                    </h3>
                    <p className="text-[11px] text-[var(--muted-foreground)] font-bold">
                      مباحثی با حداقل ۳ پاسخ و نرخ خطای بیش از ۳۰٪
                    </p>
                  </div>
                </div>
              </div>

              {weakTopics.length > 0 ? (
                <div className="space-y-3">
                  {weakTopics.map((topicItem) => (
                    <div
                      key={topicItem.topic}
                      className="p-3 rounded-2xl bg-red-50/50 dark:bg-red-950/20 border-2 border-red-200 dark:border-red-900/50 flex items-center justify-between gap-3 shadow-[2px_2px_0px_var(--neo-shadow)]"
                    >
                      <div className="space-y-0.5 min-w-0">
                        <span className="text-xs font-black text-[var(--foreground)] truncate block">
                          {topicItem.topic}
                        </span>
                        <span className="text-[10px] text-red-600 dark:text-red-400 font-bold block">
                          {topicItem.wrong} پاسخ غلط از {topicItem.total} سؤال
                        </span>
                      </div>

                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="px-2 py-1 rounded-xl text-xs font-black bg-red-500 text-white border-2 border-[var(--border)] shadow-[1px_1px_0px_var(--neo-shadow)]">
                          {Math.round(topicItem.errorRate)}٪ خطا
                        </span>
                        <Link
                          href={`/sessions/new/?mode=wrong`}
                          className="w-8 h-8 rounded-xl bg-[var(--surface)] dark:bg-slate-900 border-2 border-[var(--border)] flex items-center justify-center text-[var(--foreground)] hover:bg-slate-100 shadow-[2px_2px_0px_var(--neo-shadow)]"
                          title="تمرین این مبحث"
                        >
                          <ChevronLeft size={16} />
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center rounded-2xl bg-slate-50 dark:bg-slate-800/40 border-2 border-dashed border-[var(--border)]/40 flex flex-col items-center justify-center space-y-2">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                  <span className="text-xs font-black text-[var(--foreground)]">
                    نقطهٔ ضعف حادی با نمونه کافی ثبت نشده است!
                  </span>
                  <span className="text-[11px] text-[var(--muted-foreground)] font-medium">
                    عملکرد شما در مباحث مختلف پایدار است یا تعداد پاسخ‌ها در هر مبحث هنوز به حد نصاب ۳ نرسیده است.
                  </span>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

