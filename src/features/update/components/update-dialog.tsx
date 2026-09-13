"use client";

import { useState } from "react";
import { Sparkles, Download, RefreshCw, X, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { dismissUpdateVersion, type UpdateCheckResult } from "../domain/update-service";

interface UpdateDialogProps {
  update: UpdateCheckResult;
  onClose: () => void;
}

export function UpdateDialog({ update, onClose }: UpdateDialogProps) {
  const [platform] = useState<"web" | "desktop" | "android">(() => {
    if (typeof window !== "undefined") {
      if ((window as unknown as { testinoDesktop?: boolean }).testinoDesktop) {
        return "desktop";
      }
      if (navigator.userAgent.includes("Android") && (window as unknown as { Capacitor?: unknown }).Capacitor) {
        return "android";
      }
    }
    return "web";
  });
  const [isUpdating, setIsUpdating] = useState(false);

  const handleApplyWebUpdate = async () => {
    setIsUpdating(true);
    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.update().catch(() => {});
        }
      }
    } catch {
      // Even if the SW update probe fails, the reload below still picks up
      // the newly deployed bundle (next navigation fetches fresh HTML).
    } finally {
      // Always reload — the button must never stay disabled forever when
      // getRegistrations() rejects (insecure context, denied storage …).
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  };

  const handleDismiss = () => {
    dismissUpdateVersion(update.latestVersion);
    onClose();
  };

  return (
    <div
      data-modal="true"
      role="dialog"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in"
    >
      <div
        className="card-neo relative w-full max-w-md p-6 bg-[var(--surface)] text-[var(--ink)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[8px_8px_0px_var(--neo-shadow)] space-y-5"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-[var(--accent)] text-white flex items-center justify-center border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              <Sparkles className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="font-black text-lg text-[var(--ink)]">
                {platform === "desktop"
                  ? "نسخه جدید ویندوز آماده است!"
                  : platform === "android"
                  ? "نسخه جدید اندروید آماده است!"
                  : "نسخه جدید تستیونو آماده است!"}
              </h3>
              <p className="text-xs text-[var(--muted)] font-bold">
                {platform === "web" ? "به‌روزرسانی در سرور تستیونو" : "به‌روزرسانی آماده نصب"}
              </p>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-2 rounded-xl text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors"
            title="بستن"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Version Compare Banner */}
        <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-xs font-black">
          <div className="space-y-0.5">
            <span className="text-[var(--muted)] block">نسخه کنونی:</span>
            <span className="text-[var(--ink)] font-black">v{update.currentVersion}</span>
          </div>
          <span className="text-[var(--accent)] text-base font-black">➔</span>
          <div className="space-y-0.5 text-left">
            <span className="text-[var(--muted)] block">نسخه جدید:</span>
            <span className="text-emerald-600 dark:text-emerald-400 font-black">
              v{update.latestVersion} (بیلد {update.latestBuild})
            </span>
          </div>
        </div>

        {/* Changelog */}
        {update.changelog.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-xs font-black text-[var(--muted)]">تغییرات و بهینه‌سازی‌ها:</h4>
            <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-2 max-h-36 overflow-y-auto">
              {update.changelog.map((change, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs font-bold text-[var(--ink)]">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                  <span>{change}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons based on Platform */}
        <div className="space-y-2 pt-2">
          {platform === "web" && (
            <button
              onClick={handleApplyWebUpdate}
              disabled={isUpdating}
              className="w-full py-3.5 px-4 rounded-2xl bg-[var(--accent)] text-white font-black text-sm flex items-center justify-center gap-2 border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isUpdating ? "animate-spin" : ""}`} />
              {isUpdating ? "در حال به‌روزرسانی و بارگذاری مجدد..." : "به‌روزرسانی فوری درون برنامه"}
            </button>
          )}

          {platform === "desktop" && update.downloadUrls.windows && (
            <a
              href={update.downloadUrls.windows}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 rounded-2xl bg-[var(--accent)] text-white font-black text-sm flex items-center justify-center gap-2 border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 transition-all text-center"
            >
              <Download className="w-4 h-4" />
              دریافت نسخه جدید ویندوز (دانلود مستقیم)
            </a>
          )}

          {platform === "android" && update.downloadUrls.android && (
            <a
              href={update.downloadUrls.android}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-3.5 px-4 rounded-2xl bg-[var(--accent)] text-white font-black text-sm flex items-center justify-center gap-2 border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] hover:brightness-105 active:translate-x-0.5 active:translate-y-0.5 transition-all text-center"
            >
              <Download className="w-4 h-4" />
              دانلود فایل نصبی جدید اندروید (APK)
            </a>
          )}

          {/* Fallback download options if platform specific not detected */}
          {platform === "web" && (update.downloadUrls.windows || update.downloadUrls.android) && (
            <div className="flex gap-2 pt-1">
              {update.downloadUrls.windows && (
                <a
                  href={update.downloadUrls.windows}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-xs flex items-center justify-center gap-1 border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface)] transition-all"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  نسخه ویندوز
                </a>
              )}
              {update.downloadUrls.android && (
                <a
                  href={update.downloadUrls.android}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 py-2 px-3 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-bold text-xs flex items-center justify-center gap-1 border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface)] transition-all"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" />
                  فایل APK
                </a>
              )}
            </div>
          )}

          <button
            onClick={handleDismiss}
            className="w-full py-2.5 text-center text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          >
            بعداً یادآوری کن
          </button>
        </div>
      </div>
    </div>
  );
}
