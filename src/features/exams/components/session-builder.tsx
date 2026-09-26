"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  ArrowLeft,
  ChevronRight,
  Play,
  Plus,
} from "lucide-react";
import { LoadingState } from "@/components/ui/testino-ui";
import { useDatabase } from "@/providers/database-provider";
import { isSameSubject } from "@/features/questions/domain/subject-registry";
import type { QuestionPoolMode } from "@/database/app-database";
import { NeoButton } from "@/components/ui/neo-primitives";

import { BuilderStepper } from "./builder/builder-stepper";
import { BuilderStepSubjects } from "./builder/builder-step-subjects";
import { BuilderStepScope, type SubjectTaxonomyData } from "./builder/builder-step-scope";
import { BuilderStepPool } from "./builder/builder-step-pool";
import { BuilderStepConfig } from "./builder/builder-step-config";
import { BuilderStepSummary } from "./builder/builder-step-summary";

const PRESET_COUNTS = [10, 20, 30, 50];

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

  const subjectCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of availableSubjects) {
      counts[s] = allPublished.filter((q) => isSameSubject(q.subject, s)).length;
    }
    return counts;
  }, [availableSubjects, allPublished]);

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
    const map = new Map<string, SubjectTaxonomyData>();

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
        modes: selectedModes,
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

  if (database.status === "loading" || profilesQuery.isLoading) {
    return <LoadingState label="در حال آماده‌سازی اطلاعات آزمون…" />;
  }

  if (!profile) {
    return (
      <div className="card-neo max-w-md mx-auto py-12 px-6 text-center space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl shadow-[4px_4px_0px_var(--neo-shadow)]">
        <AlertCircle size={40} className="mx-auto text-amber-500" />
        <h2 className="text-xl font-black text-[var(--ink)]">پروفایلی یافت نشد</h2>
        <p className="text-xs text-[var(--muted)] font-bold">
          ابتدا باید یک پروفایل تحصیلی ایجاد کنید تا بتوانید آزمون بسازید.
        </p>
        <Link href="/onboarding/" className="btn-neo-orange inline-flex py-3 px-6 text-xs font-black">
          شروع راه‌اندازی پروفایل
        </Link>
      </div>
    );
  }

  if (allPublished.length === 0 && !allQuestionsQuery.isLoading) {
    return (
      <div className="card-neo max-w-md mx-auto py-12 px-6 text-center space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-3xl shadow-[4px_4px_0px_var(--neo-shadow)]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] mx-auto flex items-center justify-center text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)]">
          <AlertCircle size={32} />
        </div>
        <h2 className="text-xl font-black text-[var(--ink)]">بانک سوالات خالی است</h2>
        <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
          هیچ سوال منتشرشده‌ای در بانک وجود ندارد. برای ساخت آزمون، ابتدا سوالات را وارد کنید یا پکیج‌های آزمونی را دانلود نمایید.
        </p>
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
    <div className="page session-builder-page max-w-4xl mx-auto space-y-5 pb-32 sm:pb-16">
      {/* 1. Stepper Header */}
      <BuilderStepper currentStep={step} />

      {error && (
        <div className="p-3.5 rounded-2xl bg-[var(--pastel-red-soft)] text-[var(--pastel-red)] text-xs font-black border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-2">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Main Step Card */}
      <div className="card-neo p-5 sm:p-7 space-y-6 bg-[var(--surface)] border-2 border-[var(--line-strong)]">
        {step === 1 && (
          <BuilderStepSubjects
            subjectSearch={subjectSearch}
            onSubjectSearchChange={setSubjectSearch}
            selectedSubjects={selectedSubjects}
            onToggleSubject={toggleSubject}
            onToggleAllSubjects={toggleAllSubjects}
            isAllSubjectsSelected={isAllSubjectsSelected}
            filteredSubjectList={filteredSubjectList}
            totalPublishedCount={allPublished.length}
            subjectCounts={subjectCounts}
          />
        )}

        {step === 2 && (
          <BuilderStepScope
            scopeMode={scopeMode}
            onScopeModeChange={setScopeMode}
            selectedSubjects={selectedSubjects}
            availableCount={availableCount}
            allPublished={allPublished}
            taxonomy={taxonomy}
            expandedSubject={expandedSubject}
            onSetExpandedSubject={setExpandedSubject}
            selectedChapters={selectedChapters}
            onToggleChapter={toggleChapter}
            expandedChapters={expandedChapters}
            onToggleChapterDropdown={toggleChapterDropdown}
            selectedTopics={selectedTopics}
            onToggleTopic={toggleTopic}
            onSelectAllTopicsInChapter={selectAllTopicsInChapter}
            onDeselectAllTopicsInChapter={deselectAllTopicsInChapter}
          />
        )}

        {step === 3 && (
          <BuilderStepPool
            selectedModes={selectedModes}
            onToggleQuestionMode={toggleQuestionMode}
            availableCount={availableCount}
            selectedSources={selectedSources}
            onToggleSource={toggleSource}
            sourceCounts={sourceCounts}
            poolCounts={poolCounts}
          />
        )}

        {step === 4 && (
          <BuilderStepConfig
            feedbackMode={feedbackMode}
            onFeedbackModeChange={setFeedbackMode}
            count={count}
            onCountChange={setCount}
            isContinuous={isContinuous}
            onIsContinuousChange={setIsContinuous}
            presetCounts={PRESET_COUNTS}
            availableCount={availableCount}
            isTimed={isTimed}
            onIsTimedChange={setIsTimed}
            durationMinutes={durationMinutes}
            onDurationMinutesChange={setDurationMinutes}
            customMinutes={customMinutes}
            onCustomMinutesChange={setCustomMinutes}
            timeTouched={timeTouched}
            onTimeTouchedChange={setTimeTouched}
            suggestedMinutes={suggestedMinutes}
            negativeMarking={negativeMarking}
            onNegativeMarkingChange={setNegativeMarking}
            shuffleQuestions={shuffleQuestions}
            onShuffleQuestionsChange={setShuffleQuestions}
            shuffleOptions={shuffleOptions}
            onShuffleOptionsChange={setShuffleOptions}
            showAnswerSheet={showAnswerSheet}
            onShowAnswerSheetChange={setShowAnswerSheet}
            showExplanations={showExplanations}
            onShowExplanationsChange={setShowExplanations}
          />
        )}

        {step === 5 && (
          <BuilderStepSummary
            selectedSubjects={selectedSubjects}
            scopeMode={scopeMode}
            selectedChapters={selectedChapters}
            selectedTopics={selectedTopics}
            selectedModes={selectedModes}
            feedbackMode={feedbackMode}
            negativeMarking={negativeMarking}
            isContinuous={isContinuous}
            count={count}
            isTimed={isTimed}
            durationMinutes={durationMinutes}
            selectedSources={selectedSources}
            showAnswerSheet={showAnswerSheet}
            showExplanations={showExplanations}
            shuffleQuestions={shuffleQuestions}
            shuffleOptions={shuffleOptions}
          />
        )}

        {/* 3. Navigation Buttons Between Steps */}
        <div className="flex items-center gap-3 pt-2">
          {step > 1 && (
            <NeoButton
              type="button"
              variant="surface"
              size="md"
              onClick={() => setStep((s) => s - 1)}
              className="flex items-center gap-1.5"
            >
              <ChevronRight size={16} />
              <span>بازگشت</span>
            </NeoButton>
          )}

          {step < 5 ? (
            <NeoButton
              type="button"
              variant="primary"
              size="md"
              onClick={() => {
                if (step === 1 && selectedSubjects.length === 0) {
                  setError("لطفاً حداقل یک درس را انتخاب کنید.");
                  return;
                }
                setError("");
                setStep((s) => s + 1);
              }}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <span>ادامه</span>
              <ArrowLeft size={16} />
            </NeoButton>
          ) : (
            <NeoButton
              type="button"
              variant="primary"
              size="lg"
              onClick={create}
              disabled={busy || availableCount === 0}
              className="flex-1 flex items-center justify-center gap-2"
            >
              <span>{busy ? "در حال ساخت آزمون…" : "ساخت آزمون"}</span>
              {!busy && <Play size={16} className="fill-current" />}
            </NeoButton>
          )}
        </div>
      </div>
    </div>
  );
}
