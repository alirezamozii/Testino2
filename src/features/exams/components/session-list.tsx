"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Play, CheckCircle2, Pause, Clock, AlertCircle, ChevronLeft, History, Trash2, Loader2 } from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/testino-ui";
import { cn } from "@/lib/utils";

const stateConfig = {
  CREATED: {
    label: "آمادهٔ شروع",
    className: "bg-blue-50 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border-blue-200",
    icon: Clock,
  },
  RUNNING: {
    label: "در حال اجرا",
    className: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200",
    icon: Play,
  },
  PAUSED: {
    label: "متوقف‌شده",
    className: "bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200",
    icon: Pause,
  },
  FINISHED: {
    label: "پایان‌یافته",
    className: "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 border-neutral-200",
    icon: CheckCircle2,
  },
} as const;

export function SessionList() {
  const database = useDatabase();
  const cache = useQueryClient();
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });
  const profile = profiles.data?.[0];
  const sessions = useQuery({
    queryKey: ["sessions", profile?.id],
    queryFn: () => database.db.listSessions(profile!.id),
    enabled: Boolean(profile),
  });

  async function handleDeleteSession() {
    if (!deleteSessionId) return;
    setIsDeleting(true);
    try {
      await database.db.deleteSession(deleteSessionId);
      setDeleteSessionId(null);
      await sessions.refetch();
      await cache.invalidateQueries({ queryKey: ["sessions"] });
      await cache.invalidateQueries({ queryKey: ["history-sessions"] });
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

  return (
    <div className="page space-y-5 pb-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-[var(--ink)]">جلسه‌های آزمون</h1>
          <p className="text-xs text-[var(--muted)] mt-0.5">تاریخچه و ادامه آزمون‌های ثبت‌شده</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            className="btn-neo py-2 px-3.5 text-xs font-black inline-flex items-center gap-1.5 whitespace-nowrap shadow-[2px_2px_0px_var(--neo-shadow)]"
            href="/history/"
          >
            <History size={15} className="shrink-0" />
            <span>تاریخچه</span>
          </Link>
          <Link
            className="btn-neo-orange py-2 px-4 text-xs font-black inline-flex items-center gap-1.5 whitespace-nowrap shadow-[2px_2px_0px_var(--neo-shadow)]"
            href="/sessions/new/"
          >
            <Plus size={16} className="shrink-0" />
            <span>آزمون جدید</span>
          </Link>
        </div>
      </div>

      <div className="testino-card p-0 overflow-hidden">
        {database.status === "loading" || profiles.isLoading ? (
          <LoadingState label="در حال بارگذاری اطلاعات آزمون…" />
        ) : !profile ? (
          <EmptyState icon={AlertCircle} tone="yellow" title="پروفایل آزمونی پیدا نشد" description="برای ساخت جلسه، ابتدا درس‌ها و هدف خودت را ثبت کن." action={<Link className="btn-neo-orange px-5 py-2.5 text-xs font-black" href="/onboarding/">ساخت پروفایل</Link>} />
        ) : sessions.isLoading ? (
          <LoadingState label="در حال بارگذاری جلسه‌ها…" />
        ) : sessions.isError ? (
          <ErrorState message="جلسه‌ها خوانده نشدند." retry={() => void sessions.refetch()} />
        ) : !sessions.data?.length ? (
          <EmptyState icon={Play} tone="blue" title="هنوز آزمونی ساخته نشده" description="از سؤال‌های آمادهٔ بانک، اولین جلسه را بساز." action={<Link className="btn-neo-orange px-5 py-2.5 text-xs font-black" href="/sessions/new/">شروع اولین آزمون</Link>} />
        ) : (
          <div className="divide-y divide-[var(--line)]">
            {sessions.data.map((session) => {
              const state = stateConfig[session.state];
              const StateIcon = state.icon;
              const answered = session.answered;
              const total = session.total;
              const progressPct = total > 0 ? (answered / total) * 100 : 0;
              const mode = session.config?.mode;

              return (
                <div
                  key={session.id}
                  className="p-4 hover:bg-[var(--surface-2)]/60 transition-colors flex items-center justify-between gap-3 group"
                >
                  <Link
                    href={`/sessions/run/?id=${session.id}`}
                    className="space-y-1.5 flex-1 min-w-0"
                  >
                    <div className="flex items-center gap-2">
                      <strong className="text-xs sm:text-sm font-black text-[var(--ink)] group-hover:text-[var(--brand-orange)] transition-colors">
                        آزمون {mode === "random" ? "تصادفی" : mode === "due" ? "مرور هوشمند" : mode === "wrong" ? "اشتباهات" : "جدید"}
                      </strong>
                      <span className={cn("testino-chip text-[10px] py-0.5 px-2", state.className)}>
                        <StateIcon size={11} />
                        <span>{state.label}</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[var(--muted)] font-medium">
                      <span>{answered} پاسخ از {total} سؤال</span>
                      <div className="w-20 bg-[var(--surface-2)] h-1.5 rounded-full overflow-hidden border border-[var(--line)]">
                        <div
                          className="bg-[var(--brand-orange)] h-full transition-all"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>
                  </Link>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Link
                      href={`/sessions/run/?id=${session.id}`}
                      className="text-xs font-bold text-[var(--brand-orange)] hidden sm:inline"
                    >
                      {session.state === "FINISHED" ? "مشاهده کارنامه" : "ادامه آزمون"}
                    </Link>
                    <button
                      type="button"
                      onClick={() => setDeleteSessionId(session.id)}
                      className="p-2 rounded-xl border border-transparent hover:border-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-[var(--muted)] hover:text-rose-600 transition-all cursor-pointer"
                      title="حذف این آزمون"
                    >
                      <Trash2 size={16} />
                    </button>
                    <Link href={`/sessions/run/?id=${session.id}`}>
                      <ChevronLeft size={16} className="text-[var(--muted)] group-hover:translate-x-[-2px] transition-transform" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

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
              <h3 className="text-sm font-black text-[var(--ink)]">حذف آزمون</h3>
              <p className="text-xs text-[var(--muted)] font-medium">
                آیا مطمئن هستید که می‌خواهید این جلسه آزمون و پاسخ‌های آن را حذف کنید؟ این عملیات قابل بازگشت نیست.
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
