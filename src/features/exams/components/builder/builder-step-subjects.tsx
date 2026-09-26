"use client";

import React from "react";
import { BookOpen, Check, CheckSquare, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSameSubject } from "@/features/questions/domain/subject-registry";
import { NeoInput } from "@/components/ui/neo-primitives";

export interface BuilderStepSubjectsProps {
  subjectSearch: string;
  onSubjectSearchChange: (val: string) => void;
  selectedSubjects: string[];
  onToggleSubject: (subject: string) => void;
  onToggleAllSubjects: () => void;
  isAllSubjectsSelected: boolean;
  filteredSubjectList: string[];
  totalPublishedCount: number;
  subjectCounts: Record<string, number>;
}

const TILE_COLORS = [
  "bg-[var(--pastel-yellow)]",
  "bg-[var(--pastel-green)]",
  "bg-[var(--pastel-orange-soft)]",
  "bg-[var(--pastel-blue)]",
];

export function BuilderStepSubjects({
  subjectSearch,
  onSubjectSearchChange,
  selectedSubjects,
  onToggleSubject,
  onToggleAllSubjects,
  isAllSubjectsSelected,
  filteredSubjectList,
  totalPublishedCount,
  subjectCounts,
}: BuilderStepSubjectsProps) {
  return (
    <div className="space-y-4">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
          مرحله ۱ از ۵
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">انتخاب درس‌ها</h2>
        <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">
          یک یا چند درس را انتخاب کنید.
        </p>
      </div>

      {/* Top controls: Search & Select All */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch">
        <div className="relative flex-1">
          <NeoInput
            type="text"
            value={subjectSearch}
            onChange={(e) => onSubjectSearchChange(e.target.value)}
            placeholder="جستجوی نام درس..."
            className="w-full pr-10 pl-4 py-3 text-xs sm:text-sm font-black"
          />
          <BookOpen size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none" />
        </div>

        {/* Master Toggle: All Subjects */}
        <button
          type="button"
          onClick={onToggleAllSubjects}
          className={cn(
            "py-3 px-4 rounded-2xl border-2 text-xs font-black transition-all flex items-center justify-center gap-2 shadow-[2px_2px_0px_var(--neo-shadow)] cursor-pointer",
            isAllSubjectsSelected
              ? "bg-[var(--brand-green)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
              : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line-strong)] hover:bg-[var(--surface)]"
          )}
        >
          {isAllSubjectsSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          <span>{isAllSubjectsSelected ? "لغو انتخاب همه" : "انتخاب تمام درس‌ها (جامع)"}</span>
        </button>
      </div>

      {/* Selected Count Indicator */}
      <div className="flex items-center justify-between px-1 text-xs font-bold text-[var(--muted)]">
        <span>
          {selectedSubjects.length === 0 ? (
            <span className="text-[var(--danger)] font-black">هیچ درسی انتخاب نشده است!</span>
          ) : (
            <span>
              <strong className="text-[var(--brand-orange)] font-black">{selectedSubjects.length}</strong> درس انتخاب شده
            </span>
          )}
        </span>
        <span>{totalPublishedCount} سؤال کل در بانک</span>
      </div>

      {/* Multi-Select Subjects Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pt-1 pr-0.5">
        {filteredSubjectList.map((s, idx) => {
          const isSelected = selectedSubjects.includes(s);
          const countForSubject = subjectCounts[s] ?? 0;
          const tileColor = TILE_COLORS[idx % TILE_COLORS.length];

          return (
            <button
              key={s}
              type="button"
              onClick={() => onToggleSubject(s)}
              className={cn(
                "w-full p-3.5 rounded-2xl border-2 text-right transition-all flex items-center justify-between gap-3 cursor-pointer",
                isSelected
                  ? "border-[var(--line-strong)] bg-[var(--surface)] shadow-[3px_3px_0px_var(--neo-shadow)] font-black"
                  : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)] text-[var(--muted)] font-bold opacity-80"
              )}
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center font-black text-sm",
                    tileColor
                  )}
                >
                  {idx + 1}
                </div>
                <div>
                  <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">{s}</strong>
                  <span className="text-[10px] sm:text-xs text-[var(--muted)] font-bold">
                    {countForSubject} سؤال در بانک
                  </span>
                </div>
              </div>

              {/* Checkbox Icon */}
              <div
                className={cn(
                  "w-6 h-6 rounded-lg border-2 border-[var(--line-strong)] flex items-center justify-center transition-all",
                  isSelected ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface)] text-transparent"
                )}
              >
                <Check size={14} className="stroke-[3]" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
