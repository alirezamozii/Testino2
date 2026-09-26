"use client";

import React, { useState, useCallback, useMemo, useEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AlertCircle, Check, Copy, RefreshCw, ShieldCheck, X } from "lucide-react";
import type { SyncReport, SyncStatus } from "@/sync/ports";

const emptySubscribe = () => () => {};

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
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
  const [copied, setCopied] = useState(false);
  const [retrySuccess, setRetrySuccess] = useState(false);
  const preRef = useRef<HTMLPreElement | null>(null);

  // Lock body scroll and set modal-open class so bottom nav slides away
  useEffect(() => {
    if (!isOpen) return;

    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("modal-open");

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = originalOverflow;
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  const rawErrors = useMemo(() => lastReport?.errors ?? [], [lastReport?.errors]);
  const errorText = rawErrors.join(" ");

  const isOwnerError =
    errorText.includes("OwnerNotFound") ||
    errorText.includes("پروفایل مالک") ||
    errorText.includes("مالک محلی");

  const isAuthError =
    errorText.includes("Unauthorized") ||
    errorText.includes("احراز هویت") ||
    errorText.includes("نشست کاربر");

  const diagnosticText = useMemo(() => {
    const timestamp = lastReport?.completedAt
      ? new Date(lastReport.completedAt).toLocaleString("fa-IR")
      : new Date().toLocaleString("fa-IR");

    return [
      "=== گزارش وضعیت همگام‌سازی تستیونو ===",
      `زمان: ${timestamp}`,
      `وضعیت: ${status}`,
      `تعداد تغییرات در صف ارسال: ${pendingCount}`,
      `تعداد ارسال‌شده: ${lastReport?.pushedCount ?? 0}`,
      `تعداد دریافت‌شده: ${lastReport?.pulledCount ?? 0}`,
      "پیام‌های خطا:",
      ...(rawErrors.length > 0 ? rawErrors.map((e) => "• " + e) : ["• خطایی ثبت نشده است"]),
      "======================================",
    ].join("\n");
  }, [lastReport, status, pendingCount, rawErrors]);

  const handleCopyLog = useCallback(async () => {
    let success = false;

    // 1. Try modern clipboard API
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(diagnosticText);
        success = true;
      } catch {
        success = false;
      }
    }

    // 2. Fallback using execCommand for Android WebView / Capacitor / non-secure contexts
    if (!success && typeof document !== "undefined") {
      try {
        const textArea = document.createElement("textarea");
        textArea.value = diagnosticText;
        textArea.style.position = "fixed";
        textArea.style.left = "-999999px";
        textArea.style.top = "-999999px";
        textArea.setAttribute("readonly", "");
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        success = document.execCommand("copy");
        document.body.removeChild(textArea);
      } catch (e) {
        console.error("Fallback copy failed", e);
      }
    }

    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  }, [diagnosticText]);

  const handleSelectAll = useCallback(() => {
    if (preRef.current) {
      const range = document.createRange();
      range.selectNodeContents(preRef.current);
      const selection = window.getSelection();
      if (selection) {
        selection.removeAllRanges();
        selection.addRange(range);
      }
    }
  }, []);

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

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto overscroll-contain animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card-neo relative w-[calc(100%-0.75rem)] sm:w-full max-w-lg max-h-[min(90dvh,640px)] flex flex-col bg-[var(--surface)] text-[var(--ink)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)] my-auto overflow-hidden animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        data-modal="true"
        dir="rtl"
      >
        {/* Header - Fixed at top */}
        <div className="shrink-0 flex items-start justify-between gap-3 border-b-2 border-[var(--border)] p-3.5 sm:p-5 bg-[var(--surface)]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-500 text-rose-600 dark:text-rose-400 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              <AlertCircle size={22} />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-black">وضعیت و عیب‌یابی همگام‌سازی ابری</h2>
              <p className="text-[11px] sm:text-xs text-[var(--ink-muted)] mt-0.5">
                گزارش شفاف خطا و وضعیت داده‌های شما
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border-2 border-[var(--border)] hover:bg-[var(--surface-2)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-all shadow-[1px_1px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] cursor-pointer min-w-[36px] min-h-[36px] flex items-center justify-center"
            title="بستن"
            aria-label="بستن"
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Body Content */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3.5 sm:p-5 space-y-3.5">
          {/* Local Storage Guarantee Alert */}
          <div className="flex items-start gap-2.5 p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-500/50 text-emerald-900 dark:text-emerald-200 text-xs font-bold leading-relaxed shadow-[2px_2px_0px_var(--neo-shadow)]">
            <ShieldCheck size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <span className="block font-black text-emerald-800 dark:text-emerald-300 mb-0.5">
                داده‌های شما ۱۰۰٪ امن و محلی هستند
              </span>
              تمامی آزمون‌ها، پاسخ‌ها و تنظیمات در دیتابیس داخلی دستگاه ذخیره شده‌اند و هیچ داده‌ای از بین نرفته است.
            </div>
          </div>

          {/* User Explanation based on error diagnosis */}
          <div className="space-y-1 text-xs text-[var(--ink)]">
            <div className="font-bold text-[var(--ink-muted)]">علت عدم اتصال:</div>
            <div className="p-3 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--border)] leading-relaxed text-[11px] sm:text-xs">
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
                  اشکال در اتصال به سرور ابری. لطفاً وضعیت اینترنت خود را بررسی کرده و با دکمهٔ زیر دوباره تلاش نمایید.
                </p>
              )}
            </div>
          </div>

          {/* Technical Log Box */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-[var(--ink-muted)]">
              <span className="font-bold">متن کامل گزارش خطا:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSelectAll}
                  className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-bold"
                >
                  انتخاب تمام متن
                </button>
                {pendingCount > 0 && (
                  <span className="font-mono text-[10px] sm:text-[11px] bg-amber-100 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 px-2 py-0.5 rounded-md border border-amber-400/50">
                    {pendingCount} در صف ارسال
                  </span>
                )}
              </div>
            </div>
            <pre
              ref={preRef}
              className="relative font-mono text-[11px] sm:text-xs p-3 rounded-xl bg-slate-950 text-emerald-300 border-2 border-slate-800 max-h-36 sm:max-h-44 overflow-y-auto leading-relaxed select-all whitespace-pre-wrap break-all"
              dir="ltr"
            >
              {diagnosticText}
            </pre>
          </div>
        </div>

        {/* Actions - Fixed at bottom */}
        <div className="shrink-0 flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-3 sm:p-4 border-t-2 border-[var(--border)] bg-[var(--surface)]">
          <button
            type="button"
            onClick={handleCopyLog}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold bg-[var(--surface-2)] border-2 border-[var(--border)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface)] transition-all active:translate-x-[1px] active:translate-y-[1px] cursor-pointer min-h-[42px]"
          >
            {copied ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            <span>{copied ? "متن گزارش کپی شد ✓" : "کپی متن گزارش"}</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial px-4 py-2.5 rounded-xl text-xs font-bold border-2 border-[var(--border)] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-all cursor-pointer min-h-[42px] text-center"
            >
              بستن
            </button>
            <button
              type="button"
              onClick={handleManualRetry}
              disabled={isSyncing}
              className="flex-1 sm:flex-initial btn-neo-orange inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] transition-all active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-60 cursor-pointer min-h-[42px]"
            >
              <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
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
    </div>,
    document.body
  );
}
