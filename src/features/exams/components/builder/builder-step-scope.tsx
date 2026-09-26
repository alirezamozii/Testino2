"use client";

import React from "react";
import { BookOpen, Check, ChevronDown, ChevronUp, FolderTree, Layers } from "lucide-react";
import { cn } from "@/lib/utils";
import { isSameSubject } from "@/features/questions/domain/subject-registry";

export interface SubjectTaxonomyData {
  total: number;
  chapters: Map<string, { total: number; topics: Map<string, number> }>;
}

export interface BuilderStepScopeProps {
  scopeMode: "all" | "custom";
  onScopeModeChange: (mode: "all" | "custom") => void;
  selectedSubjects: string[];
  availableCount: number;
  allPublished: Array<{ subject: string }>;
  taxonomy: Map<string, SubjectTaxonomyData>;
  expandedSubject: string | null;
  onSetExpandedSubject: (subject: string | null) => void;
  selectedChapters: string[];
  onToggleChapter: (chapter: string) => void;
  expandedChapters: string[];
  onToggleChapterDropdown: (chKey: string) => void;
  selectedTopics: string[];
  onToggleTopic: (topic: string) => void;
  onSelectAllTopicsInChapter: (topics: string[]) => void;
  onDeselectAllTopicsInChapter: (topics: string[]) => void;
}

export function BuilderStepScope({
  scopeMode,
  onScopeModeChange,
  selectedSubjects,
  availableCount,
  allPublished,
  taxonomy,
  expandedSubject,
  onSetExpandedSubject,
  selectedChapters,
  onToggleChapter,
  expandedChapters,
  onToggleChapterDropdown,
  selectedTopics,
  onToggleTopic,
  onSelectAllTopicsInChapter,
  onDeselectAllTopicsInChapter,
}: BuilderStepScopeProps) {
  return (
    <div className="space-y-4">
      <div className="text-right space-y-1">
        <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
          مرحله ۲ از ۵
        </span>
        <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">سکشن‌بندی و سرفصل‌ها</h2>
        <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">
          مشخص کنید از کدام فصول و مباحث هر درس سوال طرح شود.
        </p>
      </div>

      {/* Mode Switcher: All vs Custom */}
      <div className="flex flex-col sm:flex-row items-stretch gap-2 p-1.5 bg-[var(--surface-cream)] rounded-2xl border-2 border-[var(--line-strong)]">
        <button
          type="button"
          onClick={() => onScopeModeChange("all")}
          className={cn(
            "flex-1 py-2.5 px-3 text-xs font-black rounded-xl transition-all border-2 flex items-center justify-center gap-1.5 text-center cursor-pointer",
            scopeMode === "all"
              ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          <Layers size={15} className="shrink-0" />
          <span>کل مباحث تمام درس‌های انتخابی ({availableCount} سؤال)</span>
        </button>

        <button
          type="button"
          onClick={() => onScopeModeChange("custom")}
          className={cn(
            "flex-1 py-2.5 px-3 text-xs font-black rounded-xl transition-all border-2 flex items-center justify-center gap-1.5 text-center cursor-pointer",
            scopeMode === "custom"
              ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          <FolderTree size={15} className="shrink-0" />
          <span>انتخاب سفارشی فصول و مباحث</span>
        </button>
      </div>

      {/* Scope Mode = All */}
      {scopeMode === "all" && (
        <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-right space-y-2">
          <span className="text-xs font-black text-[var(--ink)] block">دروس فعال در این آزمون:</span>
          <div className="flex flex-wrap gap-2 pt-1">
            {selectedSubjects.map((s) => {
              const countS = allPublished.filter((q) => isSameSubject(q.subject, s)).length;
              return (
                <span
                  key={s}
                  className="px-3 py-1 rounded-xl bg-[var(--surface)] border-2 border-[var(--line-strong)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1.5"
                >
                  <span>{s}</span>
                  <span className="text-[10px] text-[var(--muted)] font-bold">({countS} سؤال)</span>
                </span>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--muted)] font-bold pt-2">
            تمامی فصل‌ها و مباحث موجود در این دروس در آزمون حضور خواهند داشت.
          </p>
        </div>
      )}

      {/* Scope Mode = Custom: Hierarchical Subject Accordion */}
      {scopeMode === "custom" && (
        <div className="space-y-3 max-h-96 overflow-y-auto pr-0.5">
          {selectedSubjects.map((subjName) => {
            const sTax = taxonomy.get(subjName);
            if (!sTax) return null;
            const isExpanded = expandedSubject === subjName || selectedSubjects.length === 1;

            return (
              <div
                key={subjName}
                className="card-neo bg-[var(--surface)] border-2 border-[var(--line-strong)] overflow-hidden"
              >
                {/* Accordion Header */}
                <button
                  type="button"
                  onClick={() => onSetExpandedSubject(isExpanded ? null : subjName)}
                  className="w-full p-3.5 bg-[var(--surface-cream)] border-b-2 border-[var(--line-strong)] flex items-center justify-between text-right gap-2 cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <BookOpen size={16} className="text-[var(--brand-orange)] shrink-0" />
                    <strong className="text-xs sm:text-sm font-black text-[var(--ink)] truncate">{subjName}</strong>
                    <span className="text-[10px] font-bold text-[var(--muted)] shrink-0">({sTax.total} سؤال)</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] font-black text-[var(--muted)] whitespace-nowrap">
                      {sTax.chapters.size} فصل
                    </span>
                    {isExpanded ? <ChevronUp size={16} className="shrink-0" /> : <ChevronDown size={16} className="shrink-0" />}
                  </div>
                </button>

                {/* Accordion Content: Chapters & Topics */}
                {isExpanded && (
                  <div className="p-3.5 space-y-2.5">
                    {Array.from(sTax.chapters.entries()).map(([chName, chData]) => {
                      const chKey = `${subjName}::${chName}`;
                      const isChSelected = selectedChapters.includes(chName);
                      const isChDropdownOpen = expandedChapters.includes(chKey);
                      const topicList = Array.from(chData.topics.entries());
                      const hasTopics = topicList.length > 0;
                      const selectedTopicsInThisChapter = topicList.filter(([topName]) =>
                        selectedTopics.includes(topName)
                      );

                      return (
                        <div
                          key={chName}
                          className={cn(
                            "p-3 rounded-2xl border-2 transition-all space-y-2.5",
                            isChSelected
                              ? "bg-[var(--surface)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                              : "bg-[var(--surface-2)] border-[var(--line)]"
                          )}
                        >
                          {/* Main Chapter Row */}
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                            {/* Checkbox & Chapter Name */}
                            <button
                              type="button"
                              onClick={() => onToggleChapter(chName)}
                              className="flex items-start sm:items-center gap-2.5 text-right flex-1 min-w-0 cursor-pointer"
                            >
                              <div
                                className={cn(
                                  "w-5 h-5 rounded-lg border-2 border-[var(--line-strong)] flex items-center justify-center transition-all shrink-0 mt-0.5 sm:mt-0",
                                  isChSelected ? "bg-[var(--brand-orange)] text-white shadow-[1px_1px_0px_var(--neo-shadow)]" : "bg-[var(--surface)]"
                                )}
                              >
                                {isChSelected && <Check size={13} className="stroke-[3]" />}
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                                  {chName || "فصل بدون نام"}
                                </span>
                                <span className="text-[10px] text-[var(--muted)] font-bold block pt-0.5">
                                  {isChSelected ? (
                                    <strong className="text-[var(--brand-orange)] font-black">کل فصل انتخاب شد</strong>
                                  ) : (
                                    `${chData.total} سؤال`
                                  )}
                                  {hasTopics && ` • ${topicList.length} مبحث`}
                                </span>
                              </div>
                            </button>

                            {/* Right side controls: question count + dropdown button */}
                            <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-dashed border-[var(--line)]/50">
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)] whitespace-nowrap">
                                {chData.total} سؤال
                              </span>

                              {hasTopics && (
                                <button
                                  type="button"
                                  onClick={() => onToggleChapterDropdown(chKey)}
                                  className={cn(
                                    "px-2.5 py-1 rounded-xl border-2 text-[10px] sm:text-[11px] font-black transition-all flex items-center gap-1 cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]",
                                    isChDropdownOpen
                                      ? "bg-[var(--surface-3)] border-[var(--line-strong)] text-[var(--ink)]"
                                      : selectedTopicsInThisChapter.length > 0
                                      ? "bg-[var(--pastel-yellow)] border-[var(--line-strong)] text-[var(--ink-on-color)]"
                                      : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                                  )}
                                  title="مشاهده و انتخاب مباحث این فصل"
                                >
                                  <span>
                                    {selectedTopicsInThisChapter.length > 0
                                      ? `${selectedTopicsInThisChapter.length} از ${topicList.length} مبحث`
                                      : `مباحث (${topicList.length})`}
                                  </span>
                                  {isChDropdownOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Collapsible Topics Dropdown Panel */}
                          {hasTopics && isChDropdownOpen && (
                            <div className="pt-2.5 border-t-2 border-dashed border-[var(--line)] space-y-2">
                              <div className="flex items-center justify-between text-[11px] font-bold px-1">
                                <span className="text-[var(--muted)] text-[10px] sm:text-[11px]">
                                  {isChSelected ? (
                                    <span className="text-[var(--brand-orange)] font-black">
                                      کل فصل تیک خورده است. برای تمرین فقط یک مبحث، تیک فصل بالا را بردارید.
                                    </span>
                                  ) : (
                                    <span>مباحث مورد نظر را برای آزمون علامت بزنید:</span>
                                  )}
                                </span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => onSelectAllTopicsInChapter(topicList.map(([t]) => t))}
                                    className="text-[10px] font-black text-[var(--brand-blue)] hover:underline cursor-pointer"
                                  >
                                    انتخاب همه
                                  </button>
                                  <span className="text-[var(--muted)]">•</span>
                                  <button
                                    type="button"
                                    onClick={() => onDeselectAllTopicsInChapter(topicList.map(([t]) => t))}
                                    className="text-[10px] font-black text-[var(--muted)] hover:text-[var(--danger)] cursor-pointer"
                                  >
                                    لغو
                                  </button>
                                </div>
                              </div>

                              {/* Topics Sub-grid */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {topicList.map(([topName, topCount]) => {
                                  const isTopSelected = selectedTopics.includes(topName);
                                  return (
                                    <button
                                      key={topName}
                                      type="button"
                                      onClick={() => onToggleTopic(topName)}
                                      className={cn(
                                        "p-2 sm:p-2.5 rounded-xl border-2 text-right transition-all flex items-center justify-between gap-2 text-xs cursor-pointer",
                                        isTopSelected
                                          ? "bg-[var(--pastel-yellow)] border-[var(--line-strong)] text-[var(--ink-on-color)] font-black shadow-[1px_1px_0px_var(--neo-shadow)]"
                                          : "bg-[var(--surface)] border-[var(--line)] text-[var(--ink)] font-bold hover:border-[var(--line-strong)]"
                                      )}
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <div
                                          className={cn(
                                            "w-4 h-4 rounded-md border-2 border-[var(--line-strong)] flex items-center justify-center transition-all shrink-0",
                                            isTopSelected ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface)]"
                                          )}
                                        >
                                          {isTopSelected && <Check size={10} className="stroke-[3]" />}
                                        </div>
                                        <span className="text-xs font-bold text-[var(--ink)] leading-snug break-words flex-1">
                                          {topName}
                                        </span>
                                      </div>
                                      <span className="text-[10px] text-[var(--muted)] font-black shrink-0 whitespace-nowrap">
                                        {topCount} سؤال
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
