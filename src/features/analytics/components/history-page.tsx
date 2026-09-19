"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  ChevronLeft,
  CirclePlay,
  FileText,
  History,
  PauseCircle,
  Trash2,
  Loader2,
} from "lucide-react";
import { ErrorState, LoadingState } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";

export function HistoryPage() {
  const { db, status } = useDatabase();
  const cache = useQueryClient();
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
  const profile = profiles.data?.[0];
  const sessions = useQuery({
    queryKey: ["history-sessions", profile?.id],
    queryFn: () => db.listSessions(profile!.id),
    enabled: Boolean(profile),
  });

  async function handleDeleteSession() {
    if (!deleteSessionId) return;
    setIsDeleting(true);
    try {
      await db.deleteSession(deleteSessionId);
      setDeleteSessionId(null);
      await sessions.refetch();
      await cache.invalidateQueries({ queryKey: ["history-sessions"] });
      await cache.invalidateQueries({ queryKey: ["sessions"] });
      await cache.invalidateQueries({ queryKey: ["analytics"] });
      await cache.invalidateQueries({ queryKey: ["dashboard"] });
      await cache.invalidateQueries({ queryKey: ["question-pool-stats"] });
    } catch (err) {
      console.error("Failed to delete session:", err);
      alert("خطا در حذف آزمون: " + (err instanceof Error ? err.message : String(err)));
      setDeleteSessionId(null);
    } finally {
      setIsDeleting(false);
    }
  }

  // Accurate Jalali Calendar Calculation
  const jalaliParts = useMemo(() => {
    const today = new Date();
    const f = new Intl.DateTimeFormat("en-US-u-ca-persian", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
    });
    const parts = f.formatToParts(today);
    const jYear = parseInt(parts.find((p) => p.type === "year")?.value || "1403", 10);
    const jMonth = parseInt(parts.find((p) => p.type === "month")?.value || "1", 10);
    const jDay = parseInt(parts.find((p) => p.type === "day")?.value || "1", 10);
    const isJalaliLeap = [1, 5, 9, 13, 17, 22, 26, 30].includes((jYear + 38) % 33);
    const dayCount = jMonth <= 6 ? 31 : jMonth <= 11 ? 30 : isJalaliLeap ? 30 : 29;
    const firstDayOfMonthDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (jDay - 1));
    const offset = (firstDayOfMonthDate.getDay() + 1) % 7;
    return { today, jYear, jMonth, jDay, dayCount, firstDayOfMonthDate, offset };
  }, []);

  const activityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of sessions.data ?? []) {
      const d = new Date(item.createdAt).toDateString();
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [sessions.data]);

  if (profiles.isLoading || sessions.isLoading) {
    return <LoadingState label="در حال آماده‌سازی تاریخچه و تقویم فعالیت…" />;
  }

  if (profiles.isError || sessions.isError) {
    return (
      <ErrorState
        message="تاریخچهٔ آزمون‌ها خوانده نشد."
        retry={() => {
          void profiles.refetch();
          void sessions.refetch();
        }}
      />
    );
  }

  const formatter = new Intl.DateTimeFormat("fa-IR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const sessionList = sessions.data ?? [];
  const finishedCount = sessionList.filter((item) => item.state === "FINISHED").length;

  return (
    <div className="page history-page max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)] mb-1.5">
          <History size={13} />
          ثبت پیوسته جلسات
        </span>
        <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] tracking-tight">
          تاریخچهٔ آزمون‌ها
        </h1>
        <p className="text-xs sm:text-sm text-[var(--muted)] font-medium mt-1">
          تمام جلسات آزمون ذخیره‌شده بر روی دستگاه همراه با وضعیت اتمام و تعداد پاسخ‌ها.
        </p>
      </div>

      {!sessionList.length ? (
        <div className="card-neo p-8 text-center rounded-3xl bg-[var(--surface)] flex flex-col items-center justify-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border-2 border-[var(--line-strong)] flex items-center justify-center text-amber-600 shadow-[4px_4px_0px_var(--neo-shadow)]">
            <History size={32} />
          </div>
          <div className="space-y-1 max-w-md">
            <h3 className="text-base sm:text-lg font-black text-[var(--ink)]">
              هنوز سابقه‌ای ثبت نشده است
            </h3>
            <p className="text-xs sm:text-sm text-[var(--muted)] font-medium">
              با ایجاد و شروع اولین آزمون، جلسه و تاریخچه آن با جزئیات کامل در اینجا آرشیو می‌شود.
            </p>
          </div>
          <Link href="/sessions/new/" className="btn-neo-orange text-xs font-black px-5 py-2.5 shadow-[3px_3px_0px_var(--neo-shadow)]">
            ساخت اولین آزمون
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Side: Mini Calendar & Stats (4 cols on desktop) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Stat Summary Card */}
            <div className="card-neo p-4 rounded-2xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-between shadow-[4px_4px_0px_var(--neo-shadow)]">
              <div>
                <span className="text-2xl sm:text-3xl font-black text-[var(--ink)] block">
                  {sessionList.length}
                </span>
                <span className="text-xs font-bold text-[var(--ink)]">جلسهٔ ثبت‌شده</span>
                <span className="text-[11px] font-bold text-[var(--ink)] opacity-80 block mt-0.5">
                  ({finishedCount} آزمون تا انتها حل شده)
                </span>
              </div>
              <div className="w-12 h-12 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--testino-orange)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                <FileText size={24} />
              </div>
            </div>

            {/* Mini Calendar Card */}
            <div className="card-neo p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-3 shadow-[4px_4px_0px_var(--neo-shadow)]">
              <div className="flex items-center justify-between border-b border-[var(--line-strong)]/20 pb-2">
                <h3 className="text-xs font-black text-[var(--ink)]">
                  {new Intl.DateTimeFormat("fa-IR", { month: "long", year: "numeric" }).format(jalaliParts.today)}
                </h3>
                <span className="text-[10px] font-bold text-[var(--muted)]">فعالیت شما</span>
              </div>

              {/* Day names */}
              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black text-[var(--muted)]">
                <span>ش</span>
                <span>ی</span>
                <span>د</span>
                <span>س</span>
                <span>چ</span>
                <span>پ</span>
                <span>ج</span>
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold">
                {Array.from({ length: jalaliParts.offset }, (_, index) => (
                  <span key={`blank-${index}`} className="h-7" />
                ))}
                {Array.from({ length: jalaliParts.dayCount }, (_, index) => {
                  const dayNumber = index + 1;
                  const date = new Date(
                    jalaliParts.firstDayOfMonthDate.getFullYear(),
                    jalaliParts.firstDayOfMonthDate.getMonth(),
                    jalaliParts.firstDayOfMonthDate.getDate() + index
                  );
                  const count = activityMap.get(date.toDateString()) ?? 0;
                  const active = count > 0;
                  const isToday = date.toDateString() === jalaliParts.today.toDateString();

                  return (
                    <span
                      key={dayNumber}
                      title={`${new Intl.DateTimeFormat("fa-IR", { month: "long", day: "numeric" }).format(date)}: ${count} جلسه آزمون`}
                      className={cn(
                        "h-7 flex items-center justify-center rounded-lg relative text-[11px] transition-all cursor-default",
                        active && count >= 3
                          ? "bg-emerald-600 text-white font-black border border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                          : active
                          ? "bg-[var(--pastel-green)] text-[var(--ink-on-color)] font-black border border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                          : isToday
                          ? "border-2 border-[var(--testino-orange)] text-[var(--testino-orange)] font-black"
                          : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                      )}
                    >
                      {new Intl.NumberFormat("fa-IR").format(dayNumber)}
                    </span>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Sessions List (8 cols on desktop) */}
          <div className="lg:col-span-8 space-y-3">
            <div className="flex items-center justify-between text-xs font-black text-[var(--muted)] px-1">
              <span>جلسات آزمون (جدیدترین به قدیمی‌ترین)</span>
              <span>{sessionList.length} جلسه</span>
            </div>

            <div className="space-y-3">
              {sessionList.map((session) => {
                const isFinished = session.state === "FINISHED";
                const isPaused = session.state === "PAUSED";
                const modeTitle =
                  session.config?.mode === "due"
                    ? "مرور هوشمند"
                    : session.config?.mode === "wrong"
                    ? "تمرین اشتباهات"
                    : session.config?.mode === "new"
                    ? "سؤال‌های جدید"
                    : session.config?.isOpenEnded
                    ? "حل بی‌پایان"
                    : "آزمون شبیه‌ساز";

                return (
                  <div
                    key={session.id}
                    className="card-neo p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-between gap-3 transition-all hover:translate-x-[-2px] shadow-[3px_3px_0px_var(--neo-shadow)]"
                  >
                    <Link
                      href={`/sessions/run/?id=${session.id}`}
                      className="flex items-center gap-3 min-w-0 flex-1"
                    >
                      <div
                        className={cn(
                          "w-11 h-11 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center flex-shrink-0 shadow-[2px_2px_0px_var(--neo-shadow)]",
                          isFinished
                            ? "bg-[var(--pastel-green)] text-emerald-900"
                            : isPaused
                            ? "bg-[var(--pastel-yellow)] text-amber-900"
                            : "bg-[var(--pastel-blue)] text-blue-900"
                        )}
                      >
                        {isFinished ? (
                          <CheckCircle2 size={20} />
                        ) : isPaused ? (
                          <PauseCircle size={20} />
                        ) : (
                          <CirclePlay size={20} />
                        )}
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2">
                          <strong className="text-xs sm:text-sm font-black text-[var(--ink)] truncate">
                            {isFinished ? "آزمون تمام‌شده" : isPaused ? "آزمون متوقف‌شده" : "آزمون در جریان"}
                          </strong>
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-black bg-[var(--surface-2)] border border-[var(--line-strong)]/30 text-[var(--muted)]">
                            {modeTitle}
                          </span>
                        </div>

                        <span className="text-[11px] text-[var(--muted)] font-medium block">
                          {formatter.format(new Date(session.createdAt))} • {session.answered} پاسخ از {session.total} سؤال
                        </span>
                      </div>
                    </Link>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        type="button"
                        onClick={() => setDeleteSessionId(session.id)}
                        className="w-8 h-8 rounded-xl border border-transparent hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center text-[var(--muted)] hover:text-rose-600 transition-all cursor-pointer"
                        title="حذف این آزمون از تاریخچه"
                      >
                        <Trash2 size={16} />
                      </button>
                      <Link
                        href={`/sessions/run/?id=${session.id}`}
                        className="w-8 h-8 rounded-xl bg-[var(--surface-2)] border border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)]"
                      >
                        <ChevronLeft size={16} />
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Delete Session Confirmation Dialog */}
      {deleteSessionId && (
        <div
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => !isDeleting && setDeleteSessionId(null)}
        >
          <div
            className="card-neo w-full max-w-sm p-5 space-y-4 bg-[var(--surface)] text-center border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/60 border-2 border-[var(--line-strong)] flex items-center justify-center text-rose-600 dark:text-rose-400">
              <Trash2 size={24} />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-black text-[var(--ink)]">حذف آزمون از تاریخچه</h3>
              <p className="text-xs text-[var(--muted)] font-medium">
                آیا از حذف این جلسه آزمون مطمئن هستید؟ داده‌ها و کارنامه مربوط به این آزمون کاملاً حذف می‌شوند.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteSession}
                className="flex-1 py-2.5 px-4 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
              >
                {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                <span>{isDeleting ? "در حال حذف…" : "حذف قطعی"}</span>
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeleteSessionId(null)}
                className="py-2.5 px-4 rounded-xl border border-[var(--line)] text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
