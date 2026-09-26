"use client";

import React from "react";
import { BookOpen, X } from "lucide-react";
import { extractOriginalQuestionNumber, type SessionView } from "@/database/app-database";
import { NeoButton } from "@/components/ui/neo-primitives";

export interface ExamSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  question: SessionView["questions"][number];
}

export function ExamSourceModal({ isOpen, onClose, question }: ExamSourceModalProps) {
  if (!isOpen) return null;

  const originalQNum = extractOriginalQuestionNumber(question.snapshot);

  return (
    <div
      className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="card-neo w-full max-w-md p-5 sm:p-6 space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
              <BookOpen size={16} />
            </div>
            <strong className="text-sm font-black text-[var(--ink)]">منبع و مشخصات سؤال</strong>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-xl border-2 border-[var(--line)] hover:border-[var(--line-strong)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] transition-all cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3 text-xs sm:text-sm font-medium">
          <div className="flex items-start justify-between p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)]">
            <span className="text-[var(--muted)] font-bold">عنوان منبع:</span>
            <strong className="font-black text-[var(--ink)] text-right max-w-[240px]">
              {question.snapshot.source?.title || "کنکور سراسری یا بانک سوالات"}
            </strong>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex flex-col gap-1">
              <span className="text-[10px] text-[var(--muted)] font-bold">نوع منبع:</span>
              <strong className="font-black text-[var(--ink)] text-xs">
                {question.snapshot.source?.kind === "EXAM"
                  ? "آزمون سراسری (کنکور)"
                  : question.snapshot.source?.kind === "AI"
                  ? "طراحی تألیفی استاندارد"
                  : "کتاب تست مرجع و استاندارد"}
              </strong>
            </div>

            <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex flex-col gap-1">
              <span className="text-[10px] text-[var(--muted)] font-bold">سال برگزاری:</span>
              <strong className="font-black text-[var(--ink)] text-xs font-mono">
                {question.snapshot.source?.year ? String(question.snapshot.source.year) : "نامشخص"}
              </strong>
            </div>
          </div>

          {originalQNum && (
            <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-between">
              <span className="text-[10px] sm:text-xs text-[var(--muted)] font-bold">شماره در کنکور / آزمون اصلی:</span>
              <strong className="font-black text-[var(--ink)] text-xs sm:text-sm font-mono">
                سؤال {originalQNum} کنکور
              </strong>
            </div>
          )}

          <div className="p-2.5 rounded-xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-[11px] font-bold text-[var(--ink)] space-y-1">
            <div>
              <span className="text-[var(--muted)]">درس: </span>
              <span className="font-black">{question.snapshot.subject}</span>
            </div>
            {question.snapshot.chapter && (
              <div>
                <span className="text-[var(--muted)]">فصل: </span>
                <span className="font-black">{question.snapshot.chapter}</span>
              </div>
            )}
            {question.snapshot.topic && (
              <div>
                <span className="text-[var(--muted)]">مبحث: </span>
                <span className="font-black">{question.snapshot.topic}</span>
              </div>
            )}
          </div>
        </div>

        <NeoButton
          variant="primary"
          size="md"
          onClick={onClose}
          className="w-full text-xs font-black"
        >
          متوجه شدم
        </NeoButton>
      </div>
    </div>
  );
}
