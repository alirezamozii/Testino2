"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Eye,
  EyeOff,
  FastForward,
  Filter,
  Flame,
  HelpCircle,
  History,
  Layers,
  Lightbulb,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Star,
  Target,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { ErrorState, LoadingState } from "@/components/ui/testino-ui";
import type { QuestionPoolMode } from "@/database/app-database";
import { isSameSubject } from "@/features/questions/domain/subject-registry";
import { cn } from "@/lib/utils";
import { useDatabase } from "@/providers/database-provider";

type ViewMode = "study" | "test" | "overview";
type ScopeMode = "all" | "custom";
type CountChoice = 5 | 10 | 15 | 20 | 30 | "all";
type ReviewPoolMode = "wrong" | "doubtful" | "guess" | "skipped" | "due" | "mastered";
type DateRangeChoice = "all" | "7d" | "30d" | "90d";

const NO_CHAPTER = "عمومی / بدون فصل";
const chapterToken = (subject: string, chapter: string) => `${subject}::${chapter}`;
const topicToken = (subject: string, chapter: string, topic: string) => `${subject}::${chapter}::${topic}`;
const PERSIAN_LETTERS = ["الف", "ب", "ج", "د"];

const POOL_CATEGORIES: Array<{
  id: ReviewPoolMode;
  title: string;
  icon: React.ElementType;
  activeClass: string;
  badgeClass: string;
}> = [
  { id: "wrong", title: "غلط‌ها", icon: XCircle, activeClass: "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-600", badgeClass: "bg-red-100 text-red-700 border-red-300 dark:bg-red-950 dark:text-red-300" },
  { id: "doubtful", title: "با شک", icon: HelpCircle, activeClass: "bg-amber-50 dark:bg-amber-950/40 border-amber-500 text-amber-600", badgeClass: "bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950 dark:text-amber-300" },
  { id: "guess", title: "حدسی", icon: Zap, activeClass: "bg-purple-50 dark:bg-purple-950/40 border-purple-500 text-purple-600", badgeClass: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-300" },
  { id: "skipped", title: "نزده", icon: FastForward, activeClass: "bg-slate-100 dark:bg-slate-900/50 border-slate-500 text-slate-600", badgeClass: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-300" },
  { id: "due", title: "لایتنر", icon: RotateCcw, activeClass: "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600", badgeClass: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300" },
  { id: "mastered", title: "مسلط", icon: Star, activeClass: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-600", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" },
];

const STAT_STYLES: Partial<Record<QuestionPoolMode, string>> = {
  wrong: "bg-red-50 dark:bg-red-950/30",
  doubtful: "bg-amber-50 dark:bg-amber-950/30",
  guess: "bg-purple-50 dark:bg-purple-950/30",
  skipped: "bg-slate-100 dark:bg-slate-900/40",
  due: "bg-blue-50 dark:bg-blue-950/30",
  mastered: "bg-emerald-50 dark:bg-emerald-950/30",
};

const PRIORITY_LABELS: Record<number, { label: string; className: string }> = {
  0: { label: "فوری", className: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950/50 dark:text-red-300" },
  1: { label: "نزده", className: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900 dark:text-slate-200" },
  2: { label: "با شک", className: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/50 dark:text-amber-300" },
  3: { label: "موعد", className: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950/50 dark:text-blue-300" },
  4: { label: "حدسی", className: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950/50 dark:text-purple-300" },
};

export function ReviewPage() {
  const { db, status } = useDatabase();
  const [viewMode, setViewMode] = useState<ViewMode>("study");

  // Filters
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isSessionListOpen, setIsSessionListOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeChoice>("all");
  const [categoryMode, setCategoryMode] = useState<"all" | ReviewPoolMode>("all");
  const [subjectSearch, setSubjectSearch] = useState("");
  const [selectedSubjectsOverride, setSelectedSubjectsOverride] = useState<string[] | null>(null);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("all");
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [openExplanations, setOpenExplanations] = useState<Record<string, boolean>>({});
  const [allExplanationsOpen, setAllExplanationsOpen] = useState(false);

  // Test Mode options
  const [launchModes, setLaunchModes] = useState<ReviewPoolMode[]>(["wrong", "doubtful", "guess", "skipped", "due"]);
  const [launchCount, setLaunchCount] = useState<CountChoice>(15);

  // Queries
  const profilesQuery = useQuery({ queryKey: ["profiles"], queryFn: () => db.listProfiles(), enabled: status === "ready" });
  const profile = profilesQuery.data?.[0];

  const sessionsQuery = useQuery({
    queryKey: ["profile-sessions", profile?.id],
    queryFn: () => (profile ? db.listSessions(profile.id) : []),
    enabled: Boolean(profile) && status === "ready",
  });

  const questionsQuery = useQuery({
    queryKey: ["review-setup-questions"],
    queryFn: () => db.listQuestions({ limit: 10_000, status: "published" }),
    enabled: status === "ready",
  });

  const dueQuery = useQuery({ queryKey: ["reviews"], queryFn: () => db.listDueReviews(), enabled: status === "ready" });

  const finishedSessions = useMemo(
    () => sessionsQuery.data?.filter((s) => s.state === "FINISHED") ?? [],
    [sessionsQuery.data]
  );

  // Derive subjects involved in each session
  const sessionSubjectsMap = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const session of finishedSessions) {
      const set = new Set<string>();
      if (session.config?.subjectFilters && session.config.subjectFilters.length > 0) {
        for (const s of session.config.subjectFilters) set.add(s);
      } else if (session.config?.subjectFilter && session.config.subjectFilter !== "all") {
        set.add(session.config.subjectFilter);
      }
      map.set(session.id, set);
    }
    return map;
  }, [finishedSessions]);

  // All subjects across the selected sessions
  const activeSessionSubjects = useMemo(() => {
    if (selectedSessionIds.length === 0) return null; // all sessions
    const active = new Set<string>();
    for (const sid of selectedSessionIds) {
      const subs = sessionSubjectsMap.get(sid);
      if (subs) {
        for (const s of subs) active.add(s);
      }
    }
    return active;
  }, [selectedSessionIds, sessionSubjectsMap]);

  const poolFilter = useMemo(() => ({
    sessionIds: selectedSessionIds.length > 0 ? selectedSessionIds : null,
    dateRange: selectedDateRange !== "all" ? selectedDateRange : null,
  }), [selectedDateRange, selectedSessionIds]);

  const statsQuery = useQuery({
    queryKey: ["review-stats", profile?.id, poolFilter],
    queryFn: () => (profile ? db.getReviewStats(profile.id, poolFilter) : null),
    enabled: Boolean(profile) && status === "ready",
  });

  const poolStatsQuery = useQuery({
    queryKey: ["question-pool-stats", profile?.id, poolFilter],
    queryFn: () => (profile ? db.getQuestionPoolStats(profile.id, poolFilter) : null),
    enabled: Boolean(profile) && status === "ready",
  });

  const allPublished = useMemo(() => questionsQuery.data ?? [], [questionsQuery.data]);
  const subjectsInBank = useMemo(() => Array.from(new Set(allPublished.map((question) => question.subject))).filter(Boolean), [allPublished]);
  const profileSubjects = useMemo(
    () => profile?.subjects.filter((subject) => subject.coefficient > 0).map((subject) => subject.name) ?? [],
    [profile]
  );
  const availableSubjects = profileSubjects.length > 0 ? profileSubjects : subjectsInBank;
  const selectedSubjects = selectedSubjectsOverride ?? availableSubjects;
  const visibleSubjects = subjectSearch.trim()
    ? availableSubjects.filter((subject) => subject.includes(subjectSearch.trim()))
    : availableSubjects;

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const subject of availableSubjects) {
      counts.set(subject, allPublished.filter((question) => isSameSubject(subject, question.subject)).length);
    }
    return counts;
  }, [allPublished, availableSubjects]);

  const taxonomy = useMemo(() => {
    const result = new Map<string, Map<string, { total: number; topics: Map<string, number> }>>();
    for (const subject of selectedSubjects) result.set(subject, new Map());
    for (const question of allPublished) {
      const subject = selectedSubjects.find((name) => isSameSubject(name, question.subject));
      if (!subject) continue;
      const chapter = question.chapter || NO_CHAPTER;
      const chapters = result.get(subject)!;
      const current = chapters.get(chapter) ?? { total: 0, topics: new Map<string, number>() };
      current.total += 1;
      if (question.topic) current.topics.set(question.topic, (current.topics.get(question.topic) ?? 0) + 1);
      chapters.set(chapter, current);
    }
    return result;
  }, [allPublished, selectedSubjects]);

  // Study questions query
  const studyQuery = useQuery({
    queryKey: [
      "review-study-questions",
      profile?.id,
      poolFilter,
      categoryMode,
      selectedSubjects,
      scopeMode,
      selectedChapters,
      selectedTopics,
      searchQuery,
    ],
    queryFn: () => {
      if (!profile) return [];
      return db.getReviewStudyQuestions(profile.id, {
        sessionIds: poolFilter.sessionIds,
        dateRange: poolFilter.dateRange,
        modes: categoryMode === "all" ? undefined : [categoryMode],
        subjects: selectedSubjects,
        chapters: scopeMode === "custom" ? selectedChapters : undefined,
        topics: scopeMode === "custom" ? selectedTopics : undefined,
        search: searchQuery,
      });
    },
    enabled: Boolean(profile) && status === "ready" && viewMode === "study",
  });

  const filteredQuestions = useMemo(() => {
    let result = allPublished.filter((question) => selectedSubjects.some((subject) => isSameSubject(subject, question.subject)));
    if (scopeMode === "all") return result;
    if (selectedChapters.length > 0) {
      const selected = new Set(selectedChapters);
      result = result.filter((question) => {
        const chapter = question.chapter || NO_CHAPTER;
        return selectedSubjects.some((subject) => isSameSubject(subject, question.subject) && selected.has(chapterToken(subject, chapter)));
      });
    }
    if (selectedTopics.length > 0) {
      const selected = new Set(selectedTopics);
      result = result.filter((question) => {
        if (!question.topic) return false;
        const chapter = question.chapter || NO_CHAPTER;
        return selectedSubjects.some((subject) => isSameSubject(subject, question.subject) && selected.has(topicToken(subject, chapter, question.topic!)));
      });
    }
    return result;
  }, [allPublished, scopeMode, selectedChapters, selectedSubjects, selectedTopics]);

  const poolSets = useMemo(() => {
    const data = poolStatsQuery.data;
    const sets: Record<ReviewPoolMode, Set<string>> = {
      wrong: new Set(data?.wrongIds ?? []),
      doubtful: new Set(data?.doubtfulIds ?? []),
      guess: new Set(data?.guessIds ?? []),
      skipped: new Set(data?.skippedIds ?? []),
      due: new Set(data?.dueIds ?? []),
      mastered: new Set(data?.masteredIds ?? []),
    };
    return sets;
  }, [poolStatsQuery.data]);

  const filteredPoolCounts = useMemo(() => {
    const counts: Partial<Record<QuestionPoolMode, number>> = {};
    for (const category of POOL_CATEGORIES) {
      counts[category.id] = filteredQuestions.filter((question) => poolSets[category.id].has(question.id)).length;
    }
    return counts;
  }, [filteredQuestions, poolSets]);

  const eligibleQuestions = useMemo(
    () => filteredQuestions.filter((question) => launchModes.some((mode) => poolSets[mode]?.has(question.id))),
    [filteredQuestions, launchModes, poolSets]
  );
  const matchingCount = eligibleQuestions.length;
  const requestedCount = launchCount === "all" ? matchingCount : Math.min(launchCount, matchingCount);

  const reviewRunnerUrl = useMemo(() => {
    const params = new URLSearchParams();
    params.set("modes", launchModes.join(","));
    params.set("count", String(Math.max(1, requestedCount)));
    params.set("subjects", selectedSubjects.join(","));
    if (scopeMode === "custom" && selectedChapters.length > 0) params.set("chapters", selectedChapters.join(","));
    if (scopeMode === "custom" && selectedTopics.length > 0) params.set("topics", selectedTopics.join(","));
    if (selectedSessionIds.length > 0) params.set("sessionIds", selectedSessionIds.join(","));
    if (selectedDateRange !== "all") params.set("dateRange", selectedDateRange);
    return `/review/run/?${params.toString()}`;
  }, [launchModes, requestedCount, scopeMode, selectedChapters, selectedDateRange, selectedSessionIds, selectedSubjects, selectedTopics]);

  function toggleSubject(subject: string) {
    setSelectedSubjectsOverride((override) => {
      const current = override ?? availableSubjects;
      return current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject];
    });
    setSelectedChapters((current) => current.filter((token) => !token.startsWith(`${subject}::`)));
    setSelectedTopics((current) => current.filter((token) => !token.startsWith(`${subject}::`)));
  }

  function toggleAllSubjects() {
    if (selectedSubjects.length === availableSubjects.length) {
      setSelectedSubjectsOverride([]);
      setSelectedChapters([]);
      setSelectedTopics([]);
    } else {
      setSelectedSubjectsOverride([...availableSubjects]);
    }
  }

  function toggleMode(mode: ReviewPoolMode) {
    setLaunchModes((current) => (current.includes(mode) ? current.filter((item) => item !== mode) : [...current, mode]));
  }

  function toggleChapter(subject: string, chapter: string) {
    const token = chapterToken(subject, chapter);
    const wasSelected = selectedChapters.includes(token);
    setSelectedChapters((current) => (current.includes(token) ? current.filter((item) => item !== token) : [...current, token]));
    if (wasSelected) setSelectedTopics((current) => current.filter((item) => !item.startsWith(`${token}::`)));
  }

  function toggleTopic(subject: string, chapter: string, topic: string) {
    const token = topicToken(subject, chapter, topic);
    const parent = chapterToken(subject, chapter);
    setSelectedTopics((current) => (current.includes(token) ? current.filter((item) => item !== token) : [...current, token]));
    setSelectedChapters((current) => (current.includes(parent) ? current : [...current, parent]));
  }

  function toggleExplanation(questionId: string) {
    setOpenExplanations((prev) => ({ ...prev, [questionId]: !prev[questionId] }));
  }

  function toggleAllExplanations() {
    const nextState = !allExplanationsOpen;
    setAllExplanationsOpen(nextState);
    if (studyQuery.data) {
      const updated: Record<string, boolean> = {};
      for (const item of studyQuery.data) {
        updated[item.question.id] = nextState;
      }
      setOpenExplanations(updated);
    }
  }

  function toggleSession(sessionId: string) {
    setSelectedSessionIds((prev) =>
      prev.includes(sessionId) ? prev.filter((id) => id !== sessionId) : [...prev, sessionId]
    );
  }

  function selectAllSessions() {
    setSelectedSessionIds(finishedSessions.map((s) => s.id));
  }

  function clearSessions() {
    setSelectedSessionIds([]);
  }

  function applyActiveSessionSubjects() {
    if (activeSessionSubjects && activeSessionSubjects.size > 0) {
      setSelectedSubjectsOverride(Array.from(activeSessionSubjects));
    }
  }

  if (profilesQuery.isLoading || questionsQuery.isLoading || dueQuery.isLoading) {
    return <LoadingState label="در حال آماده‌سازی مرکز مرور…" />;
  }

  if (profilesQuery.isError || questionsQuery.isError || dueQuery.isError) {
    return (
      <ErrorState
        message="اطلاعات مرور بارگذاری نشد."
        retry={() => {
          void profilesQuery.refetch();
          void questionsQuery.refetch();
          void dueQuery.refetch();
        }}
      />
    );
  }

  const stats = statsQuery.data ?? { wrongCount: 0, doubtfulCount: 0, guessCount: 0, skippedCount: 0, dueTotalCount: 0 };
  const overviewCounts: Partial<Record<QuestionPoolMode, number>> = {
    wrong: stats.wrongCount,
    doubtful: stats.doubtfulCount,
    guess: stats.guessCount,
    skipped: stats.skippedCount,
    due: stats.dueTotalCount,
    mastered: poolStatsQuery.data?.masteredIds.length ?? 0,
  };
  const dueItems = dueQuery.data ?? [];

  if (!profile) {
    return (
      <div className="card-neo mx-auto max-w-lg space-y-4 p-8 text-center">
        <Target className="mx-auto text-[var(--brand-orange)]" size={40} />
        <h1 className="text-xl font-black text-[var(--ink)]">ابتدا پروفایل آزمون را بسازید</h1>
        <p className="text-sm font-bold text-[var(--muted)]">درس‌های فعال پروفایل، مبنای ساخت مرور هدفمند هستند.</p>
        <Link href="/onboarding/" className="btn-neo-orange inline-flex px-6 py-3">
          ساخت پروفایل
        </Link>
      </div>
    );
  }

  const allSubjectsSelected = availableSubjects.length > 0 && selectedSubjects.length === availableSubjects.length;
  const canStart = selectedSubjects.length > 0 && launchModes.length > 0 && matchingCount > 0;
  const studyItems = studyQuery.data ?? [];

  return (
    <div className="page review-page mx-auto max-w-6xl space-y-6 pb-20">
      {/* Top Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md bg-[var(--pastel-yellow)] px-2 py-0.5 text-[11px] font-black text-[var(--ink)] border border-[var(--line-strong)]">
              سیستم مرور هوشمند
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--ink)] sm:text-3xl">مرور و بازیابی یادگیری</h1>
        </div>

        {/* Mode Switcher Tabs */}
        <nav aria-label="حالت‌های مرور" className="flex flex-wrap items-center gap-2 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] p-1.5 shadow-[2px_2px_0px_var(--neo-shadow)]">
          <button
            type="button"
            onClick={() => setViewMode("study")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
              viewMode === "study"
                ? "border-2 border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <BookOpen size={16} />
            مرور تشریحی (مطالعه)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("test")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
              viewMode === "test"
                ? "border-2 border-[var(--line-strong)] bg-[var(--pastel-blue)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <Play size={16} />
            مرور آزمونی (تستی)
          </button>
          <button
            type="button"
            onClick={() => setViewMode("overview")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
              viewMode === "overview"
                ? "border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <Flame size={16} className="text-[var(--brand-orange)]" />
            آمار و لایتنر
          </button>
        </nav>
      </header>

      {/* Global Filter Bar: Past Session / Date Preset / Categories */}
      <section aria-label="فیلترهای مرور" className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter size={18} className="text-[var(--brand-orange)]" />
            <h2 className="text-sm font-black text-[var(--ink)]">فیلتر منبع، جلسات آزمون و بازه زمانی</h2>
          </div>

          {/* Date range presets */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "همه زمان‌ها" },
                { id: "7d", label: "۷ روز اخیر" },
                { id: "30d", label: "۳۰ روز اخیر" },
                { id: "90d", label: "۳ ماه اخیر" },
              ] as const
            ).map((range) => (
              <button
                key={range.id}
                type="button"
                onClick={() => setSelectedDateRange(range.id)}
                className={cn(
                  "rounded-lg border px-2.5 py-1 text-[11px] font-black transition",
                  selectedDateRange === range.id
                    ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] text-[var(--ink)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-Session Selection Accordion / Card */}
        <div className="rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] p-3.5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setIsSessionListOpen(!isSessionListOpen)}
              className="flex flex-wrap items-center gap-2 text-xs font-black text-[var(--ink)] hover:text-[var(--brand-orange)] transition text-right"
            >
              <History size={16} className="text-[var(--brand-orange)]" />
              <span>انتخاب جلسات آزمون برای مرور:</span>
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 text-[11px] font-black border",
                  selectedSessionIds.length > 0
                    ? "border-blue-400 bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200"
                    : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)]"
                )}
              >
                {selectedSessionIds.length === 0 ? "همه آزمون‌ها" : `${selectedSessionIds.length} جلسه انتخاب‌شده`}
              </span>
              <span className="text-[11px] font-bold text-[var(--muted)]">({finishedSessions.length} جلسه تکمیل‌شده)</span>
              {isSessionListOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </button>

            <div className="flex items-center gap-2">
              {selectedSessionIds.length > 0 && (
                <button
                  type="button"
                  onClick={clearSessions}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-black text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 transition"
                >
                  عدم فیلتر (همه آزمون‌ها)
                </button>
              )}
              {finishedSessions.length > 0 && selectedSessionIds.length < finishedSessions.length && (
                <button
                  type="button"
                  onClick={selectAllSessions}
                  className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)] hover:border-[var(--line-strong)] transition"
                >
                  انتخاب همه جلسات
                </button>
              )}
            </div>
          </div>

          {/* Active Sessions Quick Chips */}
          {selectedSessionIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] font-bold text-[var(--muted)]">جلسات انتخابی:</span>
              {selectedSessionIds.map((sid) => {
                const sessionIndex = finishedSessions.findIndex((s) => s.id === sid);
                const sessionNum = sessionIndex >= 0 ? finishedSessions.length - sessionIndex : "?";
                const subjects = sessionSubjectsMap.get(sid);
                const subLabel = subjects && subjects.size > 0 ? Array.from(subjects).join("، ") : "آزمون";
                return (
                  <span
                    key={sid}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2 py-0.5 text-[11px] font-black text-[var(--ink)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                  >
                    <span>جلسه {sessionNum} ({subLabel})</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleSession(sid);
                      }}
                      className="hover:text-red-500"
                      title="حذف این جلسه از فیلتر"
                    >
                      <X size={12} />
                    </button>
                  </span>
                );
              })}
              {activeSessionSubjects && activeSessionSubjects.size > 0 && (
                <button
                  type="button"
                  onClick={applyActiveSessionSubjects}
                  className="inline-flex items-center gap-1 text-[11px] font-black text-blue-600 dark:text-blue-400 hover:underline mr-1"
                >
                  <Target size={12} />
                  🎯 انتخاب خودکار درس‌های این جلسات ({Array.from(activeSessionSubjects).join("، ")})
                </button>
              )}
            </div>
          )}

          {/* Collapsible Session Cards Grid */}
          {isSessionListOpen && (
            <div className="pt-2 border-t border-[var(--line)] space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[var(--muted)]">
                <span>جلساتی که می‌خواهید بررسی شوند را تیک بزنید:</span>
                {activeSessionSubjects && activeSessionSubjects.size > 0 && (
                  <button
                    type="button"
                    onClick={applyActiveSessionSubjects}
                    className="inline-flex items-center gap-1 rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-[11px] font-black text-blue-800 dark:text-blue-200 hover:bg-blue-100 transition"
                  >
                    <Target size={12} />
                    <span>همگام‌سازی درس‌های این جلسات ({Array.from(activeSessionSubjects).join("، ")})</span>
                  </button>
                )}
              </div>

              {finishedSessions.length === 0 ? (
                <p className="py-4 text-center text-xs font-bold text-[var(--muted)]">هیچ آزمون تکمیل‌شده‌ای یافت نشد.</p>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 max-h-60 overflow-y-auto p-1">
                  {finishedSessions.map((session, index) => {
                    const isSelected = selectedSessionIds.includes(session.id);
                    const dateStr = new Date(session.createdAt).toLocaleDateString("fa-IR");
                    const sessionSubs = sessionSubjectsMap.get(session.id);
                    const subjectsText = sessionSubs && sessionSubs.size > 0
                      ? Array.from(sessionSubs).join("، ")
                      : (session.config?.subjectFilter || "عمومی");

                    return (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => toggleSession(session.id)}
                        className={cn(
                          "flex items-start gap-2.5 rounded-xl border-2 p-2.5 text-right transition",
                          isSelected
                            ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                            : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)]"
                        )}
                      >
                        <span className="mt-0.5">
                          <CheckBox checked={isSelected} />
                        </span>
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <strong className="text-xs font-black text-[var(--ink)]">
                              جلسه {finishedSessions.length - index}
                            </strong>
                            <span className="text-[10px] font-bold text-[var(--muted)]">{dateStr}</span>
                          </div>
                          <p className="truncate text-[11px] font-bold text-[var(--ink)]">{subjectsText}</p>
                          <div className="flex items-center gap-2 text-[10px] font-bold text-[var(--muted)]">
                            <span>{session.total} سؤال</span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Category Filter & Search for Study Mode */}
        {viewMode === "study" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="category-mode-selector" className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-[var(--ink)]">
                <Layers size={14} className="text-[var(--muted)]" />
                <span>وضعیت پاسخ:</span>
              </label>
              <select
                id="category-mode-selector"
                value={categoryMode}
                onChange={(e) => setCategoryMode(e.target.value as "all" | ReviewPoolMode)}
                className="min-h-11 w-full rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] px-3 text-xs font-bold text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
              >
                <option value="all">همه سؤالات (با پاسخ تشریحی)</option>
                <option value="wrong">❌ فقط غلط‌ها ({overviewCounts.wrong ?? 0})</option>
                <option value="doubtful">❓ با شک ({overviewCounts.doubtful ?? 0})</option>
                <option value="guess">⚡ حدسی ({overviewCounts.guess ?? 0})</option>
                <option value="skipped">⚪ نزده ({overviewCounts.skipped ?? 0})</option>
                <option value="mastered">⭐ صحیح و مسلط ({overviewCounts.mastered ?? 0})</option>
              </select>
            </div>

            <div>
              <label htmlFor="search-questions-input" className="mb-1.5 flex items-center gap-1.5 text-xs font-black text-[var(--ink)]">
                <Search size={14} className="text-[var(--muted)]" />
                <span>جستجو در متن یا تشریح:</span>
              </label>
              <input
                id="search-questions-input"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="کلمه کلیدی در سؤال…"
                className="min-h-11 w-full rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] px-3 text-xs font-bold text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
              />
            </div>
          </div>
        )}

        {/* Categories Bar Chips */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-[var(--line)]">
          {POOL_CATEGORIES.map((category) => {
            const IconComp = category.icon;
            const count = overviewCounts[category.id] ?? 0;
            const isSelected = viewMode === "study" ? categoryMode === category.id : launchModes.includes(category.id);
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  if (viewMode === "study") {
                    setCategoryMode((prev) => (prev === category.id ? "all" : category.id));
                  } else {
                    toggleMode(category.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 text-xs font-black transition",
                  isSelected
                    ? cn(category.activeClass, "shadow-[2px_2px_0px_var(--neo-shadow)]")
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                <IconComp size={14} />
                <span>{category.title}</span>
                <span className="rounded-md bg-white/70 dark:bg-black/40 px-1.5 py-0.5 text-[10px] font-black">{count}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* ========================================================================= */}
      {/* MODE 1: STUDY / READING MODE (مرور مطالعاتی با پاسخ تشریحی و گزینه‌ها) */}
      {/* ========================================================================= */}
      {viewMode === "study" && (
        <section aria-label="لیست مطالعه و مرور" className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-xs font-black">
                {studyItems.length}
              </span>
              <p className="text-sm font-black text-[var(--ink)]">
                سؤال آماده مطالعه و بازخوانی نکات
                {selectedSessionIds.length > 0 && (
                  <span className="mr-1 text-xs text-[var(--brand-orange)] font-bold">
                    (محدود به {selectedSessionIds.length} جلسه انتخابی)
                  </span>
                )}
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={toggleAllExplanations}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--surface)] px-3 py-1.5 text-xs font-black text-[var(--ink)] hover:border-[var(--line-strong)]"
              >
                {allExplanationsOpen ? <EyeOff size={14} /> : <Eye size={14} />}
                <span>{allExplanationsOpen ? "بستن همه پاسخ‌ها" : "باز کردن همه پاسخ‌ها"}</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("test")}
                className="btn-neo-orange inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black"
              >
                <Play size={14} />
                <span>ورود به حالت تستی</span>
              </button>
            </div>
          </div>

          {studyQuery.isLoading && <LoadingState label="در حال بارگذاری سؤالات تشریحی…" />}

          {!studyQuery.isLoading && studyItems.length === 0 && (
            <div className="card-neo rounded-3xl border-2 border-dashed p-10 text-center space-y-3">
              <Sparkles className="mx-auto text-emerald-500" size={36} />
              <h3 className="text-base font-black text-[var(--ink)]">سؤالی با این مشخصات یافت نشد</h3>
              <p className="text-xs font-bold text-[var(--muted)] max-w-md mx-auto">
                ممکن است برای این فیلتر یا این جلسه، سؤالی ثبت نشده باشد. می‌توانید فیلترها را پاک کرده یا دسته وضعیت دیگری را انتخاب کنید.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSelectedSessionIds([]);
                  setSelectedDateRange("all");
                  setCategoryMode("all");
                  setSearchQuery("");
                }}
                className="inline-flex items-center gap-1.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--pastel-yellow)] px-4 py-2 text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              >
                <RotateCcw size={14} />
                پاکسازی فیلترها
              </button>
            </div>
          )}

          {/* Questions Cards List */}
          <div className="space-y-6">
            {studyItems.map((item, index) => {
              const q = item.question;
              const isExplanationOpen = openExplanations[q.id] ?? false;
              const attempt = item.lastAttempt;

              return (
                <article
                  key={q.id}
                  className="card-neo rounded-3xl border-2 bg-[var(--surface)] p-5 sm:p-6 space-y-4 transition"
                >
                  {/* Card Header */}
                  <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 px-2.5 items-center justify-center rounded-lg border-2 border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] text-xs font-black text-[var(--ink)]">
                        تست {index + 1}
                      </span>
                      <span className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-xs font-black text-[var(--ink)]">
                        {q.subject}
                      </span>
                      {q.chapter && (
                        <span className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">
                          {q.chapter}
                        </span>
                      )}
                      {q.topic && (
                        <span className="rounded-md border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[11px] font-bold text-[var(--muted)]">
                          {q.topic}
                        </span>
                      )}
                    </div>

                    {/* Attempt Status Badge */}
                    <div className="flex items-center gap-2">
                      {attempt ? (
                        attempt.result === "wrong" ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-red-400 bg-red-50 dark:bg-red-950/60 px-2.5 py-1 text-[11px] font-black text-red-700 dark:text-red-300">
                            <XCircle size={13} />
                            پاسخ نادرست قبلی
                            {attempt.confidence === "doubtful" && " (با شک)"}
                            {attempt.confidence === "guess" && " (حدسی)"}
                          </span>
                        ) : attempt.result === "unanswered" ? (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-1 text-[11px] font-black text-slate-700 dark:text-slate-300">
                            <FastForward size={13} />
                            بدون پاسخ (نزده)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-1 text-[11px] font-black text-emerald-700 dark:text-emerald-300">
                            <Check size={13} />
                            پاسخ صحیح
                            {attempt.confidence === "doubtful" && " (با شک)"}
                            {attempt.confidence === "guess" && " (حدسی)"}
                          </span>
                        )
                      ) : (
                        <span className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2 py-0.5 text-[10px] font-bold text-[var(--muted)]">
                          هنوز پاسخ نداده‌اید
                        </span>
                      )}

                      {attempt?.finalizedAt && (
                        <span className="text-[10px] font-bold text-[var(--muted)]">
                          {new Date(attempt.finalizedAt).toLocaleDateString("fa-IR")}
                        </span>
                      )}
                    </div>
                  </header>

                  {/* Question Stem Content */}
                  <div className="text-sm font-bold leading-7 text-[var(--ink)] sm:text-base sm:leading-8">
                    <ContentRenderer blocks={q.content} />
                  </div>

                  {/* 4 Options */}
                  <div className="grid gap-2.5 sm:grid-cols-2 pt-2">
                    {q.options.map((opt, optIdx) => {
                      const isCorrect = opt.id === q.correctOptionId;
                      const isUserSelected = attempt?.selectedOptionId === opt.id;

                      let optCardStyle = "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]";
                      let badge = null;

                      if (isCorrect) {
                        optCardStyle = "border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-900 dark:text-emerald-200 ring-2 ring-emerald-500/20";
                        badge = (
                          <span className="rounded-md border border-emerald-400 bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.5 text-[10px] font-black text-emerald-800 dark:text-emerald-200">
                            گزینه صحیح ✓
                          </span>
                        );
                      }

                      if (isUserSelected && !isCorrect) {
                        optCardStyle = "border-red-500 bg-red-50/80 dark:bg-red-950/40 text-red-900 dark:text-red-200 ring-2 ring-red-500/20";
                        badge = (
                          <span className="rounded-md border border-red-400 bg-red-100 dark:bg-red-900 px-1.5 py-0.5 text-[10px] font-black text-red-800 dark:text-red-200">
                            انتخاب شما ✗
                          </span>
                        );
                      } else if (isUserSelected && isCorrect) {
                        badge = (
                          <span className="rounded-md border border-emerald-400 bg-emerald-200 dark:bg-emerald-800 px-1.5 py-0.5 text-[10px] font-black text-emerald-900 dark:text-emerald-100">
                            انتخاب درست شما ✓
                          </span>
                        );
                      }

                      return (
                        <div
                          key={opt.id}
                          className={cn(
                            "relative flex items-start gap-3 rounded-2xl border-2 p-3.5 transition",
                            optCardStyle
                          )}
                        >
                          <span
                            className={cn(
                              "flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border-2 text-xs font-black",
                              isCorrect
                                ? "border-emerald-600 bg-emerald-500 text-white"
                                : isUserSelected
                                ? "border-red-600 bg-red-500 text-white"
                                : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]"
                            )}
                          >
                            {PERSIAN_LETTERS[optIdx] ?? optIdx + 1}
                          </span>
                          <div className="min-w-0 flex-1 text-xs font-bold leading-6 sm:text-sm">
                            <ContentRenderer blocks={opt.content} />
                          </div>
                          {badge && <div className="shrink-0">{badge}</div>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Explanation Toggle & Content */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => toggleExplanation(q.id)}
                      className={cn(
                        "inline-flex items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-black transition",
                        isExplanationOpen
                          ? "border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] hover:border-[var(--line-strong)]"
                      )}
                    >
                      <Lightbulb size={16} className={isExplanationOpen ? "text-[var(--brand-orange)]" : "text-[var(--muted)]"} />
                      <span>{isExplanationOpen ? "بستن پاسخ تشریحی" : "مشاهده پاسخ تشریحی و نکته کلیدی"}</span>
                      {isExplanationOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                    </button>

                    {isExplanationOpen && (
                      <div className="mt-3 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] p-4 space-y-2 shadow-[2px_2px_0px_var(--neo-shadow)]">
                        <div className="flex items-center gap-2 border-b border-[var(--line)] pb-2 text-xs font-black text-[var(--ink)]">
                          <Lightbulb size={16} className="text-amber-500" />
                          <span>تحلیل و پاسخ تشریحی سؤال:</span>
                        </div>
                        <div className="text-xs font-bold leading-6 text-[var(--ink)] sm:text-sm sm:leading-7">
                          <ContentRenderer blocks={q.explanation} />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Card Footer Statistics */}
                  <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--line)] pt-3 text-[11px] font-bold text-[var(--muted)]">
                    <div className="flex flex-wrap items-center gap-3">
                      <span>تعداد دفعات حل: {item.totalAttempts} بار</span>
                      {item.wrongCount > 0 && <span className="text-red-500">({item.wrongCount} بار نادرست)</span>}
                      {item.doubtfulCount > 0 && <span className="text-amber-500">({item.doubtfulCount} با شک)</span>}
                    </div>

                    <Link
                      href={`/review/run/?modes=wrong,doubtful,guess,skipped,due&count=1&subjects=${encodeURIComponent(q.subject)}`}
                      className="inline-flex items-center gap-1 text-xs font-black text-[var(--brand-orange)] hover:underline"
                    >
                      <span>تمرین فوری این مبحث</span>
                      <ArrowRight size={13} />
                    </Link>
                  </footer>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODE 2: TEST / PRACTICE SETUP (مرور آزمونی و تمرینی) */}
      {/* ========================================================================= */}
      {viewMode === "test" && (
        <section aria-label="تنظیم آزمون مرور" className="space-y-5">
          {/* Step 1: Subjects */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StepNumber value="۱" color="bg-[var(--pastel-yellow)]" />
                <h2 className="font-black text-[var(--ink)]">انتخاب درس‌ها</h2>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {activeSessionSubjects && activeSessionSubjects.size > 0 && (
                  <button
                    type="button"
                    onClick={applyActiveSessionSubjects}
                    className="inline-flex items-center gap-1 text-xs font-black text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    <Target size={13} />
                    <span>فقط درس‌های جلسات انتخابی ({activeSessionSubjects.size} درس)</span>
                  </button>
                )}
                <button type="button" onClick={toggleAllSubjects} className="text-xs font-black text-[var(--brand-orange)]">
                  {allSubjectsSelected ? "لغو انتخاب همه" : "انتخاب همه درس‌ها"}
                </button>
              </div>
            </div>
            <label className="relative block">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
              <span className="sr-only">جستجوی درس</span>
              <input
                value={subjectSearch}
                onChange={(event) => setSubjectSearch(event.target.value)}
                placeholder="جستجوی درس…"
                className="min-h-11 w-full rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] pr-10 pl-3 text-sm font-bold text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
              />
            </label>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {visibleSubjects.map((subject) => {
                const selected = selectedSubjects.includes(subject);
                const isInSelectedSession = activeSessionSubjects?.has(subject);
                return (
                  <button
                    key={subject}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleSubject(subject)}
                    className={cn(
                      "flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 p-3 text-right transition",
                      selected
                        ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]"
                    )}
                  >
                    <span className="flex items-center gap-2 overflow-hidden">
                      <CheckBox checked={selected} />
                      <strong className="truncate text-xs font-black text-[var(--ink)]">{subject}</strong>
                      {isInSelectedSession && (
                        <span className="shrink-0 rounded-md border border-blue-400 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 text-[9px] font-black text-blue-800 dark:text-blue-200">
                          در جلسات انتخابی
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] font-black text-[var(--muted)]">{subjectCounts.get(subject) ?? 0} سؤال</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Chapters & Scope */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <StepNumber value="۲" color="bg-[var(--pastel-blue)]" />
              <h2 className="font-black text-[var(--ink)]">محدوده فصول</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["all", "custom"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setScopeMode(mode)}
                  className={cn(
                    "min-h-12 rounded-2xl border-2 px-4 text-xs font-black",
                    scopeMode === mode
                      ? "border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                      : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                  )}
                >
                  {mode === "all" ? "تمام فصول درس‌های انتخابی" : "انتخاب فصول خاص"}
                </button>
              ))}
            </div>

            {scopeMode === "custom" && (
              <div className="space-y-2">
                {selectedSubjects.map((subject) => {
                  const chapters = taxonomy.get(subject) ?? new Map<string, { total: number; topics: Map<string, number> }>();
                  const expanded = expandedSubjects.includes(subject);
                  return (
                    <div key={subject} className="overflow-hidden rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)]">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSubjects((current) => (current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject]))
                        }
                        className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-right"
                        aria-expanded={expanded}
                      >
                        <span className="flex items-center gap-2 text-xs font-black text-[var(--ink)]">
                          <BookOpen size={16} />
                          {subject}
                        </span>
                        <span className="flex items-center gap-2 text-[10px] font-black text-[var(--muted)]">
                          {chapters.size} فصل {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </span>
                      </button>

                      {expanded && (
                        <div className="space-y-2 border-t-2 border-[var(--line)] p-3">
                          {chapters.size === 0 ? (
                            <p className="py-3 text-center text-xs font-bold text-[var(--muted)]">فصل دارای تستی برای این درس نیست.</p>
                          ) : (
                            Array.from(chapters.entries()).map(([chapter, data]) => {
                              const token = chapterToken(subject, chapter);
                              const selected = selectedChapters.includes(token);
                              return (
                                <div key={token} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                                  <button
                                    type="button"
                                    onClick={() => toggleChapter(subject, chapter)}
                                    className="flex w-full items-center justify-between gap-3 text-right"
                                  >
                                    <span className="flex items-center gap-2 text-xs font-black text-[var(--ink)]">
                                      <CheckBox checked={selected} />
                                      {chapter}
                                    </span>
                                    <span className="text-[10px] font-black text-[var(--muted)]">{data.total} سؤال</span>
                                  </button>
                                  {data.topics.size > 0 && (
                                    <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
                                      {Array.from(data.topics.entries()).map(([topic, count]) => {
                                        const value = topicToken(subject, chapter, topic);
                                        const topicSelected = selectedTopics.includes(value);
                                        return (
                                          <button
                                            key={value}
                                            type="button"
                                            onClick={() => toggleTopic(subject, chapter, topic)}
                                            className={cn(
                                              "rounded-lg border px-2.5 py-1.5 text-[10px] font-black",
                                              topicSelected
                                                ? "border-[var(--line-strong)] bg-[var(--pastel-blue)] text-[var(--ink)]"
                                                : "border-[var(--line)] text-[var(--muted)]"
                                            )}
                                          >
                                            {topic} · {count}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Step 3: Pool Categories & Count */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StepNumber value="۳" color="bg-[var(--pastel-green)]" />
                <h2 className="font-black text-[var(--ink)]">منابع و تعداد تست</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                <PresetButton onClick={() => setLaunchModes(["wrong", "doubtful", "guess", "skipped"])}>نقاط ضعف</PresetButton>
                <PresetButton onClick={() => setLaunchModes(["wrong"])}>فقط غلط‌ها</PresetButton>
                <PresetButton onClick={() => setLaunchModes(POOL_CATEGORIES.map((c) => c.id))}>همه سؤال‌ها</PresetButton>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {POOL_CATEGORIES.map((category) => {
                const selected = launchModes.includes(category.id);
                const IconComp = category.icon;
                return (
                  <button
                    key={category.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleMode(category.id)}
                    className={cn(
                      "flex min-h-20 flex-col items-start justify-between rounded-2xl border-2 p-3 text-right transition",
                      selected ? cn(category.activeClass, "shadow-[2px_2px_0px_var(--neo-shadow)]") : "border-[var(--line)] bg-[var(--surface-2)] opacity-70"
                    )}
                  >
                    <span className="flex w-full items-center justify-between">
                      <IconComp size={16} aria-hidden="true" />
                      <span className="text-xs font-black text-[var(--ink)]">{filteredPoolCounts[category.id] ?? 0}</span>
                    </span>
                    <strong className="text-xs font-black text-[var(--ink)]">{category.title}</strong>
                  </button>
                );
              })}
            </div>

            <div>
              <p className="mb-2 text-xs font-black text-[var(--ink)]">تعداد تست آزمون مرور:</p>
              <div className="grid grid-cols-6 gap-2">
                {([5, 10, 15, 20, 30, "all"] as CountChoice[]).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => setLaunchCount(choice)}
                    className={cn(
                      "min-h-11 rounded-xl border-2 text-xs font-black",
                      launchCount === choice
                        ? "border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)]"
                    )}
                  >
                    {choice === "all" ? "همه" : choice}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Fixed Footer with Start Button */}
          <footer className="fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mx-auto flex max-w-3xl items-center justify-between gap-3 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-3 shadow-[4px_4px_0px_var(--neo-shadow)] sm:static sm:max-w-none">
            <div className="min-w-0">
              <strong className="block text-sm font-black text-[var(--ink)]">{requestedCount} سؤال انتخابی</strong>
              <span className="block truncate text-[10px] font-bold text-[var(--muted)]">
                از {matchingCount} سؤال منطبق با فیلترها
              </span>
            </div>
            {canStart ? (
              <Link href={reviewRunnerUrl} className="btn-neo-orange inline-flex min-h-12 items-center justify-center gap-2 px-5 text-xs font-black sm:text-sm">
                <Play size={17} />
                شروع آزمون مرور
              </Link>
            ) : (
              <button
                type="button"
                disabled
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] px-5 text-xs font-black text-[var(--muted)] opacity-70"
              >
                <CircleHelp size={17} />
                {selectedSubjects.length === 0 ? "یک درس انتخاب کنید" : launchModes.length === 0 ? "یک منبع انتخاب کنید" : "سؤالی منطبق نیست"}
              </button>
            )}
          </footer>
        </section>
      )}

      {/* ========================================================================= */}
      {/* MODE 3: OVERVIEW & LEITNER QUEUE (آمار و صف سررسید) */}
      {/* ========================================================================= */}
      {viewMode === "overview" && (
        <section aria-label="آمار و مرور لایتنر" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {POOL_CATEGORIES.map((category) => {
              const IconComp = category.icon;
              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => {
                    setCategoryMode(category.id);
                    setViewMode("study");
                  }}
                  className={cn(
                    "card-neo flex min-h-28 flex-col justify-between rounded-2xl border-2 p-4 text-right transition hover:scale-[1.02]",
                    STAT_STYLES[category.id]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <IconComp size={20} className={category.activeClass.split(" ").pop()} aria-hidden="true" />
                    <strong className="text-2xl font-black text-[var(--ink)]">{overviewCounts[category.id] ?? 0}</strong>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--ink)]">{category.title}</h3>
                    <span className="text-[10px] font-bold text-[var(--muted)]">مشاهده در حالت مطالعه ←</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Leitner Due Queue */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Flame size={20} className="text-[var(--brand-orange)]" />
                <div>
                  <h2 className="text-base font-black text-[var(--ink)]">صف سررسید لایتنر</h2>
                  <p className="text-xs font-bold text-[var(--muted)]">{dueItems.length} سؤال آماده مرور بر اساس فاصله تکرار</p>
                </div>
              </div>
              {dueItems.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setLaunchModes(["due"]);
                    setViewMode("test");
                  }}
                  className="btn-neo-orange inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black"
                >
                  <Play size={14} />
                  مرور این سوالات
                </button>
              )}
            </div>

            {dueItems.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[var(--line)] px-4 py-8 text-center space-y-2">
                <Sparkles className="mx-auto text-emerald-500" size={28} />
                <p className="text-sm font-black text-[var(--ink)]">فعلاً سؤال سررسیدشده‌ای در صف لایتنر ندارید</p>
                <p className="text-xs font-bold text-[var(--muted)]">
                  می‌توانید از حالت «مرور تشریحی» یا «مرور آزمونی» برای بازیابی اشتباهات قبلی استفاده کنید.
                </p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {dueItems.slice(0, 6).map((item) => {
                  const priority = PRIORITY_LABELS[item.priority] ?? PRIORITY_LABELS[3];
                  return (
                    <article key={item.questionId} className="rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] p-4">
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-black text-[var(--ink)]">{item.subject}</span>
                        <span className={cn("rounded-lg border px-2 py-1 text-[10px] font-black", priority.className)}>{priority.label}</span>
                      </div>
                      <div className="line-clamp-2 text-xs font-bold leading-6 text-[var(--muted)]">
                        <ContentRenderer blocks={item.content} />
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function StepNumber({ value, color }: { value: string; color: string }) {
  return <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[var(--line-strong)] text-sm font-black text-[var(--ink-on-color)]", color)}>{value}</span>;
}

function CheckBox({ checked }: { checked: boolean }) {
  return <span className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 border-[var(--line-strong)]", checked ? "bg-[var(--brand-orange)] text-white" : "bg-[var(--surface)] text-transparent")}><Check size={14} strokeWidth={3} /></span>;
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="rounded-lg border-2 border-[var(--line)] px-3 py-1.5 text-[10px] font-black text-[var(--ink)]">{children}</button>;
}
