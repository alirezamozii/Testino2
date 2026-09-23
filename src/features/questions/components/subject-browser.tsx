"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FolderOpen,
  HelpCircle,
  Layers,
  Play,
  RotateCcw,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { EmptyState, LoadingState, MascotBanner } from "@/components/ui/testino-ui";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";

export function SubjectBrowser() {
  const { db, status } = useDatabase();

  const [selectedSubject, setSelectedSubject] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<"chapters" | "topics">("chapters");
  const [searchTerm, setSearchTerm] = useState("");

  const questionsQuery = useQuery({
    queryKey: ["subject-browser-questions"],
    queryFn: () => db.listQuestions({ limit: 10_000 }),
    enabled: status === "ready",
  });

  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
  const profile = profilesQuery.data?.[0];

  const analyticsQuery = useQuery({
    queryKey: ["subject-analytics", profile?.id],
    queryFn: () => db.analytics(profile!.id),
    enabled: Boolean(profile),
  });

  // Group questions by subject
  const subjectsData = useMemo(() => {
    const list = questionsQuery.data ?? [];
    const grouped = new Map<string, typeof list>();

    for (const q of list) {
      const sub = q.subject || "بدون درس";
      const existing = grouped.get(sub) ?? [];
      existing.push(q);
      grouped.set(sub, existing);
    }

    // Also include any subjects from profile if not yet in questions
    if (profile?.subjects) {
      for (const s of profile.subjects) {
        if (!grouped.has(s.name)) {
          grouped.set(s.name, []);
        }
      }
    }

    return grouped;
  }, [questionsQuery.data, profile]);

  const subjectsList = useMemo(() => {
    return Array.from(subjectsData.entries()).map(([name, questions]) => {
      const chaptersSet = new Set(questions.map((q) => q.chapter).filter(Boolean));
      const topicsSet = new Set(questions.map((q) => q.topic).filter(Boolean));
      const profileSub = profile?.subjects.find((ps) => ps.name === name);
      const stats = analyticsQuery.data?.bySubject.find((s) => s.subject === name);

      return {
        name,
        questionCount: questions.length,
        chaptersCount: chaptersSet.size,
        topicsCount: topicsSet.size,
        coefficient: profileSub?.coefficient ?? 2,
        targetPercentage: profileSub?.targetPercentage ?? 70,
        actualPercentage: stats?.percentage ? Math.round(stats.percentage) : 0,
        solvedCount: stats?.total ?? 0,
        correctCount: stats?.correct ?? 0,
      };
    });
  }, [subjectsData, profile, analyticsQuery.data]);

  // If a subject is currently selected, get its chapters and topics
  const currentSubjectDetails = useMemo(() => {
    if (!selectedSubject) return null;
    const questions = subjectsData.get(selectedSubject) ?? [];

    const chaptersMap = new Map<string, typeof questions>();
    for (const q of questions) {
      const ch = q.chapter || "فصل عمومی / بدون فصل";
      const arr = chaptersMap.get(ch) ?? [];
      arr.push(q);
      chaptersMap.set(ch, arr);
    }

    const topicsMap = new Map<string, typeof questions>();
    for (const q of questions) {
      const top = q.topic || "موضوع عمومی";
      const arr = topicsMap.get(top) ?? [];
      arr.push(q);
      topicsMap.set(top, arr);
    }

    const subInfo = subjectsList.find((s) => s.name === selectedSubject);

    return {
      name: selectedSubject,
      info: subInfo,
      questions,
      chapters: Array.from(chaptersMap.entries()).map(([title, items], index) => ({
        index: index + 1,
        title,
        questionsCount: items.length,
        progressPct: 0,
      })),
      topics: Array.from(topicsMap.entries()).map(([title, items], index) => ({
        index: index + 1,
        title,
        questionsCount: items.length,
      })),
    };
  }, [selectedSubject, subjectsData, subjectsList]);

  if (questionsQuery.isLoading) {
    return <LoadingState label="در حال دسته‌بندی و بارگذاری ساختار دروس…" />;
  }

  // VIEW 1: Individual Subject Detail (Wireframe 6/20 Sheet)
  if (currentSubjectDetails) {
    const { name, info, chapters, topics } = currentSubjectDetails;
    const masteryPct = info?.actualPercentage || 65;

    return (
      <div className="page subject-detail-page space-y-6 pb-12">
        {/* 0. Global Bank Navigation */}
        <BankNavTabs activeTab="bank" />

        {/* Top Header with Back Arrow */}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setSelectedSubject(null)}
            className="btn-secondary-clean py-2 px-3.5 text-xs font-black flex items-center gap-1.5"
          >
            <ArrowRight size={16} />
            <span>بازگشت به همهٔ درس‌ها</span>
          </button>

          <Link
            href={`/sessions/new/?subject=${encodeURIComponent(name)}`}
            className="btn-neo-orange py-2 px-4 text-xs font-black flex items-center gap-1.5"
          >
            <Play size={14} className="fill-current" />
            <span>شروع آزمون از این درس</span>
          </Link>
        </div>

        {/* Subject Overview Card */}
        <div className="testino-card p-5 sm:p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-5">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 flex items-center justify-center font-black text-xl shadow-inner">
                <BookOpen size={28} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-xl font-black text-[var(--ink)]">{name}</h1>
                  <span className="testino-chip bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 text-[10px] font-black">
                    ضریب {info?.coefficient ?? 2}
                  </span>
                </div>
                <p className="text-xs font-bold text-[var(--muted)] mt-1">
                  شامل {chapters.length} فصل و {topics.length} موضوع تخصصی در بانک
                </p>
              </div>
            </div>

            {/* Mastery Pill */}
            <div className="flex items-center gap-3 bg-[var(--surface-2)] p-3 rounded-2xl border border-[var(--line)]">
              <div className="text-center">
                <span className="block text-xl font-black text-[var(--brand-orange)]">
                  {new Intl.NumberFormat("fa-IR").format(masteryPct)}٪
                </span>
                <span className="text-[10px] font-bold text-[var(--muted)]">میزان تسلط</span>
              </div>
              <div className="w-px h-8 bg-[var(--line)]" />
              <div className="text-center">
                <span className="block text-xl font-black text-emerald-600 dark:text-emerald-400">
                  {new Intl.NumberFormat("fa-IR").format(info?.targetPercentage || 70)}٪
                </span>
                <span className="text-[10px] font-bold text-[var(--muted)]">درصد هدف</span>
              </div>
            </div>
          </div>

          {/* 4 Stat Boxes (Wireframe 06) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
              <span className="block text-[11px] font-bold text-[var(--muted)]">کل سؤالات</span>
              <strong className="block text-base sm:text-lg font-black text-[var(--ink)] mt-0.5">
                {new Intl.NumberFormat("fa-IR").format(currentSubjectDetails.questions.length)}
              </strong>
            </div>

            <div className="p-3.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
              <span className="block text-[11px] font-bold text-[var(--muted)]">پاسخ‌های داده‌شده</span>
              <strong className="block text-base sm:text-lg font-black text-emerald-600 dark:text-emerald-400 mt-0.5">
                {new Intl.NumberFormat("fa-IR").format(info?.solvedCount || 0)}
              </strong>
            </div>

            <div className="p-3.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
              <span className="block text-[11px] font-bold text-[var(--muted)]">پاسخ‌های صحیح</span>
              <strong className="block text-base sm:text-lg font-black text-[var(--brand-orange)] mt-0.5">
                {new Intl.NumberFormat("fa-IR").format(info?.correctCount || 0)}
              </strong>
            </div>

            <div className="p-3.5 bg-[var(--surface-2)] rounded-2xl border border-[var(--line)] text-center">
              <span className="block text-[11px] font-bold text-[var(--muted)]">تعداد فصول</span>
              <strong className="block text-base sm:text-lg font-black text-[var(--ink)] mt-0.5">
                {new Intl.NumberFormat("fa-IR").format(chapters.length)}
              </strong>
            </div>
          </div>
        </div>

        {/* Chapters and Topics Tabs */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveSubTab("chapters")}
                className={cn(
                  "py-2 px-4 rounded-xl text-xs font-black transition-all",
                  activeSubTab === "chapters"
                    ? "bg-[var(--brand-orange)] text-white shadow-sm"
                    : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                فصل‌های درس ({new Intl.NumberFormat("fa-IR").format(chapters.length)})
              </button>

              <button
                type="button"
                onClick={() => setActiveSubTab("topics")}
                className={cn(
                  "py-2 px-4 rounded-xl text-xs font-black transition-all",
                  activeSubTab === "topics"
                    ? "bg-[var(--brand-orange)] text-white shadow-sm"
                    : "bg-[var(--surface-2)] text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                موضوعات و مباحث ({new Intl.NumberFormat("fa-IR").format(topics.length)})
              </button>
            </div>

            <span className="text-xs font-bold text-[var(--muted)]">مرتب‌سازی: به ترتیب سرفصل</span>
          </div>

          {/* Chapters List */}
          {activeSubTab === "chapters" ? (
            <div className="space-y-3">
              {chapters.length === 0 ? (
                <EmptyState
                  icon={Layers}
                  title="هنوز فصلی برای این درس ثبت نشده است"
                  description="با وارد کردن سؤالات با برچسب فصل، فصول این درس به‌طور خودکار ساخته می‌شوند."
                />
              ) : (
                chapters.map((ch) => (
                  <div
                    key={ch.title}
                    className="testino-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-[var(--brand-orange)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 rounded-xl bg-[var(--surface-2)] text-[var(--ink)] font-black text-xs flex items-center justify-center shrink-0 border border-[var(--line)]">
                        {new Intl.NumberFormat("fa-IR").format(ch.index)}
                      </span>
                      <div>
                        <h3 className="text-xs sm:text-sm font-black text-[var(--ink)]">{ch.title}</h3>
                        <span className="text-[11px] font-bold text-[var(--muted)] mt-0.5 block">
                          {new Intl.NumberFormat("fa-IR").format(ch.questionsCount)} سؤال در بانک
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                      <div className="w-28 sm:w-36 space-y-1">
                        <div className="h-2 w-full bg-[var(--surface-2)] rounded-full overflow-hidden border border-[var(--line)]">
                          <div
                            className="h-full bg-emerald-500 rounded-full"
                            style={{ width: `${ch.progressPct}%` }}
                          />
                        </div>
                        <span className="text-[10px] font-bold text-[var(--muted)] block text-left">
                          {new Intl.NumberFormat("fa-IR").format(ch.progressPct)}٪ پیشرفت
                        </span>
                      </div>

                      <Link
                        href={`/sessions/new/?subject=${encodeURIComponent(name)}&chapter=${encodeURIComponent(ch.title)}`}
                        className="btn-secondary-clean py-1.5 px-3 text-[11px] font-bold shrink-0"
                      >
                        تمرین فصل <ChevronLeft size={14} />
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* Topics List */
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {topics.length === 0 ? (
                <div className="col-span-2">
                  <EmptyState
                    icon={Compass}
                    title="هنوز موضوعی برای این درس ثبت نشده است"
                    description="با وارد کردن سؤالات با فیلد topic، موضوعات تفکیک می‌شوند."
                  />
                </div>
              ) : (
                topics.map((top) => (
                  <Link
                    key={top.title}
                    href={`/bank/topic/?subject=${encodeURIComponent(name)}&topic=${encodeURIComponent(top.title)}`}
                    className="testino-card p-4 flex items-center justify-between gap-3 hover:border-[var(--brand-orange)] transition-all hover:scale-[1.01]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 flex items-center justify-center font-bold text-xs shrink-0">
                        <Compass size={16} />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-[var(--ink)] line-clamp-1">{top.title}</h4>
                        <span className="text-[10px] font-bold text-[var(--muted)] block">
                          {new Intl.NumberFormat("fa-IR").format(top.questionsCount)} سؤال
                        </span>
                      </div>
                    </div>
                    <ChevronLeft size={16} className="text-[var(--muted)] shrink-0" />
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // VIEW 2: All Subjects Overview Grid (Wireframe 6 Overview)
  return (
    <div className="page subjects-overview-page space-y-6 pb-12">
      {/* 0. Global Bank Navigation */}
      <BankNavTabs activeTab="bank" />

      {/* Mascot Banner */}
      <MascotBanner
        badge="نمای ساختار درس‌ها"
        title="تسلط کامل بر دروس و فصول آزمون"
        description="هر درس یک فرصت طلایی برای پیشرفت است. فصول و مباحث را بررسی کن و نقاط ضعف و قوتت را ارتقا بده."
        mood="celebrate"
        action={
          <Link href="/bank/" className="btn-secondary-clean py-2.5 px-4 text-xs font-bold flex items-center gap-1.5">
            <Search size={16} />
            <span>جستجو در کل بانک سؤالات</span>
          </Link>
        }
      />

      {/* Search and Summary */}
      <div className="testino-card p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="جستجوی نام درس..."
            className="w-full pr-9 pl-3 py-2 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] focus:outline-none focus:border-[var(--brand-orange)]"
          />
        </div>

        <div className="flex items-center gap-3 text-xs font-bold text-[var(--muted)]">
          <span>{new Intl.NumberFormat("fa-IR").format(subjectsList.length)} درس فعال</span>
          <span>•</span>
          <span>
            {new Intl.NumberFormat("fa-IR").format(questionsQuery.data?.length ?? 0)} سؤال کل
          </span>
        </div>
      </div>

      {/* Subjects Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {subjectsList
          .filter((s) => !searchTerm || s.name.includes(searchTerm))
          .map((subject, idx) => {
            const colors = [
              "bg-orange-500",
              "bg-indigo-500",
              "bg-emerald-500",
              "bg-amber-500",
              "bg-sky-500",
              "bg-purple-500",
              "bg-teal-500",
            ];
            const colorClass = colors[idx % colors.length];

            return (
              <div
                key={subject.name}
                onClick={() => setSelectedSubject(subject.name)}
                className="testino-card p-5 cursor-pointer hover:border-[var(--brand-orange)] transition-all hover:scale-[1.01] flex flex-col justify-between space-y-4"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <div className={cn("w-10 h-10 rounded-2xl text-white flex items-center justify-center font-black text-sm shadow-sm", colorClass)}>
                        <BookOpen size={20} />
                      </div>
                      <div>
                        <h3 className="text-sm font-black text-[var(--ink)] line-clamp-1">{subject.name}</h3>
                        <span className="text-[11px] font-bold text-[var(--muted)]">
                          {new Intl.NumberFormat("fa-IR").format(subject.questionCount)} سؤال در بانک
                        </span>
                      </div>
                    </div>

                    <span className="testino-chip text-[10px] font-black bg-[var(--surface-2)] text-[var(--ink)]">
                      ضریب {subject.coefficient}
                    </span>
                  </div>

                  {/* Chapters and Topics Pills */}
                  <div className="flex items-center gap-2 mt-4 text-[11px] font-bold text-[var(--muted)]">
                    <span className="bg-[var(--surface-2)] px-2.5 py-1 rounded-lg border border-[var(--line)]">
                      {new Intl.NumberFormat("fa-IR").format(subject.chaptersCount)} فصل
                    </span>
                    <span className="bg-[var(--surface-2)] px-2.5 py-1 rounded-lg border border-[var(--line)]">
                      {new Intl.NumberFormat("fa-IR").format(subject.topicsCount)} موضوع
                    </span>
                  </div>
                </div>

                {/* Progress bar and Action */}
                <div className="space-y-2 pt-2 border-t border-[var(--line)]">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-[var(--muted)]">هدف: {subject.targetPercentage}٪</span>
                    <span className="text-emerald-600 dark:text-emerald-400 font-black">
                      {subject.actualPercentage}% تسلط
                    </span>
                  </div>
                  <div className="w-full h-2 bg-[var(--surface-2)] rounded-full overflow-hidden border border-[var(--line)]">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${Math.min(100, subject.actualPercentage || 30)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-xs font-black text-[var(--brand-orange)] flex items-center gap-1">
                      مشاهده جزئیات و فصول <ChevronLeft size={14} />
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export function SubjectDetail({ name }: { name: string }) {
  const { db, status } = useDatabase();
  const [activeTab, setActiveTab] = useState<"overview" | "chapters" | "analytics" | "topics">("overview");
  const [selectedChapterName, setSelectedChapterName] = useState<string | null>(null);
  const [topicSearchTerm, setTopicSearchTerm] = useState("");
  const [analyticsPeriod, setAnalyticsPeriod] = useState<"7d" | "1m" | "3m" | "all">("all");

  const statsQuery = useQuery({
    queryKey: ["subject-stats", name],
    queryFn: () => db.getSubjectStats(name),
    enabled: status === "ready" && Boolean(name),
  });

  const questionsQuery = useQuery({
    queryKey: ["subject-questions", name],
    queryFn: () => db.listQuestions({ subject: name, limit: 10_000 }),
    enabled: status === "ready" && Boolean(name),
  });

  const allQuestions = questionsQuery.data ?? [];
  const stats = statsQuery.data;
  const topicsList = stats?.topics;

  // Filter topics for the topic tab
  const filteredTopics = useMemo(() => {
    if (!topicsList) return [];
    if (!topicSearchTerm.trim()) return topicsList;
    const term = topicSearchTerm.trim().toLowerCase();
    return topicsList.filter(
      (t) => t.name.toLowerCase().includes(term) || t.chapter.toLowerCase().includes(term)
    );
  }, [topicsList, topicSearchTerm]);

  if (statsQuery.isLoading || questionsQuery.isLoading) {
    return <LoadingState label="در حال آماده‌سازی جزئیات درس…" />;
  }

  const totalQuestions = stats?.totalQuestions ?? allQuestions.length;
  const solvedCount = stats?.solvedCount ?? 0;
  const progressPercentage = totalQuestions > 0 ? Math.round((solvedCount / totalQuestions) * 100) : 0;
  const accuracyPercentage = stats?.accuracyPercentage ?? 0;

  // Mastery categories
  const strongChapters = (stats?.chapters ?? []).filter((c) => c.accuracy >= 70).length;
  const mediumChapters = (stats?.chapters ?? []).filter((c) => c.accuracy >= 40 && c.accuracy < 70).length;
  const focusChapters = (stats?.chapters ?? []).filter((c) => c.accuracy < 40).length;

  const strongestTopic = (stats?.topics ?? []).length
    ? [...(stats?.topics ?? [])].sort((a, b) => b.accuracy - a.accuracy)[0]
    : null;
  const weakestTopic = (stats?.topics ?? []).length
    ? [...(stats?.topics ?? [])].sort((a, b) => a.accuracy - b.accuracy)[0]
    : null;

  return (
    <div className="page subject-detail-page max-w-4xl mx-auto space-y-6 pb-12">
      {/* 0. Global Bank Navigation */}
      <BankNavTabs activeTab="bank" />

      {/* 1. Top Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/bank/"
          className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
        >
          <ChevronRight size={20} />
        </Link>
        <div className="text-center">
          <h1 className="text-lg sm:text-xl font-black text-[var(--ink)] tracking-tight">{name}</h1>
          <span className="text-[10px] text-[var(--muted)] font-bold">جزئیات و تحلیل درس</span>
        </div>
        <Link
          href={`/sessions/new/?subject=${encodeURIComponent(name)}`}
          className="py-2 px-3.5 rounded-2xl bg-[var(--brand-orange)] text-white text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center gap-1.5"
        >
          <Play size={14} className="fill-current" />
          <span>آزمون</span>
        </Link>
      </div>

      {/* 2. Top Hero Card: Subject Banner (Matching Wireframe 06 Phone 1) */}
      <div className="card-neo p-5 bg-gradient-to-r from-[var(--pastel-blue)]/25 via-[var(--surface)] to-[var(--surface)] space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
                کنکور کارشناسی ارشد
              </span>
              <span className="text-[11px] text-[var(--muted)] font-bold">
                {stats?.chapters.length ?? 0} فصل • {totalQuestions} سؤال
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] mt-1.5">{name}</h2>
            <p className="text-xs text-[var(--muted)] font-bold mt-1">
              مجموعه کامل سوالات و تست‌های استاندارد با بودجه‌بندی و سطح تسلط
            </p>
          </div>
          <div className="w-14 h-14 rounded-2xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)] flex-shrink-0">
            <BookOpen size={28} />
          </div>
        </div>

        {/* Overall Progress Bar */}
        <div className="space-y-1.5 pt-1">
          <div className="flex justify-between text-xs font-black">
            <span className="text-[var(--ink)]">پیشرفت کلی درس</span>
            <span className="text-[var(--brand-orange)]">{progressPercentage}٪</span>
          </div>
          <div className="w-full bg-[var(--surface-3)] h-3 rounded-full border-2 border-[var(--line-strong)] overflow-hidden">
            <div
              className="bg-[var(--brand-green)] h-full transition-all duration-500"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
          <div className="flex justify-between text-[10px] text-[var(--muted)] font-bold">
            <span>{solvedCount} سؤال حل شده</span>
            <span>{totalQuestions - solvedCount} سؤال باقی‌مانده</span>
          </div>
        </div>
      </div>

      {/* 3. Navigation Tabs (Matching Wireframe 06 4-Phone Layout) */}
      <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)]">
        <button
          type="button"
          onClick={() => { setActiveTab("overview"); setSelectedChapterName(null); }}
          className={cn(
            "py-2.5 rounded-xl transition-all border-2 flex items-center justify-center",
            activeTab === "overview" && !selectedChapterName
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          نمای کلی
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("chapters"); setSelectedChapterName(null); }}
          className={cn(
            "py-2.5 rounded-xl transition-all border-2 flex items-center justify-center",
            activeTab === "chapters" || selectedChapterName
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          فصل‌ها ({stats?.chapters.length ?? 0})
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("analytics"); setSelectedChapterName(null); }}
          className={cn(
            "py-2.5 rounded-xl transition-all border-2 flex items-center justify-center",
            activeTab === "analytics"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          تحلیل درس
        </button>
        <button
          type="button"
          onClick={() => { setActiveTab("topics"); setSelectedChapterName(null); }}
          className={cn(
            "py-2.5 rounded-xl transition-all border-2 flex items-center justify-center",
            activeTab === "topics"
              ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
              : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
          )}
        >
          موضوعات ({stats?.topics.length ?? 0})
        </button>
      </div>

      {/* TAB 1: نمای کلی درس */}
      {activeTab === "overview" && !selectedChapterName && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="card-neo p-3.5 bg-[var(--surface)] text-center space-y-1">
              <span className="text-[11px] font-black text-[var(--muted)] block">تعداد سؤالات</span>
              <strong className="text-xl font-black text-[var(--ink)]">{totalQuestions}</strong>
              <span className="text-[10px] text-[var(--muted)] font-bold block">بانک موجود</span>
            </div>
            <div className="card-neo p-3.5 bg-[var(--surface)] text-center space-y-1">
              <span className="text-[11px] font-black text-[var(--muted)] block">حل شده</span>
              <strong className="text-xl font-black text-[var(--brand-green)]">{solvedCount}</strong>
              <span className="text-[10px] text-[var(--muted)] font-bold block">تست پاسخ‌داده</span>
            </div>
            <div className="card-neo p-3.5 bg-[var(--surface)] text-center space-y-1">
              <span className="text-[11px] font-black text-[var(--muted)] block">میانگین زمان</span>
              <strong className="text-xl font-black text-[var(--ink)]">
                {Math.floor((stats?.averageTimeSec ?? 0) / 60)}:
                {String((stats?.averageTimeSec ?? 0) % 60).padStart(2, "0")}
              </strong>
              <span className="text-[10px] text-[var(--muted)] font-bold block">دقیقه به ازای سؤال</span>
            </div>
            <div className="card-neo p-3.5 bg-[var(--surface)] text-center space-y-1">
              <span className="text-[11px] font-black text-[var(--muted)] block">درصد پاسخ صحیح</span>
              <strong className="text-xl font-black text-[var(--brand-orange)]">{accuracyPercentage}٪</strong>
              <span className="text-[10px] text-[var(--muted)] font-bold block">دقت پاسخگویی</span>
            </div>
          </div>

          <div className="card-neo p-5 bg-[var(--surface)] space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-[var(--ink)]">میزان تسلط مبحثی</h3>
              <span className="text-xs font-black px-2.5 py-1 rounded-xl bg-[var(--pastel-green)]/25 text-[var(--ink-on-color)] border border-[var(--line-strong)]">
                {accuracyPercentage >= 70 ? "سطح قوی" : accuracyPercentage >= 40 ? "سطح متوسط" : "نیازمند تمرکز"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2.5 text-center">
              <div className="p-3 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)]">
                <span className="text-[10px] font-black text-[var(--ink)] block">فصول قوی</span>
                <strong className="text-xl font-black text-[var(--ink)] mt-0.5 block">{strongChapters}</strong>
                <span className="text-[9px] text-[var(--muted)] font-bold block">دقت بالای ۷۰٪</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)]">
                <span className="text-[10px] font-black text-[var(--ink)] block">فصول متوسط</span>
                <strong className="text-xl font-black text-[var(--ink)] mt-0.5 block">{mediumChapters}</strong>
                <span className="text-[9px] text-[var(--muted)] font-bold block">دقت بین ۴۰ تا ۷۰٪</span>
              </div>
              <div className="p-3 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)]">
                <span className="text-[10px] font-black text-[var(--danger)] block">نیاز به تمرکز</span>
                <strong className="text-xl font-black text-[var(--danger)] mt-0.5 block">{focusChapters}</strong>
                <span className="text-[9px] text-[var(--danger)] font-bold block">دقت زیر ۴۰٪</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setActiveTab("chapters")}
              className="card-neo p-4 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-all flex items-center justify-between text-right"
            >
              <div className="flex items-center gap-2.5">
                <FolderOpen size={20} className="text-[var(--brand-orange)]" />
                <div>
                  <strong className="text-xs font-black text-[var(--ink)] block">مشاهده فصول</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">سرفصل‌ها و بودجه‌بندی</span>
                </div>
              </div>
              <ChevronLeft size={16} />
            </button>

            <Link
              href={`/review/?subject=${encodeURIComponent(name)}`}
              className="card-neo p-4 bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-all flex items-center justify-between text-right"
            >
              <div className="flex items-center gap-2.5">
                <RotateCcw size={20} className="text-[var(--brand-yellow)] stroke-[2.5]" />
                <div>
                  <strong className="text-xs font-black text-[var(--ink)] block">مرور سررسید</strong>
                  <span className="text-[10px] text-[var(--muted)] font-bold">تست‌های اشتباه یا شک‌دار</span>
                </div>
              </div>
              <ChevronLeft size={16} />
            </Link>

            <Link
              href={`/sessions/new/?subject=${encodeURIComponent(name)}`}
              className="btn-neo-orange p-4 text-xs font-black flex items-center justify-center gap-2"
            >
              <Play size={16} className="fill-current" />
              <span>شروع آزمون از این درس</span>
            </Link>
          </div>
        </div>
      )}

      {/* TAB 2: فصل‌های درس */}
      {(activeTab === "chapters" || selectedChapterName) && (
        <div className="space-y-4">
          {selectedChapterName ? (
            <div className="space-y-4">
              <button
                type="button"
                onClick={() => setSelectedChapterName(null)}
                className="flex items-center gap-1.5 text-xs font-black text-[var(--brand-orange)] hover:underline"
              >
                <ChevronRight size={16} />
                <span>بازگشت به لیست تمام فصل‌ها</span>
              </button>

              <div className="card-neo p-5 bg-[var(--surface)] space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
                      جزئیات فصل
                    </span>
                    <h3 className="text-xl font-black text-[var(--ink)] mt-1">{selectedChapterName}</h3>
                  </div>
                  <Link
                    href={`/sessions/new/?subject=${encodeURIComponent(name)}`}
                    className="btn-neo-orange py-2 px-3 text-xs font-black flex items-center gap-1"
                  >
                    <Play size={14} className="fill-current" />
                    <span>آزمون این فصل</span>
                  </Link>
                </div>

                <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <strong className="text-xs font-black text-[var(--ink)] block">درباره این فصل</strong>
                  <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
                    این فصل شامل تست‌های مفهومی و تحلیلی از مباحث اصلی {name} است.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-black text-[var(--ink)]">موضوعات این فصل:</h4>
                  <div className="space-y-2">
                    {(stats?.topics ?? [])
                      .filter((t) => t.chapter === selectedChapterName)
                      .map((topic, tIdx) => (
                        <Link
                          key={topic.name}
                          href={`/bank/topic/?subject=${encodeURIComponent(name)}&topic=${encodeURIComponent(topic.name)}`}
                          className="p-3 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] hover:bg-[var(--surface-2)] transition-all flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="w-6 h-6 rounded-lg bg-[var(--pastel-blue)] border border-[var(--line-strong)] flex items-center justify-center font-black text-xs text-[var(--ink-on-color)]">
                              {tIdx + 1}
                            </span>
                            <span className="text-xs font-black text-[var(--ink)]">{topic.name}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] text-[var(--muted)] font-bold">{topic.total} سؤال</span>
                            <ChevronLeft size={14} />
                          </div>
                        </Link>
                      ))}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {(stats?.chapters ?? []).map((ch, idx) => (
                <div
                  key={ch.name}
                  className="card-neo p-4 bg-[var(--surface)] flex items-center justify-between gap-4 hover:-translate-y-0.5 transition-all"
                >
                  <div className="flex items-center gap-3.5 flex-1">
                    <div className="w-10 h-10 rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center font-black text-sm text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                      {idx + 1}
                    </div>
                    <div className="flex-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <strong className="text-xs sm:text-sm font-black text-[var(--ink)]">{ch.name}</strong>
                        <span className="text-xs font-black text-[var(--brand-orange)]">{ch.percentage}٪</span>
                      </div>
                      <div className="w-full bg-[var(--surface-3)] h-2 rounded-full border border-[var(--line-strong)] overflow-hidden">
                        <div
                          className="bg-[var(--brand-green)] h-full transition-all"
                          style={{ width: `${ch.percentage}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[10px] text-[var(--muted)] font-bold">
                        <span>{ch.total} سؤال</span>
                        <span>{ch.solved} پاسخ داده شده</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedChapterName(ch.name)}
                    className="py-2 px-3 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1"
                  >
                    <span>جزئیات</span>
                    <ChevronLeft size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: تحلیل درس */}
      {activeTab === "analytics" && (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-1 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)]">
            {(["all", "3m", "1m", "7d"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setAnalyticsPeriod(p)}
                className={cn(
                  "flex-1 py-1.5 rounded-xl transition-all",
                  analyticsPeriod === p ? "bg-[var(--line-strong)] text-[var(--surface)]" : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                {p === "7d" ? "۷ روز" : p === "1m" ? "۱ ماه" : p === "3m" ? "۳ ماه" : "تمام دوره‌ها"}
              </button>
            ))}
          </div>

          <div className="card-neo p-5 bg-[var(--surface)] space-y-4">
            <h3 className="text-sm font-black text-[var(--ink)]">عملکرد کلی در درس {name}</h3>
            <div className="flex flex-col sm:flex-row items-center justify-around gap-4 pt-1">
              <div className="w-32 h-32 rounded-full border-8 border-[var(--brand-green)] bg-[var(--bg)] flex flex-col items-center justify-center shadow-[3px_3px_0px_var(--neo-shadow)]">
                <span className="text-2xl font-black text-[var(--ink)]">{accuracyPercentage}٪</span>
                <span className="text-[10px] font-bold text-[var(--muted)]">درصد پاسخ صحیح</span>
              </div>

              <div className="space-y-2 w-full sm:w-auto">
                <div className="flex items-center justify-between gap-6 text-xs p-2 rounded-xl bg-[var(--pastel-green)]/15 border border-[var(--line-strong)]">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-emerald-600" />
                    <span className="font-bold text-[var(--ink)]">پاسخ‌های صحیح:</span>
                  </div>
                  <strong className="font-black text-[var(--ink)]">{stats?.correctCount ?? 0} سؤال</strong>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs p-2 rounded-xl bg-[var(--pastel-red)]/15 border border-[var(--line-strong)]">
                  <div className="flex items-center gap-2">
                    <AlertCircle size={16} className="text-red-600" />
                    <span className="font-bold text-[var(--danger)]">پاسخ‌های غلط:</span>
                  </div>
                  <strong className="font-black text-[var(--danger)]">{stats?.wrongCount ?? 0} سؤال</strong>
                </div>
                <div className="flex items-center justify-between gap-6 text-xs p-2 rounded-xl bg-[var(--pastel-blue)]/20 border border-[var(--line-strong)]">
                  <div className="flex items-center gap-2">
                    <HelpCircle size={16} className="text-[var(--ink)]" />
                    <span className="font-bold text-[var(--ink)]">نزده یا بدون تلاش:</span>
                  </div>
                  <strong className="font-black text-[var(--ink)]">{stats?.unansweredCount ?? 0} سؤال</strong>
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="card-neo p-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2.5 py-0.5 rounded-full border border-emerald-300 dark:border-emerald-800">
                <Sparkles size={13} />
                <span>قوی‌ترین موضوع</span>
              </span>
              <strong className="block text-sm font-black text-[var(--ink)]">
                {strongestTopic ? strongestTopic.name : "هنوز تستی ثبت نشده"}
              </strong>
              <span className="text-xs font-bold text-[var(--muted)] block">
                {strongestTopic ? `دقت پاسخگویی: ${strongestTopic.accuracy}٪ (${strongestTopic.solved} تست)` : "نیاز به حل آزمون"}
              </span>
            </div>

            <div className="card-neo p-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-2">
              <span className="inline-flex items-center gap-1 text-[11px] font-black text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/40 px-2.5 py-0.5 rounded-full border border-red-300 dark:border-red-800">
                <Target size={13} />
                <span>ضعیف‌ترین موضوع (نیاز به تمرکز)</span>
              </span>
              <strong className="block text-sm font-black text-[var(--ink)]">
                {weakestTopic ? weakestTopic.name : "هنوز تستی ثبت نشده"}
              </strong>
              <span className="text-xs font-bold text-[var(--muted)] block">
                {weakestTopic ? `دقت پاسخگویی: ${weakestTopic.accuracy}٪ (${weakestTopic.solved} تست)` : "نیاز به حل آزمون"}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: موضوعات درس */}
      {activeTab === "topics" && (
        <div className="space-y-4">
          <div className="relative">
            <input
              type="text"
              value={topicSearchTerm}
              onChange={(e) => setTopicSearchTerm(e.target.value)}
              placeholder="جستجوی موضوع در این درس..."
              className="w-full bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-2xl pr-10 pl-4 py-3 text-xs font-black text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none shadow-[2px_2px_0px_var(--neo-shadow)]"
            />
            <Search size={18} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink)]" />
          </div>

          <div className="space-y-2.5">
            {!filteredTopics.length ? (
              <div className="card-neo p-6 text-center bg-[var(--surface)]">
                <EmptyState
                  icon={BookOpen}
                  title="موضوعی یافت نشد"
                  description="عبارت جستجو را تغییر دهید یا موضوع جدیدی اضافه کنید."
                />
              </div>
            ) : (
              filteredTopics.map((topic) => (
                <div
                  key={topic.name}
                  className="card-neo p-4 bg-[var(--surface)] flex items-center justify-between gap-3 hover:-translate-y-0.5 transition-all"
                >
                  <div>
                    <strong className="block text-xs sm:text-sm font-black text-[var(--ink)]">{topic.name}</strong>
                    <span className="text-[11px] text-[var(--muted)] font-bold">
                      فصل: {topic.chapter} • {topic.total} سؤال
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link
                      href={`/bank/topic/?subject=${encodeURIComponent(name)}&topic=${encodeURIComponent(topic.name)}`}
                      className="py-1.5 px-3 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] hover:bg-[var(--surface)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1"
                    >
                      <span>مشاهده سؤال‌ها</span>
                      <ChevronLeft size={14} />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
