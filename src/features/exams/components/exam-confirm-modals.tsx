"use client";

import React from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, Pause, Trash2 } from "lucide-react";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface FinishConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  unansweredCount: number;
  isFinishing: boolean;
  error?: string;
  onPauseAndExit: () => void;
  onFinalFinish: () => void;
  onSwitchToAbandon: () => void;
}

export function FinishConfirmModal({
  isOpen,
  onClose,
  unansweredCount,
  isFinishing,
  error,
  onPauseAndExit,
  onFinalFinish,
  onSwitchToAbandon,
}: FinishConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="card-neo max-w-md mx-auto p-6 bg-[var(--surface)] space-y-4 text-center animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="finish-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
          <AlertCircle size={28} />
        </div>
        <h2 id="finish-title" className="text-lg font-black text-[var(--ink)]">
          تعیین وضعیت پایان آزمون
        </h2>

        <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
          {unansweredCount > 0
            ? `${unansweredCount.toLocaleString("fa-IR")} سؤال بی‌پاسخ مانده است. نحوهٔ ثبت جلسه را انتخاب کنید:`
            : "به تمام سؤالات این آزمون پاسخ داده‌اید. نحوهٔ ثبت جلسه را انتخاب کنید:"}
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold text-right">
            {error}
          </div>
        )}

        <div className="space-y-3 pt-1 text-right">
          {/* Option 1: Pause and Resume Later */}
          <button
            type="button"
            className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-cream)] text-[var(--ink)] shadow-[2.5px_2.5px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
            disabled={isFinishing}
            onClick={onPauseAndExit}
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 shadow-[1px_1px_0px_var(--neo-shadow)]">
              <Pause size={18} className="text-[var(--ink)]" />
            </div>
            <div className="flex-1 min-w-0">
              <strong className="block text-xs font-black text-[var(--ink)]">
                ذخیره و خروج موقت (ادامه بعداً)
              </strong>
              <span className="text-[11px] text-[var(--muted)] font-medium leading-relaxed block mt-0.5 text-pretty">
                آزمون ذخیره می‌شود و بعداً از همین سؤال ادامه می‌دهی.
              </span>
            </div>
          </button>

          {/* Option 2: Final submit */}
          <button
            type="button"
            className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-orange)] text-white shadow-[2.5px_2.5px_0px_var(--neo-shadow)] hover:brightness-105 active:translate-x-[1px] active:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
            disabled={isFinishing}
            onClick={onFinalFinish}
          >
            <div className="w-10 h-10 rounded-xl bg-white/20 border-2 border-white/60 flex items-center justify-center shrink-0 text-white shadow-[1px_1px_0px_rgba(0,0,0,0.15)]">
              {isFinishing ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            </div>
            <div className="flex-1 min-w-0">
              <strong className="block text-xs font-black text-white">
                پایان قطعی و مشاهده کارنامه
              </strong>
              <span className="text-[11px] text-white/90 font-medium leading-relaxed block mt-0.5 text-pretty">
                درصد و ترازت بلافاصله محاسبه و در کارنامه ثبت می‌شود.
              </span>
            </div>
          </button>

          {/* Option 3: Abandon without saving */}
          <button
            type="button"
            className="w-full p-3.5 rounded-2xl border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 shadow-[2.5px_2.5px_0px_#f43f5e] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
            disabled={isFinishing}
            onClick={onSwitchToAbandon}
          >
            <div className="w-10 h-10 rounded-xl bg-rose-200 dark:bg-rose-900/60 border-2 border-rose-400 text-rose-700 dark:text-rose-300 flex items-center justify-center shrink-0 shadow-[1px_1px_0px_#f43f5e]">
              <Trash2 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <strong className="block text-xs font-black text-rose-700 dark:text-rose-300">
                انصراف و حذف کامل آزمون
              </strong>
              <span className="text-[11px] text-rose-600/90 dark:text-rose-400/90 font-medium leading-relaxed block mt-0.5 text-pretty">
                این جلسه لغو می‌شود و در آمار و کارنامه‌ها محاسبه نخواهد شد.
              </span>
            </div>
          </button>
        </div>

        <NeoButton variant="surface" size="sm" className="w-full text-xs font-black mt-2" onClick={onClose}>
          بازگشت به آزمون
        </NeoButton>
      </section>
    </div>
  );
}

export interface AbandonConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAbandoning: boolean;
  error?: string;
  onConfirmAbandon: () => void;
}

export function AbandonConfirmModal({
  isOpen,
  onClose,
  isAbandoning,
  error,
  onConfirmAbandon,
}: AbandonConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
      onMouseDown={() => !isAbandoning && onClose()}
    >
      <section
        className="card-neo max-w-sm mx-auto p-6 bg-[var(--surface)] space-y-4 text-center animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="abandon-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 border-2 border-[var(--line-strong)] flex items-center justify-center text-rose-600">
          <AlertTriangle size={28} />
        </div>
        <h2 id="abandon-title" className="text-lg font-black text-[var(--ink)]">
          آیا از انصراف مطمئن هستید؟
        </h2>
        <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
          با انصراف از آزمون، هیچ پاسخی ثبت نمی‌شود، درصدی محاسبه نخواهد شد و این آزمون به طور کامل حذف می‌گردد.
        </p>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold text-right">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2 pt-2">
          <NeoButton
            variant="surface"
            size="md"
            className="flex-1 text-xs font-black"
            disabled={isAbandoning}
            onClick={onClose}
          >
            انصراف نمی‌دهم
          </NeoButton>
          <NeoButton
            variant="danger"
            size="md"
            className="flex-1 text-xs font-black"
            isLoading={isAbandoning}
            onClick={onConfirmAbandon}
          >
            بله، حذف کن
          </NeoButton>
        </div>
      </section>
    </div>
  );
}
