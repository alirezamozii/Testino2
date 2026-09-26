"use client";

import React from "react";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Layers,
  Link2,
  Plus,
  Target,
  Trash2,
  Unlink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseSafeInt, sanitizeIntegerInput } from "@/lib/number-utils";
import { SubjectAutocomplete } from "@/components/ui/subject-autocomplete";
import type { SubjectDisplayEntry } from "@/features/profiles/domain/score-groups";
import type { Profile } from "@/database/app-database";

export type ProfileSubject = Profile["subjects"][number];

export interface SettingsSubjectsCardProps {
  activeProfile: Profile;
  partitionedEntries: SubjectDisplayEntry<ProfileSubject>[];
  expandedGroups: Record<string, boolean>;
  onToggleGroup: (groupName: string) => void;
  draggedSubjectId: string | null;
  onSetDraggedSubjectId: (id: string | null) => void;
  dragOverTargetId: string | null;
  onSetDragOverTargetId: (id: string | null) => void;
  groupEditorFor: string | null;
  onSetGroupEditorFor: (id: string | null) => void;
  onMergeSubjects: (sourceId: string, targetId: string) => void;
  onUpdateSubject: (
    subjectId: string,
    field: "targetPercentage" | "coefficient" | "questionCount",
    value: number,
    previousValue: number
  ) => void;
  onUngroupSubject: (subjectId: string, subjectName: string) => void;
  onRemoveSubject: (subjectId: string, subjectName: string) => void;
  onUpdateScoreGroup: (subjectId: string, groupName: string, previousValue: string) => void;
  newSubjName: string;
  onNewSubjNameChange: (val: string) => void;
  newSubjQuestions: number;
  onNewSubjQuestionsChange: (val: number) => void;
  newSubjCoefficient: number;
  onNewSubjCoefficientChange: (val: number) => void;
  newSubjTarget: number;
  onNewSubjTargetChange: (val: number) => void;
  onAddSubject: (e: React.FormEvent) => void;
  subjectError: string;
}

export function SettingsSubjectsCard({
  activeProfile,
  partitionedEntries,
  expandedGroups,
  onToggleGroup,
  draggedSubjectId,
  onSetDraggedSubjectId,
  dragOverTargetId,
  onSetDragOverTargetId,
  groupEditorFor,
  onSetGroupEditorFor,
  onMergeSubjects,
  onUpdateSubject,
  onUngroupSubject,
  onRemoveSubject,
  onUpdateScoreGroup,
  newSubjName,
  onNewSubjNameChange,
  newSubjQuestions,
  onNewSubjQuestionsChange,
  newSubjCoefficient,
  onNewSubjCoefficientChange,
  newSubjTarget,
  onNewSubjTargetChange,
  onAddSubject,
  subjectError,
}: SettingsSubjectsCardProps) {
  return (
    <div className="card-neo p-5 space-y-4 rounded-3xl bg-[var(--surface)]">
      <div className="flex items-center justify-between border-b-2 border-[var(--line-strong)]/20 pb-3">
        <div className="flex items-center gap-2">
          <Target size={18} className="text-[var(--testino-orange)]" />
          <h3 className="text-sm font-black text-[var(--ink)]">
            اهداف و دروس من ({activeProfile.subjects.length} درس)
          </h3>
        </div>
        <span className="text-[11px] font-bold text-[var(--muted)]">ضریب و هدف</span>
      </div>

      {/* Subject List with Sleek Collapsible Groups & Compact Rows */}
      <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
        {partitionedEntries.map((entry) => {
          if (entry.type === "group") {
            const isDragTarget =
              dragOverTargetId && entry.subjects.some((s: ProfileSubject) => s.id === dragOverTargetId);
            const isExpanded = Boolean(expandedGroups[entry.groupName]);

            return (
              <div
                key={entry.groupName}
                onDragOver={(e) => {
                  e.preventDefault();
                  if (draggedSubjectId && !entry.subjects.some((s: ProfileSubject) => s.id === draggedSubjectId)) {
                    onSetDragOverTargetId(entry.subjects[0].id);
                  }
                }}
                onDragLeave={() => {
                  if (entry.subjects.some((s: ProfileSubject) => s.id === dragOverTargetId)) {
                    onSetDragOverTargetId(null);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedSubjectId && !entry.subjects.some((s: ProfileSubject) => s.id === draggedSubjectId)) {
                    onMergeSubjects(draggedSubjectId, entry.subjects[0].id);
                  }
                }}
                className={cn(
                  "rounded-2xl border-2 transition-all overflow-hidden",
                  isDragTarget
                    ? "border-sky-500 bg-sky-500/10 shadow-[3px_3px_0px_#0284c7] scale-[1.01]"
                    : "border-sky-600/30 dark:border-sky-500/25 bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                )}
              >
                {/* Group Header (Clickable Accordion) */}
                <div
                  onClick={() => onToggleGroup(entry.groupName)}
                  className="flex items-center justify-between p-3 bg-sky-50/50 dark:bg-sky-950/20 hover:bg-sky-100/60 dark:hover:bg-sky-950/40 cursor-pointer transition-colors select-none"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 flex items-center justify-center shrink-0">
                      <Layers size={14} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[9px] font-black text-sky-700 dark:text-sky-300 px-1.5 py-0.5 rounded bg-sky-100 dark:bg-sky-900/40 border border-sky-300/40 shrink-0">
                          گروه کنکوری
                        </span>
                        <strong className="text-xs font-black text-[var(--ink)] truncate">
                          {entry.groupName}
                        </strong>
                      </div>
                      <div className="text-[10px] font-bold text-[var(--muted)] flex items-center gap-2 mt-0.5">
                        <span>{entry.subjects.length} زیردرس</span>
                        <span>•</span>
                        <span>مجموع {entry.totalQuestions} تست</span>
                        <span>•</span>
                        <span className="text-[var(--brand-green)] font-black">
                          +{entry.correctValFormatted}٪
                        </span>
                        <span>•</span>
                        <span className="text-sky-600 dark:text-sky-400 font-black">
                          هدف: {entry.combinedTarget}٪
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Controls: Coefficient + Expand Arrow */}
                  <div
                    className="flex items-center gap-2 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="flex items-center gap-1 bg-[var(--surface)] px-2 py-1 rounded-xl border border-[var(--line-strong)]/20 shadow-sm">
                      <span className="text-[10px] font-bold text-[var(--muted)]">ضریب:</span>
                      <input
                        aria-label={`ضریب گروه ${entry.groupName}`}
                        type="text"
                        inputMode="numeric"
                        dir="ltr"
                        defaultValue={entry.coefficient}
                        onBlur={(event) => {
                          const val = parseSafeInt(event.currentTarget.value, entry.coefficient);
                          if (val !== entry.coefficient) {
                            onUpdateSubject(entry.subjects[0].id, "coefficient", val, entry.coefficient);
                          }
                        }}
                        className="w-8 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => onToggleGroup(entry.groupName)}
                      className="w-7 h-7 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/20 flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                      title={isExpanded ? "بستن گروه" : "باز کردن و مشاهده درس‌ها"}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </div>

                {/* Collapsible Sub-subjects Container */}
                {isExpanded && (
                  <div className="p-3 border-t border-sky-500/20 bg-[var(--surface-2)]/40 space-y-2 animate-in fade-in slide-in-from-top-2 duration-150">
                    {entry.subjects.map((sub: ProfileSubject) => {
                      const sharePct =
                        entry.totalQuestions > 0
                          ? Math.round(((sub.questionCount ?? 25) / entry.totalQuestions) * 100)
                          : 0;
                      return (
                        <div
                          key={sub.id}
                          className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/25 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-sm"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <span className="w-2 h-2 rounded-full bg-sky-500 shrink-0" />
                            <span className="text-xs font-black text-[var(--ink)] break-words">
                              {sub.name}
                            </span>
                            <span className="text-[10px] font-bold text-sky-700 dark:text-sky-300 px-1.5 py-0.2 rounded bg-sky-50 dark:bg-sky-950/40 border border-sky-200/50 shrink-0">
                              {sharePct}٪ سهم ({sub.questionCount ?? 25} تست)
                            </span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                            <div className="flex items-center gap-1.5 bg-[var(--surface-2)] px-2 py-1 rounded-lg border border-[var(--line-strong)]/20">
                              <span className="text-[10px] text-[var(--muted)] font-bold">تست:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                dir="ltr"
                                defaultValue={sub.questionCount ?? 25}
                                onBlur={(event) =>
                                  onUpdateSubject(
                                    sub.id,
                                    "questionCount",
                                    parseSafeInt(event.currentTarget.value, sub.questionCount ?? 25),
                                    sub.questionCount ?? 25
                                  )
                                }
                                className="w-10 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
                              />
                              <span className="text-[10px] text-[var(--muted)] font-bold mr-1">هدف:</span>
                              <input
                                type="text"
                                inputMode="numeric"
                                dir="ltr"
                                defaultValue={sub.targetPercentage}
                                onBlur={(event) =>
                                  onUpdateSubject(
                                    sub.id,
                                    "targetPercentage",
                                    parseSafeInt(event.currentTarget.value, sub.targetPercentage),
                                    sub.targetPercentage
                                  )
                                }
                                className="w-9 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
                              />
                              <span className="text-[10px] font-black text-[var(--muted)]">٪</span>
                            </div>

                            <button
                              type="button"
                              onClick={() => onUngroupSubject(sub.id, sub.name)}
                              className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg bg-[var(--surface-2)] text-[var(--muted)] hover:text-amber-600 border border-[var(--line-strong)]/20 transition-all cursor-pointer"
                              title="انفصال از گروه و تبدیل به درس مستقل"
                            >
                              <Unlink size={11} className="text-amber-500" />
                              <span>انفصال</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => onRemoveSubject(sub.id, sub.name)}
                              className="w-6 h-6 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors cursor-pointer"
                              title="حذف درس"
                            >
                              <Trash2 size={11} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }

          // Standalone Subject Entry
          const s = entry.subject;
          const isDraggingThis = draggedSubjectId === s.id;
          const isDragTarget = dragOverTargetId === s.id;
          const otherSubjects = activeProfile.subjects.filter((other: ProfileSubject) => other.id !== s.id);

          return (
            <div
              key={s.id}
              draggable={true}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", s.id);
                onSetDraggedSubjectId(s.id);
              }}
              onDragEnd={() => {
                onSetDraggedSubjectId(null);
                onSetDragOverTargetId(null);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (draggedSubjectId && draggedSubjectId !== s.id) {
                  onSetDragOverTargetId(s.id);
                }
              }}
              onDragLeave={() => {
                if (dragOverTargetId === s.id) {
                  onSetDragOverTargetId(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedSubjectId && draggedSubjectId !== s.id) {
                  onMergeSubjects(draggedSubjectId, s.id);
                }
              }}
              className={cn(
                "p-2.5 sm:p-3 rounded-2xl border-2 transition-all space-y-2",
                isDraggingThis && "opacity-40 border-dashed border-sky-400",
                isDragTarget
                  ? "border-sky-500 bg-sky-500/10 shadow-[3px_3px_0px_#0284c7] scale-[1.01]"
                  : "border-[var(--line-strong)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              )}
            >
              {/* Row 1: Subject Name + Drag Handle + Delete Button */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div
                    draggable={true}
                    onDragStart={(e) => {
                      e.stopPropagation();
                      e.dataTransfer.setData("text/plain", s.id);
                      e.dataTransfer.effectAllowed = "move";
                      onSetDraggedSubjectId(s.id);
                    }}
                    className="p-1 rounded-lg bg-[var(--surface)] hover:bg-sky-500 hover:text-white border border-[var(--line-strong)]/20 cursor-grab active:cursor-grabbing text-[var(--muted)] transition-colors shrink-0 select-none"
                    title="بکشید و روی درس دیگر رها کنید تا ادغام شوند"
                  >
                    <GripVertical size={14} />
                  </div>
                  <span className="w-2 h-2 rounded-full bg-[var(--testino-orange)] shrink-0" />
                  <strong className="font-black text-sm text-[var(--ink)] break-words">
                    {s.name}
                  </strong>
                </div>

                <button
                  type="button"
                  onClick={() => onRemoveSubject(s.id, s.name)}
                  className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors shrink-0 cursor-pointer"
                  title="حذف درس"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Row 2: Metrics Inputs + Sanjesh Formula Badges + Merge Link */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[var(--line-strong)]/15">
                <div className="flex items-center gap-1.5 bg-[var(--surface)] px-2.5 py-1 rounded-xl border border-[var(--line-strong)]/20 shadow-sm text-xs font-bold">
                  <span className="text-[var(--muted)] text-[11px]">تست:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    defaultValue={entry.totalQuestions}
                    onBlur={(event) =>
                      onUpdateSubject(
                        s.id,
                        "questionCount",
                        parseSafeInt(event.currentTarget.value, entry.totalQuestions),
                        entry.totalQuestions
                      )
                    }
                    className="w-9 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
                    title="تعداد سؤال"
                  />
                  <span className="text-[var(--muted)] text-[11px] mr-1">ضریب:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    defaultValue={s.coefficient}
                    onBlur={(event) =>
                      onUpdateSubject(
                        s.id,
                        "coefficient",
                        parseSafeInt(event.currentTarget.value, s.coefficient),
                        s.coefficient
                      )
                    }
                    className="w-8 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
                    title="ضریب درس"
                  />
                  <span className="text-[var(--muted)] text-[11px] mr-1">هدف:</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    defaultValue={s.targetPercentage}
                    onBlur={(event) =>
                      onUpdateSubject(
                        s.id,
                        "targetPercentage",
                        parseSafeInt(event.currentTarget.value, s.targetPercentage),
                        s.targetPercentage
                      )
                    }
                    className="w-9 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
                    title="درصد هدف"
                  />
                  <span className="text-[var(--muted)] font-black text-[11px]">٪</span>
                </div>

                <div className="flex items-center gap-2 text-[10px] font-bold">
                  <span className="text-[var(--brand-green)] font-black" dir="ltr">
                    +{entry.correctValFormatted}٪
                  </span>
                  <span className="text-red-500 font-black" dir="ltr">
                    -{entry.wrongValFormatted}٪
                  </span>
                </div>

                {groupEditorFor === s.id ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 w-full pt-1.5 border-t border-[var(--line-strong)]/10">
                    <label className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] flex-1">
                      <span>گروه مشترک:</span>
                      <input
                        aria-label={`گروه مشترک ${s.name}`}
                        type="text"
                        defaultValue={s.scoreGroup ?? ""}
                        onBlur={(event) =>
                          onUpdateScoreGroup(s.id, event.currentTarget.value.trim(), s.scoreGroup ?? "")
                        }
                        placeholder="مثلاً: مدیریت یا اقتصاد"
                        className="min-w-0 flex-1 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-lg px-2 py-1 text-xs font-bold text-[var(--ink)]"
                      />
                    </label>
                    {otherSubjects.length > 0 && (
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-[10px] font-bold text-[var(--muted)]">یا ادغام با:</span>
                        {otherSubjects.slice(0, 3).map((other: ProfileSubject) => (
                          <button
                            key={other.id}
                            type="button"
                            onClick={() => {
                              onMergeSubjects(s.id, other.id);
                              onSetGroupEditorFor(null);
                            }}
                            className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-50 dark:bg-sky-950/50 text-sky-700 dark:text-sky-300 border border-sky-300 hover:bg-sky-500 hover:text-white transition-colors cursor-pointer"
                          >
                            {other.name}
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onSetGroupEditorFor(null)}
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--ink)] self-end sm:self-auto cursor-pointer"
                    >
                      بستن
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => onSetGroupEditorFor(s.id)}
                    className="inline-flex items-center gap-1 text-[10px] font-bold text-[var(--muted)] hover:text-sky-600 transition-colors cursor-pointer"
                    aria-label={`گروه مشترک با درس دیگر برای ${s.name}`}
                  >
                    <Link2 size={11} className="text-sky-500" />
                    <span>گروه مشترک با درس دیگر (ادغام)</span>
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Inline Add Subject */}
      <form
        onSubmit={onAddSubject}
        className="space-y-2 pt-3 border-t-2 border-[var(--line-strong)]/20 bg-[var(--surface-2)] p-3 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
      >
        <div className="flex items-center justify-between">
          <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
            <Plus size={13} className="text-[var(--testino-orange)]" />
            <span>افزودن درس جدید به برنامه</span>
          </span>
        </div>

        <SubjectAutocomplete
          value={newSubjName}
          onChange={onNewSubjNameChange}
          onSelectSuggestion={(suggestion) => {
            onNewSubjNameChange(suggestion.name);
            if (suggestion.recommendedQuestions) {
              onNewSubjQuestionsChange(suggestion.recommendedQuestions);
            }
            if (suggestion.recommendedCoefficient !== undefined) {
              onNewSubjCoefficientChange(suggestion.recommendedCoefficient);
            }
          }}
          placeholder="نام درس را بنویسید (مثلاً: ریاضی، ادبیات، زیست)..."
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 bg-[var(--surface)] px-2 py-1 rounded-xl border border-[var(--line-strong)]/30 text-[10px] font-bold shadow-sm">
            <span className="text-[var(--muted)]">سؤال:</span>
            <input
              aria-label="تعداد سؤال درس جدید"
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={newSubjQuestions || ""}
              onChange={(e) => {
                const s = sanitizeIntegerInput(e.target.value, { max: 200 });
                onNewSubjQuestionsChange(s ? parseInt(s, 10) : 0);
              }}
              onBlur={() => {
                if (!newSubjQuestions) onNewSubjQuestionsChange(25);
              }}
              className="w-9 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
            />
            <span className="text-[var(--muted)] mr-1">ضریب:</span>
            <input
              aria-label="ضریب درس جدید"
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={newSubjCoefficient || ""}
              onChange={(e) => {
                const s = sanitizeIntegerInput(e.target.value, { max: 100 });
                onNewSubjCoefficientChange(s ? parseInt(s, 10) : 0);
              }}
              onBlur={() => {
                if (!newSubjCoefficient) onNewSubjCoefficientChange(1);
              }}
              className="w-8 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
            />
            <span className="text-[var(--muted)] mr-1">هدف:</span>
            <input
              aria-label="هدف درصدی درس جدید"
              type="text"
              inputMode="numeric"
              dir="ltr"
              value={newSubjTarget === 0 ? "0" : newSubjTarget || ""}
              onChange={(e) => {
                const s = sanitizeIntegerInput(e.target.value, { max: 100 });
                onNewSubjTargetChange(s ? parseInt(s, 10) : 0);
              }}
              className="w-9 bg-transparent text-xs font-black text-center text-[var(--ink)] focus:outline-none"
            />
            <span className="text-[var(--muted)] font-black">٪</span>
          </div>

          <button
            type="submit"
            className="btn-neo-orange px-3 py-1.5 rounded-xl flex items-center gap-1 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0 cursor-pointer"
            title="افزودن درس جدید"
          >
            <Plus size={14} />
            <span>افزودن</span>
          </button>
        </div>
      </form>
      {subjectError && <p className="text-[10px] text-red-600 font-bold">{subjectError}</p>}
    </div>
  );
}
