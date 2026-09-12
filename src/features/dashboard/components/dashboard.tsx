"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Sprout,
} from "lucide-react";
import { LoadingState } from "@/components/ui/testino-ui";
import { BrandLogo } from "@/components/ui/brand-logo";
import { SignedPercent } from "@/components/ui/signed-number";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { calculateWeightedTarget } from "@/features/profiles/domain/score-groups";

export function Dashboard() {
  const [selectedSimSubject, setSelectedSimSubject] = useState<string>("all");
  const database = useDatabase();
  const owner = useQuery({
    queryKey: ["owner"],
    queryFn: () => database.db.getCurrentOwner(),
    enabled: database.status === "ready",
  });
  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });
  const profile = profiles.data?.[0];
  const dashboard = useQuery({
    queryKey: ["dashboard", profile?.id],
    queryFn: () => database.db.dashboard(profile!.id),
    enabled: Boolean(profile),
  });

  if (database.status === "loading" || profiles.isLoading) {
    return <LoadingState label="در حال آماده‌سازی فضای مطالعه…" />;
  }

  if (!profile) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Main Welcome Hero (7 cols) */}
          <div className="lg:col-span-7 card-neo p-6 sm:p-8 bg-[var(--surface)] flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <BrandLogo size="lg" />
              </div>
              <div className="space-y-2 pt-2">
                <span className="inline-block text-xs font-black px-3 py-1 rounded-full bg-[var(--pastel-orange)] text-white border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                  نسخه ۱.۰ آفلاین
                </span>
                <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] tracking-tight">
                  به سامانهٔ تستیونو خوش آمدید!
                </h1>
                <p className="text-xs sm:text-sm font-bold text-[var(--muted)] leading-relaxed">
                  پلتفرم مستقل تمرین، آزمون‌های شبیه‌ساز و موتور مرور فاصله‌دار. با ساخت اولین پروفایل تحصیلی، تمام امکانات بر اساس آزمون، دروس و ضرایب دلخواه شما فعال می‌شوند.
                </p>
              </div>

              {/* Offline & Architecture Badges */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2">
                <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <strong className="text-xs font-black text-[var(--ink)] block">۱۰۰٪ آفلاین</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold block">داده‌ها روی حافظه پایدار مرورگر شما</span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <strong className="text-xs font-black text-[var(--ink)] block">محاسبه تراز وزنی</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold block">ضریب و اهداف تفکیکی هر درس</span>
                </div>
                <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <strong className="text-xs font-black text-[var(--ink)] block">مرور لایتنر</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold block">تکرار هوشمند بر اساس پاسخ واقعی</span>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t-2 border-[var(--line-strong)]/20 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <Link
                href="/onboarding/"
                className="btn-neo-orange py-3.5 px-6 text-sm font-black flex items-center justify-center gap-2 shadow-[3px_3px_0px_var(--neo-shadow)]"
              >
                <span>شروع و ساخت اولین پروفایل</span>
                <ArrowLeft size={18} />
              </Link>
              <span className="text-[11px] font-bold text-[var(--muted)] text-center sm:text-right">
                کمتر از ۱ دقیقه زمان می‌برد
              </span>
            </div>
          </div>

          {/* Feature Preview Cards (5 cols) */}
          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
            <div className="card-neo card-neo-orange p-4 sm:p-5 flex items-center gap-3.5">
              <div className="badge-neo-icon bg-[var(--surface)] text-[var(--line-strong)]">
                <Plus size={20} strokeWidth={3} />
              </div>
              <div>
                <strong className="text-sm font-black block text-white">۱. ساخت آزمون هدفمند</strong>
                <span className="text-[11px] text-white/90 font-bold block mt-0.5">تمرین با سقف زمان، انتخاب دروس و نمره منفی</span>
              </div>
            </div>

            <div className="card-neo card-neo-blue p-4 sm:p-5 flex items-center gap-3.5">
              <div className="badge-neo-icon bg-[var(--surface)] text-[var(--line-strong)]">
                <BookOpen size={20} strokeWidth={2.5} />
              </div>
              <div>
                <strong className="text-sm font-black block text-white">۲. بانک سؤالات شخصی</strong>
                <span className="text-[11px] text-white/90 font-bold block mt-0.5">دسته‌بندی موضوعی، فیلترها و ورود داده با JSON</span>
              </div>
            </div>

            <div className="card-neo card-neo-yellow p-4 sm:p-5 flex items-center gap-3.5">
              <div className="badge-neo-icon bg-[var(--surface)] text-[var(--line-strong)]">
                <RotateCcw size={20} strokeWidth={2.5} />
              </div>
              <div>
                <strong className="text-sm font-black block text-white">۳. مرور هوشمند لایتنر</strong>
                <span className="text-[11px] text-white/90 font-bold block mt-0.5">بازآموزی اشتباهات و شک‌دارها در فواصل مشخص</span>
              </div>
            </div>

            <div className="card-neo card-neo-green p-4 sm:p-5 flex items-center gap-3.5">
              <div className="badge-neo-icon bg-[var(--surface)] text-[var(--line-strong)]">
                <BarChart3 size={20} strokeWidth={2.5} />
              </div>
              <div>
                <strong className="text-sm font-black block text-white">۴. تحلیل تسلط و تراز</strong>
                <span className="text-[11px] text-white/90 font-bold block mt-0.5">محاسبه درصدهای واقعی و فاصله تا هدف تعیین‌شده</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const data = dashboard.data;
  const confidenceSim = data?.confidenceSimulation;
  const paused = data?.sessions.find(
    (item) => item.state === "RUNNING" || item.state === "PAUSED"
  );
  const completedSessions =
    data?.sessions.filter((item) => item.state === "FINISHED") ?? [];

  // Calculate real average progress or target percentage
  const averageTarget = Math.round(calculateWeightedTarget(profile.subjects).percentage ?? 70);

  // Real progress from finished attempts
  const finishedQuestions = completedSessions.reduce(
    (sum, s) => sum + (s.answered || 0),
    0
  );
  const totalQuestions = data?.questionCount || 0;
  const progressPercent = totalQuestions
    ? Math.min(100, Math.round((finishedQuestions / totalQuestions) * 100))
    : averageTarget;

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* 1. Greeting Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)]">
            سلام {owner.data?.displayName || "کاربر گرامی"}!
          </h1>
          <p className="text-xs sm:text-sm font-bold text-[var(--muted)] flex items-center gap-1.5 mt-1">
            <span>امروز یک قدم به هدفت نزدیک‌تر شو</span>
            <Sprout size={16} className="text-[var(--brand-green)]" />
          </p>
        </div>
        <div className="flex items-center gap-2">
          {owner.data?.kind === "account" && (
            <span className="px-3 py-1.5 rounded-full bg-blue-50 dark:bg-blue-950/40 border-2 border-[var(--line-strong)] text-xs font-black text-blue-700 dark:text-blue-300 flex items-center gap-1.5 shadow-[2px_2px_0px_var(--neo-shadow)]">
              <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>حساب گوگل</span>
            </span>
          )}
          <span className="px-3.5 py-1.5 rounded-full bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            🎯 {profile.targetTrack || profile.name || "هدف تحصیلی"}
          </span>
        </div>
      </header>

      {/* Responsive 2-column layout on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Main Left Column (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* 2. Overall Progress Widget Card */}
          <section className="bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl p-5 sm:p-6 shadow-[4px_4px_0px_var(--neo-shadow)] space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-xs font-black text-[var(--muted)] block">
                  درصد پیشرفت کلی
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl sm:text-4xl font-black text-[var(--ink)]">
                    {progressPercent}٪
                  </span>
                  <BarChart3 size={22} className="text-[var(--brand-blue)]" />
                </div>
                <p className="text-xs font-bold text-[var(--muted)] mt-1.5">
                  هدف: {profile.targetTrack || profile.name || "تعیین هدف در تنظیمات"}
                </p>
              </div>

              {/* Donut Progress Ring */}
              <div className="relative w-22 h-22 sm:w-24 sm:h-24 flex items-center justify-center shrink-0">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 80 80">
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="8"
                    className="text-[var(--surface-3)]"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="32"
                    fill="none"
                    stroke="var(--brand-yellow)"
                    strokeWidth="8"
                    strokeDasharray={201}
                    strokeDashoffset={201 - (201 * progressPercent) / 100}
                    strokeLinecap="round"
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <span className="absolute text-sm font-black text-[var(--ink)]">
                  {progressPercent}٪
                </span>
              </div>
            </div>
          </section>

          {/* 3. Four Neo-Brutalist Colored Cards (Preserving Identity) */}
          <section className="grid grid-cols-2 gap-3.5 sm:gap-4" aria-label="دسترسی سریع">
            {/* Card 1: ساخت آزمون (Vibrant Orange Hue, matched saturation & brightness) */}
            <Link
              href="/sessions/new/"
              className="quick-action-card quick-card-primary"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 border-2 border-white/35 flex items-center justify-center text-white shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)]">
                <Plus size={22} strokeWidth={3} />
              </div>
              <div>
                <strong className="text-sm sm:text-base font-black block text-white">
                  ساخت آزمون
                </strong>
                <span className="text-[11px] sm:text-xs font-bold text-white/90 block mt-0.5">
                  شروع کوئیز جدید
                </span>
              </div>
            </Link>

            {/* Card 2: مرور هوشمند (Rich Indigo/Violet Hue) */}
            <Link
              href="/review/"
              className="quick-action-card quick-card-review"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 border-2 border-white/35 flex items-center justify-center text-white shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)]">
                <RotateCcw size={22} strokeWidth={2.5} />
              </div>
              <div>
                <strong className="text-sm sm:text-base font-black block text-white">
                  مرور هوشمند
                </strong>
                <span className="text-[11px] sm:text-xs font-bold text-white/90 block mt-0.5">
                  اشتباهات، شک‌ها و لایتنر
                </span>
              </div>
            </Link>

            {/* Card 3: بانک سؤالات (Vibrant Ocean/Sky Blue Hue) */}
            <Link
              href="/bank/"
              className="quick-action-card quick-card-bank"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 border-2 border-white/35 flex items-center justify-center text-white shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)]">
                <Layers size={22} strokeWidth={2.5} />
              </div>
              <div>
                <strong className="text-sm sm:text-base font-black block text-white">
                  بانک سؤالات
                </strong>
                <span className="text-[11px] sm:text-xs font-bold text-white/90 block mt-0.5">
                  فصل‌ها و دروس
                </span>
              </div>
            </Link>

            {/* Card 4: کارنامه و آمار (Vibrant Emerald Green Hue) */}
            <Link
              href="/analytics/"
              className="quick-action-card quick-card-stats"
            >
              <div className="w-10 h-10 rounded-2xl bg-white/20 border-2 border-white/35 flex items-center justify-center text-white shadow-[1.5px_1.5px_0px_rgba(0,0,0,0.15)]">
                <BarChart3 size={22} strokeWidth={2.5} />
              </div>
              <div>
                <strong className="text-sm sm:text-base font-black block text-white">
                  کارنامه و آمار
                </strong>
                <span className="text-[11px] sm:text-xs font-bold text-white/90 block mt-0.5">
                  روند درصد و دقت
                </span>
              </div>
            </Link>
          </section>

          {/* 4. Active / Paused Session Banner (Neo Alert Style) */}
          {paused && (
            <section className="bg-[var(--surface-cream)] text-[var(--ink)] border-2 border-[var(--line-strong)] rounded-3xl p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
              <div className="flex items-center gap-3.5 w-full sm:w-auto justify-start">
                <div className="w-11 h-11 rounded-2xl bg-[var(--brand-orange)] border-2 border-[var(--line-strong)] text-white flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  <Play size={20} className="fill-current" />
                </div>
                <div>
                  <span className="text-xs font-bold text-[var(--muted)] block">
                    جلسهٔ نیمه‌تمام در جریان
                  </span>
                  <strong className="text-sm sm:text-base font-black text-[var(--ink)]">
                    {paused.answered} پاسخ از {paused.total} سؤال
                  </strong>
                </div>
              </div>
              <div className="w-full sm:w-auto flex items-center justify-center">
                <Link
                  href={`/sessions/run/?id=${paused.id}`}
                  className="btn-neo-orange py-2.5 px-6 text-xs sm:text-sm font-black flex items-center justify-center gap-2 shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer w-full sm:w-auto text-center"
                >
                  <span>ادامه آزمون</span>
                  <ArrowLeft size={16} />
                </Link>
              </div>
            </section>
          )}

          {/* 5. Confidence Simulation Card (اگه نمی‌زدم چی می‌شد؟) */}
          <section className="bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl p-5 space-y-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-[var(--ink)]">
                    شبیه‌ساز اثر شک و حدس («اگه نمی‌زدم چی می‌شد؟»)
                  </h2>
                  <span className="text-[11px] text-[var(--muted)] font-bold">
                    محاسبه نمره منفی و بررسی سود یا زیان در کنکور به تفکیک درس
                  </span>
                </div>
              </div>
              <Link
                href="/analytics/"
                className="text-xs font-black text-[var(--brand-orange)] hover:underline inline-flex items-center gap-1"
              >
                <span>تحلیل دقیق‌تر</span>
                <ChevronLeft size={14} />
              </Link>
            </div>

            {/* Subject Selector Tabs */}
            {confidenceSim?.subjects && confidenceSim.subjects.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs font-black">
                <button
                  type="button"
                  onClick={() => setSelectedSimSubject("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-xl border-2 transition-all shrink-0",
                    selectedSimSubject === "all"
                      ? "bg-[var(--ink)] text-[var(--surface)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                      : "bg-[var(--surface-2)] text-[var(--muted)] border-transparent hover:border-[var(--line-strong)]"
                  )}
                >
                  همه دروس ({confidenceSim.totals.totalAttempts} تست)
                </button>
                {confidenceSim.subjects.map((sub) => (
                  <button
                    key={sub.subject}
                    type="button"
                    onClick={() => setSelectedSimSubject(sub.subject)}
                    className={cn(
                      "px-3 py-1.5 rounded-xl border-2 transition-all shrink-0 flex items-center gap-1",
                      selectedSimSubject === sub.subject
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "bg-[var(--surface-2)] text-[var(--ink)] border-transparent hover:border-[var(--line-strong)]"
                    )}
                  >
                    <span>{sub.subject}</span>
                    <span className="text-[10px] opacity-80 font-mono">({sub.totalAttempts})</span>
                  </button>
                ))}
              </div>
            )}

            {/* If no attempts yet */}
            {(!confidenceSim || confidenceSim.totals.totalAttempts === 0) ? (
              <div className="p-5 rounded-2xl bg-[var(--surface-2)] border-2 border-dashed border-[var(--line-strong)]/40 text-center space-y-1.5">
                <p className="text-xs font-bold text-[var(--muted)]">
                  هنوز تستی در آزمون‌ها ثبت نشده است.
                </p>
                <span className="text-[11px] text-[var(--muted)] block">
                  با پاسخ دادن به سؤالات و مشخص کردن شک یا حدس در آزمون، اثر نمره منفی و سوددهی گزینه‌ها اینجا تحلیل می‌شود.
                </span>
              </div>
            ) : selectedSimSubject === "all" ? (
              /* All Subjects Overview */
              <div className="space-y-3">
                {/* 4 Comparative Percentage Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-1">
                    <span className="text-[10px] font-black text-[var(--muted)] block">درصد واقعی کل</span>
                    <strong className="text-lg font-black text-[var(--ink)] font-mono">
                      <SignedPercent value={confidenceSim.totals.overallActualPercentage} showPlus={false} />
                    </strong>
                    <span className="text-[9px] font-bold text-[var(--muted)] block">با احتساب همه</span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-1">
                    <span className="text-[10px] font-black text-[var(--brand-yellow)] block">اگه شک رو نمی‌زدی</span>
                    <strong className="text-lg font-black text-[var(--ink)] font-mono">
                      <SignedPercent value={confidenceSim.totals.overallWithoutDoubt} showPlus={false} />
                    </strong>
                    <span className={cn("text-[9px] font-black block font-mono", confidenceSim.totals.totalDoubtfulNetGain >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                      <SignedPercent value={confidenceSim.totals.totalDoubtfulNetGain} showPlus={true} /> {confidenceSim.totals.totalDoubtfulNetGain >= 0 ? "سود" : "زیان"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-1">
                    <span className="text-[10px] font-black text-red-600 block">اگه حدس نمی‌زدی</span>
                    <strong className="text-lg font-black text-[var(--ink)] font-mono">
                      <SignedPercent value={confidenceSim.totals.overallWithoutGuess} showPlus={false} />
                    </strong>
                    <span className={cn("text-[9px] font-black block font-mono", confidenceSim.totals.totalGuessNetGain >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                      <SignedPercent value={confidenceSim.totals.totalGuessNetGain} showPlus={true} /> {confidenceSim.totals.totalGuessNetGain >= 0 ? "سود" : "زیان"}
                    </span>
                  </div>

                  <div className="p-3 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-1">
                    <span className="text-[10px] font-black text-[var(--brand-green)] block">فقط مطمئن‌ها</span>
                    <strong className="text-lg font-black text-[var(--ink)] font-mono">
                      <SignedPercent value={confidenceSim.totals.overallOnlySure} showPlus={false} />
                    </strong>
                    <span className="text-[9px] font-bold text-[var(--muted)] block">بدون هرگونه ریسک</span>
                  </div>
                </div>

                {/* Recommendation Banner */}
                <div className="p-3.5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--brand-orange)] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="space-y-0.5">
                    <strong className="text-xs font-black text-[var(--ink)] block">
                      استراتژی برگزیده کلی:
                    </strong>
                    <p className="text-[11px] leading-relaxed text-[var(--muted)] font-bold">
                      {confidenceSim.topRecommendation}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              /* Specific Subject Simulation */
              (() => {
                const curSub = confidenceSim.subjects.find((s) => s.subject === selectedSimSubject);
                if (!curSub) return null;
                return (
                  <div className="space-y-3">
                    {/* Subject Header with Konkur Question Count and Test Value */}
                    <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] flex items-center justify-between flex-wrap gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-black text-[var(--ink)]">{curSub.subject}</strong>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--line-strong)]">
                            ضریب {curSub.coefficient}
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--line-strong)]">
                            {curSub.questionCount} سؤال در کنکور
                          </span>
                        </div>
                        <span className="text-[10px] text-[var(--muted)] font-bold block">
                          هدف تعیین‌شده: {curSub.targetPercentage}٪
                        </span>
                      </div>
                      <div className="text-left font-mono text-[11px] font-bold">
                        <span className="text-[var(--brand-green)] font-black block">
                          هر تست درست: <SignedPercent value={curSub.pointValuePerCorrect} showPlus={true} />
                        </span>
                        <span className="text-red-500 font-black block">
                          نمره منفی غلط: <SignedPercent value={-curSub.penaltyPerWrong} showPlus={false} />
                        </span>
                      </div>
                    </div>

                    {/* 4 Simulated Percentages for this subject */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                      <div className="p-2.5 rounded-xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-1">
                        <span className="text-[10px] font-black text-[var(--muted)] block">درصد واقعی</span>
                        <strong className="text-base font-black text-[var(--ink)] font-mono">
                          <SignedPercent value={curSub.actualPercentage} showPlus={false} />
                        </strong>
                        <span className="text-[9px] text-[var(--muted)] font-bold block">{curSub.totalAttempts} تست</span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-1">
                        <span className="text-[10px] font-black text-[var(--brand-yellow)] block">بدون شک‌ها</span>
                        <strong className="text-base font-black text-[var(--ink)] font-mono">
                          <SignedPercent value={curSub.percentageWithoutDoubt} showPlus={false} />
                        </strong>
                        <span className={cn("text-[9px] font-black block font-mono", curSub.doubtful.netPercentageImpact >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                          <SignedPercent value={curSub.doubtful.netPercentageImpact} showPlus={true} /> {curSub.doubtful.netPercentageImpact >= 0 ? "اثر مثبت" : "ضرر"}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-1">
                        <span className="text-[10px] font-black text-red-600 block">بدون حدس‌ها</span>
                        <strong className="text-base font-black text-[var(--ink)] font-mono">
                          <SignedPercent value={curSub.percentageWithoutGuess} showPlus={false} />
                        </strong>
                        <span className={cn("text-[9px] font-black block font-mono", curSub.guess.netPercentageImpact >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                          <SignedPercent value={curSub.guess.netPercentageImpact} showPlus={true} /> {curSub.guess.netPercentageImpact >= 0 ? "اثر مثبت" : "ضرر"}
                        </span>
                      </div>

                      <div className="p-2.5 rounded-xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-1">
                        <span className="text-[10px] font-black text-[var(--brand-green)] block">فقط مطمئن‌ها</span>
                        <strong className="text-base font-black text-[var(--ink)] font-mono">
                          <SignedPercent value={curSub.percentageOnlySure} showPlus={false} />
                        </strong>
                        <span className="text-[9px] text-[var(--muted)] font-bold block">{curSub.sure.accuracy}٪ دقت</span>
                      </div>
                    </div>

                    {/* Breakdown of Doubt and Guess */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-bold">
                      <div className="p-3 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--ink)] font-black">گزینه‌های شک‌دار:</span>
                          <span className="font-mono text-[var(--ink)]">{curSub.doubtful.count} تست ({curSub.doubtful.correct} درست، {curSub.doubtful.wrong} غلط)</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span>دقت شک‌ها: {curSub.doubtful.accuracy}٪</span>
                          <span className={cn("font-black font-mono", curSub.doubtful.netPercentageImpact >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                            سود/زیان: {curSub.doubtful.netPercentageImpact > 0 ? `+${curSub.doubtful.netPercentageImpact}` : curSub.doubtful.netPercentageImpact}٪
                          </span>
                        </div>
                      </div>

                      <div className="p-3 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)] space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[var(--pastel-red)] font-black">گزینه‌های حدسی:</span>
                          <span className="font-mono text-[var(--ink)]">{curSub.guess.count} تست ({curSub.guess.correct} درست، {curSub.guess.wrong} غلط)</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span>دقت حدس‌ها: {curSub.guess.accuracy}٪</span>
                          <span className={cn("font-black font-mono", curSub.guess.netPercentageImpact >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                            سود/زیان: {curSub.guess.netPercentageImpact > 0 ? `+${curSub.guess.netPercentageImpact}` : curSub.guess.netPercentageImpact}٪
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Subject Strategic Advice Banner */}
                    <div className="p-3.5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] space-y-1">
                      <div className="flex items-center gap-2">
                        <span className={cn(
                          "px-2 py-0.5 rounded-md text-[10px] font-black border",
                          curSub.strategicAdvice.recommendationTag === "trust_doubt"
                            ? "bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                            : curSub.strategicAdvice.recommendationTag === "avoid_doubt" || curSub.strategicAdvice.recommendationTag === "avoid_guess"
                            ? "bg-[var(--pastel-red)] text-white border-[var(--line-strong)]"
                            : "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                        )}>
                          {curSub.strategicAdvice.recommendationLabel}
                        </span>
                        <strong className="text-xs font-black text-[var(--ink)]">
                          استراتژی پیشنهادی برای درس {curSub.subject}:
                        </strong>
                      </div>
                      <p className="text-[11px] leading-relaxed text-[var(--muted)] font-bold pt-0.5">
                        {curSub.strategicAdvice.overallSubjectAdvice}
                      </p>
                    </div>
                  </div>
                );
              })()
            )}
          </section>
        </div>

        {/* Side Right Column (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* 5. Last Sessions Section */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-[var(--ink)]">
                آخرین آزمون‌ها
              </h2>
              <Link
                href="/history/"
                className="text-xs font-black text-[var(--brand-orange)] hover:underline"
              >
                مشاهده همه
              </Link>
            </div>

            {completedSessions.length === 0 ? (
              <div className="bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl p-6 text-center space-y-2 shadow-[4px_4px_0px_var(--neo-shadow)]">
                <p className="text-xs font-bold text-[var(--muted)]">
                  هنوز آزمونی به پایان نرسیده است.
                </p>
                <Link
                  href="/sessions/new/"
                  className="text-xs font-black text-[var(--brand-orange)] inline-flex items-center gap-1 mt-1"
                >
                  <span>ساخت اولین آزمون</span>
                  <ArrowLeft size={14} />
                </Link>
              </div>
            ) : (
              <div className="space-y-2.5">
                {completedSessions.slice(0, 4).map((session) => (
                  <Link
                    key={session.id}
                    href={`/sessions/run/?id=${session.id}`}
                    className="bg-[var(--surface)] hover:bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-2xl p-3.5 flex items-center justify-between transition-all shadow-[2.5px_2.5px_0px_var(--neo-shadow)] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[3.5px_3.5px_0px_var(--neo-shadow)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-xl bg-[var(--brand-green)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center font-black text-xs shadow-[1px_1px_0px_var(--neo-shadow)]">
                        {session.total ? Math.round(((session.answered || 0) / session.total) * 100) : 0}٪
                      </div>
                      <div>
                        <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                          آزمون {session.answered} سؤال
                        </strong>
                        <span className="text-[10px] font-bold text-[var(--muted)]">
                          {session.total} سؤال کلی
                        </span>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-[var(--muted)]" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 6. Subject Target Progress (Real data from SQLite) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[var(--ink)]">
                  هدف دروس فعال
                </h2>
                <Link
                  href="/goals/"
                  className="text-xs font-bold text-[var(--muted)] hover:text-[var(--brand-orange)] transition-colors"
                >
                  (صفحه اهداف)
                </Link>
              </div>
              <Link
                href="/settings/"
                className="text-xs font-black text-[var(--brand-orange)] hover:underline"
              >
                تنظیم اهداف
              </Link>
            </div>

            <div className="bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl p-5 space-y-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
              {profile.subjects.length === 0 ? (
                <div className="text-center py-4 space-y-2">
                  <p className="text-xs font-bold text-[var(--muted)]">
                    هنوز درسی تعریف نشده است.
                  </p>
                  <Link
                    href="/settings/"
                    className="text-xs font-black text-[var(--brand-orange)] inline-flex items-center gap-1"
                  >
                    <span>افزودن درس در تنظیمات</span>
                    <ArrowLeft size={14} />
                  </Link>
                </div>
              ) : (
                profile.subjects.slice(0, 6).map((subject) => {
                  const qCount = subject.questionCount ?? 25;
                  const correctVal = (100 / qCount).toFixed(1);
                  const wrongVal = (100 / (3 * qCount)).toFixed(1);
                  return (
                    <div key={subject.id} className="space-y-1.5 p-2 rounded-2xl bg-[var(--surface-2)]/50 border border-[var(--line)]">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-[var(--ink)]">
                            {subject.name}
                          </span>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)]">
                            {qCount} سؤال کنکور
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-[var(--brand-green)]" title="ارزش هر تست درست">
                            <SignedPercent value={parseFloat(correctVal)} showPlus={true} />
                          </span>
                          <span className="text-[10px] font-bold text-red-500" title="نمره منفی هر پاسخ غلط">
                            <SignedPercent value={-parseFloat(wrongVal)} showPlus={false} />
                          </span>
                          <span className="font-black text-[var(--ink)]">
                            هدف {subject.targetPercentage}٪
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-[var(--surface-3)] h-2 rounded-full overflow-hidden border border-[var(--line)]">
                        <div
                          className="bg-[var(--brand-green)] h-full rounded-full transition-all duration-500"
                          style={{ width: `${subject.targetPercentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
