"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronUp,
  FastForward,
  Flame,
  HelpCircle,
  History,
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
import { ErrorState, LoadingState } from "@/components/ui/testino-ui";
import type { QuestionPoolMode } from "@/database/app-database";
import { isSameSubject } from "@/features/questions/domain/subject-registry";
import { cn } from "@/lib/utils";
import { useDatabase } from "@/providers/database-provider";
import { ContentRenderer } from "@/components/rich-content/content-renderer";

type ViewTab = "setup" | "overview";
type ScopeMode = "all" | "custom";
type CountChoice = 5 | 10 | 15 | 20 | 30 | "all";
type ReviewPoolMode = "wrong" | "doubtful" | "guess" | "skipped" | "due" | "mastered";
type DateRangeChoice = "all" | "7d" | "30d" | "90d";

const NO_CHAPTER = "عمومی / بدون فصل";
const chapterToken = (subject: string, chapter: string) => `${subject}::${chapter}`;
const topicToken = (subject: string, chapter: string, topic: string) => `${subject}::${chapter}::${topic}`;

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
  { id: "due", title: "موعد لایتنر", icon: RotateCcw, activeClass: "bg-blue-50 dark:bg-blue-950/40 border-blue-500 text-blue-600", badgeClass: "bg-blue-100 text-blue-800 border-blue-300 dark:bg-blue-950 dark:text-blue-300" },
  { id: "mastered", title: "مسلط و درست", icon: Star, activeClass: "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-600", badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" },
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

function formatSessionSubjectsSummary(subjects: Set<string> | string[] | undefined): string {
  if (!subjects) return "عمومی";
  const arr = Array.isArray(subjects) ? subjects : Array.from(subjects);
  if (arr.length === 0) return "عمومی";
  if (arr.length <= 2) return arr.join("، ");
  return `${arr[0]} و ${arr.length - 1} درس دیگر`;
}

export function ReviewPage() {
  const { db, status } = useDatabase();
  const [activeTab, setActiveTab] = useState<ViewTab>("setup");

  // Filter states
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const [isSessionListOpen, setIsSessionListOpen] = useState(false);
  const [selectedDateRange, setSelectedDateRange] = useState<DateRangeChoice>("all");
  const [selectedModes, setSelectedModes] = useState<ReviewPoolMode[]>(["wrong", "doubtful"]);
  const [subjectSearch, setSubjectSearch] = useState("");
  const [selectedSubjectsOverride, setSelectedSubjectsOverride] = useState<string[] | null>(null);
  const [scopeMode, setScopeMode] = useState<ScopeMode>("all");
  const [selectedChapters, setSelectedChapters] = useState<string[]>([]);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [expandedSubjects, setExpandedSubjects] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [launchCount, setLaunchCount] = useState<CountChoice>(15);

  // Queries
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
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

  const dueQuery = useQuery({
    queryKey: ["reviews"],
    queryFn: () => db.listDueReviews(),
    enabled: status === "ready",
  });

  const finishedSessions = useMemo(
    () => sessionsQuery.data?.filter((s) => s.state === "FINISHED") ?? [],
    [sessionsQuery.data]
  );

  // Session subjects map
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

  // Active subjects across selected sessions
  const activeSessionSubjects = useMemo(() => {
    if (selectedSessionIds.length === 0) return null;
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
  const subjectsInBank = useMemo(
    () => Array.from(new Set(allPublished.map((q) => q.subject))).filter(Boolean),
    [allPublished]
  );
  const profileSubjects = useMemo(
    () => profile?.subjects.filter((s) => s.coefficient > 0).map((s) => s.name) ?? [],
    [profile]
  );
  const availableSubjects = profileSubjects.length > 0 ? profileSubjects : subjectsInBank;
  const selectedSubjects = selectedSubjectsOverride ?? availableSubjects;
  const visibleSubjects = subjectSearch.trim()
    ? availableSubjects.filter((s) => s.includes(subjectSearch.trim()))
    : availableSubjects;

  const subjectCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const subject of availableSubjects) {
      counts.set(subject, allPublished.filter((q) => isSameSubject(subject, q.subject)).length);
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

  // Questions matching selected subjects and chapter/topic scope
  const filteredQuestions = useMemo(() => {
    let result = allPublished.filter((q) => selectedSubjects.some((s) => isSameSubject(s, q.subject)));
    if (scopeMode === "all") return result;
    if (selectedChapters.length > 0) {
      const selected = new Set(selectedChapters);
      result = result.filter((q) => {
        const chapter = q.chapter || NO_CHAPTER;
        return selectedSubjects.some((s) => isSameSubject(s, q.subject) && selected.has(chapterToken(s, chapter)));
      });
    }
    if (selectedTopics.length > 0) {
      const selected = new Set(selectedTopics);
      result = result.filter((q) => {
        if (!q.topic) return false;
        const chapter = q.chapter || NO_CHAPTER;
        return selectedSubjects.some((s) => isSameSubject(s, q.subject) && selected.has(topicToken(s, chapter, q.topic!)));
      });
    }
    return result;
  }, [allPublished, scopeMode, selectedChapters, selectedSubjects, selectedTopics]);

  // Pool counts within the filtered subject/chapter scope
  const filteredPoolCounts = useMemo(() => {
    const counts: Partial<Record<QuestionPoolMode, number>> = {};
    for (const category of POOL_CATEGORIES) {
      counts[category.id] = filteredQuestions.filter((q) => poolSets[category.id]?.has(q.id)).length;
    }
    return counts;
  }, [filteredQuestions, poolSets]);

  // Eligible questions matching chosen categories and optional search
  const eligibleQuestions = useMemo(() => {
    let list = filteredQuestions.filter((q) => selectedModes.some((mode) => poolSets[mode]?.has(q.id)));
    if (searchQuery.trim()) {
      const qLower = searchQuery.trim().toLowerCase();
      list = list.filter((q) => {
        const contentStr = JSON.stringify(q.content).toLowerCase();
        const explStr = JSON.stringify(q.explanation).toLowerCase();
        return contentStr.includes(qLower) || explStr.includes(qLower) || q.subject.toLowerCase().includes(qLower);
      });
    }
    return list;
  }, [filteredQuestions, poolSets, searchQuery, selectedModes]);

  const matchingCount = eligibleQuestions.length;
  const requestedCount = launchCount === "all" ? matchingCount : Math.min(launchCount, matchingCount);

  // Helper to build runner URLs
  const buildRunnerUrl = useCallback((type: "study" | "test") => {
    const params = new URLSearchParams();
    params.set("type", type);
    params.set("modes", selectedModes.join(","));
    params.set("count", String(Math.max(1, requestedCount)));
    params.set("subjects", selectedSubjects.join(","));
    if (scopeMode === "custom" && selectedChapters.length > 0) params.set("chapters", selectedChapters.join(","));
    if (scopeMode === "custom" && selectedTopics.length > 0) params.set("topics", selectedTopics.join(","));
    if (selectedSessionIds.length > 0) params.set("sessionIds", selectedSessionIds.join(","));
    if (selectedDateRange !== "all") params.set("dateRange", selectedDateRange);
    if (searchQuery.trim()) params.set("search", searchQuery.trim());
    return `/review/run/?${params.toString()}`;
  }, [
    requestedCount,
    scopeMode,
    searchQuery,
    selectedChapters,
    selectedDateRange,
    selectedModes,
    selectedSessionIds,
    selectedSubjects,
    selectedTopics,
  ]);

  const studyRunnerUrl = useMemo(() => buildRunnerUrl("study"), [buildRunnerUrl]);
  const testRunnerUrl = useMemo(() => buildRunnerUrl("test"), [buildRunnerUrl]);

  function toggleMode(mode: ReviewPoolMode) {
    setSelectedModes((prev) =>
      prev.includes(mode) ? (prev.length > 1 ? prev.filter((m) => m !== mode) : prev) : [...prev, mode]
    );
  }

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
    return <LoadingState label="در حال بارگذاری مرکز مرور و یادگیری…" />;
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
        <p className="text-sm font-bold text-[var(--muted)]">درس‌های فعال پروفایل مبنای ساخت مرور هدفمند هستند.</p>
        <Link href="/onboarding/" className="btn-neo-orange inline-flex px-6 py-3">
          ساخت پروفایل
        </Link>
      </div>
    );
  }

  const allSubjectsSelected = availableSubjects.length > 0 && selectedSubjects.length === availableSubjects.length;
  const canStart = selectedSubjects.length > 0 && selectedModes.length > 0 && matchingCount > 0;

  return (
    <div className="page review-page mx-auto max-w-5xl space-y-6 pb-28">
      {/* Top Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded-md bg-[var(--pastel-yellow)] px-2.5 py-0.5 text-[11px] font-black text-[var(--ink)] border border-[var(--line-strong)]">
              سیستم مرور هوشمند
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-[var(--ink)] sm:text-3xl">مرور و بازیابی یادگیری</h1>
        </div>

        {/* Tab Navigation */}
        <nav aria-label="بخش‌های مرور" className="flex items-center gap-2 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] p-1.5 shadow-[2px_2px_0px_var(--neo-shadow)]">
          <button
            type="button"
            onClick={() => setActiveTab("setup")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
              activeTab === "setup"
                ? "border-2 border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <BookOpen size={16} />
            تنظیم و انتخاب سؤالات
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("overview")}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition",
              activeTab === "overview"
                ? "border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            <Flame size={16} className="text-[var(--brand-orange)]" />
            آمار و لایتنر
          </button>
        </nav>
      </header>

      {/* ========================================================================= */}
      {/* TAB 1: SETUP & FILTERS (تنظیم دقیق فیلترها و پرتاب مرور) */}
      {/* ========================================================================= */}
      {activeTab === "setup" && (
        <section aria-label="تنظیمات فیلتر مرور" className="space-y-5">
          {/* STEP 1: SESSIONS & TIME RANGE */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StepNumber value="۱" color="bg-[var(--pastel-yellow)]" />
                <h2 className="font-black text-[var(--ink)]">منبع و بازه زمانی آزمون‌ها</h2>
              </div>

              {/* Date Presets */}
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

            {/* Session Filter Accordion */}
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

              {/* Active Sessions Clean Chips */}
              {selectedSessionIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[11px] font-bold text-[var(--muted)]">جلسات انتخابی:</span>
                  {selectedSessionIds.map((sid) => {
                    const sessionIndex = finishedSessions.findIndex((s) => s.id === sid);
                    const sessionNum = sessionIndex >= 0 ? finishedSessions.length - sessionIndex : "?";
                    const subjects = sessionSubjectsMap.get(sid);
                    const subLabel = formatSessionSubjectsSummary(subjects);
                    return (
                      <span
                        key={sid}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                      >
                        <span>جلسه {sessionNum} ({subLabel})</span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSession(sid);
                          }}
                          className="text-[var(--muted)] hover:text-red-500"
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
                      className="inline-flex items-center gap-1 rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-950/50 px-2.5 py-1 text-[11px] font-black text-blue-700 dark:text-blue-300 hover:underline mr-1"
                    >
                      <Target size={13} />
                      <span>انتخاب خودکار درس‌های این جلسات ({activeSessionSubjects.size} درس)</span>
                    </button>
                  )}
                </div>
              )}

              {/* Collapsible Session Cards Grid */}
              {isSessionListOpen && (
                <div className="pt-2 border-t border-[var(--line)] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold text-[var(--muted)]">
                    <span>جلساتی که می‌خواهید سؤالات آن‌ها بررسی شوند را تیک بزنید:</span>
                    {activeSessionSubjects && activeSessionSubjects.size > 0 && (
                      <button
                        type="button"
                        onClick={applyActiveSessionSubjects}
                        className="inline-flex items-center gap-1 rounded-lg border border-blue-400 bg-blue-50 dark:bg-blue-950/40 px-2.5 py-1 text-[11px] font-black text-blue-800 dark:text-blue-200 hover:bg-blue-100 transition"
                      >
                        <Target size={12} />
                        <span>همگام‌سازی درس‌های این جلسات ({activeSessionSubjects.size} درس)</span>
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
                        const subjectsText = formatSessionSubjectsSummary(sessionSubs);

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
          </div>

          {/* STEP 2: MULTI-SELECT CATEGORIES (تیک زدن چندتایی دسته‌ها) */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StepNumber value="۲" color="bg-[var(--pastel-green)]" />
                <div>
                  <h2 className="font-black text-[var(--ink)]">دسته‌های وضعیت سؤال (انتخاب چندتایی)</h2>
                  <p className="text-xs font-bold text-[var(--muted)]">می‌توانید همزمان چند گزینه مانند غلط‌ها و با شک را تیک بزنید:</p>
                </div>
              </div>

              {/* Category Presets */}
              <div className="flex flex-wrap gap-1.5">
                <PresetButton onClick={() => setSelectedModes(["wrong", "doubtful", "guess"])}>
                  نقاط ضعف (غلط + با شک + حدسی)
                </PresetButton>
                <PresetButton onClick={() => setSelectedModes(["wrong"])}>
                  فقط غلط‌ها
                </PresetButton>
                <PresetButton onClick={() => setSelectedModes(["skipped"])}>
                  سؤالات نزده
                </PresetButton>
                <PresetButton onClick={() => setSelectedModes(POOL_CATEGORIES.map((c) => c.id))}>
                  همه دسته‌ها
                </PresetButton>
              </div>
            </div>

            {/* Checkable Category Cards Grid */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              {POOL_CATEGORIES.map((category) => {
                const selected = selectedModes.includes(category.id);
                const IconComp = category.icon;
                const count = filteredPoolCounts[category.id] ?? 0;

                return (
                  <button
                    key={category.id}
                    type="button"
                    role="checkbox"
                    aria-checked={selected}
                    onClick={() => toggleMode(category.id)}
                    className={cn(
                      "flex min-h-20 flex-col items-start justify-between rounded-2xl border-2 p-3 text-right transition cursor-pointer",
                      selected
                        ? cn(category.activeClass, "shadow-[3px_3px_0px_var(--neo-shadow)]")
                        : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--line-strong)]"
                    )}
                  >
                    <div className="flex w-full items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <CheckBox checked={selected} />
                        <IconComp size={15} />
                      </span>
                      <span className="rounded-md bg-white/80 dark:bg-black/40 px-2 py-0.5 text-[11px] font-black text-[var(--ink)]">
                        {count}
                      </span>
                    </div>
                    <strong className="text-xs font-black mt-2 text-[var(--ink)]">{category.title}</strong>
                  </button>
                );
              })}
            </div>
          </div>

          {/* STEP 3: SUBJECTS & CHAPTERS/TOPICS (درس و مبحث / فصل) */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <StepNumber value="۳" color="bg-[var(--pastel-blue)]" />
                <h2 className="font-black text-[var(--ink)]">انتخاب درس‌ها و مباحث</h2>
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

            {/* Subject Search */}
            <label className="relative block">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={17} />
              <span className="sr-only">جستجوی درس</span>
              <input
                value={subjectSearch}
                onChange={(event) => setSubjectSearch(event.target.value)}
                placeholder="جستجوی عنوان درس…"
                className="min-h-11 w-full rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] pr-10 pl-3 text-sm font-bold text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
              />
            </label>

            {/* Subject Cards Grid */}
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
                      "flex min-h-14 items-center justify-between gap-3 rounded-2xl border-2 p-3 text-right transition cursor-pointer",
                      selected
                        ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)] hover:border-[var(--line-strong)]"
                    )}
                  >
                    <span className="flex items-center gap-2 overflow-hidden">
                      <CheckBox checked={selected} />
                      <strong className="truncate text-xs font-black text-[var(--ink)]">{subject}</strong>
                      {isInSelectedSession && (
                        <span className="shrink-0 rounded-md border border-blue-400 bg-blue-100 dark:bg-blue-900/60 px-1.5 py-0.5 text-[9px] font-black text-blue-800 dark:text-blue-200">
                          در آزمون
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-[10px] font-black text-[var(--muted)]">
                      {subjectCounts.get(subject) ?? 0} سؤال
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Chapter & Scope Selection */}
            <div className="pt-3 border-t border-[var(--line)] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-[var(--ink)]">محدوده فصول و مباحث:</span>
                <div className="flex items-center gap-1.5">
                  {(["all", "custom"] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setScopeMode(mode)}
                      className={cn(
                        "rounded-lg border px-3 py-1 text-xs font-black transition",
                        scopeMode === mode
                          ? "border-[var(--line-strong)] bg-[var(--pastel-yellow)] text-[var(--ink)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                          : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]"
                      )}
                    >
                      {mode === "all" ? "تمام فصول" : "انتخاب فصول و مباحث خاص"}
                    </button>
                  ))}
                </div>
              </div>

              {scopeMode === "custom" && (
                <div className="space-y-2 pt-1">
                  {selectedSubjects.map((subject) => {
                    const chapters = taxonomy.get(subject) ?? new Map<string, { total: number; topics: Map<string, number> }>();
                    const expanded = expandedSubjects.includes(subject);
                    return (
                      <div key={subject} className="overflow-hidden rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)]">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedSubjects((current) =>
                              current.includes(subject) ? current.filter((item) => item !== subject) : [...current, subject]
                            )
                          }
                          className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-right cursor-pointer"
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
                              <p className="py-3 text-center text-xs font-bold text-[var(--muted)]">فصل یا مبحث دارای تستی برای این درس نیست.</p>
                            ) : (
                              Array.from(chapters.entries()).map(([chapter, data]) => {
                                const token = chapterToken(subject, chapter);
                                const selected = selectedChapters.includes(token);
                                return (
                                  <div key={token} className="rounded-xl border border-[var(--line)] bg-[var(--surface)] p-3">
                                    <button
                                      type="button"
                                      onClick={() => toggleChapter(subject, chapter)}
                                      className="flex w-full items-center justify-between gap-3 text-right cursor-pointer"
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
                                                "rounded-lg border px-2.5 py-1.5 text-[10px] font-black transition",
                                                topicSelected
                                                  ? "border-[var(--line-strong)] bg-[var(--pastel-blue)] text-[var(--ink)]"
                                                  : "border-[var(--line)] text-[var(--muted)] bg-[var(--surface-2)]"
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
          </div>

          {/* STEP 4: QUESTION COUNT & OPTIONAL KEYWORD SEARCH */}
          <div className="card-neo space-y-4 rounded-3xl border-2 bg-[var(--surface)] p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <StepNumber value="۴" color="bg-[var(--pastel-yellow)]" />
              <h2 className="font-black text-[var(--ink)]">تعداد سؤالات و جستجوی متنی (اختیاری)</h2>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-2 block text-xs font-black text-[var(--ink)]">تعداد تست برای مرور:</label>
                <div className="grid grid-cols-6 gap-2">
                  {([5, 10, 15, 20, 30, "all"] as CountChoice[]).map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      onClick={() => setLaunchCount(choice)}
                      className={cn(
                        "min-h-11 rounded-xl border-2 text-xs font-black transition",
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

              <div>
                <label htmlFor="search-questions-input" className="mb-2 block text-xs font-black text-[var(--ink)]">
                  جستجو در صورت سؤال یا نکته تشریحی:
                </label>
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" size={16} />
                  <input
                    id="search-questions-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="کلمه کلیدی یا مفهوم خاص…"
                    className="min-h-11 w-full rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] pr-10 pl-3 text-xs font-bold text-[var(--ink)] outline-none focus:border-[var(--line-strong)]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* LAUNCH & SUMMARY DASHBOARD */}
          <div className="card-neo space-y-4 rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-5 sm:p-6 shadow-[4px_4px_0px_var(--neo-shadow)]">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[var(--line)] pb-4">
              <div>
                <strong className="block text-base font-black text-[var(--ink)]">
                  {requestedCount} سؤال آماده برای شروع مرور
                </strong>
                <span className="text-xs font-bold text-[var(--muted)]">
                  (از مجموع {matchingCount} سؤال منطبق بر فیلترهای انتخابی شما)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
                  {selectedSubjects.length} درس انتخابی
                </span>
                <span className="rounded-lg border border-[var(--line)] bg-[var(--surface-2)] px-2.5 py-1 text-[11px] font-black text-[var(--ink)]">
                  {selectedModes.length} دسته وضعیت
                </span>
              </div>
            </div>

            {/* Two Primary Action Launch Buttons */}
            {canStart ? (
              <div className="grid gap-3 sm:grid-cols-2 pt-1">
                {/* 1. Study Review Launcher */}
                <Link
                  href={studyRunnerUrl}
                  className="group relative flex flex-col justify-between rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--pastel-yellow)] p-4 shadow-[3px_3px_0px_var(--neo-shadow)] transition hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--line-strong)] bg-[var(--surface)] px-2.5 py-0.5 text-[11px] font-black text-[var(--ink)]">
                        <BookOpen size={13} />
                        مطالعه گام‌به‌گام
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-[var(--ink)] sm:text-base pt-1">
                      شروع مرور تشریحی
                    </h3>
                    <p className="text-[11px] font-bold text-[var(--ink)]/80 leading-relaxed">
                      مشاهده سؤال با گزینهٔ صحیح، پاسخ تشریحی کامل و دکمهٔ «یاد گرفتم» بدون فشار آزمون
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-end font-black text-xs text-[var(--ink)] group-hover:underline">
                    ورود به مرور تشریحی ←
                  </div>
                </Link>

                {/* 2. Test Review Launcher */}
                <Link
                  href={testRunnerUrl}
                  className="group relative flex flex-col justify-between rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-orange)] text-white p-4 shadow-[3px_3px_0px_var(--neo-shadow)] transition hover:translate-x-[-1px] hover:translate-y-[-1px] active:translate-x-[1px] active:translate-y-[1px]"
                >
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="inline-flex items-center gap-1.5 rounded-lg border border-white/40 bg-black/20 px-2.5 py-0.5 text-[11px] font-black text-white">
                        <Play size={13} />
                        تستی و تمرینی
                      </span>
                    </div>
                    <h3 className="text-sm font-black text-white sm:text-base pt-1">
                      شروع مرور آزمونی
                    </h3>
                    <p className="text-[11px] font-bold text-white/90 leading-relaxed">
                      آزمون زمان‌دار با گزینه‌های تعاملی، یادآوری فعال و ثبت درصد در کارنامه
                    </p>
                  </div>
                  <div className="mt-3 flex items-center justify-end font-black text-xs text-white group-hover:underline">
                    ورود به آزمون مرور ←
                  </div>
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border-2 border-dashed border-[var(--line)] p-6 text-center space-y-2 bg-[var(--surface-2)]">
                <Sparkles className="mx-auto text-[var(--muted)]" size={28} />
                <strong className="block text-sm font-black text-[var(--ink)]">
                  {selectedSubjects.length === 0
                    ? "حداقل یک درس انتخاب کنید."
                    : selectedModes.length === 0
                    ? "حداقل یک دسته وضعیت را تیک بزنید."
                    : "سؤالی با این ترکیب از فیلترها و درس‌ها یافت نشد."}
                </strong>
                <p className="text-xs font-bold text-[var(--muted)] max-w-md mx-auto">
                  می‌توانید فیلترهای جلسه را پاک کنید، دسته‌های دیگر (مانند با شک یا مسلط) را تیک بزنید، یا درس‌های بیشتری را انتخاب نمایید.
                </p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OVERVIEW & LEITNER QUEUE (آمار و صف سررسید) */}
      {/* ========================================================================= */}
      {activeTab === "overview" && (
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
                    setSelectedModes([category.id]);
                    setActiveTab("setup");
                  }}
                  className={cn(
                    "card-neo flex min-h-28 flex-col justify-between rounded-2xl border-2 p-4 text-right transition hover:scale-[1.02] cursor-pointer",
                    STAT_STYLES[category.id]
                  )}
                >
                  <div className="flex items-center justify-between">
                    <IconComp size={20} className={category.activeClass.split(" ").pop()} aria-hidden="true" />
                    <strong className="text-2xl font-black text-[var(--ink)]">{overviewCounts[category.id] ?? 0}</strong>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-[var(--ink)]">{category.title}</h3>
                    <span className="text-[10px] font-bold text-[var(--muted)]">تنظیم در فیلترها ←</span>
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
                    setSelectedModes(["due"]);
                    setActiveTab("setup");
                  }}
                  className="btn-neo-orange inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black cursor-pointer"
                >
                  <Play size={14} />
                  <span>تنظیم مرور لایتنر</span>
                </button>
              )}
            </div>

            {dueItems.length === 0 ? (
              <div className="rounded-2xl border-2 border-dashed border-[var(--line)] px-4 py-8 text-center space-y-2">
                <Sparkles className="mx-auto text-emerald-500" size={28} />
                <p className="text-sm font-black text-[var(--ink)]">فعلاً سؤال سررسیدشده‌ای در صف لایتنر ندارید</p>
                <p className="text-xs font-bold text-[var(--muted)]">
                  می‌توانید از تب «تنظیم و انتخاب سؤالات» برای بازیابی اشتباهات یا مرور درس‌های دلخواه استفاده کنید.
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
  return (
    <span className={cn("flex h-8 w-8 items-center justify-center rounded-xl border-2 border-[var(--line-strong)] text-sm font-black text-[var(--ink-on-color)] shadow-[1px_1px_0px_var(--neo-shadow)]", color)}>
      {value}
    </span>
  );
}

function CheckBox({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 border-[var(--line-strong)] transition",
        checked ? "bg-[var(--brand-orange)] text-white shadow-[1px_1px_0px_var(--neo-shadow)]" : "bg-[var(--surface)] text-transparent"
      )}
    >
      <Check size={13} strokeWidth={3} />
    </span>
  );
}

function PresetButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border-2 border-[var(--line)] bg-[var(--surface)] px-2.5 py-1 text-[10px] font-black text-[var(--ink)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] transition cursor-pointer"
    >
      {children}
    </button>
  );
}
