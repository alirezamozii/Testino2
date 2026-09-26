"use client";

import React from "react";
import { ArrowLeft, Check, Eye, EyeOff, Loader2, Lock, Mail, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { NeoButton, NeoInput } from "@/components/ui/neo-primitives";

export interface OnboardingStepIdentityProps {
  userName: string;
  onUserNameChange: (name: string) => void;
  avatarUrl: string | null;
  isAuthenticated: boolean;
  authEmail: string;
  isAuthLoading: boolean;
  authTab: "email" | "google";
  onAuthTabChange: (tab: "email" | "google") => void;
  emailInput: string;
  onEmailInputChange: (val: string) => void;
  passwordInput: string;
  onPasswordInputChange: (val: string) => void;
  showPassword: boolean;
  onToggleShowPassword: () => void;
  onEmailAuth: (e: React.FormEvent) => void;
  onGoogleSignIn: () => void;
  onDisconnectAuth: () => void;
  showManualCodeInput: boolean;
  manualOAuthCode: string;
  onManualOAuthCodeChange: (code: string) => void;
  onManualOAuthSubmit: () => void;
  isManualExchanging: boolean;
}

export function OnboardingStepIdentity({
  userName,
  onUserNameChange,
  avatarUrl,
  isAuthenticated,
  authEmail,
  isAuthLoading,
  authTab,
  onAuthTabChange,
  emailInput,
  onEmailInputChange,
  passwordInput,
  onPasswordInputChange,
  showPassword,
  onToggleShowPassword,
  onEmailAuth,
  onGoogleSignIn,
  onDisconnectAuth,
  showManualCodeInput,
  manualOAuthCode,
  onManualOAuthCodeChange,
  onManualOAuthSubmit,
  isManualExchanging,
}: OnboardingStepIdentityProps) {
  return (
    <div className="space-y-5 sm:space-y-6">
      <div className="text-right space-y-1">
        <span className="inline-block text-[10px] sm:text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line)]">
          گام ۱ از ۴ • هویت و حساب کاربری
        </span>
        <h2 className="text-lg sm:text-2xl font-black text-[var(--ink)] pt-1">
          نام خود را وارد کنید
        </h2>
        <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
          نام نمایشی شما در کارنامه‌ها و گزارش‌های مطالعه درج می‌شود. اتصال به حساب کاملاً اختیاری است.
        </p>
      </div>

      {/* Identity & Avatar Card */}
      <div className="p-3.5 sm:p-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] space-y-3 sm:space-y-4">
        <div className="flex items-center gap-3 sm:gap-4">
          {/* Avatar Preview */}
          <div className="relative shrink-0">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl border-2 border-[var(--line)] object-cover shadow-[2px_2px_0px_var(--line)]"
              />
            ) : (
              <div className="w-13 h-13 sm:w-16 sm:h-16 rounded-2xl bg-[var(--pastel-orange)]/30 border-2 border-[var(--line)] flex items-center justify-center font-black text-lg sm:text-xl text-[var(--testino-orange)] shadow-[2px_2px_0px_var(--line)]">
                {userName.trim() ? userName.trim().slice(0, 2) : <User size={24} className="text-[var(--ink)]" />}
              </div>
            )}
            {isAuthenticated && (
              <div
                className="absolute -bottom-1 -left-1 w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-[var(--brand-green)] border-2 border-[var(--line)] flex items-center justify-center text-white"
                title="حساب متصل است"
              >
                <Check size={11} strokeWidth={3.5} />
              </div>
            )}
          </div>

          <div className="flex-1 space-y-1 min-w-0">
            <label className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5 truncate">
              <User size={13} className="text-[var(--testino-orange)] shrink-0" />
              <span>نام یا نام مستعار شما:</span>
            </label>
            <NeoInput
              value={userName}
              onChange={(e) => onUserNameChange(e.target.value)}
              placeholder="نام یا نام خانوادگی خود را بنویسید..."
              className="w-full"
            />
          </div>
        </div>
      </div>

      {/* Auth Connection Card — Tabbed */}
      <div className="p-4 sm:p-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] space-y-4 shadow-[2px_2px_0px_var(--line)]">
        <div className="flex items-center gap-3 pb-2">
          <div className="w-11 h-11 rounded-2xl bg-[var(--surface)] dark:bg-slate-900 border-2 border-[var(--line)] flex items-center justify-center shrink-0 shadow-[2px_2px_0px_var(--line)]">
            <Lock size={20} className="text-[var(--ink)]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                اتصال به حساب کاربری
              </strong>
              <span
                className={cn(
                  "text-[10px] font-black px-2 py-0.5 rounded-full border",
                  isAuthenticated
                    ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                    : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                )}
              >
                {isAuthenticated ? "متصل شده" : "اختیاری"}
              </span>
            </div>
            <span className="text-[11px] font-bold text-[var(--muted)] block mt-0.5">
              {isAuthenticated
                ? `حساب فعال: ${authEmail}`
                : "برای همگام‌سازی ابری بین دستگاه‌ها (اختیاری)"}
            </span>
          </div>
        </div>

        {isAuthenticated ? (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-300 dark:border-emerald-800">
            <div className="flex items-center gap-2">
              <Check size={16} className="text-emerald-600" />
              <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">{authEmail}</span>
            </div>
            <NeoButton
              variant="danger"
              size="sm"
              onClick={onDisconnectAuth}
              className="text-xs font-bold"
            >
              قطع اتصال
            </NeoButton>
          </div>
        ) : (
          <>
            {/* Auth Tabs */}
            <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line-strong)]">
              <button
                type="button"
                onClick={() => onAuthTabChange("google")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  authTab === "google"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs border border-[var(--line)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>ورود با گوگل</span>
              </button>
              <button
                type="button"
                onClick={() => onAuthTabChange("email")}
                className={cn(
                  "flex-1 py-2.5 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                  authTab === "email"
                    ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs border border-[var(--line)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                <Mail size={14} className="shrink-0" />
                <span>ایمیل و رمز عبور</span>
              </button>
            </div>

            {/* Email+Password Tab */}
            {authTab === "email" && (
              <form onSubmit={onEmailAuth} className="space-y-3">
                <p className="text-[11px] font-bold text-[var(--muted)] leading-relaxed">
                  ایمیل و رمز عبور وارد کنید. اگر حساب دارید وارد می‌شوید، در غیر این صورت حساب جدید ساخته می‌شود.
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-black text-[var(--ink)]">آدرس ایمیل</label>
                  <input
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => onEmailInputChange(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--ink)] text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-[var(--testino-orange)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black text-[var(--ink)]">رمز عبور</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={passwordInput}
                      onChange={(e) => onPasswordInputChange(e.target.value)}
                      placeholder="••••••"
                      className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--ink)] text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-[var(--testino-orange)] pl-10"
                    />
                    <button
                      type="button"
                      onClick={onToggleShowPassword}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                      title={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <span className="block text-[10px] font-bold text-[var(--muted)]">حداقل ۶ کاراکتر</span>
                </div>
                <NeoButton
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isAuthLoading}
                  isLoading={isAuthLoading}
                  icon={ArrowLeft}
                  className="w-full text-xs sm:text-sm font-black"
                >
                  ادامه
                </NeoButton>
              </form>
            )}

            {/* Google Tab */}
            {authTab === "google" && (
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-[var(--muted)] leading-relaxed">
                  با حساب گوگل خود مستقیماً وارد شوید. اگر حساب جدیدی باشد، به‌طور خودکار ثبت‌نام انجام می‌شود.
                </p>
                <button
                  type="button"
                  onClick={onGoogleSignIn}
                  disabled={isAuthLoading}
                  className="py-2.5 px-4 w-full rounded-xl bg-[var(--surface)] dark:bg-slate-900 border-2 border-[var(--line)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--line)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isAuthLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-[var(--testino-orange)]" />
                      <span>در حال انتقال به گوگل…</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" viewBox="0 0 24 24">
                        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                      </svg>
                      <span>ورود با حساب گوگل</span>
                    </>
                  )}
                </button>

                {showManualCodeInput && (
                  <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-2 mt-2">
                    <label className="text-[11px] font-bold text-[var(--ink)] block">
                      اگر مرورگر خودکار به برنامه بازنگشت، آدرس یا کد صفحه مرورگر را اینجا قرار دهید:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={manualOAuthCode}
                        onChange={(e) => onManualOAuthCodeChange(e.target.value)}
                        placeholder="http://localhost:3000/?code=... یا کد"
                        className="flex-1 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-1.5 text-xs font-mono text-[var(--ink)]"
                        dir="ltr"
                      />
                      <NeoButton
                        variant="primary"
                        size="sm"
                        onClick={onManualOAuthSubmit}
                        disabled={isManualExchanging || !manualOAuthCode.trim()}
                        isLoading={isManualExchanging}
                        className="text-xs font-black"
                      >
                        تأیید
                      </NeoButton>
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}

        <p className="text-[10px] text-[var(--muted)] font-bold pt-2 border-t border-[var(--line-strong)]/20">
          اتصال به حساب کاملاً اختیاری است. تستیونو به‌صورت ۱۰۰٪ آفلاین و مستقل روی دستگاه شما کار می‌کند.
        </p>
      </div>
    </div>
  );
}
