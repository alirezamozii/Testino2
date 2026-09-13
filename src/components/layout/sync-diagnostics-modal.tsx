"use client";

import React, { useState } from "react";
import { AlertCircle, Check, Copy, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { SyncReport, SyncStatus } from "@/sync/ports";

interface SyncDiagnosticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  status: SyncStatus;
  lastReport: SyncReport | null;
  pendingCount: number;
  onRetry: () => Promise<void>;
  isSyncing: boolean;
}

export function SyncDiagnosticsModal({
  isOpen,
  onClose,
  status,
  lastReport,
  pendingCount,
  onRetry,
  isSyncing,
}: SyncDiagnosticsModalProps) {
  const [copied, setCopied] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);

  if (!isOpen) return null;

  const rawErrors = lastReport?.errors?.filter(Boolean) || [];
  const errorText = rawErrors.length > 0 ? rawErrors.join("\n") : "خطای نامشخص در همگام‌سازی ابری.";

  const isOwnerError =
    errorText.includes("OwnerNotFound") ||
    errorText.includes("پروفایل مالک") ||
    errorText.includes("مالک محلی");

  const isAuthError =
    errorText.includes("Unauthorized") ||
    errorText.includes("احراز هویت") ||
    errorText.includes("نشست کاربر");

  const handleCopyLog = async () => {
    const diagnosticInfo = [
      "=== گزارش وضعیت همگام‌سازی تستیونو ===",
      `زمان: ${new Date(lastReport?.completedAt || Date.now()).toLocaleString("fa-IR")}`,
      `وضعیت: ${status}`,
      `تعداد تغییرات در صف ارسال: ${pendingCount}`,
      `تعداد ارسال‌شده: ${lastReport?.pushedCount ?? 0}`,
      `تعداد دریافت‌شده: ${lastReport?.pulledCount ?? 0}`,
      "پیام‌های خطا:",
      ...rawErrors.map((e) => "• " + e),
      "======================================",
    ].join("\n");

    try {
      await navigator.clipboard.writeText(diagnosticInfo);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  const handleManualRetry = async () => {
    setRetrySuccess(false);
    try {
      await onRetry();
      setRetrySuccess(true);
      setTimeout(() => {
        setRetrySuccess(false);
        onClose();
      }, 1200);
    } catch {
      // handled in parent
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
      <div
        className="card-neo w-full max-w-lg bg-[var(--surface)] text-[var(--ink)] p-6 rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)] space-y-5"
        role="dialog"
        aria-modal="true"
        dir="rtl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b-2 border-[var(--border)] pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              <AlertCircle size={22} />
            </div>
            <div>
              <h2 className="text-base font-black">وضعیت همگام‌سازی ابری</h2>
              <p className="text-xs text-[var(--ink-muted)] mt-0.5">
                گزارش شفاف خطا و وضعیت داده‌های شما
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl border-2 border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-all shadow-[1px_1px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px]"
            title="بستن"
          >
            <X size={18} />
          </button>
        </div>

        {/* Local Storage Guarantee Alert */}
        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500/50 text-emerald-900 dark:text-emerald-200 text-xs font-bold leading-relaxed shadow-[2px_2px_0px_var(--neo-shadow)]">
          <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <span className="block font-black text-emerald-800 dark:text-emerald-300 mb-0.5">
              داده‌های شما ۱۰۰٪ امن و محلی هستند
            </span>
            تمامی آزمون‌ها، پاسخ‌ها و تنظیمات شما در دیتابیس داخلی دستگاه ذخیره شده‌اند و هیچ داده‌ای از بین نرفته است.
          </div>
        </div>

        {/* User Explanation based on error diagnosis */}
        <div className="space-y-1.5 text-xs text-[var(--ink)]">
          <div className="font-bold text-[var(--ink-muted)]">علت عدم اتصال:</div>
          <div className="p-3 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--border)] leading-relaxed">
            {isOwnerError ? (
              <p>
                ارتباط حساب ابری با دستگاه نیاز به فعال‌سازی خودکار داشت. با فشردن دکمهٔ «تلاش مجدد هم‌اکنون»، سیستم به طور خودکار اتصال مالک ابری را برقرار می‌کند.
              </p>
            ) : isAuthError ? (
              <p>
                نشست کاربری شما در سرور ابری معتبر نیست یا منقضی شده است. لطفاً از طریق بخش تنظیمات، یک بار وارد حساب کاربری خود شوید.
              </p>
            ) : (
              <p>
                اشکال در اتصال به سرور ابری. لطفاً وضعیت اینترنت خود را بررسی کرده و مجدداً تلاش کنید.
              </p>
            )}
          </div>
        </div>

        {/* Technical Log Box */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
            <span className="font-bold">جزئیات فنی لاگ خطا:</span>
            {pendingCount > 0 && (
              <span className="font-mono text-[11px] bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-400/50">
                {pendingCount} تغییر در صف ارسال
              </span>
            )}
          </div>
          <div className="relative font-mono text-[11px] p-3 rounded-xl bg-slate-900 text-rose-300 border-2 border-slate-800 max-h-36 overflow-y-auto leading-relaxed select-all" dir="ltr">
            {rawErrors.length > 0 ? (
              rawErrors.map((err, i) => (
                <div key={i} className="mb-1">
                  [{i + 1}] {err}
                </div>
              ))
            ) : (
              <div>No critical errors reported in last sync cycle.</div>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleCopyLog}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold bg-[var(--surface-2)] border-2 border-[var(--border)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface)] transition-all active:translate-x-[1px] active:translate-y-[1px]"
          >
            {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
            <span>{copied ? "کپی شد ✓" : "کپی لاگ خطا"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-bold border-2 border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-all"
            >
              بستن
            </button>
            <button
              type="button"
              onClick={handleManualRetry}
              disabled={isSyncing}
              className="btn-neo-orange inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] transition-all active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60"
            >
              <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
              <span>
                {retrySuccess
                  ? "همگام شد ✓"
                  : isSyncing
                  ? "در حال اتصال…"
                  : "تلاش مجدد هم‌اکنون"}
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
