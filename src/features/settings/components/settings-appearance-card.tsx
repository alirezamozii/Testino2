"use client";

import React from "react";
import Link from "next/link";
import {
  Activity,
  Calculator,
  Check,
  ChevronLeft,
  HardDrive,
  Moon,
  Palette,
  RotateCcw,
  Sun,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ACCENT_OPTIONS } from "@/providers/theme-provider";

export interface SettingsAppearanceCardProps {
  theme: string;
  onSetTheme: (theme: "light" | "dark") => void;
  accent: string;
  onSetAccent: (accent: string) => void;
  hasPenalty: boolean;
  onToggleNegativeScore: () => void;
  canTogglePenalty: boolean;
  persisted: boolean | null;
  onRequestPersistence: () => void;
  onOpenAbout: () => void;
  onDeleteConfirm: () => void;
}

export function SettingsAppearanceCard({
  theme,
  onSetTheme,
  accent,
  onSetAccent,
  hasPenalty,
  onToggleNegativeScore,
  canTogglePenalty,
  persisted,
  onRequestPersistence,
  onOpenAbout,
  onDeleteConfirm,
}: SettingsAppearanceCardProps) {
  return (
    <>
      <div className="card-neo p-4 sm:p-5 rounded-3xl bg-[var(--surface)] divide-y-2 divide-[var(--line-strong)]/15">
        {/* Preference: Theme */}
        <div className="py-3.5 first:pt-1 flex flex-col sm:flex-row sm:items-center justify-between text-right gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              {theme === "dark" ? <Moon size={18} /> : <Sun size={18} />}
            </div>
            <div>
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                حالت نمایش رنگی
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                {theme === "dark"
                  ? "حالت شب نئوبروتال فعال است"
                  : "حالت روز (روشن و کاغذی گرم) فعال است"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-2)] rounded-2xl border-2 border-[var(--line-strong)] shrink-0">
            <button
              type="button"
              onClick={() => onSetTheme("light")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border cursor-pointer",
                theme === "light"
                  ? "bg-[var(--surface)] text-[var(--ink)] border-[var(--line-strong)] shadow-[1.5px_1.5px_0px_var(--neo-shadow)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              روز (کاغذی)
            </button>
            <button
              type="button"
              onClick={() => onSetTheme("dark")}
              className={cn(
                "px-3.5 py-1.5 rounded-xl text-xs font-black transition-all border cursor-pointer",
                theme === "dark"
                  ? "bg-[var(--surface)] text-[var(--ink)] border-[var(--line-strong)] shadow-[1.5px_1.5px_0px_var(--neo-shadow)]"
                  : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              شب (تیره)
            </button>
          </div>
        </div>

        {/* Preference: 10 Accent Colors */}
        <div className="py-3.5 flex flex-col gap-3 text-right">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
                <Palette size={18} />
              </div>
              <div>
                <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                  رنگ مکمل و تم برنامه (۱۰ رنگ)
                </span>
                <span className="text-[11px] text-[var(--muted)] font-bold">
                  رنگ ناوبری فعال، دکمه‌های اصلی و نشانگرها
                </span>
              </div>
            </div>
            <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line-strong)] text-[var(--ink)] shrink-0">
              {ACCENT_OPTIONS.find((a) => a.id === accent)?.name || "آبی کلاسیک"}
            </span>
          </div>

          {/* 10 Color Swatches */}
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-2 pt-1">
            {ACCENT_OPTIONS.map((opt) => {
              const isSelected = opt.id === accent;
              const displayColor = theme === "dark" ? opt.darkColor : opt.color;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onSetAccent(opt.id)}
                  title={opt.name}
                  className={cn(
                    "group flex flex-col items-center gap-1.5 p-1.5 rounded-2xl border-2 transition-all cursor-pointer relative",
                    isSelected
                      ? "border-[var(--line-strong)] bg-[var(--surface-2)] shadow-[2px_2px_0px_var(--neo-shadow)] scale-105"
                      : "border-transparent hover:bg-[var(--surface-2)]/60"
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center transition-transform group-hover:scale-110 shadow-xs"
                    style={{ backgroundColor: displayColor }}
                  >
                    {isSelected && (
                      <Check size={14} strokeWidth={3.5} className="text-white drop-shadow-xs" />
                    )}
                  </div>
                  <span className="text-[10px] font-bold text-[var(--ink-soft)] truncate max-w-full text-center leading-tight">
                    {opt.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Preference: Negative Score */}
        <div className="py-3.5 flex items-center justify-between text-right gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              <Calculator size={18} />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                نمرهٔ منفی آزمون (فرمول سازمان سنجش)
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                {hasPenalty
                  ? "فعال (فرمول رسمی سازمان سنجش: ۳ پاسخ غلط = ابطال ۱ پاسخ درست)"
                  : "غیرفعال (بدون کسر نمره منفی)"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onToggleNegativeScore}
            disabled={!canTogglePenalty}
            className={cn(
              "w-14 h-7 rounded-full border-2 border-[var(--line-strong)] transition-colors relative p-0.5 flex items-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 cursor-pointer",
              hasPenalty ? "bg-[var(--pastel-green)]" : "bg-[var(--surface-3)]"
            )}
            aria-pressed={hasPenalty}
          >
            <div
              className={cn(
                "w-5 h-5 rounded-full bg-[var(--surface)] dark:bg-slate-200 border border-[var(--line-strong)] shadow-xs transition-transform transform",
                hasPenalty ? "translate-x-[-26px]" : "translate-x-0"
              )}
            />
          </button>
        </div>

        {/* Preference: SQLite Permanence */}
        <div className="py-3.5 flex items-center justify-between text-right gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-100 dark:bg-sky-950/50 border-2 border-[var(--line-strong)] text-sky-700 dark:text-sky-300 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              <HardDrive size={18} />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                حافظهٔ دائمی روی دستگاه
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                {persisted ? "مرورگر اجازهٔ پاک‌سازی خودکار داده‌ها را ندارد" : "ذخیرهٔ استاندارد روی دستگاه"}
              </span>
            </div>
          </div>

          {persisted === false && (
            <button
              type="button"
              onClick={onRequestPersistence}
              className="btn-neo-yellow py-1.5 px-3 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 cursor-pointer"
            >
              ثبت دائم
            </button>
          )}
        </div>

        {/* Diagnostics & Benchmark Center */}
        <Link
          href="/diagnostics/"
          className="py-3.5 flex items-center justify-between text-right hover:bg-[var(--surface-2)] rounded-2xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/50 border-2 border-[var(--line-strong)] text-purple-700 dark:text-purple-300 flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              <Activity size={18} />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                پایش، عیب‌یابی و بنچمارک سرعت (FPS & DB)
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                آزمون میلی‌ثانیه‌ای دیتابیس، نرخ فریم، مصرف رم و لاگ باگ‌ها
              </span>
            </div>
          </div>
          <ChevronLeft size={18} className="text-[var(--muted)]" />
        </Link>

        {/* About Testino item */}
        <button
          type="button"
          onClick={onOpenAbout}
          className="py-3.5 last:pb-1 w-full flex items-center justify-between text-right hover:bg-[var(--surface-2)] rounded-2xl transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/50 border-2 border-[var(--line-strong)] flex items-center justify-center p-1.5 shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="لوگو" className="w-full h-full object-contain" />
            </div>
            <div>
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                درباره تستینو
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                نسخه ۱.۰ • بانک هوشمند و موتور مرور آفلاین
              </span>
            </div>
          </div>
          <ChevronLeft size={18} className="text-[var(--muted)]" />
        </button>
      </div>

      {/* Action CTAs */}
      <div className="space-y-3">
        <Link
          href="/onboarding/"
          className="card-neo w-full p-4 rounded-3xl bg-amber-50 dark:bg-amber-950/30 border-2 border-[var(--line-strong)] text-amber-800 dark:text-amber-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-amber-100 transition-colors shadow-[3px_3px_0px_var(--neo-shadow)]"
        >
          <RotateCcw size={18} />
          <span>راه‌اندازی مجدد پروفایل و درس‌ها</span>
        </Link>

        <button
          type="button"
          onClick={onDeleteConfirm}
          className="card-neo w-full p-4 rounded-3xl bg-red-50 dark:bg-red-950/30 border-2 border-red-400 text-red-700 dark:text-red-300 font-black text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-red-100 transition-colors shadow-[3px_3px_0px_#EF4444] cursor-pointer"
        >
          <Trash2 size={18} />
          <span>حذف تمام داده‌ها (ریست کامل برنامه)</span>
        </button>
      </div>
    </>
  );
}
