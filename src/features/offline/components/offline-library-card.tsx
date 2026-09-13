"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, DownloadCloud, HardDriveDownload, LoaderCircle, WifiOff } from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
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

  async function download() {
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
          className="text-[11px] font-black text-sky-700 dark:text-sky-300 underline underline-offset-4"
        >
          {selectedCount === subjects.length ? "لغو انتخاب همه" : "انتخاب همهٔ درس‌های پروفایل"}
        </button>
      </div>

      <div className="w-full space-y-2.5">
        {subjects.map((subject) => {
          const item = state.data?.find((entry) => entry.subjectId === subject.id);
          const checked = enabledIds.has(subject.id);
          return (
            <label
              key={subject.id}
              className={cn(
                "w-full flex items-center justify-between gap-3 rounded-2xl border-2 p-3 transition-all cursor-pointer select-none",
                checked
                  ? "border-[var(--line-strong)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "border-[var(--line-strong)]/40 bg-[var(--surface-2)] opacity-90 hover:opacity-100"
              )}
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => void toggle(subject, event.currentTarget.checked)}
                  disabled={state.isLoading}
                  className="w-4 h-4 rounded border-2 border-[var(--line-strong)] text-sky-600 focus:ring-sky-500 shrink-0 cursor-pointer accent-sky-600"
                />
                <div className="min-w-0 flex-1">
                  <strong className="block text-xs sm:text-sm font-black text-[var(--ink)] leading-snug break-words">
                    {subject.name}
                  </strong>
                  <span className="block text-[10px] sm:text-[11px] font-bold text-[var(--muted)] mt-0.5">
                    {state.isLoading
                      ? "در حال بررسی…"
                      : item?.status === "ready"
                      ? `${item.downloadedQuestions.toLocaleString("fa-IR")} سؤال آماده آفلاین`
                      : item?.status === "error"
                      ? "خطا در دانلود - تلاش مجدد"
                      : "برای دانلود تیک بزنید"}
                  </span>
                </div>
              </div>
              <div className="shrink-0 flex items-center">
                {item?.status === "ready" ? (
                  <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 px-2 py-1 rounded-lg">
                    <CheckCircle2 size={13} className="shrink-0" />
                    <span>آماده آفلاین</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--muted)] bg-[var(--surface-3)] px-2 py-1 rounded-lg border border-[var(--line-strong)]/20">
                    <WifiOff size={12} className="shrink-0" />
                    <span>آفلاین نیست</span>
                  </span>
                )}
              </div>
            </label>
          );
        })}
      </div>

      <button
        type="button"
        onClick={download}
        disabled={downloading || selectedCount === 0}
        className="btn-neo-blue w-full py-2.5 text-xs font-black flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloading ? <LoaderCircle size={16} className="animate-spin" /> : <DownloadCloud size={16} />}
        <span className="whitespace-nowrap">{downloading ? "در حال دریافت…" : "دانلود نسخهٔ آفلاین"}</span>
      </button>

      {feedback && (
        <p className={`rounded-xl border p-2 text-[11px] font-bold ${feedback.kind === "success" ? "border-emerald-400 text-emerald-700" : "border-amber-400 text-amber-700"}`}>
          {feedback.text}
        </p>
      )}
    </section>
  );
}
