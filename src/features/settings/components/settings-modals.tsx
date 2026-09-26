"use client";

import React from "react";
import { AlertTriangle, RefreshCw, Trash2 } from "lucide-react";
import { APP_BUILD, APP_VERSION } from "@/config/version";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface SettingsAboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  checkingUpdate: boolean;
  onCheckUpdate: () => void;
  updateFeedback: string;
}

export function SettingsAboutModal({
  isOpen,
  onClose,
  checkingUpdate,
  onCheckUpdate,
  updateFeedback,
}: SettingsAboutModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop animate-in fade-in" onClick={onClose}>
      <div
        className="card-neo relative p-6 max-w-sm w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center space-y-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="لوگوی تستینو"
            className="w-20 h-20 object-contain drop-shadow-md"
          />
          <div className="flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/name.png"
              alt="تستینو Testino"
              className="h-9 w-auto object-contain dark:hidden"
            />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/name-dark.png"
              alt="تستینو Testino"
              className="h-9 w-auto object-contain hidden dark:block"
            />
          </div>
          <p className="text-xs text-[var(--muted)] font-bold">
            بانک هوشمند سؤال و موتور مرور آفلاین
          </p>
          <div className="w-full py-3 px-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-right space-y-2.5 text-xs font-bold shadow-[2px_2px_0px_var(--neo-shadow)]">
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted)]">نسخه:</span>
              <strong className="font-black text-[var(--ink)]">v{APP_VERSION} (بیلد {APP_BUILD})</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted)]">موتور ذخیره‌سازی:</span>
              <strong className="font-black text-emerald-600 dark:text-emerald-400">SQLite WASM (OPFS)</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-[var(--muted)]">شعار:</span>
              <strong className="font-black text-[var(--testino-orange)]">آزمون امروز، موفقیت فردا</strong>
            </div>

            {/* Update Checker Button */}
            <div className="pt-2 border-t border-[var(--line-strong)] space-y-2">
              <button
                type="button"
                onClick={onCheckUpdate}
                disabled={checkingUpdate}
                className="w-full py-2 px-3 rounded-xl bg-[var(--surface)] text-[var(--ink)] border-2 border-[var(--line-strong)] font-black text-xs flex items-center justify-center gap-2 hover:bg-[var(--surface-2)] active:translate-x-0.5 active:translate-y-0.5 transition-all shadow-[2px_2px_0px_var(--neo-shadow)] disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? "animate-spin text-[var(--accent)]" : ""}`} />
                <span>{checkingUpdate ? "در حال بررسی سرور..." : "بررسی به‌روزرسانی"}</span>
              </button>

              {updateFeedback && (
                <div className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] text-[11px] font-bold text-center text-[var(--ink)]">
                  {updateFeedback}
                </div>
              )}
            </div>
          </div>
        </div>
        <NeoButton
          type="button"
          variant="primary"
          size="md"
          onClick={onClose}
          className="w-full text-xs font-black"
        >
          بستن
        </NeoButton>
      </div>
    </div>
  );
}

export interface SettingsDeleteDataModalProps {
  isOpen: boolean;
  onClose: () => void;
  isDeleting: boolean;
  onConfirmDelete: () => void;
}

export function SettingsDeleteDataModal({
  isOpen,
  onClose,
  isDeleting,
  onConfirmDelete,
}: SettingsDeleteDataModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop animate-in fade-in" onClick={() => !isDeleting && onClose()}>
      <div
        className="card-neo relative p-6 max-w-sm w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-red-500 shadow-[6px_6px_0px_#EF4444]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-red-100 dark:bg-red-950/60 border-2 border-red-500 flex items-center justify-center text-red-600 shadow-[2px_2px_0px_#EF4444]">
            <AlertTriangle size={28} />
          </div>
          <h3 className="text-base font-black text-[var(--ink)]">
            آیا از حذف تمام داده‌ها مطمئن هستید؟
          </h3>
          <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
            تمام سؤالات، پاسخ‌ها، کارنامه‌ها، تاریخچه آزمون‌ها و پروفایل کاربری به‌طور دائم از این دستگاه پاک خواهند شد و این عملیات غیرقابل بازگشت است.
          </p>
        </div>

        <div className="flex flex-col gap-2 pt-2">
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={isDeleting}
            className="w-full py-3 rounded-2xl border-2 border-[var(--line-strong)] bg-red-600 hover:bg-red-700 text-white font-black text-xs sm:text-sm shadow-[3px_3px_0px_var(--neo-shadow)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Trash2 size={16} />
            <span>{isDeleting ? "در حال پاک‌سازی..." : "بله، همه داده‌ها را پاک کن"}</span>
          </button>
          <NeoButton
            type="button"
            variant="surface"
            size="md"
            onClick={onClose}
            disabled={isDeleting}
            className="w-full text-xs font-black"
          >
            انصراف
          </NeoButton>
        </div>
      </div>
    </div>
  );
}
