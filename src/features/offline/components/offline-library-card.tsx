"use client";

import { useMemo, useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, DownloadCloud, HardDriveDownload, LoaderCircle, WifiOff } from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
import type { User } from "@supabase/supabase-js";
import { getCurrentAuthUser, onAuthStateChange, signInWithGoogle } from "@/platform/auth/supabase-client";
import { OfflineLibraryService } from "../domain/offline-library-service";
import { cn } from "@/lib/utils";

interface SubjectOption {
  id: string;
  name: string;
}

export function OfflineLibraryCard({
  ownerId,
  profileId,
  subjects,
}: {
  ownerId: string;
  profileId: string;
  subjects: SubjectOption[];
}) {
  const database = useDatabase();
  const queryClient = useQueryClient();
  const service = useMemo(() => new OfflineLibraryService(database.db.getClient()), [database.db]);
  const [downloading, setDownloading] = useState(false);
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const state = useQuery({
    queryKey: ["offline-library", ownerId, profileId],
    queryFn: () => service.list(ownerId, profileId),
    enabled: database.status === "ready" && Boolean(ownerId && profileId),
  });

  const enabledIds = new Set(state.data?.filter((item) => item.enabled).map((item) => item.subjectId) ?? []);
  const selectedCount = enabledIds.size;

  async function toggle(subject: SubjectOption, enabled: boolean) {
    await service.setEnabled(ownerId, profileId, subject, enabled);
    await queryClient.invalidateQueries({ queryKey: ["offline-library", ownerId, profileId] });
  }

  async function toggleAll(enabled: boolean) {
    await Promise.all(subjects.map((subject) => service.setEnabled(ownerId, profileId, subject, enabled)));
    await queryClient.invalidateQueries({ queryKey: ["offline-library", ownerId, profileId] });
  }

  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentAuthUser().then((u) => {
      if (active) setUser(u);
    }).catch(() => {});
    const unsubscribe = onAuthStateChange((u) => {
      if (active) setUser(u);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  async function download() {
    if (!user) {
      setFeedback({
        kind: "error",
        text: "برای دانلود بانک سؤالات ابری، ابتدا از بخش «حساب ابری» بالا وارد شوید (ورود با گوگل). پس از اتصال، می‌توانید همهٔ بانک‌ها را دانلود کنید.",
      });
      return;
    }
    setDownloading(true);
    setFeedback(null);
    try {
      const report = await service.downloadEnabled(ownerId, profileId);
      if (report.errors.length) {
        setFeedback({
          kind: "error",
          text: `${report.questions.toLocaleString("fa-IR")} سؤال ذخیره شد؛ ${report.missingMedia.toLocaleString("fa-IR")} رسانه هنوز در دسترس نیست.`,
        });
      } else {
        setFeedback({
          kind: "success",
          text: `${report.questions.toLocaleString("fa-IR")} سؤال و ${report.media.toLocaleString("fa-IR")} تصویر برای استفادهٔ آفلاین آماده شد.`,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["offline-library", ownerId, profileId] });
    } catch (error) {
      setFeedback({ kind: "error", text: error instanceof Error ? error.message : "دانلود آفلاین ناموفق بود." });
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="card-neo p-5 rounded-3xl bg-[var(--surface)] space-y-4" aria-labelledby="offline-library-title">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-950/50 border-2 border-[var(--line-strong)] text-sky-600 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
          <HardDriveDownload size={20} />
        </div>
        <div>
          <h3 id="offline-library-title" className="text-sm font-black text-[var(--ink)]">کتابخانهٔ آفلاین</h3>
          <p className="text-[11px] leading-5 text-[var(--muted)] font-bold">
            درس‌های انتخابی را یک‌بار دانلود کن تا بدون اینترنت هم در دسترس باشند.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-black text-[var(--ink)]">{selectedCount.toLocaleString("fa-IR")} درس انتخاب شده</span>
        <button
          type="button"
          onClick={() => toggleAll(selectedCount !== subjects.length)}
          className="text-[11px] font-black px-3 py-1.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] hover:bg-[var(--surface-3)] transition-all shadow-[1.5px_1.5px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px]"
        >
          {selectedCount === subjects.length ? "لغو انتخاب همه" : "انتخاب همهٔ درس‌ها"}
        </button>
      </div>

      <div className="w-full space-y-2.5">
        {subjects.map((subject) => {
          const item = state.data?.find((entry) => entry.subjectId === subject.id);
          const checked = enabledIds.has(subject.id);
          return (
            <div
              key={subject.id}
              onClick={() => void toggle(subject, !checked)}
              role="checkbox"
              aria-checked={checked}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  void toggle(subject, !checked);
                }
              }}
              className={cn(
                "w-full flex flex-row items-center justify-between gap-3 rounded-2xl border-2 p-3 sm:p-3.5 transition-all cursor-pointer select-none",
                checked
                  ? "border-[var(--line-strong)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "border-[var(--line-strong)]/30 bg-[var(--surface-2)] opacity-85 hover:opacity-100 hover:border-[var(--line-strong)]/60"
              )}
            >
              {/* Right Side: Checkbox Box + Subject Name & Subtitle */}
              <div className="flex flex-row items-center gap-3 min-w-0 flex-1">
                {/* Modern Custom Neo-Brutalist Checkbox */}
                <div
                  className={cn(
                    "w-6 h-6 rounded-lg border-2 flex items-center justify-center shrink-0 transition-all shadow-[1px_1px_0px_var(--neo-shadow)]",
                    checked
                      ? "bg-sky-500 border-[var(--line-strong)] text-white"
                      : "bg-[var(--surface)] border-[var(--line-strong)]/60 text-transparent"
                  )}
                >
                  <CheckCircle2 size={16} className={checked ? "stroke-[2.5]" : "opacity-0"} />
                </div>

                <div className="min-w-0 flex-1 text-right">
                  <strong className="block text-xs sm:text-sm font-black text-[var(--ink)] leading-snug break-words">
                    {subject.name}
                  </strong>
                  <span className="block text-[10px] sm:text-[11px] font-bold text-[var(--muted)] mt-0.5">
                    {state.isLoading
                      ? "در حال بررسی…"
                      : item?.status === "ready"
                      ? `${item.downloadedQuestions.toLocaleString("fa-IR")} سؤال آماده آفلاین`
                      : item?.status === "error"
                      ? "خطا در دریافت - تلاش مجدد"
                      : checked
                      ? "انتخاب شده برای دانلود"
                      : "برای انتخاب کلیک کنید"}
                  </span>
                </div>
              </div>

              {/* Left Side: Status Pill */}
              <div className="shrink-0 flex items-center">
                {item?.status === "ready" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2.5 py-1 rounded-lg">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span className="whitespace-nowrap">آماده آفلاین</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--muted)] bg-[var(--surface-3)] px-2.5 py-1 rounded-lg border border-[var(--line-strong)]/20">
                    <WifiOff size={12} className="shrink-0" />
                    <span className="whitespace-nowrap">آفلاین نیست</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {!user ? (
        <div className="p-3.5 rounded-2xl bg-amber-500/10 border-2 border-amber-500/30 text-amber-900 dark:text-amber-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-right">
            <span className="text-xs font-black block">اتصال به حساب برای دریافت سؤالات ابری</span>
            <p className="text-[11px] font-bold text-amber-800/80 dark:text-amber-300/80 mt-0.5">
              بانک سؤالات روی سرور ابری قرار دارد. برای دسترسی به همهٔ بانک‌ها، لطفاً وارد حساب شوید.
            </p>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signInWithGoogle();
            }}
            className="btn-neo-orange px-4 py-2 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 self-start sm:self-auto"
          >
            ورود با گوگل
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={download}
          disabled={downloading || selectedCount === 0}
          className="btn-neo-blue w-full py-2.5 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shadow-[2px_2px_0px_var(--neo-shadow)]"
        >
          {downloading ? <LoaderCircle size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
          <span className="whitespace-nowrap">{downloading ? "در حال دریافت…" : "دانلود نسخهٔ آفلاین"}</span>
        </button>
      )}

      {feedback && (
        <div
          className={`rounded-2xl border-2 p-3 text-xs font-bold shadow-[2px_2px_0px_var(--neo-shadow)] ${
            feedback.kind === "success"
              ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
              : "border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200"
          }`}
        >
          {feedback.text}
        </div>
      )}
    </section>
  );
}
