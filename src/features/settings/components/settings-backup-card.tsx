"use client";

import React from "react";
import { Download, Upload } from "lucide-react";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface SettingsBackupCardProps {
  backingUp: boolean;
  restoring: boolean;
  onExportAllData: () => void;
  onRestoreFile: (file: File) => void;
}

export function SettingsBackupCard({
  backingUp,
  restoring,
  onExportAllData,
  onRestoreFile,
}: SettingsBackupCardProps) {
  return (
    <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
          <Download size={18} />
        </div>
        <div>
          <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
            پشتیبان‌گیری و بازیابی داده‌ها (ZIP)
          </strong>
          <span className="text-[11px] text-[var(--muted)] font-bold">
            بسته کامل پروفایل، سؤالات، آزمون‌ها و تصاویر
          </span>
        </div>
      </div>

      <p className="text-xs font-bold text-[var(--muted)] leading-relaxed">
        فایل خروجی شامل کلیه اطلاعات پایگاه داده و تصاویر است که با رعایت کامل حریم خصوصی و بدون نشت توکن تهیه می‌شود.
      </p>

      <div className="space-y-2 pt-1">
        <NeoButton
          type="button"
          variant="blue"
          size="md"
          onClick={onExportAllData}
          disabled={backingUp || restoring}
          className="w-full text-xs font-black flex items-center justify-center gap-2"
        >
          <Download size={15} />
          <span>{backingUp ? "در حال تهیه پشتیبان…" : "دانلود فایل پشتیبان کامل (.testino)"}</span>
        </NeoButton>

        <label className="btn-neo-yellow w-full py-2.5 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 cursor-pointer">
          <Upload size={15} />
          <span>{restoring ? "در حال بازیابی اطلاعات…" : "بازیابی از فایل پشتیبان"}</span>
          <input
            type="file"
            accept=".testino,.zip,application/zip"
            className="hidden"
            disabled={backingUp || restoring}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRestoreFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    </div>
  );
}
