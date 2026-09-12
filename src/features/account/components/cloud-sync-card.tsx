"use client";

import { useState, useEffect } from "react";
import {
  Cloud,
  CloudOff,
  RefreshCw,
  LogIn,
  LogOut,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  getSupabaseConfig,
  signInWithGoogle,
  signOut,
  getCurrentAuthUser,
  onAuthStateChange,
} from "@/platform/auth/supabase-client";
import { useSync } from "@/providers/sync-provider";

export function CloudSyncCard() {
  const { status: syncStatus, isOnline, isSyncing, lastReport, pendingCount, syncNow } = useSync();
  const [config] = useState(() => getSupabaseConfig());
  const [authUser, setAuthUser] = useState<User | null>(null);

  // Feedback state
  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    let active = true;
    getCurrentAuthUser().then((u) => {
      if (active) setAuthUser(u);
    }).catch(() => {});

    const unsubscribe = onAuthStateChange((user) => {
      if (active) setAuthUser(user);
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleManualSync = async () => {
    setActionFeedback(null);
    try {
      const report = await syncNow();
      if (report.errors.length > 0) {
        setActionFeedback({ type: "error", text: report.errors[0] });
      } else {
        setActionFeedback({
          type: "success",
          text: `همگام‌سازی موفق: ${report.pushedCount} جهش ارسال شد، ${report.pulledCount} تغییر دریافت شد.`,
        });
      }
    } catch (err) {
      setActionFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در برقراری ارتباط با سرور ابری",
      });
    }
  };

  const handleGoogleSignIn = async () => {
    setActionFeedback(null);
    const { error } = await signInWithGoogle();
    if (error) {
      setActionFeedback({ type: "error", text: error.message });
    }
  };

  const handleSignOut = async () => {
    setActionFeedback(null);
    const { error } = await signOut();
    if (error) {
      setActionFeedback({ type: "error", text: error.message });
    } else {
      setAuthUser(null);
      setActionFeedback({ type: "success", text: "با موفقیت از حساب ابری خارج شدید. داده‌های محلی شما محفوظ است." });
    }
  };




  return (
    <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] space-y-4 border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
      {/* Header */}
      <div className="flex items-center justify-between border-b-2 border-[var(--line-strong)]/20 pb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 border-2 border-[var(--line-strong)] text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
            {isOnline && config.isConfigured ? <Cloud size={20} /> : <CloudOff size={20} />}
          </div>
          <div>
            <h3 className="text-sm font-black text-[var(--ink)]">حساب ابری و همگام‌سازی (Supabase)</h3>
            <span className="text-[11px] text-[var(--muted)] font-bold">
              {config.isConfigured
                ? authUser
                  ? `متصل با حساب: ${authUser.email || authUser.id.slice(0, 8)}`
                  : "سرویس ابری آماده • نیاز به ورود با گوگل"
                : "حالت کاملاً آفلاین و محلی (ذخیره روی دیتابیس دستگاه)"}
            </span>
          </div>
        </div>
      </div>

      {/* Feedback Alert */}
      {actionFeedback && (
        <div
          className={`p-3 rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black flex items-center gap-2 shadow-[2px_2px_0px_var(--neo-shadow)] ${
            actionFeedback.type === "success"
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300"
              : "bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300"
          }`}
        >
          {actionFeedback.type === "success" ? (
            <CheckCircle2 size={16} className="shrink-0 text-emerald-600" />
          ) : (
            <AlertCircle size={16} className="shrink-0 text-red-600" />
          )}
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* Status & Sync Stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
          <span className="text-[10px] font-bold text-[var(--muted)] block">صف خروجی محلی (Outbox)</span>
          <span className="text-sm font-black text-[var(--ink)] mt-0.5 block">
            {pendingCount > 0 ? `${pendingCount} تغییر در انتظار` : "تمام تغییرات محلی ثبت شده"}
          </span>
        </div>

        <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
          <span className="text-[10px] font-bold text-[var(--muted)] block">وضعیت اتصال</span>
          <span className="text-sm font-black text-[var(--ink)] mt-0.5 block">
            {!isOnline
              ? "آفلاین (بدون اینترنت)"
              : !config.isConfigured
              ? "کلید سرور تنظیم نشده"
              : syncStatus === "syncing"
              ? "در حال همگام‌سازی..."
              : "آماده برای تبادل"}
          </span>
        </div>
      </div>

      {lastReport && (
        <div className="text-[11px] font-bold text-[var(--muted)] flex items-center justify-between px-1">
          <span>آخرین همگام‌سازی: {new Date(lastReport.completedAt).toLocaleTimeString("fa-IR")}</span>
          <span>{lastReport.pushedCount} ارسال / {lastReport.pulledCount} دریافت</span>
        </div>
      )}

      {/* Action Buttons: Google Sign-In & Sync Now */}
      <div className="flex flex-col sm:flex-row items-center gap-3 pt-1">
        {authUser ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 font-black text-xs flex items-center justify-center gap-2 hover:bg-red-100 transition-colors shadow-[2px_2px_0px_var(--neo-shadow)]"
          >
            <LogOut size={16} />
            <span>خروج از حساب</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] dark:bg-slate-900 text-[var(--ink)] font-black text-xs flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors shadow-[2px_2px_0px_var(--neo-shadow)]"
          >
            <LogIn size={16} className="text-blue-500" />
            <span>ورود با حساب گوگل (PKCE)</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncing || !config.isConfigured}
          className="btn-neo-orange w-full sm:w-1/2 py-2.5 text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
          <span>{isSyncing ? "همگام‌سازی..." : "همگام‌سازی دستی (Push & Pull)"}</span>
        </button>
      </div>



    </div>
  );
}
