"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  Layers,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
  Sprout,
  Target,
} from "lucide-react";
import { LoadingState } from "@/components/ui/testino-ui";
import { SignedPercent } from "@/components/ui/signed-number";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { canonicalizeSubject } from "@/features/questions/domain/subject-registry";
import { normalizeScoreGroup, getSanjeshMetrics } from "@/features/profiles/domain/score-groups";
import { useAuthAvatar } from "@/platform/auth/use-avatar";

export function Dashboard() {
  const router = useRouter();
  const database = useDatabase();
  const avatarUrl = useAuthAvatar();
  const [avatarError, setAvatarError] = useState(false);
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

  useEffect(() => {
    // Only redirect when the profiles query is truly settled: not loading
    // AND not refetching in the background. React Query serves stale cached
    // data (e.g. an empty list cached before onboarding) while a refetch is
    // in flight — acting on that caused a bogus bounce back to /onboarding.
    if (database.status === "ready" && !profiles.isLoading && !profiles.isFetching && !profile) {
      router.replace("/onboarding/");
    }
  }, [database.status, profiles.isLoading, profiles.isFetching, profile, router]);

  if (database.status === "loading" || profiles.isLoading) {
    return (
      <div className="space-y-6 max-w-6xl mx-auto pb-10">
        <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 animate-pulse" />
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)]">
                سلام کاربر گرامی!
              </h1>
              <p className="text-xs sm:text-sm font-bold text-[var(--muted)] flex items-center gap-1.5 mt-1">
                <span>امروز یک قدم به هدفت نزدیک‌تر شو</span>
                <Sprout size={16} className="text-[var(--brand-green)]" />
              </p>
            </div>
          </div>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-7 space-y-6">
            <div className="card-neo p-6 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] space-y-4 animate-pulse">
              <div className="h-6 w-48 bg-[var(--surface-2)] rounded-lg" />
              <div className="h-24 bg-[var(--surface-2)] rounded-2xl" />
            </div>
          </div>
          <div className="lg:col-span-5 space-y-6">
            <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3 animate-pulse">
              <div className="h-6 w-32 bg-[var(--surface-2)] rounded-lg" />
              <div className="h-28 bg-[var(--surface-2)] rounded-2xl" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (profiles.isError) {
    return (
      <div className="max-w-md mx-auto mt-16 text-center space-y-3">
        <p className="text-sm font-black text-[var(--ink)]">دریافت اطلاعات پروفایل ناموفق بود.</p>
        <button
          type="button"
          onClick={() => profiles.refetch()}
          className="btn-neo-orange py-2.5 px-5 text-xs font-black"
        >
          تلاش دوباره
        </button>
      </div>
    );
  }

  if (!profile) {
    return <LoadingState label="در حال انتقال به صفحهٔ ثبت‌نام…" />;
  }

  const data = dashboard.data;
  const confidenceSim = data?.confidenceSimulation;
  const paused = data?.sessions.find(
    (item) => item.state === "RUNNING" || item.state === "PAUSED"
  );
  const completedSessions =
    data?.sessions.filter((item) => item.state === "FINISHED") ?? [];

  // Real progress from finished attempts — distinct questions answered in the bank
  const finishedQuestions = data?.uniqueAnsweredQuestionsCount ?? 0;
  const totalQuestions = data?.questionCount || 0;
  const progressPercent = totalQuestions
    ? Math.min(100, Math.round((finishedQuestions / totalQuestions) * 100))
    : 0;
  const hasAnyAttempt = finishedQuestions > 0;

  // Real per-subject accuracy (from FINISHED attempts) keyed by canonical name.
  const statsBySubject = new Map(
    (data?.subjectStats ?? []).map((s) => [canonicalizeSubject(s.subject), s])
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-10">
      {/* 1. Greeting Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          {avatarUrl && !avatarError && (
            <img
              src={avatarUrl}
              alt="Avatar"
              referrerPolicy="no-referrer"
              onError={() => setAvatarError(true)}
              className="w-12 h-12 rounded-2xl border-2 border-[var(--line-strong)] object-cover shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0"
            />
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)]">
              سلام {owner.data?.displayName || "کاربر گرامی"}!
            </h1>
            <p className="text-xs sm:text-sm font-bold text-[var(--muted)] flex items-center gap-1.5 mt-1">
              <span>امروز یک قدم به هدفت نزدیک‌تر شو</span>
              <Sprout size={16} className="text-[var(--brand-green)]" />
            </p>
          </div>
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
          <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            <Target size={13} className="text-[var(--brand-orange)]" />
            <span>{profile.targetTrack || profile.name || "هدف تحصیلی"}</span>
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
                  پیشرفت پاسخ‌دهی بانک سؤال
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-3xl sm:text-4xl font-black text-[var(--ink)]">
                    {progressPercent}٪
                  </span>
                  <BarChart3 size={22} className="text-[var(--brand-blue)]" />
                </div>
                <p className="text-xs font-bold text-[var(--muted)] mt-1.5">
                  {hasAnyAttempt
                    ? `${finishedQuestions.toLocaleString("fa-IR")} سؤال از ${totalQuestions.toLocaleString("fa-IR")} سؤال بانک پاسخ داده شده`
                    : "با اولین آزمون، پیشرفت واقعی اینجا محاسبه می‌شود"}
                </p>
              </div>

              {/* Donut Progress Ring (value shown once — in the big numeral) */}
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

          {/* 5. Confidence Simulation — Dashboard TEASER.
              The per-subject breakdown and simulator live in /analytics (تحلیل) to avoid
              duplicating the same data and cards on two pages. */}
          <section className="bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl p-5 space-y-4 shadow-[4px_4px_0px_var(--neo-shadow)]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                  <Sparkles size={20} />
                </div>
                <div>
                  <h2 className="text-sm sm:text-base font-black text-[var(--ink)]">
                    اثر شک و حدس روی نمره‌ات
                  </h2>
                  <span className="text-[11px] text-[var(--muted)] font-bold">
                    اگر شک‌ها و حدس‌ها را نمی‌زدی، درصدت چقدر بود؟
                  </span>
                </div>
              </div>
              <Link
                href="/analytics/"
                className="text-xs font-black text-[var(--brand-orange)] hover:underline inline-flex items-center gap-1"
              >
                <span>تحلیل کامل به تفکیک درس</span>
                <ChevronLeft size={14} />
              </Link>
            </div>

            {/* If no attempts yet */}
            {(!confidenceSim || confidenceSim.totals.totalAttempts === 0) ? (
              <div className="p-5 rounded-2xl bg-[var(--surface-2)] border-2 border-dashed border-[var(--line-strong)]/40 text-center space-y-1.5">
                <p className="text-xs font-bold text-[var(--muted)]">
                  هنوز تستی ثبت نشده است.
                </p>
                <span className="text-[11px] text-[var(--muted)] block">
                  بعد از اولین آزمون، اثر شک و حدس بر نمرهٔ تو اینجا نمایش داده می‌شود.
                </span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* 4 Comparative Percentage Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                  <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-1">
                    <span className="text-[10px] font-black text-[var(--muted)] block">درصد واقعی</span>
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
                    <span className="text-[9px] font-bold text-[var(--muted)] block">بدون ریسک</span>
                  </div>
                </div>

                {/* Recommendation Banner */}
                <div className="p-3.5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-[var(--brand-orange)] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <CheckCircle2 size={16} />
                  </div>
                  <div className="space-y-0.5">
                    <strong className="text-xs font-black text-[var(--ink)] block">
                      توصیهٔ کلی:
                    </strong>
                    <p className="text-[11px] leading-relaxed text-[var(--muted)] font-bold">
                      {confidenceSim.topRecommendation}
                    </p>
                  </div>
                </div>
              </div>
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
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[var(--brand-green)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center font-black text-xs shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0">
                        {session.total ? Math.round(((session.answered || 0) / session.total) * 100) : 0}٪
                      </div>
                      <div className="min-w-0">
                        <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block truncate">
                          آزمون {session.answered} از {session.total} سؤال
                        </strong>
                        <span className="text-[10px] font-bold text-[var(--muted)]">
                          مشاهده کارنامه
                        </span>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-[var(--muted)]" />
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* 6. Subject Target vs Real Accuracy (Real data from SQLite) */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-[var(--ink)]">
                  عملکرد دروس فعال
                </h2>
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
                profile.subjects.map((subject) => {
                  const qCount = subject.questionCount ?? 25;
                  const normGroup = normalizeScoreGroup(subject.scoreGroup);
                  const groupMembers = normGroup
                    ? profile.subjects.filter((s) => normalizeScoreGroup(s.scoreGroup)?.toLowerCase() === normGroup.toLowerCase())
                    : [subject];
                  const isGrouped = groupMembers.length > 1;
                  const groupTotalQuestions = groupMembers.reduce((sum, s) => sum + Math.max(1, s.questionCount ?? 25), 0);
                  const metrics = getSanjeshMetrics(groupTotalQuestions);
                  const correctVal = metrics.correctVal.toFixed(1);
                  const wrongVal = metrics.wrongVal.toFixed(1);

                  const stats = statsBySubject.get(canonicalizeSubject(subject.name));
                  const accuracy = stats?.accuracyPct ?? 0;
                  const penalized = stats?.penalizedPct ?? 0;
                  const hasSubjectAttempts = Boolean(stats && stats.total > 0);
                  const fillWidth = Math.max(0, Math.min(100, penalized));
                  return (
                    <div key={subject.id} className="space-y-1.5 p-2 rounded-2xl bg-[var(--surface-2)]/50 border border-[var(--line)]">
                      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-black text-[var(--ink)] break-words">
                            {subject.name}
                          </span>
                          {isGrouped ? (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-sky-100 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border border-sky-300 dark:border-sky-800 shrink-0"
                              title={`بخشی از گروه «${normGroup}» (مجموع ${groupTotalQuestions} سؤال در دفترچه کنکور)`}
                            >
                              {qCount} از {groupTotalQuestions} سؤال دفترچه
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--surface)] text-[var(--muted)] border border-[var(--line)] shrink-0">
                              {qCount} سؤال کنکور
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-bold text-[var(--brand-green)]" title="ارزش هر تست درست در آزمون دفترچه کنکور">
                            <SignedPercent value={parseFloat(correctVal)} showPlus={true} />
                          </span>
                          <span className="text-[10px] font-bold text-red-500" title="نمره منفی هر پاسخ غلط در آزمون دفترچه کنکور">
                            <SignedPercent value={-parseFloat(wrongVal)} showPlus={false} />
                          </span>
                          <span className="font-black text-[var(--ink)]">
                            هدف {subject.targetPercentage}٪
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          dir="ltr"
                          className="relative flex-1 bg-[var(--surface-3)] h-2.5 rounded-full overflow-hidden border border-[var(--line)]"
                          title={
                            hasSubjectAttempts
                              ? `درصد کنکوری با کسر نمره منفی: ${penalized}٪ | دقت: ${accuracy}٪ | هدف: ${subject.targetPercentage}٪`
                              : `هدف: ${subject.targetPercentage}٪`
                          }
                        >
                          {/* Real Konkur score fill — 0% to 100% left-to-right */}
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              hasSubjectAttempts
                                ? penalized < 0
                                  ? "bg-red-500"
                                  : "bg-[var(--brand-green)]"
                                : "bg-transparent"
                            )}
                            style={{ width: hasSubjectAttempts ? `${fillWidth}%` : "0%" }}
                          />
                          {/* Target marker on standard scale (0% left -> 100% right) */}
                          <div
                            className="absolute top-0 bottom-0 w-1 bg-amber-400 z-10 shadow-[0_0_4px_rgba(251,191,36,0.6)]"
                            style={{ left: `${Math.min(100, subject.targetPercentage)}%` }}
                            title={`هدف: ${subject.targetPercentage}٪`}
                          />
                        </div>
                        <div
                          className="text-[10px] font-black shrink-0 flex items-center gap-1.5 min-w-[70px] justify-end"
                          title={hasSubjectAttempts ? `درصد رسمی کنکور با نمره منفی: ${penalized}٪ | دقت: ${accuracy}٪` : undefined}
                        >
                          {hasSubjectAttempts ? (
                            <>
                              <span className={penalized < 0 ? "text-red-500 font-black" : "text-[var(--ink)] font-black"}>
                                {penalized.toLocaleString("fa-IR")}٪ کنکور
                              </span>
                              <span className="text-[9px] font-bold text-[var(--muted)]">
                                (دقت {accuracy.toLocaleString("fa-IR")}٪)
                              </span>
                            </>
                          ) : (
                            <span className="text-[var(--muted)] font-bold">بدون آزمون</span>
                          )}
                        </div>
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
