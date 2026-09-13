"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Cloud, CloudOff, RefreshCw, LogOut, CheckCircle2, AlertCircle } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  getSupabaseConfig,
  signInWithGoogle,
  signOut,
  getCurrentAuthUser,
  onAuthStateChange,
} from "@/platform/auth/supabase-client";
import { useSync } from "@/providers/sync-provider";

// Hydration gate: flips to true on the client, false on the server — no effect needed.
const mountedSubscribe = () => () => {};
const useMounted = () => useSyncExternalStore(mountedSubscribe, () => true, () => false);

function GoogleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.5 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.39 3.62v3h3.87c2.26-2.09 3.57-5.16 3.57-8.81Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.07.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.29v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.28A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.28v-3.1H1.29a12 12 0 0 0 0 10.76l3.98-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44A11.98 11.98 0 0 0 12 0 12 12 0 0 0 1.29 6.62l3.98 3.1C6.22 6.88 8.87 4.77 12 4.77Z"
      />
    </svg>
  );
}

export function CloudSyncCard() {
  const { status: syncStatus, isOnline, isSyncing, lastReport, pendingCount, syncNow } = useSync();
  const [config] = useState(() => getSupabaseConfig());
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const mounted = useMounted();

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

  const [actionFeedback, setActionFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const handleManualSync = async () => {
    setActionFeedback(null);
    try {
      const report = await syncNow();
      if (report.errors.length > 0) {
        setActionFeedback({ type: "error", text: "همگام‌سازی ناموفق بود." });
      } else {
        setActionFeedback({ type: "success", text: "همگام‌سازی انجام شد." });
      }
    } catch {
      setActionFeedback({ type: "error", text: "همگام‌سازی ناموفق بود." });
    }
  };

  const handleGoogleSignIn = async () => {
    setActionFeedback(null);
    setSigningIn(true);
    try {
      const { error } = await signInWithGoogle();
      if (error) {
        setActionFeedback({
          type: "error",
          text: !config.isConfigured ? "اتصال ابری تنظیم نشده است." : "ورود با گوگل ناموفق بود.",
        });
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = async () => {
    setActionFeedback(null);
    const { error } = await signOut();
    if (error) {
      setActionFeedback({ type: "error", text: "خروج ناموفق بود." });
    } else {
      setAuthUser(null);
    }
  };

  const statusText = !mounted
    ? "…"
    : !config.isConfigured
    ? "غیرفعال"
    : authUser
    ? authUser.email || "متصل"
    : "وارد نشده‌اید";

  return (
    <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] space-y-4 border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
            {mounted && isOnline && config.isConfigured ? <Cloud size={20} /> : <CloudOff size={20} />}
          </div>
          <div>
            <h3 className="text-sm font-black text-[var(--ink)]">حساب ابری</h3>
            <span className="text-[11px] text-[var(--muted)] font-bold block max-w-[220px] truncate" dir="ltr">
              {statusText}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] shrink-0">
          <span
            className={
              !mounted
                ? "w-2 h-2 rounded-full bg-slate-400"
                : !isOnline
                ? "w-2 h-2 rounded-full bg-slate-400"
                : isSyncing || syncStatus === "syncing"
                ? "w-2 h-2 rounded-full bg-[var(--pastel-yellow)] animate-pulse"
                : authUser && pendingCount === 0
                ? "w-2 h-2 rounded-full bg-[var(--brand-green)]"
                : "w-2 h-2 rounded-full bg-[var(--pastel-yellow)]"
            }
          />
          <span className="text-[11px] font-black text-[var(--ink)]">
            {pendingCount > 0 ? `${pendingCount.toLocaleString("fa-IR")} در انتظار` : isSyncing ? "همگام‌سازی…" : "به‌روز"}
          </span>
        </div>
      </div>

      {/* Feedback */}
      {actionFeedback && (
        <div
          className={`p-2.5 rounded-xl border-2 border-[var(--line-strong)] text-xs font-black flex items-center gap-2 ${
            actionFeedback.type === "success"
              ? "bg-[var(--pastel-green-soft)] text-[var(--ink)]"
              : "bg-[var(--pastel-red-soft)] text-[var(--ink)]"
          }`}
        >
          {actionFeedback.type === "success" ? (
            <CheckCircle2 size={15} className="shrink-0" />
          ) : (
            <AlertCircle size={15} className="shrink-0" />
          )}
          <span>{actionFeedback.text}</span>
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center gap-3">
        {authUser ? (
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] font-black text-xs flex items-center justify-center gap-2 hover:bg-[var(--surface-3)] transition-colors shadow-[2px_2px_0px_var(--neo-shadow)]"
          >
            <LogOut size={15} />
            <span>خروج از حساب</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={signingIn}
            className="w-full sm:w-1/2 py-2.5 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-white text-[#1f2937] font-black text-xs flex items-center justify-center gap-2.5 hover:bg-slate-50 transition-colors shadow-[2px_2px_0px_var(--neo-shadow)] disabled:opacity-60 disabled:cursor-not-allowed"
          >
            <GoogleIcon size={16} />
            <span>{signingIn ? "در حال انتقال…" : "ورود با گوگل"}</span>
          </button>
        )}

        <button
          type="button"
          onClick={handleManualSync}
          disabled={isSyncing || !config.isConfigured || !authUser}
          className="btn-neo-orange w-full sm:w-1/2 py-2.5 text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
          <span>{isSyncing ? "همگام‌سازی…" : "همگام‌سازی"}</span>
        </button>
      </div>

      {lastReport && (
        <div className="text-[10px] font-bold text-[var(--muted)] flex items-center justify-between px-1">
          <span>آخرین همگام‌سازی: {new Date(lastReport.completedAt).toLocaleTimeString("fa-IR")}</span>
          <span>
            {lastReport.pushedCount.toLocaleString("fa-IR")} ارسال / {lastReport.pulledCount.toLocaleString("fa-IR")} دریافت
          </span>
        </div>
      )}
    </div>
  );
}
