"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronRight,
  ChevronDown,
  ChevronUp,
  BookOpen,
  ListOrdered,
  ArrowLeft,
  AlertCircle,
  Check,
  CheckSquare,
  Square,
  Infinity,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Timer,
  Layers,
  FolderTree,
  Plus,
  Bookmark,
  HelpCircle,
  Zap,
  FastForward,
  Clock,
} from "lucide-react";
import { LoadingState } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { isSameSubject } from "@/features/questions/domain/subject-registry";
import type { QuestionPoolMode } from "@/database/app-database";

export function SessionBuilder() {
  const database = useDatabase();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialMode = searchParams.get("mode") || "random";
  const initialCount = Number(searchParams.get("count")) || 20;
  const initialSubject = searchParams.get("subject") || "all";

  const [step, setStep] = useState(1);
  const [count, setCount] = useState(initialCount);
  const [selectedModes, setSelectedModes] = useState<QuestionPoolMode[]>(
    initialMode === "continuous"
      ? ["random"]
      : ([initialMode as QuestionPoolMode].filter(Boolean) as QuestionPoolMode[])
  );
  const [isContinuous, setIsContinuous] = useState(initialMode === "continuous");
  const [selectedSubjectsOverride, setSelectedSubjectsOverride] = useState<string[] | null>(
    initialSubject && initialSubject !== "all" ? [initialSubject] : null
  );
  const [subjectSearch, setSubjectSearch] = useState("");

  // Scope: 'all' = all chapters of selected subjects, 'custom' = granular selection
  const [scopeMode, setScopeMode] = useState<"all" | "custom">("all");
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedSubject, setExpandedSubject] = useState<string | null>(null);
  const [expandedChapters, setExpandedChapters] = useState<string[]>([]);

  // Source selection: 'EXAM' (کنکور), 'PERSONAL' (تألیفی), 'AI' (شبیه‌ساز)
  const [selectedSources, setSelectedSources] = useState<Array<"EXAM" | "PERSONAL" | "AI">>([
    "EXAM",
    "PERSONAL",
    "AI",
  ]);

  function toggleSource(src: "EXAM" | "PERSONAL" | "AI") {
    setSelectedSources((prev) => {
      if (prev.includes(src)) {
        if (prev.length === 1) return prev; // keep at least one source selected
        return prev.filter((item) => item !== src);
      }
      return [...prev, src];
    });
  }

  // Step 4 Settings
  const [feedbackMode, setFeedbackMode] = useState<"deferred" | "instant">("deferred");
  const [isTimed, setIsTimed] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState(() =>
    Math.max(5, Math.round((initialCount * 1.25) / 5) * 5)
  );
  const [customMinutes, setCustomMinutes] = useState("");
  // Once the user picks a time manually, auto-scaling stops (their override wins).
  const [timeTouched, setTimeTouched] = useState(false);
  const [negativeMarking, setNegativeMarking] = useState(true);
  const [showAnswerSheet, setShowAnswerSheet] = useState(true);
  const [showExplanations, setShowExplanations] = useState(true);
  const [shuffleQuestions, setShuffleQuestions] = useState(true);
  const [shuffleOptions, setShuffleOptions] = useState(true);

  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });
  const profile = profilesQuery.data?.[0];

  const allQuestionsQuery = useQuery({
    queryKey: ["published-questions-all"],
    queryFn: async () => {
      return database.db.listQuestions({ limit: 10000, status: "published" });
    },
    enabled: database.status === "ready",
  });

  const allPublished = useMemo(() => allQuestionsQuery.data ?? [], [allQuestionsQuery.data]);
  const subjectsInBank = useMemo(
    () => Array.from(new Set(allPublished.map((q) => q.subject))).filter(Boolean),
    [allPublished]
  );
  // Strictly prioritize user's active profile subjects. If user configured subjects in profile, use those.
  // Fall back to subjects in bank only if user has no profile subjects configured yet.
  const profileSubjectNames = useMemo(
    () => profile?.subjects?.filter((s) => s.coefficient > 0).map((s) => s.name) ?? [],
    [profile]
  );
  const availableSubjects = useMemo(
    () => (profileSubjectNames.length > 0 ? profileSubjectNames : subjectsInBank),
    [profileSubjectNames, subjectsInBank]
  );

  const selectedSubjects = selectedSubjectsOverride ?? availableSubjects;

  const filteredSubjectList = subjectSearch.trim()
    ? availableSubjects.filter((s) => s.includes(subjectSearch.trim()))
    : availableSubjects;

  const isAllSubjectsSelected =
    availableSubjects.length > 0 && selectedSubjects.length === availableSubjects.length;

  function toggleSubject(s: string) {
    setSelectedSubjectsOverride((prev) => {
      const current = prev ?? availableSubjects;
      return current.includes(s) ? current.filter((item) => item !== s) : [...current, s];
    });
  }

  function toggleAllSubjects() {
    if (isAllSubjectsSelected) {
      setSelectedSubjectsOverride([]);
    } else {
      setSelectedSubjectsOverride([...availableSubjects]);
    }
  }

  // Dynamic taxonomy for selected subjects: Subject -> Chapter -> Topics
  const taxonomy = useMemo(() => {
    const map = new Map<
      string,
      {
        total: number;
        chapters: Map<string, { total: number; topics: Map<string, number> }>;
      }
    >();

    for (const q of allPublished) {
      const matchingSub = selectedSubjects.find((s) => isSameSubject(s, q.subject));
      if (!matchingSub) continue;
      if (!map.has(matchingSub)) {
        map.set(matchingSub, { total: 0, chapters: new Map() });
      }
      const sData = map.get(matchingSub)!;
      sData.total += 1;

      const chName = q.chapter || "عمومی / بدون فصل";
      if (!sData.chapters.has(chName)) {
        sData.chapters.set(chName, { total: 0, topics: new Map() });
      }
      const chData = sData.chapters.get(chName)!;
      chData.total += 1;

      if (q.topic) {
        const prevCount = chData.topics.get(q.topic) || 0;
        chData.topics.set(q.topic, prevCount + 1);
      }
    }

    return map;
  }, [allPublished, selectedSubjects]);

  function toggleChapter(ch: string) {
    setSelectedChapters((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    );
  }

  function toggleTopic(top: string) {
    setSelectedTopics((prev) =>
      prev.includes(top) ? prev.filter((t) => t !== top) : [...prev, top]
    );
  }

  function toggleChapterDropdown(chKey: string) {
    setExpandedChapters((prev) =>
      prev.includes(chKey) ? prev.filter((k) => k !== chKey) : [...prev, chKey]
    );
  }

  function selectAllTopicsInChapter(topics: string[]) {
    setSelectedTopics((prev) => Array.from(new Set([...prev, ...topics])));
  }

  function deselectAllTopicsInChapter(topics: string[]) {
    setSelectedTopics((prev) => prev.filter((t) => !topics.includes(t)));
  }

  const poolStatsQuery = useQuery({
    queryKey: ["question-pool-stats", profile?.id],
    queryFn: () => database.db.getQuestionPoolStats(profile!.id),
    enabled: database.status === "ready" && Boolean(profile?.id),
  });

  // Live calculation of matching eligible questions
  const filteredQuestions = useMemo(() => {
    let list = allPublished.filter((q) => selectedSubjects.some((s) => isSameSubject(s, q.subject)));
    if (scopeMode === "custom") {
      if (selectedChapters.length > 0 && selectedTopics.length > 0) {
        const chSet = new Set(selectedChapters);
        const topSet = new Set(selectedTopics);
        list = list.filter(
          (q) =>
            (q.chapter ? chSet.has(q.chapter) : chSet.has("عمومی / بدون فصل")) ||
            (q.topic && topSet.has(q.topic))
        );
      } else if (selectedChapters.length > 0) {
        const chSet = new Set(selectedChapters);
        list = list.filter((q) => (q.chapter ? chSet.has(q.chapter) : chSet.has("عمومی / بدون فصل")));
      } else if (selectedTopics.length > 0) {
        const topSet = new Set(selectedTopics);
        list = list.filter((q) => q.topic && topSet.has(q.topic));
      }
    }
    if (selectedSources.length > 0 && selectedSources.length < 3) {
      const allowedSources = new Set(selectedSources);
      list = list.filter((q) => {
        const kind = q.source?.kind || "PERSONAL";
        return allowedSources.has(kind);
      });
    }
    return list;
  }, [allPublished, selectedSubjects, scopeMode, selectedChapters, selectedTopics, selectedSources]);

  const sourceCounts = useMemo(() => {
    let exam = 0;
    let personal = 0;
    let ai = 0;
    let base = allPublished.filter((q) => selectedSubjects.some((s) => isSameSubject(s, q.subject)));
    if (scopeMode === "custom") {
      if (selectedChapters.length > 0) {
        const chSet = new Set(selectedChapters);
        base = base.filter((q) => (q.chapter ? chSet.has(q.chapter) : chSet.has("عمومی / بدون فصل")));
      }
      if (selectedTopics.length > 0) {
        const topSet = new Set(selectedTopics);
        base = base.filter((q) => q.topic && topSet.has(q.topic));
      }
    }
    for (const q of base) {
      const kind = q.source?.kind || "PERSONAL";
      if (kind === "EXAM") exam++;
      else if (kind === "AI") ai++;
      else personal++;
    }
    return { EXAM: exam, PERSONAL: personal, AI: ai };
  }, [allPublished, selectedSubjects, scopeMode, selectedChapters, selectedTopics]);

  const poolCounts = useMemo(() => {
    const attemptedSet = new Set(poolStatsQuery.data?.attemptedIds ?? []);
    const wrongSet = new Set(poolStatsQuery.data?.wrongIds ?? []);
    const doubtfulSet = new Set(poolStatsQuery.data?.doubtfulIds ?? []);
    const guessSet = new Set(poolStatsQuery.data?.guessIds ?? []);
    const dueSet = new Set(poolStatsQuery.data?.dueIds ?? []);
    const skippedSet = new Set(poolStatsQuery.data?.skippedIds ?? []);
    const bookmarkedSet = new Set(poolStatsQuery.data?.bookmarkedIds ?? []);

    let newCount = 0;
    let wrongCount = 0;
    let doubtfulCount = 0;
    let guessCount = 0;
    let dueCount = 0;
    let skippedCount = 0;
    let bookmarkedCount = 0;

    for (const q of filteredQuestions) {
      if (!attemptedSet.has(q.id)) newCount++;
      if (wrongSet.has(q.id)) wrongCount++;
      if (doubtfulSet.has(q.id)) doubtfulCount++;
      if (guessSet.has(q.id)) guessCount++;
      if (dueSet.has(q.id)) dueCount++;
      if (skippedSet.has(q.id)) skippedCount++;
      if (bookmarkedSet.has(q.id)) bookmarkedCount++;
    }

    return {
      new: newCount,
      wrong: wrongCount,
      doubtful: doubtfulCount,
      guess: guessCount,
      due: dueCount,
      skipped: skippedCount,
      bookmarked: bookmarkedCount,
      mastered: 0,
      random: filteredQuestions.length,
    };
  }, [filteredQuestions, poolStatsQuery.data]);

  const eligibleQuestions = useMemo(() => {
    if (selectedModes.includes("random") || selectedModes.length === 0) {
      return filteredQuestions;
    }
    const attemptedSet = new Set(poolStatsQuery.data?.attemptedIds ?? []);
    const wrongSet = new Set(poolStatsQuery.data?.wrongIds ?? []);
    const doubtfulSet = new Set(poolStatsQuery.data?.doubtfulIds ?? []);
    const guessSet = new Set(poolStatsQuery.data?.guessIds ?? []);
    const dueSet = new Set(poolStatsQuery.data?.dueIds ?? []);
    const skippedSet = new Set(poolStatsQuery.data?.skippedIds ?? []);
    const bookmarkedSet = new Set(poolStatsQuery.data?.bookmarkedIds ?? []);

    return filteredQuestions.filter((q) => {
      if (selectedModes.includes("new") && !attemptedSet.has(q.id)) return true;
      if (selectedModes.includes("wrong") && wrongSet.has(q.id)) return true;
      if (selectedModes.includes("doubtful") && doubtfulSet.has(q.id)) return true;
      if (selectedModes.includes("guess") && guessSet.has(q.id)) return true;
      if (selectedModes.includes("due") && dueSet.has(q.id)) return true;
      if (selectedModes.includes("skipped") && skippedSet.has(q.id)) return true;
      if (selectedModes.includes("bookmarked") && bookmarkedSet.has(q.id)) return true;
      return false;
    });
  }, [filteredQuestions, selectedModes, poolStatsQuery.data]);

  const availableCount = eligibleQuestions.length;

  // Standard pacing: ~1.25 min per question, rounded to 5-minute steps.
  // Time must scale UP logically as the question count grows.
  const suggestedMinutes = useMemo(
    () => Math.max(5, Math.round((count * 1.25) / 5) * 5),
    [count]
  );

  function toggleQuestionMode(modeId: QuestionPoolMode) {
    if (modeId === "random") {
      setSelectedModes(["random"]);
      return;
    }

    setSelectedModes((prev) => {
      const withoutRandom = prev.filter((m) => m !== "random");
      if (withoutRandom.includes(modeId)) {
        const next = withoutRandom.filter((m) => m !== modeId);
        return next.length === 0 ? ["random"] : next;
      } else {
        return [...withoutRandom, modeId];
      }
    });
  }

  async function create() {
    if (!profile) return;
    if (selectedSubjects.length === 0) {
      setError("حداقل یک درس را برای آزمون انتخاب کنید.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const id = await database.db.createSession(profile.id, {
        sessionType: "exam",
        count: isContinuous ? null : count,
        mode: isContinuous ? "continuous" : (selectedModes[0] || "random"),
        modes: isContinuous ? undefined : selectedModes,
        subjects: selectedSubjects,
        chapters: scopeMode === "custom" && selectedChapters.length > 0 ? selectedChapters : undefined,
        topics: scopeMode === "custom" && selectedTopics.length > 0 ? selectedTopics : undefined,
        isOpenEnded: isContinuous,
        shuffleQuestions,
        shuffleOptions,
        feedbackMode,
        instantFeedback: feedbackMode === "instant",
        durationMinutes: isTimed ? durationMinutes : null,
        negativeMarking,
        sourceKinds: selectedSources,
      });
      router.push(`/sessions/run/?id=${id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "جلسه ساخته نشد.");
    } finally {
      setBusy(false);
    }
  }

  const stepsHeader = [
    { num: 1, label: "انتخاب درس" },
    { num: 2, label: "سرفصل‌ها" },
    { num: 3, label: "نوع سوالات" },
    { num: 4, label: "تنظیمات" },
    { num: 5, label: "تأیید و ساخت" },
  ];

  const questionPoolCategories: Array<{
    id: QuestionPoolMode;
    title: string;
    desc: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: string;
    textColor: string;
    borderActive: string;
  }> = [
    {
      id: "new",
      title: "سوالات جدید",
      desc: "پاسخ نداده‌اید",
      icon: Sparkles,
      color: "bg-[var(--pastel-green)]",
      textColor: "text-[var(--ink-on-color)]",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "wrong",
      title: "غلط‌ها",
      desc: "پاسخ نادرست داده‌اید",
      icon: AlertCircle,
      color: "bg-[var(--pastel-red)]",
      textColor: "text-white",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "doubtful",
      title: "شک‌دارها",
      desc: "مردد بوده‌اید",
      icon: HelpCircle,
      color: "bg-[var(--pastel-yellow)]",
      textColor: "text-[var(--ink-on-color)]",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "guess",
      title: "حدسی‌ها",
      desc: "بدون اطمینان زده‌اید",
      icon: Zap,
      color: "bg-[var(--brand-purple)]",
      textColor: "text-white",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "bookmarked",
      title: "نشانه‌دارها",
      desc: "ذخیره کرده‌اید",
      icon: Bookmark,
      color: "bg-[var(--surface-3)]",
      textColor: "text-[var(--ink)]",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "due",
      title: "مرور لایتنر",
      desc: "نوبت مرور رسیده",
      icon: RotateCcw,
      color: "bg-[var(--pastel-teal)]",
      textColor: "text-[var(--ink-on-color)]",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "skipped",
      title: "بی‌پاسخ",
      desc: "بدون پاسخ رد شده",
      icon: FastForward,
      color: "bg-[var(--pastel-orange)]",
      textColor: "text-[var(--ink-on-color)]",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
    {
      id: "random",
      title: "همه سوالات",
      desc: "بدون فیلتر",
      icon: Shuffle,
      color: "bg-[var(--pastel-blue)]",
      textColor: "text-[var(--ink-on-color)]",
      borderActive: "border-[var(--line-strong)] bg-[var(--surface-3)]",
    },
  ];

  const presetCounts = [10, 20, 30, 50];

  if (database.status === "loading" || profilesQuery.isLoading) {
    return <LoadingState label="در حال آماده‌سازی اطلاعات آزمون…" />;
  }

  if (!profile) {
    return (
      <div className="card-neo max-w-md mx-auto py-12 px-6 text-center space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl shadow-[4px_4px_0px_var(--neo-shadow)]">
        <AlertCircle size={40} className="mx-auto text-amber-500" />
        <h2 className="text-xl font-black text-[var(--ink)]">پروفایلی یافت نشد</h2>
        <p className="text-xs text-[var(--muted)] font-bold">ابتدا مشخصات تحصیلی و دروس هدف خود را ثبت کنید.</p>
        <Link href="/onboarding/" className="btn-neo-orange inline-flex py-3 px-6 text-sm font-black shadow-[2px_2px_0px_var(--neo-shadow)]">
          ساخت پروفایل
        </Link>
      </div>
    );
  }

  if (allQuestionsQuery.isLoading) {
    return <LoadingState label="در حال بررسی سؤالات بانک…" />;
  }

  if (allPublished.length === 0) {
    return (
      <div className="card-neo max-w-lg mx-auto py-10 px-6 text-center space-y-5 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl shadow-[4px_4px_0px_var(--neo-shadow)]">
        <div className="w-16 h-16 mx-auto rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)]">
          <BookOpen size={32} />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-xl font-black text-[var(--ink)]">بانک سؤالات شما خالی است</h2>
          <p className="text-xs font-bold text-[var(--muted)] leading-relaxed max-w-sm mx-auto">
            هنوز سوالی در بانک سوالات ثبت نشده است. ابتدا سوالات را وارد کنید.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <Link href="/import/" className="btn-neo-orange py-3 px-6 text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-center gap-2">
            <Plus size={16} />
            <span>ورود سؤالات (Import)</span>
          </Link>
          <Link href="/bank/" className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-xs font-black text-[var(--ink)] hover:bg-[var(--surface-3)] transition-colors">
            مشاهده بانک سؤالات
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page session-builder-page max-w-4xl mx-auto space-y-5 pb-8">
      {/* 1. Stepper Header */}
      <div className="card-neo p-4 bg-[var(--surface)]">
        <div className="flex items-center justify-between px-1">
          {stepsHeader.map((s, idx) => {
            const isCurrent = step === s.num;
            const isDone = step > s.num;
            return (
              <div key={s.num} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-black text-xs transition-all border-2",
                      isCurrent
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] scale-110"
                        : isDone
                        ? "bg-[var(--brand-green)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                        : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line)]"
                    )}
                  >
                    {isDone ? <Check size={16} className="stroke-[3]" /> : s.num}
                  </div>
                  <span
                    className={cn(
                      "text-[10px] sm:text-xs font-black mt-1.5 transition-colors whitespace-nowrap",
                      isCurrent ? "text-[var(--brand-orange)]" : isDone ? "text-[var(--ink)]" : "text-[var(--muted)]"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < stepsHeader.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-1 mb-5 transition-colors rounded-full",
                      step > idx + 1 ? "bg-[var(--brand-green)]" : "bg-[var(--line)]"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="p-3.5 rounded-2xl bg-[var(--pastel-red-soft)] text-[var(--pastel-red)] text-xs font-black border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Step Views Container */}
      <div className="card-neo p-5 sm:p-7 space-y-5 bg-[var(--surface)]">
        {/* =================================================================== */}
        {/* STEP 1: انتخاب درس‌ها (Multi-Subject Selection) */}
        {/* =================================================================== */}
        {step === 1 && (
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
                <input
                  type="text"
                  value={subjectSearch}
                  onChange={(e) => setSubjectSearch(e.target.value)}
                  placeholder="جستجوی نام درس..."
                  className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-2xl pr-10 pl-4 py-3 text-xs sm:text-sm font-black text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                />
                <BookOpen size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
              </div>

              {/* Master Toggle: All Subjects */}
              <button
                type="button"
                onClick={toggleAllSubjects}
                className={cn(
                  "py-3 px-4 rounded-2xl border-2 text-xs font-black transition-all flex items-center justify-center gap-2 shadow-[2px_2px_0px_var(--neo-shadow)]",
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
              <span>{allPublished.length} سؤال کل در بانک</span>
            </div>

            {/* Multi-Select Subjects Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto pt-1 pr-0.5">
              {filteredSubjectList.map((s, idx) => {
                const isSelected = selectedSubjects.includes(s);
                const countForSubject = allPublished.filter((q) => isSameSubject(q.subject, s)).length;
                const tileColors = ["bg-[var(--pastel-yellow)]", "bg-[var(--pastel-green)]", "bg-[var(--pastel-orange-soft)]", "bg-[var(--pastel-blue)]"];
                const tileColor = tileColors[idx % tileColors.length];

                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSubject(s)}
                    className={cn(
                      "w-full p-3.5 rounded-2xl border-2 text-right transition-all flex items-center justify-between gap-3",
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
        )}

        {/* =================================================================== */}
        {/* STEP 2: سرفصل‌ها و مباحث هر درس (Taxonomy Breakdown) */}
        {/* =================================================================== */}
        {step === 2 && (
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
            <div className="flex items-center gap-2 p-1.5 bg-[var(--surface-cream)] rounded-2xl border-2 border-[var(--line-strong)]">
              <button
                type="button"
                onClick={() => setScopeMode("all")}
                className={cn(
                  "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 flex items-center justify-center gap-1.5",
                  scopeMode === "all"
                    ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                <Layers size={14} />
                <span>کل مباحث تمام درس‌های انتخابی ({availableCount} سؤال)</span>
              </button>

              <button
                type="button"
                onClick={() => setScopeMode("custom")}
                className={cn(
                  "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2 flex items-center justify-center gap-1.5",
                  scopeMode === "custom"
                    ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                <FolderTree size={14} />
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
                        onClick={() => setExpandedSubject(isExpanded ? null : subjName)}
                        className="w-full p-3.5 bg-[var(--surface-cream)] border-b-2 border-[var(--line-strong)] flex items-center justify-between text-right"
                      >
                        <div className="flex items-center gap-2">
                          <BookOpen size={16} className="text-[var(--brand-orange)]" />
                          <strong className="text-xs sm:text-sm font-black text-[var(--ink)]">{subjName}</strong>
                          <span className="text-[10px] font-bold text-[var(--muted)]">({sTax.total} سؤال)</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-black text-[var(--muted)]">
                            {sTax.chapters.size} فصل
                          </span>
                          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
                                <div className="flex items-center justify-between gap-3">
                                  {/* Checkbox & Chapter Name */}
                                  <button
                                    type="button"
                                    onClick={() => toggleChapter(chName)}
                                    className="flex items-center gap-2.5 text-right flex-1 min-w-0 cursor-pointer"
                                  >
                                    <div
                                      className={cn(
                                        "w-5 h-5 rounded-lg border-2 border-[var(--line-strong)] flex items-center justify-center transition-all shrink-0",
                                        isChSelected ? "bg-[var(--brand-orange)] text-white shadow-[1px_1px_0px_var(--neo-shadow)]" : "bg-[var(--surface)]"
                                      )}
                                    >
                                      {isChSelected && <Check size={13} className="stroke-[3]" />}
                                    </div>
                                    <div className="min-w-0">
                                      <span className="text-xs sm:text-sm font-black text-[var(--ink)] block truncate">
                                        {chName}
                                      </span>
                                      <span className="text-[10px] text-[var(--muted)] font-bold">
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
                                  <div className="flex items-center gap-2 shrink-0">
                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line)] text-[var(--ink)]">
                                      {chData.total} سؤال
                                    </span>

                                    {hasTopics && (
                                      <button
                                        type="button"
                                        onClick={() => toggleChapterDropdown(chKey)}
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
                                          onClick={() => selectAllTopicsInChapter(topicList.map(([t]) => t))}
                                          className="text-[10px] font-black text-[var(--brand-blue)] hover:underline"
                                        >
                                          انتخاب همه
                                        </button>
                                        <span className="text-[var(--muted)]">•</span>
                                        <button
                                          type="button"
                                          onClick={() => deselectAllTopicsInChapter(topicList.map(([t]) => t))}
                                          className="text-[10px] font-black text-[var(--muted)] hover:text-[var(--danger)]"
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
                                            onClick={() => toggleTopic(topName)}
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
                                              <span className="truncate">{topName}</span>
                                            </div>
                                            <span className="text-[10px] text-[var(--muted)] font-black shrink-0">
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
        )}

        {/* =================================================================== */}
        {/* STEP 3: نوع سوالات (Question Types - Multi-Select Pool) */}
        {/* =================================================================== */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="text-right space-y-1">
              <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
                مرحله ۳ از ۵
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">نوع سوالات</h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">
                دسته‌های موردنظر را انتخاب کنید.
              </p>
            </div>

            {/* Selection Status Banner */}
            <div className="p-3 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap">
                {selectedModes.includes("random") ? (
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-lg bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
                    همه سوالات
                  </span>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {selectedModes.map((m) => {
                      const cat = questionPoolCategories.find((c) => c.id === m);
                      return (
                        <span
                          key={m}
                          className="text-[11px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] border border-[var(--line-strong)]"
                        >
                          {cat?.title}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
              <span className="text-xs font-black text-[var(--brand-orange)]">
                {availableCount.toLocaleString("fa-IR")} سؤال قابل انتخاب
              </span>
            </div>

            {/* Source Selection Checkboxes */}
            <div className="p-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-right">
                <div>
                  <h3 className="text-xs sm:text-sm font-black text-[var(--ink)]">منبع سؤالات آزمون</h3>
                  <p className="text-[11px] text-[var(--muted)] font-medium">
                    با تیک زدن گزینه‌ها مشخص کنید سؤالات از کدام منابع انتخاب شوند (امکان انتخاب همزمان چند مورد)
                  </p>
                </div>
                <span className="text-[10px] sm:text-[11px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)] self-start sm:self-auto">
                  {selectedSources.length === 3 ? "همه منابع فعال" : `${selectedSources.length} منبع انتخابی`}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
                {[
                  {
                    id: "EXAM" as const,
                    title: "کنکور سراسری",
                    desc: "سؤالات رسمی سازمان سنجش",
                    count: sourceCounts.EXAM,
                  },
                  {
                    id: "PERSONAL" as const,
                    title: "تألیفی و جزوات",
                    desc: "تست‌های تألیفی و دست‌نویس اساتید",
                    count: sourceCounts.PERSONAL,
                  },
                  {
                    id: "AI" as const,
                    title: "شبیه‌ساز هوش مصنوعی",
                    desc: "سؤالات مفهومی و تمرینی",
                    count: sourceCounts.AI,
                  },
                ].map((src) => {
                  const isChecked = selectedSources.includes(src.id);
                  return (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => toggleSource(src.id)}
                      className={cn(
                        "p-3 rounded-xl border-2 text-right transition-all flex items-center justify-between gap-2 cursor-pointer select-none",
                        isChecked
                          ? "border-[var(--brand-orange)] bg-[var(--surface-cream)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                          : "border-[var(--line)] bg-[var(--surface-2)] opacity-70 hover:opacity-100"
                      )}
                    >
                      <div className="space-y-0.5 min-w-0">
                        <strong className="block text-xs font-black text-[var(--ink)]">{src.title}</strong>
                        <span className="block text-[10px] text-[var(--muted)] font-medium truncate">{src.desc}</span>
                        <span className="inline-block text-[10px] font-black text-[var(--brand-orange)] pt-0.5">
                          {src.count.toLocaleString("fa-IR")} سؤال
                        </span>
                      </div>
                      <div
                        className={cn(
                          "w-5 h-5 rounded-md border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 transition-all",
                          isChecked ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface)] text-transparent"
                        )}
                      >
                        <Check size={12} className="stroke-[3]" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 8 Categories Multi-Select Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {questionPoolCategories.map((t) => {
                const Icon = t.icon;
                const isSelected = selectedModes.includes(t.id);
                const countInPool = poolCounts[t.id] ?? 0;

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleQuestionMode(t.id)}
                    className={cn(
                      "w-full p-4 rounded-2xl border-2 text-right transition-all flex items-center justify-between gap-3 cursor-pointer",
                      isSelected
                        ? cn("shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5", t.borderActive)
                        : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div className={cn("w-12 h-12 rounded-2xl border-2 border-[var(--line-strong)] flex items-center justify-center font-black shrink-0", t.color, t.textColor)}>
                        <Icon size={22} />
                      </div>
                      <div className="space-y-0.5">
                        <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">{t.title}</strong>
                        <span className="text-[11px] text-[var(--muted)] font-medium line-clamp-1">{t.desc}</span>
                        <div className="pt-0.5">
                          <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)]">
                            {countInPool.toLocaleString("fa-IR")} سؤال
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Checkbox Box */}
                    <div
                      className={cn(
                        "w-6 h-6 rounded-lg border-2 border-[var(--line-strong)] flex items-center justify-center transition-all shrink-0",
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
        )}

        {/* =================================================================== */}
        {/* STEP 4: تنظیمات آزمون (Mode, Time, Toggles) */}
        {/* =================================================================== */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="text-right space-y-1">
              <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
                مرحله ۴ از ۵
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">تنظیمات و شیوه برگزاری</h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">نوع بازخورد، زمان‌بندی و تنظیمات آزمون را تعیین کنید.</p>
            </div>

            {/* 1. Feedback Mode Selector (Card 1: Official Exam vs Card 2: Instant Review) */}
            <div className="space-y-2">
              <span className="text-xs font-black text-[var(--ink)] block">شیوه پاسخ‌دهی و نمایش نتایج:</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Mode A: آزمون رسمی */}
                <button
                  type="button"
                  onClick={() => setFeedbackMode("deferred")}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer",
                    feedbackMode === "deferred"
                      ? "border-[var(--line-strong)] bg-[var(--pastel-yellow-soft)] shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5"
                      : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                      <Clock size={20} />
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--ink)]">
                      شبیه‌ساز کنکور
                    </span>
                  </div>
                  <div>
                    <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">
                      آزمون رسمی
                    </strong>
                    <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed mt-1">
                      پاسخ‌ها و کارنامه فقط پس از پایان آزمون نمایش داده می‌شود.
                    </p>
                  </div>
                </button>

                {/* Mode B: تمرین و تحلیل آنی */}
                <button
                  type="button"
                  onClick={() => setFeedbackMode("instant")}
                  className={cn(
                    "p-4 rounded-2xl border-2 text-right transition-all flex flex-col justify-between gap-3 cursor-pointer",
                    feedbackMode === "instant"
                      ? "border-[var(--line-strong)] bg-[var(--pastel-green-soft)] shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5"
                      : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)] hover:bg-[var(--surface)]"
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="w-10 h-10 rounded-xl bg-[var(--pastel-green)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                      <Sparkles size={20} />
                    </div>
                    <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--ink)]">
                      تمرین
                    </span>
                  </div>
                  <div>
                    <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">
                      تمرین با تحلیل آنی
                    </strong>
                    <p className="text-[11px] text-[var(--muted)] font-medium leading-relaxed mt-1">
                      پاسخ و تحلیل هر سوال بلافاصله پس از ثبت گزینه نمایش داده می‌شود.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 2. Count & Time Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Question Count Selection */}
              <div className="p-4 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
                    <ListOrdered size={16} className="text-[var(--brand-orange)]" />
                    <span>تعداد سوال</span>
                  </span>
                  <span className="text-xs font-black px-3 py-1 rounded-xl bg-[var(--brand-orange)] text-white border-2 border-[var(--line-strong)]">
                    {isContinuous ? "پیوسته (بی‌نهایت)" : `${count} سؤال`}
                  </span>
                </div>

                {/* Preset numbers + Continuous Mode Button */}
                <div className="grid grid-cols-5 gap-1.5">
                  {presetCounts.map((num) => (
                    <button
                      key={num}
                      type="button"
                      onClick={() => {
                        setCount(num);
                        setIsContinuous(false);
                        if (!timeTouched) {
                          setDurationMinutes(Math.max(5, Math.round((num * 1.25) / 5) * 5));
                          setCustomMinutes("");
                        }
                      }}
                      className={cn(
                        "py-2.5 rounded-xl text-xs font-black transition-all border-2 cursor-pointer",
                        !isContinuous && count === num
                          ? "bg-[var(--ink)] text-[var(--bg)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                          : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
                      )}
                    >
                      {num}
                    </button>
                  ))}

                  <button
                    type="button"
                    onClick={() => setIsContinuous(true)}
                    className={cn(
                      "py-2.5 px-1 rounded-xl text-xs font-black transition-all border-2 flex items-center justify-center gap-1 cursor-pointer",
                      isContinuous
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
                    )}
                    title="آزمون پیوسته: بدون محدودیت تعداد سوال"
                  >
                    <Infinity size={13} />
                    <span className="text-[10px] sm:text-xs">پیوسته</span>
                  </button>
                </div>

                {isContinuous ? (
                  <div className="p-2.5 rounded-xl bg-[var(--pastel-green-soft)] border border-[var(--line-strong)] text-[11px] font-bold text-[var(--ink)] leading-relaxed flex items-center gap-1.5">
                    <Zap size={14} className="text-[var(--brand-orange)] shrink-0" />
                    <span><strong>حالت پیوسته فعال شد:</strong> سوالات بدون محدودیت و زنجیره‌ای ادامه پیدا می‌کنند.</span>
                  </div>
                ) : (
                  <p className="text-[10px] text-[var(--muted)] font-bold">
                    {availableCount.toLocaleString("fa-IR")} سؤال قابل انتخاب.
                  </p>
                )}
              </div>

              {/* Timed Switch & Custom Minutes */}
              <div className="p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-[var(--ink)]">زمان آزمون</span>
                  <div className="flex items-center gap-1 bg-[var(--surface-2)] p-1 rounded-xl border-2 border-[var(--line-strong)]">
                    <button
                      type="button"
                      onClick={() => setIsTimed(true)}
                      className={cn(
                        "px-3 py-1 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                        isTimed ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]" : "text-[var(--muted)]"
                      )}
                    >
                      <span>زمان‌دار</span>
                      <Timer size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsTimed(false)}
                      className={cn(
                        "px-3 py-1 text-xs font-black rounded-lg transition-all flex items-center gap-1.5 cursor-pointer",
                        !isTimed ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border border-[var(--line-strong)]" : "text-[var(--muted)]"
                      )}
                    >
                      <span>آزاد</span>
                      <Infinity size={13} />
                    </button>
                  </div>
                </div>

                {isTimed && (
                  <div className="space-y-2.5 pt-1">
                    {/* Quick Preset Minutes */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {[15, 30, 45, 60, 90].map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setDurationMinutes(m);
                            setCustomMinutes("");
                            setTimeTouched(true);
                          }}
                          className={cn(
                            "px-2.5 py-1 rounded-xl text-xs font-black border transition-all cursor-pointer",
                            durationMinutes === m && !customMinutes
                              ? "bg-[var(--ink)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                              : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
                          )}
                        >
                          {m} دقیقه
                        </button>
                      ))}
                    </div>

                    {/* Auto-suggested time for the current question count */}
                    {suggestedMinutes !== durationMinutes && (
                      <button
                        type="button"
                        onClick={() => {
                          setDurationMinutes(suggestedMinutes);
                          setCustomMinutes("");
                          setTimeTouched(false);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)] transition-all cursor-pointer"
                      >
                        <Timer size={12} />
                        <span>پیشنهاد برای {count.toLocaleString("fa-IR")} سؤال: {suggestedMinutes.toLocaleString("fa-IR")} دقیقه</span>
                      </button>
                    )}

                    {/* Custom Minutes Input */}
                    <div className="flex items-center gap-2 pt-2 border-t border-[var(--line)]">
                      <span className="text-xs font-black text-[var(--muted)] shrink-0">مدت دلخواه:</span>
                      <div className="relative flex-1">
                        <input
                          type="number"
                          min={1}
                          max={360}
                          placeholder="مثلاً ۲۵ یا ۷۵"
                          value={customMinutes}
                          onChange={(e) => {
                            const v = e.target.value;
                            setCustomMinutes(v);
                            setTimeTouched(true);
                            if (v && Number(v) > 0) {
                              setDurationMinutes(Number(v));
                            }
                          }}
                          className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-1.5 text-xs font-black text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)]"
                        />
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-[var(--muted)]">
                          دقیقه
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 3. Neo-Brutalist Toggle Switches */}
            <div className="p-4 sm:p-5 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-4">
              <strong className="block text-xs font-black text-[var(--ink)] pb-2 border-b border-[var(--line)]">
                شیوه‌نامه برگزاری و قوانین آزمون
              </strong>

              <div className="space-y-3.5">
                {/* 1. نمره منفی ۱/۳ */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={negativeMarking}
                  onClick={() => setNegativeMarking(!negativeMarking)}
                  className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
                >
                  <div className="flex-1">
                    <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                      نمره منفی (۱/۳ کنکور)
                    </span>
                    <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                      به ازای هر ۳ پاسخ اشتباه، ۱ پاسخ صحیح کسر می‌شود.
                    </span>
                  </div>
                  <div
                    className={cn(
                      "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                      negativeMarking ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                        negativeMarking ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                      )}
                    >
                      {negativeMarking ? <Check size={12} strokeWidth={3} /> : null}
                    </div>
                  </div>
                </button>

                {/* 2. بر هم زدن ترتیب سوالات */}
                <div className="border-t border-[var(--line)] pt-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shuffleQuestions}
                    onClick={() => setShuffleQuestions(!shuffleQuestions)}
                    className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
                  >
                    <div className="flex-1">
                      <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                        بر هم زدن تصادفی ترتیب سؤالات
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                        ترتیب پسیج‌های درک مطلب حفظ می‌شود.
                      </span>
                    </div>
                    <div
                      className={cn(
                        "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                        shuffleQuestions ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                          shuffleQuestions ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                        )}
                      >
                        {shuffleQuestions ? <Check size={12} strokeWidth={3} /> : null}
                      </div>
                    </div>
                  </button>
                </div>

                {/* 3. بر هم زدن ترتیب گزینه‌ها */}
                <div className="border-t border-[var(--line)] pt-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={shuffleOptions}
                    onClick={() => setShuffleOptions(!shuffleOptions)}
                    className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
                  >
                    <div className="flex-1">
                      <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                        بر هم زدن تصادفی گزینه‌ها (الف تا د)
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                        جای گزینه‌ها تصادفی می‌شود.
                      </span>
                    </div>
                    <div
                      className={cn(
                        "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                        shuffleOptions ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                          shuffleOptions ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                        )}
                      >
                        {shuffleOptions ? <Check size={12} strokeWidth={3} /> : null}
                      </div>
                    </div>
                  </button>
                </div>

                {/* 4. نمایش پاسخ‌نامه */}
                <div className="border-t border-[var(--line)] pt-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showAnswerSheet}
                    onClick={() => setShowAnswerSheet(!showAnswerSheet)}
                    className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
                  >
                    <div className="flex-1">
                      <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                        نمایش کلید پاسخ‌نامه پس از پایان
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                        مقایسه پاسخ شما با کلید در کارنامه.
                      </span>
                    </div>
                    <div
                      className={cn(
                        "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                        showAnswerSheet ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                          showAnswerSheet ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                        )}
                      >
                        {showAnswerSheet ? <Check size={12} strokeWidth={3} /> : null}
                      </div>
                    </div>
                  </button>
                </div>

                {/* 5. نمایش تحلیل تشریحی */}
                <div className="border-t border-[var(--line)] pt-3.5">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={showExplanations}
                    onClick={() => setShowExplanations(!showExplanations)}
                    className="w-full flex items-center justify-between gap-3 text-right group cursor-pointer"
                  >
                    <div className="flex-1">
                      <span className="font-black text-xs sm:text-sm text-[var(--ink)] block group-hover:text-[var(--brand-orange)] transition-colors">
                        نمایش پاسخ تشریحی و تحلیل ۳ گامی
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-medium block mt-0.5">
                        ایده، حل کامل و دلیل رد گزینه‌ها.
                      </span>
                    </div>
                    <div
                      className={cn(
                        "w-12 h-7 rounded-full border-2 border-[var(--line-strong)] transition-all p-0.5 flex items-center shadow-[1px_1px_0px_var(--neo-shadow)] shrink-0",
                        showExplanations ? "bg-[var(--brand-orange)] justify-end" : "bg-[var(--surface-3)] justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "w-5 h-5 rounded-full border border-[var(--line-strong)] bg-white transition-all shadow-sm flex items-center justify-center text-[10px]",
                          showExplanations ? "text-[var(--brand-orange)] font-black" : "text-transparent"
                        )}
                      >
                        {showExplanations ? <Check size={12} strokeWidth={3} /> : null}
                      </div>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* =================================================================== */}
        {/* STEP 5: تأیید و ساخت آزمون */}
        {/* =================================================================== */}
        {step === 5 && (
          <div className="space-y-5 text-center">
            <div className="text-right space-y-1">
              <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)]">
                مرحله ۵ از ۵
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">تأیید و ساخت آزمون</h2>
              <p className="text-xs sm:text-sm text-[var(--muted)] font-bold">تنظیمات را بررسی کنید و آزمون را بسازید.</p>
            </div>

            {/* Summary Card */}
            <div className="p-5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] text-right space-y-3 text-xs sm:text-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[var(--line)]">
                <span className="text-[var(--muted)] font-bold">درس‌های انتخابی ({selectedSubjects.length}):</span>
                <div className="flex flex-wrap gap-1.5 justify-start sm:justify-end">
                  {selectedSubjects.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded-lg bg-[var(--surface)] border border-[var(--line-strong)] text-xs font-black text-[var(--ink)]"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--line)]">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)] font-bold">محدوده سرفصل‌ها:</span>
                  <strong className="font-black text-[var(--ink)]">
                    {scopeMode === "all"
                      ? "کل مباحث تمام درس‌های انتخابی"
                      : [
                          selectedChapters.length > 0 ? `${selectedChapters.length} فصل` : "",
                          selectedTopics.length > 0 ? `${selectedTopics.length} مبحث` : "",
                        ]
                          .filter(Boolean)
                          .join(" و ") || "تمام سرفصل‌ها"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)] font-bold">نوع سوالات:</span>
                  <strong className="font-black text-[var(--ink)]">
                    {selectedModes.includes("random")
                      ? "همه سوالات"
                      : selectedModes.map((m) => questionPoolCategories.find((c) => c.id === m)?.title).filter(Boolean).join(" + ")}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--line)]">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)] font-bold">شیوه بازخورد:</span>
                  <strong className="font-black text-[var(--ink)]">
                    {feedbackMode === "instant" ? "تمرین با تحلیل آنی" : "آزمون رسمی"}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)] font-bold">نمره منفی:</span>
                  <strong className="font-black text-[var(--ink)]">
                    {negativeMarking ? "دارد (۱/۳)" : "ندارد"}
                  </strong>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pb-3 border-b border-[var(--line)]">
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)] font-bold">تعداد سوال:</span>
                  <strong className="font-black text-[var(--brand-orange)]">
                    {isContinuous ? "پیوسته (نامحدود)" : `${count} سؤال`}
                  </strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[var(--muted)] font-bold">زمان آزمون:</span>
                  <strong className="font-black text-[var(--ink)]">
                    {isTimed ? `${durationMinutes} دقیقه` : "آزاد (بدون محدودیت)"}
                  </strong>
                </div>
              </div>

              <div className="flex justify-between items-center pb-3 border-b border-[var(--line)]">
                <span className="text-[var(--muted)] font-bold">منبع سؤالات:</span>
                <strong className="font-black text-[var(--ink)]">
                  {selectedSources.length === 3
                    ? "همه منابع فعال"
                    : selectedSources
                        .map((s) => (s === "EXAM" ? "کنکور سراسری" : s === "PERSONAL" ? "تألیفی و جزوات" : "شبیه‌ساز"))
                        .join(" + ")}
                </strong>
              </div>

              <div className="space-y-1 pt-1">
                <span className="text-xs font-black text-[var(--muted)] block">سایر تنظیمات:</span>
                <div className="text-xs text-[var(--ink)] font-bold grid grid-cols-2 gap-1 pr-2">
                  <div>• نمایش پاسخ‌نامه: {showAnswerSheet ? "بله" : "خیر"}</div>
                  <div>• نمایش تحلیل: {showExplanations ? "بله" : "خیر"}</div>
                  <div>• ترتیب سوالات: {shuffleQuestions ? "مخلوط (با حفظ یکپارچگی پسیج)" : "عادی"}</div>
                  <div>• ترتیب گزینه‌ها: {shuffleOptions ? "مخلوط" : "عادی"}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 3. Navigation Buttons Between Steps */}
        <div className="flex items-center gap-3 pt-2">
          {step > 1 && (
            <button
              type="button"
              onClick={() => setStep((s) => s - 1)}
              className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5"
            >
              <ChevronRight size={16} />
              <span>بازگشت</span>
            </button>
          )}

          {step < 5 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && selectedSubjects.length === 0) {
                  setError("لطفاً حداقل یک درس را انتخاب کنید.");
                  return;
                }
                setError("");
                setStep((s) => s + 1);
              }}
              className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2"
            >
              <span>ادامه</span>
              <ArrowLeft size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={create}
              disabled={busy || availableCount === 0}
              className="btn-neo-orange flex-1 py-4 text-sm font-black flex items-center justify-center gap-2"
            >
              <span>{busy ? "در حال ساخت آزمون…" : "ساخت آزمون"}</span>
              {!busy && <Play size={16} className="fill-current" />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
