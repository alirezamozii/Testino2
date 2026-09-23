"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Cloud, CloudOff, RefreshCw, LogOut, CheckCircle2, AlertCircle, Settings2, ChevronDown, ChevronUp, RotateCcw } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import {
  getSupabaseConfig,
  setCustomSupabaseConfig,
  resetCustomSupabaseConfig,
  signInWithGoogle,
  signOut,
  getCurrentAuthUser,
  onAuthStateChange,
  exchangeOAuthCode,
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
  const [config, setConfig] = useState(() => getSupabaseConfig());
  const [customUrl, setCustomUrl] = useState(() => config.url);
  const [customKey, setCustomKey] = useState(() => config.anonKey);
  const [showConfigEditor, setShowConfigEditor] = useState(false);
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [manualCode, setManualCode] = useState("");
  const [showManualCode, setShowManualCode] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
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
      } else {
        setActionFeedback({
          type: "success",
          text: "صفحهٔ ورود گوگل در مرورگر باز شد. پس از ورود، به برنامه بازگردید.",
        });
        setShowManualCode(true);
      }
    } finally {
      setTimeout(() => setSigningIn(false), 2000);
    }
  };

  const handleManualCodeSubmit = async () => {
    if (!manualCode.trim()) return;
    setIsExchanging(true);
    setActionFeedback(null);
    try {
      const { user, error } = await exchangeOAuthCode(manualCode);
      if (error || !user) {
        setActionFeedback({
          type: "error",
          text: error?.message || "کد یا آدرس نامعتبر است. لطفاً دوباره تلاش کنید.",
        });
      } else {
        setAuthUser(user);
        setShowManualCode(false);
        setManualCode("");
        setActionFeedback({
          type: "success",
          text: `با موفقیت متصل شدید: ${user.email || user.id.slice(0, 8)}`,
        });
      }
    } catch (err) {
      setActionFeedback({
        type: "error",
        text: err instanceof Error ? err.message : "خطا در بررسی کد",
      });
    } finally {
      setIsExchanging(false);
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

  const handleSaveCustomConfig = () => {
    setCustomSupabaseConfig(customUrl, customKey);
    const updated = getSupabaseConfig();
    setConfig(updated);
    setActionFeedback({
      type: "success",
      text: "تنظیمات سرور ابری به‌روز شد.",
    });
  };

  const handleResetConfig = () => {
    resetCustomSupabaseConfig();
    const updated = getSupabaseConfig();
    setCustomUrl(updated.url);
    setCustomKey(updated.anonKey);
    setConfig(updated);
    setActionFeedback({
      type: "success",
      text: "تنظیمات سرور ابری به پیش‌فرض پروژه بازنشانی شد.",
    });
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

      {!authUser && showManualCode && (
        <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-2">
          <label className="text-[11px] font-bold text-[var(--ink)] block">
            اگر مرورگر خودکار به برنامه بازنگشت، آدرس یا کد نهایی صفحه مرورگر را اینجا قرار دهید:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="http://localhost:3000/?code=... یا کد"
              className="flex-1 px-3 py-1.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-xs font-mono text-[var(--ink)]"
              dir="ltr"
            />
            <button
              type="button"
              onClick={handleManualCodeSubmit}
              disabled={isExchanging || !manualCode.trim()}
              className="btn-neo-orange px-3 py-1.5 text-xs font-black rounded-xl disabled:opacity-50 shrink-0"
            >
              {isExchanging ? "تأیید…" : "تأیید"}
            </button>
          </div>
        </div>
      )}

      {/* Advanced Server Configuration Toggle */}
      <div className="pt-1 border-t border-[var(--line-strong)]/20">
        <button
          type="button"
          onClick={() => setShowConfigEditor(!showConfigEditor)}
          className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] flex items-center justify-between w-full py-1 cursor-pointer transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Settings2 size={13} />
            <span>تنظیمات پیشرفته اتصال به سرور ابری (URL و کلید اختصاصی)</span>
          </span>
          {showConfigEditor ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {showConfigEditor && (
          <div className="p-3 mt-2 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-2.5 animate-in fade-in duration-150">
            <div>
              <label className="text-[10px] font-black text-[var(--ink)] block mb-1">
                آدرس پروژه Supabase (URL):
              </label>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://xyzcompany.supabase.co"
                className="w-full px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-xs font-mono text-[var(--ink)]"
                dir="ltr"
              />
            </div>
            <div>
              <label className="text-[10px] font-black text-[var(--ink)] block mb-1">
                کلید عمومی ناشر (Anon / Publishable Key):
              </label>
              <input
                type="text"
                value={customKey}
                onChange={(e) => setCustomKey(e.target.value)}
                placeholder="sb_publishable_..."
                className="w-full px-3 py-1.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-xs font-mono text-[var(--ink)]"
                dir="ltr"
              />
            </div>
            <div className="flex items-center justify-between gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveCustomConfig}
                className="btn-neo-orange px-3 py-1.5 text-xs font-black rounded-xl shadow-xs"
              >
                ذخیره تنظیمات
              </button>
              <button
                type="button"
                onClick={handleResetConfig}
                className="text-xs font-bold text-[var(--muted)] hover:text-rose-600 flex items-center gap-1 transition-colors"
              >
                <RotateCcw size={12} />
                <span>بازنشانی پیش‌فرض</span>
              </button>
            </div>
          </div>
        )}
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
