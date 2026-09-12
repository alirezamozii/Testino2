"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Compass,
  Lightbulb,
  Pencil,
  Plus,
  Sparkles,
  Target,
  Trash2,
  X,
} from "lucide-react";
import { EmptyState, LoadingState, MascotBanner } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { isSameSubject } from "@/features/questions/domain/subject-registry";

interface StudyGoal {
  id: string;
  title: string;
  subjectId?: string;
  subjectName?: string;
  questionCount?: number;
  coefficient?: number;
  category: "short" | "medium" | "long";
  currentValue: number;
  targetValue: number;
  unit: string;
  deadlineDays: number;
  completed: boolean;
  milestones: { title: string; target: string; status: "done" | "current" | "upcoming" }[];
}

export function GoalsPage() {
  const { db, status } = useDatabase();
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
  const profile = profilesQuery.data?.[0];

  const analyticsQuery = useQuery({
    queryKey: ["goals-analytics", profile?.id],
    queryFn: () => db.analytics(profile!.id),
    enabled: Boolean(profile),
  });

  const [activeTab, setActiveTab] = useState<"all" | "short" | "medium" | "long">("all");
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);

  // Subject quick editing state
  const [isEditingSubject, setIsEditingSubject] = useState(false);
  const [editTarget, setEditTarget] = useState<number>(70);
  const [editQuestions, setEditQuestions] = useState<number>(25);
  const [isSavingSubject, setIsSavingSubject] = useState(false);

  // New goal form state
  const [newTitle, setNewTitle] = useState("");
  const [newCategory, setNewCategory] = useState<"short" | "medium" | "long">("short");
  const [newTargetValue, setNewTargetValue] = useState(100);
  const [newUnit, setNewUnit] = useState("تست");
  const [newDays, setNewDays] = useState(14);
  const [newSubject, setNewSubject] = useState("");

  // Initial custom goals in state, augmented with actual profile subjects
  const [customGoals, setCustomGoals] = useState<StudyGoal[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = localStorage.getItem("testino_custom_goals");
      if (saved) return JSON.parse(saved);
    } catch {
      // ignore
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem("testino_custom_goals", JSON.stringify(customGoals));
    } catch {
      // ignore
    }
  }, [customGoals]);

  // Merge profile subjects as dynamic goals if they have target percentages
  const allGoals = useMemo(() => {
    const goals = [...customGoals];
    if (profile?.subjects) {
      const subjectAnalyticsList = analyticsQuery.data?.bySubject ?? [];
      profile.subjects.forEach((sub, idx) => {
        if (!goals.some((g) => g.id === `sub-goal-${sub.id}`)) {
          const stats = subjectAnalyticsList.find((item) => isSameSubject(item.subject, sub.name));
          const currentPct = stats?.percentage ? Math.round(stats.percentage) : 0;
          const qCount = sub.questionCount ?? 25;
          const targetPct = sub.targetPercentage || 70;
          const neededCorrect = Math.min(qCount, Math.ceil((targetPct / 100) * qCount));

          goals.push({
            id: `sub-goal-${sub.id}`,
            subjectId: sub.id,
            title: `هدف درس ${sub.name}`,
            subjectName: sub.name,
            questionCount: qCount,
            coefficient: sub.coefficient,
            category: idx % 2 === 0 ? "medium" : "long",
            currentValue: currentPct,
            targetValue: targetPct,
            unit: "درصد",
            deadlineDays: 60,
            completed: currentPct >= targetPct,
            milestones: [
              { title: "مطالعه مفاهیم و حل ۵۰ تست مقدماتی", target: "۵۰ تست", status: currentPct >= 30 ? "done" : "current" },
              { title: `تسلط نسبی (${Math.ceil(neededCorrect * 0.7)} تست درست از ${qCount} تست)`, target: `${Math.round(targetPct * 0.7)}٪`, status: currentPct >= Math.round(targetPct * 0.7) ? "done" : "upcoming" },
              { title: `تحقق هدف: ${neededCorrect} تست درست از ${qCount} سؤال دفترچه`, target: `${targetPct}٪`, status: currentPct >= targetPct ? "done" : "upcoming" },
            ],
          });
        }
      });
    }
    return goals;
  }, [customGoals, profile, analyticsQuery.data]);

  const filteredGoals = useMemo(() => {
    if (activeTab === "all") return allGoals;
    return allGoals.filter((g) => g.category === activeTab);
  }, [allGoals, activeTab]);

  const selectedGoal = useMemo(() => {
    return allGoals.find((g) => g.id === selectedGoalId) || allGoals[0] || null;
  }, [allGoals, selectedGoalId]);

  async function handleSaveSubjectEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedGoal?.subjectId) return;
    setIsSavingSubject(true);
    try {
      await db.updateProfileSubject(selectedGoal.subjectId, {
        targetPercentage: Math.max(0, Math.min(100, Number(editTarget))),
        questionCount: Math.max(1, Math.min(200, Number(editQuestions))),
      });
      await queryClient.invalidateQueries({ queryKey: ["profiles"] });
      await queryClient.invalidateQueries({ queryKey: ["goals-analytics"] });
      setIsEditingSubject(false);
    } finally {
      setIsSavingSubject(false);
    }
  }

  function handleCreateGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    const newGoalItem: StudyGoal = {
      id: `goal-${Date.now()}`,
      title: newTitle.trim(),
      subjectName: newSubject.trim() || undefined,
      category: newCategory,
      currentValue: 0,
      targetValue: Number(newTargetValue) || 100,
      unit: newUnit,
      deadlineDays: Number(newDays) || 14,
      completed: false,
      milestones: [
        { title: "گام اول: شروع برنامه", target: `${Math.round(newTargetValue * 0.25)} ${newUnit}`, status: "current" },
        { title: "گام دوم: نصف مسیر", target: `${Math.round(newTargetValue * 0.5)} ${newUnit}`, status: "upcoming" },
        { title: "گام سوم: تسلط", target: `${Math.round(newTargetValue * 0.8)} ${newUnit}`, status: "upcoming" },
        { title: "گام نهایی: تحقق هدف", target: `${newTargetValue} ${newUnit}`, status: "upcoming" },
      ],
    };

    setCustomGoals((prev) => [newGoalItem, ...prev]);
    setSelectedGoalId(newGoalItem.id);
    setShowAddModal(false);
    setNewTitle("");
  }

  function handleDeleteGoal(goalId: string) {
    setCustomGoals((prev) => prev.filter((g) => g.id !== goalId));
    if (selectedGoalId === goalId) {
      setSelectedGoalId(null);
    }
  }

  if (profilesQuery.isLoading) {
    return <LoadingState label="در حال بارگذاری اهداف و مسیر مطالعه…" />;
  }

  return (
    <div className="page goals-page space-y-6 pb-12">
      {/* Top Header & Mascot Banner */}
      <MascotBanner
        badge="اهداف من (Goals)"
        title="هدف‌های بزرگ، با قدم‌های کوچک!"
        description="هدف بذار، مسیرت رو ببین و هر روز یک گام به رتبهٔ دلخواهت نزدیک‌تر شو. تستینو قدم به قدم کنار توست."
        mood="happy"
        action={
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="btn-primary-orange py-2.5 px-4 text-xs font-black flex items-center gap-1.5 shadow-md"
          >
            <Plus size={16} />
            <span>تعریف هدف جدید</span>
          </button>
        }
      />

      {/* Categories Tabs */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)]">
          {[
            { id: "all", label: "همهٔ اهداف" },
            { id: "short", label: "کوتاه‌مدت" },
            { id: "medium", label: "میان‌مدت" },
            { id: "long", label: "بلندمدت" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as "all" | "short" | "medium" | "long")}
              className={cn(
                "py-2 px-4 rounded-xl text-xs font-black transition-all",
                activeTab === tab.id
                  ? "bg-[var(--brand-orange)] text-white shadow-sm"
                  : "text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)]"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <span className="text-xs font-bold text-[var(--muted)] whitespace-nowrap">
          {new Intl.NumberFormat("fa-IR").format(filteredGoals.length)} هدف فعال
        </span>
      </div>

      {/* Main Content Layout: Grid of Goals (Left) + Detail Card / Timeline (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Goals List (5 cols on lg) */}
        <div className="lg:col-span-5 space-y-3">
          {filteredGoals.length === 0 ? (
            <div className="testino-card p-6 text-center">
              <EmptyState
                icon={Target}
                tone="orange"
                title="هیچ هدفی در این بخش نیست"
                description="می‌توانی همین الان اولین هدف مطالعاتی‌ات را اضافه کنی."
                action={
                  <button
                    type="button"
                    onClick={() => setShowAddModal(true)}
                    className="btn-primary-orange py-2 px-4 text-xs font-black"
                  >
                    + افزودن هدف جدید
                  </button>
                }
              />
            </div>
          ) : (
            filteredGoals.map((goal) => {
              const pct = Math.min(100, Math.round((goal.currentValue / goal.targetValue) * 100));
              const isSelected = selectedGoal?.id === goal.id;

              return (
                <div
                  key={goal.id}
                  onClick={() => setSelectedGoalId(goal.id)}
                  className={cn(
                    "testino-card p-4 cursor-pointer transition-all hover:scale-[1.01]",
                    isSelected
                      ? "border-2 border-[var(--brand-orange)] bg-orange-50/40 dark:bg-orange-950/20 shadow-md"
                      : "border border-[var(--line)] hover:border-[var(--brand-orange)]/50"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div
                        className={cn(
                          "w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-black text-sm",
                          pct >= 100
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : isSelected
                            ? "bg-[var(--brand-orange)] text-white shadow-sm"
                            : "bg-[var(--surface-2)] text-[var(--ink)]"
                        )}
                      >
                        {pct >= 100 ? <CheckCircle2 size={20} /> : <Target size={20} />}
                      </div>
                      <div>
                        <h3 className="text-xs sm:text-sm font-black text-[var(--ink)] line-clamp-1">
                          {goal.title}
                        </h3>
                        <p className="text-[11px] font-bold text-[var(--muted)] mt-0.5">
                          {goal.subjectName ? `${goal.subjectName} • ` : ""}
                          {new Intl.NumberFormat("fa-IR").format(goal.currentValue)} از{" "}
                          {new Intl.NumberFormat("fa-IR").format(goal.targetValue)} {goal.unit}
                        </p>
                        {goal.questionCount && (
                          <div className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--muted)] mt-1 flex-wrap">
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--surface-2)] border border-[var(--line)] text-[var(--ink)]">
                              {goal.questionCount} سؤال کنکور
                            </span>
                            <span className="text-[var(--brand-green)]">
                              +{(100 / goal.questionCount).toFixed(1)}٪
                            </span>
                            <span className="text-red-500">
                              -{(100 / (3 * goal.questionCount)).toFixed(1)}٪
                            </span>
                            {goal.coefficient && (
                              <span>ضریب {goal.coefficient}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <span
                      className={cn(
                        "testino-chip text-[11px] font-black shrink-0",
                        pct >= 100
                          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"
                          : pct >= 50
                          ? "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300"
                          : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                      )}
                    >
                      {new Intl.NumberFormat("fa-IR").format(pct)}٪
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3.5 space-y-1">
                    <div className="w-full h-2.5 bg-[var(--surface-2)] rounded-full overflow-hidden border border-[var(--line)]">
                      <div
                        className={cn(
                          "h-full transition-all duration-500 rounded-full",
                          pct >= 100
                            ? "bg-emerald-500"
                            : pct >= 60
                            ? "bg-[var(--brand-orange)]"
                            : "bg-[var(--brand-yellow)]"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] font-bold text-[var(--muted)] pt-0.5">
                      <span>
                        {goal.category === "short"
                          ? "کوتاه‌مدت"
                          : goal.category === "medium"
                          ? "میان‌مدت"
                          : "بلندمدت"}
                      </span>
                      <span>{new Intl.NumberFormat("fa-IR").format(goal.deadlineDays)} روز مانده</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Goal Details & Milestone Timeline (7 cols on lg) */}
        {selectedGoal && (
          <div className="lg:col-span-7 space-y-5">
            {/* Main Details Card */}
            <div className="testino-card p-5 sm:p-6 space-y-6">
              <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] pb-4">
                <div>
                  <span className="testino-chip bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 text-[10px] font-black mb-1.5 inline-block">
                    {selectedGoal.category === "short"
                      ? "هدف کوتاه‌مدت"
                      : selectedGoal.category === "medium"
                      ? "هدف میان‌مدت"
                      : "هدف بلندمدت"}
                  </span>
                  <h2 className="text-base sm:text-lg font-black text-[var(--ink)]">
                    {selectedGoal.title}
                  </h2>
                  <p className="text-xs font-bold text-[var(--muted)] mt-0.5">
                    با هر تمرین و تست، یک قدم به تحقق این هدف نزدیک‌تر می‌شوی.
                  </p>
                </div>

                <div className="text-center shrink-0 bg-[var(--surface-2)] p-3 rounded-2xl border border-[var(--line)]">
                  <span className="block text-xl sm:text-2xl font-black text-[var(--brand-orange)]">
                    {new Intl.NumberFormat("fa-IR").format(
                      Math.min(100, Math.round((selectedGoal.currentValue / selectedGoal.targetValue) * 100))
                    )}
                    ٪
                  </span>
                  <span className="text-[10px] font-bold text-[var(--muted)]">میزان تحقق</span>
                </div>
              </div>

              {/* 3 Quick Stat Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
                  <span className="block text-xs text-[var(--muted)] font-bold">انجام شده</span>
                  <strong className="block text-sm sm:text-base font-black text-emerald-600 dark:text-emerald-400 mt-1">
                    {new Intl.NumberFormat("fa-IR").format(selectedGoal.currentValue)}
                  </strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">{selectedGoal.unit}</span>
                </div>

                <div className="p-3 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
                  <span className="block text-xs text-[var(--muted)] font-bold">باقی‌مانده</span>
                  <strong className="block text-sm sm:text-base font-black text-amber-600 dark:text-amber-400 mt-1">
                    {new Intl.NumberFormat("fa-IR").format(
                      Math.max(0, selectedGoal.targetValue - selectedGoal.currentValue)
                    )}
                  </strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">{selectedGoal.unit}</span>
                </div>

                <div className="p-3 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
                  <span className="block text-xs text-[var(--muted)] font-bold">زمان باقی‌مانده</span>
                  <strong className="block text-sm sm:text-base font-black text-[var(--ink)] mt-1">
                    {new Intl.NumberFormat("fa-IR").format(selectedGoal.deadlineDays)}
                  </strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">روز</span>
                </div>
              </div>

              {/* Konkur Subject Specifications & Question Count Breakdown */}
              {selectedGoal.questionCount && (
                <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
                      <Target size={15} className="text-[var(--brand-orange)]" />
                      <span>مشخصات درس {selectedGoal.subjectName} در کنکور</span>
                    </h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)]">
                        {selectedGoal.questionCount} سؤال در دفترچه آزمون
                      </span>
                      {selectedGoal.subjectId && !isEditingSubject && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditQuestions(selectedGoal.questionCount ?? 25);
                            setEditTarget(selectedGoal.targetValue);
                            setIsEditingSubject(true);
                          }}
                          className="text-[10px] font-black text-[var(--brand-orange)] flex items-center gap-1 hover:underline"
                        >
                          <Pencil size={12} />
                          <span>تغییر تعداد سؤال / هدف</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
                      <span className="text-[10px] text-[var(--muted)] font-bold block">تعداد سؤالات</span>
                      <strong className="text-sm font-black text-[var(--ink)] mt-0.5 block">
                        {selectedGoal.questionCount} تست
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
                      <span className="text-[10px] text-[var(--muted)] font-bold block">ارزش هر تست</span>
                      <strong className="text-sm font-black text-emerald-600 dark:text-emerald-400 mt-0.5 block">
                        +{(100 / selectedGoal.questionCount).toFixed(2)}٪
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
                      <span className="text-[10px] text-[var(--muted)] font-bold block">نمره منفی هر غلط</span>
                      <strong className="text-sm font-black text-red-500 mt-0.5 block">
                        -{(100 / (3 * selectedGoal.questionCount)).toFixed(2)}٪
                      </strong>
                    </div>
                    <div className="p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line)]">
                      <span className="text-[10px] text-[var(--muted)] font-bold block">ضریب در تراز</span>
                      <strong className="text-sm font-black text-[var(--brand-orange)] mt-0.5 block">
                        ضریب {selectedGoal.coefficient ?? 1}
                      </strong>
                    </div>
                  </div>

                  {/* Calculated Needed Net Correct Questions for Target */}
                  <div className="p-3 rounded-xl bg-orange-50/70 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 text-xs font-bold text-orange-900 dark:text-orange-200 leading-relaxed flex items-start gap-2">
                    <Lightbulb size={15} className="text-[var(--testino-orange)] shrink-0 mt-0.5" />
                    <div>
                      برای دستیابی به درصد هدف <strong>{selectedGoal.targetValue}٪</strong>، باید حداقل{" "}
                      <span className="underline font-black text-orange-700 dark:text-orange-300">
                        {Math.min(selectedGoal.questionCount, Math.ceil((selectedGoal.targetValue / 100) * selectedGoal.questionCount))} تست درست خالص
                      </span>{" "}
                      از کل {selectedGoal.questionCount} سؤال کنکور (بدون نمره منفی) را پاسخ دهی.
                    </div>
                  </div>

                  {/* Inline Subject Editor */}
                  {selectedGoal.subjectId && isEditingSubject && (
                    <form onSubmit={handleSaveSubjectEdit} className="p-3.5 rounded-xl bg-[var(--surface)] border border-[var(--brand-orange)]/40 space-y-3 animate-fade-in">
                      <div className="flex items-center justify-between border-b border-[var(--line)] pb-2">
                        <span className="text-xs font-black text-[var(--ink)]">
                          ویرایش تنظیمات درس {selectedGoal.subjectName}
                        </span>
                        <button
                          type="button"
                          onClick={() => setIsEditingSubject(false)}
                          className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)]"
                        >
                          انصراف
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-[var(--ink)]">تعداد سؤالات در کنکور:</label>
                          <input
                            type="number"
                            min="1"
                            max="200"
                            value={editQuestions}
                            onChange={(e) => setEditQuestions(Number(e.target.value))}
                            className="w-full p-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-black text-[var(--ink)]"
                          />
                          <span className="text-[10px] text-[var(--muted)] font-bold block">
                            ارزش هر تست: +{(100 / (editQuestions || 25)).toFixed(2)}٪ | منفی: -{(100 / (3 * (editQuestions || 25))).toFixed(2)}٪
                          </span>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-[var(--ink)]">درصد هدف مطلوب (٪):</label>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            value={editTarget}
                            onChange={(e) => setEditTarget(Number(e.target.value))}
                            className="w-full p-2 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-black text-[var(--ink)]"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setIsEditingSubject(false)}
                          className="btn-secondary-clean py-1.5 px-3 text-xs font-bold"
                        >
                          لغو
                        </button>
                        <button
                          type="submit"
                          disabled={isSavingSubject}
                          className="btn-primary-orange py-1.5 px-4 text-xs font-black"
                        >
                          {isSavingSubject ? "در حال ذخیره…" : "ذخیره تغییرات"}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}

              {/* Milestone Timeline: مسیر تا هدف */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs sm:text-sm font-black text-[var(--ink)] flex items-center gap-1.5">
                    <Compass size={16} className="text-[var(--brand-orange)]" />
                    <span>مسیر گام‌به‌گام تا هدف (Milestones)</span>
                  </h3>
                  <span className="text-[11px] font-bold text-[var(--muted)]">
                    {selectedGoal.milestones.filter((m) => m.status === "done").length} از {selectedGoal.milestones.length} مرحله
                  </span>
                </div>

                <div className="relative pr-6 space-y-4 before:content-[''] before:absolute before:right-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[var(--line)]">
                  {selectedGoal.milestones.map((ms, idx) => (
                    <div key={idx} className="relative flex items-start gap-3">
                      {/* Step Circle Indicator */}
                      <div
                        className={cn(
                          "absolute -right-6 top-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black border-2 border-[var(--surface)] transition-all",
                          ms.status === "done"
                            ? "bg-emerald-500 text-white"
                            : ms.status === "current"
                            ? "bg-[var(--brand-orange)] text-white ring-4 ring-orange-200 dark:ring-orange-950"
                            : "bg-[var(--line)] text-[var(--muted)]"
                        )}
                      >
                        {ms.status === "done" ? "✓" : idx + 1}
                      </div>

                      <div
                        className={cn(
                          "p-3 rounded-2xl border flex-1 transition-all",
                          ms.status === "current"
                            ? "bg-orange-50/50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800"
                            : "bg-[var(--surface-2)] border-[var(--line)]"
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-[var(--ink)]">
                            {ms.title}
                          </span>
                          <span className="testino-chip text-[10px] font-bold bg-[var(--surface)] text-[var(--ink)]">
                            {ms.target}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Mascot Recommendation Box */}
              <div className="p-4 rounded-2xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
                <Lightbulb size={20} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <strong className="font-black text-amber-900 dark:text-amber-200 block">
                    پیشنهاد هوشمند تستینو برای این هدف:
                  </strong>
                  <p className="font-bold text-amber-800/90 dark:text-amber-300 leading-relaxed">
                    برای رسیدن به این هدف در موعد مقرر، روزانه حداقل{" "}
                    <span className="font-black underline">
                      {Math.max(5, Math.round((selectedGoal.targetValue - selectedGoal.currentValue) / selectedGoal.deadlineDays))}
                    </span>{" "}
                    {selectedGoal.unit} تمرین کن. تداوم راز اصلی موفقیت است!
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--line)]">
                <Link
                  href={selectedGoal.subjectName ? `/sessions/new/?subject=${encodeURIComponent(selectedGoal.subjectName)}` : "/sessions/new"}
                  className="btn-primary-orange py-2.5 px-5 text-xs font-black shadow-sm flex items-center gap-1.5"
                >
                  <Sparkles size={16} />
                  <span>شروع تمرین اختصاصی برای این هدف</span>
                </Link>

                <button
                  type="button"
                  onClick={() => {
                    setCustomGoals((prev) =>
                      prev.map((g) =>
                        g.id === selectedGoal.id
                          ? { ...g, currentValue: Math.min(g.targetValue, g.currentValue + 10) }
                          : g
                      )
                    );
                  }}
                  className="btn-secondary-clean py-2.5 px-3.5 text-xs font-bold flex items-center gap-1"
                >
                  <Plus size={14} />
                  <span>ثبت ۱۰ {selectedGoal.unit} پیشرفت</span>
                </button>

                {selectedGoal.id.startsWith("goal-") && (
                  <button
                    type="button"
                    onClick={() => handleDeleteGoal(selectedGoal.id)}
                    className="p-2.5 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                    title="حذف این هدف"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Add New Goal Modal */}
      {showAddModal && (
        <div
          data-modal="true"
          role="dialog"
          aria-modal="true"
          className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-4 pb-[max(1rem,calc(env(safe-area-inset-bottom,0px)+1rem))] bg-black/60 backdrop-blur-sm animate-fade-in"
        >
          <div className="testino-card w-full max-w-lg p-6 space-y-4 shadow-2xl border-2 border-[var(--brand-orange)] bg-[var(--surface)]">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <h3 className="text-sm sm:text-base font-black text-[var(--ink)] flex items-center gap-2">
                <Target className="text-[var(--brand-orange)]" size={20} />
                <span>تعریف هدف مطالعاتی جدید</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1 text-[var(--muted)] hover:text-[var(--ink)] rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[var(--ink)]">عنوان هدف *</label>
                <input
                  type="text"
                  required
                  placeholder="مثلاً تسلط بر فصل ۲ آمار یا ۱۰۰ تست ریاضی..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)] focus:outline-none focus:border-[var(--brand-orange)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--ink)]">درس مرتبط (اختیاری)</label>
                  {profile?.subjects && profile.subjects.length > 0 ? (
                    <select
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)]"
                    >
                      <option value="">(بدون درس مشخص / هدف عمومی)</option>
                      {profile.subjects.map((sub) => (
                        <option key={sub.id} value={sub.name}>
                          {sub.name} (ضریب {sub.coefficient} • {sub.questionCount ?? 25} سؤال کنکور)
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      placeholder="نام درس مرتبط..."
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)]"
                    />
                  )}
                  {(() => {
                    const matched = profile?.subjects?.find((s) => s.name === newSubject);
                    if (!matched) return null;
                    const qc = matched.questionCount ?? 25;
                    return (
                      <div className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--line)] text-[10px] text-[var(--muted)] font-bold flex items-center justify-between">
                        <span>سؤالات کنکور: {qc} تست</span>
                        <span className="text-[var(--brand-green)]">هر تست: +{(100 / qc).toFixed(1)}٪</span>
                        <span className="text-red-500">منفی: -{(100 / (3 * qc)).toFixed(1)}٪</span>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--ink)]">بازه زمانی</label>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as "short" | "medium" | "long")}
                    className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)]"
                  >
                    <option value="short">کوتاه‌مدت (۱ تا ۲ هفته)</option>
                    <option value="medium">میان‌مدت (۱ تا ۲ ماه)</option>
                    <option value="long">بلندمدت (تا کنکور)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--ink)]">مقدار هدف *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newTargetValue}
                    onChange={(e) => setNewTargetValue(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--ink)]">واحد</label>
                  <select
                    value={newUnit}
                    onChange={(e) => setNewUnit(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)]"
                  >
                    <option value="تست">تست</option>
                    <option value="درصد">درصد</option>
                    <option value="ساعت">ساعت مطالعه</option>
                    <option value="دور">دور مرور</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[var(--ink)]">مهلت (روز)</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newDays}
                    onChange={(e) => setNewDays(Number(e.target.value))}
                    className="w-full p-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-xs font-bold text-[var(--ink)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-[var(--line)]">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="btn-secondary-clean py-2 px-4 text-xs font-bold"
                >
                  انصراف
                </button>
                <button
                  type="submit"
                  className="btn-primary-orange py-2 px-5 text-xs font-black shadow-sm"
                >
                  ذخیره هدف
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
