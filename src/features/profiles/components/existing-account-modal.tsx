"use client";

import React from "react";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface ExistingAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingOwnerName: string;
  onContinueExisting: () => void;
  onCreateNewLocal: () => void;
}

export function ExistingAccountModal({
  isOpen,
  onClose,
  existingOwnerName,
  onContinueExisting,
  onCreateNewLocal,
}: ExistingAccountModalProps) {
  if (!isOpen) return null;

  return (
    <div className="dialog-backdrop animate-in fade-in" onClick={onClose}>
      <div
        className="card-neo relative p-6 max-w-sm w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-black text-[var(--ink)] text-center">
          حساب قبلی شناسایی شد
        </h3>
        <p className="text-xs font-bold text-[var(--muted)] text-center leading-relaxed">
          حساب «{existingOwnerName}» از قبل روی این دستگاه وجود دارد.
          می‌خواهید وارد همان شوید یا حساب جدید بسازید؟
        </p>
        <div className="flex flex-col gap-2">
          <NeoButton
            variant="primary"
            size="md"
            onClick={onContinueExisting}
            className="w-full text-xs font-black"
          >
            وارد حساب «{existingOwnerName}» شو
          </NeoButton>
          <NeoButton
            variant="surface"
            size="md"
            onClick={onCreateNewLocal}
            className="w-full text-xs font-black"
          >
            حساب جدید بساز
          </NeoButton>
        </div>
      </div>
    </div>
  );
}
