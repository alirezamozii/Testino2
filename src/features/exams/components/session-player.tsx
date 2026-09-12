"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  BarChart3,
  Bookmark,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  Columns,
  Download,
  FileText,
  HelpCircle,
  Hourglass,
  Laptop,
  Lightbulb,
  List,
  Pause,
  Pin,
  PinOff,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  Wrench,
  X,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { calculateScore } from "../domain/scoring";
import { createActiveTimer, processHeartbeat, HEARTBEAT_INTERVAL_MS } from "../domain/active-timer";
import { buildSessionExport } from "@/features/ai/domain/export-builder";
import { simulateOverallConfidence } from "@/features/analytics/domain/confidence-simulation";
import { SignedNumber, SignedPercent, formatSignedPercentString } from "@/components/ui/signed-number";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { QuestionTrustActions } from "@/features/questions/components/question-trust-actions";

const PERSIAN_LETTERS = ["الف", "ب", "ج", "د"];

export function SessionPlayer() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const database = useDatabase();
  const cache = useQueryClient();

  const session = useQuery({
    queryKey: ["session", id],
    queryFn: () => database.db.getSession(id!),
    enabled: database.status === "ready" && Boolean(id),
  });

  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [flaggedIndices, setFlaggedIndices] = useState<Set<number>>(new Set());
  const [showNavSheet, setShowNavSheet] = useState(false);
  const [showToolsSheet, setShowToolsSheet] = useState(false);
  const [isExamPaper, setIsExamPaper] = useState(false);
  const [isPassagePinned, setIsPassagePinned] = useState(true);
  const [passageSplitMode, setPassageSplitMode] = useState(false);
  const [fontSize, setFontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const [quickNote, setQuickNote] = useState("");
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "wrong" | "unanswered">("all");
  const [navFilter, setNavFilter] = useState<"all" | "sure" | "doubtful" | "guess" | "skipped" | "unvisited">("all");
  const [finishedTab, setFinishedTab] = useState<"breakdown" | "questions" | "confidence">("breakdown");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
  const [poolExhausted, setPoolExhausted] = useState(false);
  const [gapNotice, setGapNotice] = useState(false);
  const openedAt = useRef<number | null>(null);
  const timerStateRef = useRef(createActiveTimer());

  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());

  const totalQuestions = session.data?.questions.length ?? 1;
  const index = selectedIndex ?? Math.min(session.data?.currentOrdinal ?? 0, Math.max(0, totalQuestions - 1));
  const current = session.data?.questions[index];
  const persistedSeconds = Math.floor((session.data?.questions.reduce((sum, item) => sum + item.activeMs, 0) ?? 0) / 1000);

  const isOpenEnded = Boolean(session.data?.config?.isOpenEnded || session.data?.config?.mode === "continuous");
  const isInstantFeedback = Boolean(
    session.data?.config?.instantFeedback || session.data?.config?.feedbackMode === "instant"
  );

  const isCurrentRevealed = isInstantFeedback && Boolean(
    current && (revealedIds.has(current.id) || (current.selectedOptionId && current.visited))
  );

  // Sync already answered questions on session load for instant feedback
  useEffect(() => {
    if (isInstantFeedback && session.data?.questions) {
      const answered = session.data.questions
        .filter((q) => Boolean(q.selectedOptionId))
        .map((q) => q.id);
      if (answered.length > 0) {
        setRevealedIds((prev) => {
          const next = new Set(prev);
          for (const qid of answered) next.add(qid);
          return next;
        });
      }
    }
  }, [isInstantFeedback, session.data?.questions]);

  const hasPassage = Boolean(
    current?.snapshot.groupContent && current.snapshot.groupContent.length > 0
  );

  const currentGroupId = current?.snapshot.groupId;
  const passageQuestions = (session.data?.questions ?? [])
    .map((q, qIdx) => ({ ...q, qIdx }))
    .filter((q) => currentGroupId && q.snapshot.groupId === currentGroupId);

  // Monotonic timer for current active screen
  useEffect(() => {
    openedAt.current = performance.now();
    timerStateRef.current = createActiveTimer(performance.now());
  }, [current?.id, session.data?.state]);

  // Active monotonic heartbeat timer (2s interval, 5s gap limit, background auto-pause)
  // Auto-paused when studying explanation in instant feedback mode
  useEffect(() => {
    if (session.data?.state !== "RUNNING" || isCurrentRevealed) return;
    const interval = setInterval(() => {
      const res = processHeartbeat(
        timerStateRef.current,
        performance.now(),
        document.visibilityState === "visible"
      );
      timerStateRef.current = res.nextState;
      if (res.gapDetected || res.shouldPause) {
        setGapNotice(true);
        if (id) {
          void database.db.pauseSession(id).then(() => {
            void cache.invalidateQueries({ queryKey: ["session", id] });
          });
        }
      } else if (res.deltaMs > 0) {
        setElapsedSeconds((prev) => prev + Math.round(res.deltaMs / 1000));
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [cache, database.db, id, isCurrentRevealed, session.data?.state]);

  const options = useMemo(
    () =>
      current
        ? current.optionOrder
            .map((optionId) => current.snapshot.options.find((option) => option.id === optionId))
            .filter(Boolean)
        : [],
    [current]
  );

  const save = useCallback(
    async (optionId: string | null, confidence = current?.confidence ?? null, nextIndex = index) => {
      if (!id || !current) return;
      setPending(true);
      setError("");
      try {
        const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
        await database.db.saveAnswer(id, current.id, optionId, confidence, elapsed, nextIndex);
        openedAt.current = performance.now();
        await cache.invalidateQueries({ queryKey: ["session", id] });
        setElapsedSeconds(0);
        setSelectedIndex(nextIndex);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "پاسخ ذخیره نشد.");
      } finally {
        setPending(false);
      }
    },
    [cache, current, database.db, id, index]
  );

  const handleRevealAnswer = useCallback(async () => {
    if (!id || !current) return;
    setPending(true);
    setError("");
    try {
      const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
      await database.db.saveAnswer(id, current.id, current.selectedOptionId, current.confidence, elapsed, index);
      openedAt.current = performance.now();
      setRevealedIds((prev) => new Set([...prev, current.id]));
      await cache.invalidateQueries({ queryKey: ["session", id] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در ثبت و بررسی پاسخ.");
    } finally {
      setPending(false);
    }
  }, [cache, current, database.db, id, index]);

  const handleNext = useCallback(async () => {
    if (!id || !current) return;
    if (index < totalQuestions - 1) {
      await save(current.selectedOptionId, current.confidence, index + 1);
    } else if (isOpenEnded) {
      setPending(true);
      setError("");
      try {
        const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
        await database.db.saveAnswer(id, current.id, current.selectedOptionId, current.confidence, elapsed, index);
        openedAt.current = performance.now();
        const appended = await database.db.appendNextUnit(id);
        if (appended && appended.length > 0) {
          await cache.invalidateQueries({ queryKey: ["session", id] });
          await session.refetch();
          setSelectedIndex(index + 1);
          setElapsedSeconds(0);
        } else {
          setPoolExhausted(true);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "خطا در دریافت سؤال بعدی.");
      } finally {
        setPending(false);
      }
    }
  }, [cache, current, database.db, id, index, isOpenEnded, save, session, totalQuestions]);

  const handleNavSelectQuestion = useCallback(
    (targetIndex: number) => {
      void save(current?.selectedOptionId ?? null, current?.confidence ?? null, targetIndex);
      setShowNavSheet(false);
    },
    [current?.confidence, current?.selectedOptionId, save]
  );

  const handlePrev = useCallback(async () => {
    if (!id || !current) return;
    if (index > 0) {
      await save(current.selectedOptionId, current.confidence, index - 1);
    }
  }, [current, id, index, save]);

  // Auto-pause & flush checkpoint on visibilitychange, blur, pagehide, beforeunload
  useEffect(() => {
    if (!id || !current || session.data?.state !== "RUNNING") return;
    const flushAndPause = () => {
      const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
      openedAt.current = null;
      void database.db
        .saveAnswer(id, current.id, current.selectedOptionId, current.confidence, elapsed, index)
        .then(() => database.db.pauseSession(id))
        .then(() => cache.invalidateQueries({ queryKey: ["session", id] }))
        .catch(() => undefined);
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushAndPause();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", flushAndPause);
    window.addEventListener("beforeunload", flushAndPause);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", flushAndPause);
      window.removeEventListener("beforeunload", flushAndPause);
    };
  }, [cache, current, database.db, id, index, session.data?.state]);

  function toggleFlag(qIdx: number) {
    setFlaggedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(qIdx)) next.delete(qIdx);
      else next.add(qIdx);
      return next;
    });
  }

  async function begin() {
    if (!id) return;
    await database.db.startOrResumeSession(id);
    openedAt.current = performance.now();
    await session.refetch();
  }

  async function pause() {
    if (!id) return;
    await save(current?.selectedOptionId ?? null, current?.confidence ?? null, index);
    await database.db.pauseSession(id);
    await session.refetch();
  }

  async function finish() {
    if (!id) return;
    await save(current?.selectedOptionId ?? null, current?.confidence ?? null, index);
    await database.db.finishSession(id);
    await session.refetch();
    await cache.invalidateQueries({ queryKey: ["sessions"] });
    await cache.invalidateQueries({ queryKey: ["dashboard"] });
  }

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  };

  if (!id || session.isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="w-12 h-12 rounded-2xl bg-[var(--brand-orange)]/15 flex items-center justify-center text-[var(--brand-orange)] font-bold">
          <Hourglass size={24} className="animate-pulse" />
        </div>
        <p className="text-xs font-bold text-[var(--muted)]">در حال آماده‌سازی آزمون…</p>
      </div>
    );
  }

  if (!session.data) {
    return (
      <div className="max-w-md mx-auto py-12 px-4 text-center space-y-4">
        <AlertCircle size={40} className="mx-auto text-amber-500" />
        <h2 className="text-lg font-black">آزمون یافت نشد</h2>
        <Link href="/sessions/" className="btn-primary-orange inline-flex">
          بازگشت به فهرست آزمون‌ها
        </Link>
      </div>
    );
  }

  const sData = session.data;

  // =========================================================================
  // VIEW 1: CREATED / READY TO START (Wireframe 09 Phone 1)
  // =========================================================================
  if (sData.state === "CREATED") {
    return (
      <div className="max-w-2xl mx-auto py-8 px-4 space-y-6 text-center">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/sessions/"
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            <ChevronRight size={20} />
          </Link>
          <span className="text-xs font-black text-[var(--muted)]">پیش‌نمایش آزمون</span>
          <div className="w-10" />
        </div>

        {/* Hero Vector Illustration: Exam Sheet + Stopwatch (Matching Wireframe 09 Phone 1) */}
        <div className="w-28 h-28 mx-auto relative flex items-center justify-center">
          <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
            {/* Radiating sunburst rays */}
            <circle cx="50" cy="50" r="44" fill="#FFE173" opacity="0.4" />
            {/* Paper sheet */}
            <rect x="22" y="16" width="46" height="60" rx="8" fill="#FFFFFF" stroke="#0F172A" strokeWidth="2.5" />
            {/* Checklist items */}
            <line x1="30" y1="28" x2="42" y2="28" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 48 26 L 52 30 L 60 22" fill="none" stroke="#6CCB7F" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="40" x2="42" y2="40" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 48 38 L 52 42 L 60 34" fill="none" stroke="#6CCB7F" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="30" y1="52" x2="42" y2="52" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <path d="M 48 50 L 52 54 L 60 46" fill="none" stroke="#6CCB7F" strokeWidth="2.5" strokeLinecap="round" />
            {/* Stopwatch on bottom right */}
            <circle cx="68" cy="68" r="18" fill="#BAC4FE" stroke="#0F172A" strokeWidth="2.5" />
            <line x1="68" y1="50" x2="68" y2="46" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="68" y1="68" x2="68" y2="58" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
            <line x1="68" y1="68" x2="76" y2="68" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
          </svg>
        </div>

        <div>
          <h1 className="text-2xl font-black text-[var(--ink)]">آماده‌ای شروع کنیم؟</h1>
          <p className="text-xs text-[var(--muted)] font-bold mt-1.5 leading-relaxed">
            همه‌چیز آماده‌ست! همه تمرکزت رو پاسخ بده و بهترین خودت باش.
          </p>
        </div>

        {/* Test Parameters Card (Matching Wireframe 09 Phone 1) */}
        <div className="card-neo p-5 space-y-3.5 text-right bg-[var(--surface)]">
          <div className="flex items-center justify-between text-xs pb-2.5 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <Laptop size={18} />
              </div>
              <span className="text-[var(--muted)] font-bold">عنوان آزمون</span>
            </div>
            <strong className="font-black text-[var(--ink)]">
              {sData.config?.subjectFilter ? `آزمون ${sData.config.subjectFilter}` : "جامع شبیه‌ساز آزمون"}
            </strong>
          </div>

          <div className="flex items-center justify-between text-xs pb-2.5 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-green)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <ClipboardList size={18} />
              </div>
              <span className="text-[var(--muted)] font-bold">تعداد سؤال</span>
            </div>
            <strong className="font-black text-[var(--brand-orange)]">{totalQuestions} سؤال</strong>
          </div>

          <div className="flex items-center justify-between text-xs pb-2.5 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <Timer size={18} />
              </div>
              <span className="text-[var(--muted)] font-bold">مدت زمان</span>
            </div>
            <strong className="font-black text-[var(--ink)]">{Math.max(10, Math.round(totalQuestions * 1.5))} دقیقه</strong>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-orange-soft)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)]">
                <BookOpen size={18} />
              </div>
              <span className="text-[var(--muted)] font-bold">موضوعات</span>
            </div>
            <strong className="font-black text-[var(--ink)] max-w-[180px] truncate">
              {sData.config?.subjectFilter || "تمام دروس تخصصی"}
            </strong>
          </div>
        </div>

        <button
          type="button"
          onClick={begin}
          className="btn-neo-orange w-full py-4 text-base font-black flex items-center justify-center gap-2"
        >
          <Play size={20} className="fill-current" />
          <span>شروع آزمون</span>
        </button>
      </div>
    );
  }

  // =========================================================================
  // VIEW 2: FINISHED (RESULT & SESSION ANALYSIS - WIREFRAMES 11 & 12)
  // =========================================================================
  if (sData.state === "FINISHED") {
    const attempts = sData.questions.map((q) => {
      const isAnswered = Boolean(q.selectedOptionId);
      const isCorrect = q.selectedOptionId === q.snapshot.correctOptionId;
      return {
        result: (!isAnswered ? "unanswered" : isCorrect ? "correct" : "wrong") as "correct" | "wrong" | "unanswered",
        visited: q.visited,
      };
    });
    const score = calculateScore(attempts, sData.config?.scorePolicy ?? { penaltyNumerator: 1, penaltyDenominator: 3 });
    const percentage = score.percentage ?? 0;

    const penaltyNum = sData.config?.scorePolicy?.penaltyNumerator ?? 1;
    const penaltyDen = sData.config?.scorePolicy?.penaltyDenominator ?? 3;

    // Subject breakdown calculation
    const subjectStats: Record<
      string,
      {
        total: number;
        correct: number;
        wrong: number;
        unanswered: number;
        rawPct: number;
        penalizedPct: number;
      }
    > = {};

    for (const q of sData.questions) {
      const subj = q.snapshot.subject || "عمومی";
      if (!subjectStats[subj]) {
        subjectStats[subj] = { total: 0, correct: 0, wrong: 0, unanswered: 0, rawPct: 0, penalizedPct: 0 };
      }
      subjectStats[subj].total += 1;
      if (!q.selectedOptionId) {
        subjectStats[subj].unanswered += 1;
      } else if (q.selectedOptionId === q.snapshot.correctOptionId) {
        subjectStats[subj].correct += 1;
      } else {
        subjectStats[subj].wrong += 1;
      }
    }

    for (const subj of Object.keys(subjectStats)) {
      const s = subjectStats[subj];
      if (s.total > 0) {
        s.rawPct = Math.round((s.correct / s.total) * 100);
        const net = penaltyNum > 0 ? s.correct - (s.wrong * penaltyNum) / penaltyDen : s.correct;
        s.penalizedPct = Math.round((net / s.total) * 100 * 10) / 10;
      }
    }

    // Confidence breakdown calculation: 4 cognitive states
    const sureAttempts = sData.questions.filter((q) => q.selectedOptionId && (q.confidence === "sure" || !q.confidence));
    const doubtfulAttempts = sData.questions.filter((q) => q.selectedOptionId && q.confidence === "doubtful");
    const guessAttempts = sData.questions.filter((q) => q.selectedOptionId && q.confidence === "guess");
    const skippedAttempts = sData.questions.filter((q) => !q.selectedOptionId && q.visited);
    const unvisitedAttempts = sData.questions.filter((q) => !q.visited);

    const sureCorrect = sureAttempts.filter((q) => q.selectedOptionId === q.snapshot.correctOptionId).length;
    const doubtfulCorrect = doubtfulAttempts.filter((q) => q.selectedOptionId === q.snapshot.correctOptionId).length;
    const guessCorrect = guessAttempts.filter((q) => q.selectedOptionId === q.snapshot.correctOptionId).length;

    const sureAccuracy = sureAttempts.length ? Math.round((sureCorrect / sureAttempts.length) * 100) : 0;
    const doubtfulAccuracy = doubtfulAttempts.length ? Math.round((doubtfulCorrect / doubtfulAttempts.length) * 100) : 0;
    const guessAccuracy = guessAttempts.length ? Math.round((guessCorrect / guessAttempts.length) * 100) : 0;

    const sessionAttemptsForSim = sData.questions.map((q) => ({
      subject: q.snapshot.subject,
      result: !q.selectedOptionId
        ? ("unanswered" as const)
        : q.selectedOptionId === q.snapshot.correctOptionId
        ? ("correct" as const)
        : ("wrong" as const),
      confidence: q.confidence,
    }));

    const sessionSim = simulateOverallConfidence(
      sessionAttemptsForSim,
      Object.keys(subjectStats).map((subj) => ({
        name: subj,
        coefficient: 1,
        questionCount: subjectStats[subj].total,
      }))
    );

    // Filter questions based on selected tab in review
    const filteredQuestions = sData.questions.filter((q) => {
      const isAnswered = Boolean(q.selectedOptionId);
      const isCorrect = q.selectedOptionId === q.snapshot.correctOptionId;
      if (resultFilter === "correct") return isAnswered && isCorrect;
      if (resultFilter === "wrong") return isAnswered && !isCorrect;
      if (resultFilter === "unanswered") return !isAnswered;
      return true;
    });

    return (
      <div className="result-page max-w-4xl mx-auto space-y-6 pb-12">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/sessions/"
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            <ChevronRight size={20} />
          </Link>
          <h1 className="text-base sm:text-lg font-black text-[var(--ink)]">نتیجه آزمون</h1>
          <div className="w-10" />
        </div>

        {/* 1. Trophy Celebration Card (Matching Wireframe 11 Phone 1) */}
        <div className="card-neo p-6 text-center bg-[var(--surface-cream)] space-y-4">
          {/* Trophy Graphic */}
          <div className="w-20 h-20 mx-auto relative flex items-center justify-center">
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-md">
              <circle cx="50" cy="50" r="44" fill="#FFE173" opacity="0.4" />
              {/* Trophy Cup */}
              <path d="M 28 26 L 72 26 L 66 58 Q 50 72 34 58 Z" fill="#FFE173" stroke="#0F172A" strokeWidth="2.5" />
              {/* Cup Handles */}
              <path d="M 28 32 Q 16 32 18 44 Q 20 54 32 52" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
              <path d="M 72 32 Q 84 32 82 44 Q 80 54 68 52" fill="none" stroke="#0F172A" strokeWidth="2.5" strokeLinecap="round" />
              {/* Base */}
              <rect x="42" y="66" width="16" height="12" fill="#0F172A" />
              <rect x="30" y="78" width="40" height="8" rx="3" fill="#FFE173" stroke="#0F172A" strokeWidth="2.5" />
              {/* Star on Cup */}
              <polygon points="50,36 53,44 61,44 54,49 57,57 50,52 43,57 46,49 39,44 47,44" fill="var(--brand-orange)" stroke="var(--line-strong)" strokeWidth="1" />
            </svg>
          </div>

          <div>
            <h2 className="text-2xl font-black text-[var(--ink)]">آزمون شما به پایان رسید!</h2>
            <p className="text-xs text-[var(--muted)] font-bold mt-1">
              کار بزرگی انجام دادی! حالا وقت دیدن نتیجه و تحلیل عملکرد است.
            </p>
          </div>

          {/* Donut Percentage Badge */}
          <div className="inline-flex flex-col items-center justify-center p-4 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)]">
            <span className="text-[11px] font-black text-[var(--muted)]">درصد کل کسب‌شده</span>
            <div className="text-4xl font-black text-[var(--brand-orange)] my-1">
              <SignedPercent value={percentage} showPlus={false} />
            </div>
          </div>

          {/* 3 Stats in Row (صحیح, غلط, نزده - Strictly NO PINK!) */}
          <div className="grid grid-cols-3 gap-2.5 pt-2">
            <div className="p-3 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              <span className="block text-[11px] font-black text-[var(--ink)]">پاسخ صحیح</span>
              <strong className="text-xl font-black text-[var(--ink)]">{score.correct}</strong>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              <span className="block text-[11px] font-black text-[var(--pastel-red)]">پاسخ غلط</span>
              <strong className="text-xl font-black text-[var(--pastel-red)]">{score.wrong}</strong>
            </div>
            <div className="p-3 rounded-2xl bg-[var(--pastel-blue-soft)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
              <span className="block text-[11px] font-black text-[var(--ink)]">بدون پاسخ</span>
              <strong className="text-xl font-black text-[var(--ink)]">{score.unanswered}</strong>
            </div>
          </div>
        </div>

        {/* 2. Three Tabs (عملکرد در درس‌ها, مرور پاسخ‌نامه, تحلیل اطمینان) */}
        <div className="flex items-center gap-2 p-1.5 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
          <button
            type="button"
            onClick={() => setFinishedTab("breakdown")}
            className={cn(
              "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2",
              finishedTab === "breakdown"
                ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            عملکرد درس‌ها
          </button>
          <button
            type="button"
            onClick={() => setFinishedTab("questions")}
            className={cn(
              "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2",
              finishedTab === "questions"
                ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            مرور پاسخ‌ها
          </button>
          <button
            type="button"
            onClick={() => setFinishedTab("confidence")}
            className={cn(
              "flex-1 py-2 text-xs font-black rounded-xl transition-all border-2",
              finishedTab === "confidence"
                ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
            )}
          >
            تحلیل اطمینان
          </button>
        </div>

        {/* TAB 1: عملکرد در درس‌ها (Wireframe 11 Phone 2) */}
        {finishedTab === "breakdown" && (
          <div className="card-neo p-5 space-y-4 bg-[var(--surface)]">
            <div>
              <h3 className="text-sm sm:text-base font-black text-[var(--ink)]">عملکرد تفکیکی درس‌ها</h3>
              <p className="text-[11px] text-[var(--muted)] font-bold mt-0.5">
                محاسبهٔ درصدهای دقیق هر درس با احتساب نمره منفی
              </p>
            </div>

            <div className="space-y-3.5">
              {Object.entries(subjectStats).map(([subj, data]) => {
                const correctPct = data.total > 0 ? Math.round((data.correct / data.total) * 100) : 0;
                const wrongPct = data.total > 0 ? Math.round((data.wrong / data.total) * 100) : 0;
                const unansweredPct = data.total > 0 ? Math.round((data.unanswered / data.total) * 100) : 0;

                return (
                  <div
                    key={subj}
                    className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-3 shadow-[2px_2px_0px_var(--neo-shadow)]"
                  >
                    {/* Header: Subject Name & Percentages */}
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <strong className="font-black text-sm text-[var(--ink)]">{subj}</strong>
                      <div className="flex items-center gap-2">
                        <span
                          className="px-2.5 py-0.5 rounded-xl text-xs font-black bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                          title={`درصد با نمره منفی: ${formatSignedPercentString(data.penalizedPct, false)} (درصد خام: ${data.rawPct}٪)`}
                        >
                          <SignedPercent value={data.penalizedPct} showPlus={false} />
                          <span className="text-[9px] mr-1 font-normal opacity-80">با نمره منفی</span>
                        </span>
                      </div>
                    </div>

                    {/* 3 Metric Badges: Correct, Wrong, Unanswered */}
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div className="py-1 px-1.5 rounded-xl bg-[var(--pastel-green-soft)] border border-emerald-400 text-[var(--ink)]">
                        <span className="block text-[10px] font-bold">صحیح</span>
                        <strong className="text-xs sm:text-sm font-black">{data.correct}</strong>
                        <span className="text-[9px] block text-emerald-700 dark:text-emerald-300 font-bold">
                          {correctPct}٪
                        </span>
                      </div>
                      <div className="py-1 px-1.5 rounded-xl bg-[var(--pastel-red-soft)] border border-rose-400 text-[var(--pastel-red)]">
                        <span className="block text-[10px] font-bold">غلط</span>
                        <strong className="text-xs sm:text-sm font-black">{data.wrong}</strong>
                        <span className="text-[9px] block text-rose-700 dark:text-rose-300 font-bold">
                          {wrongPct}٪
                        </span>
                      </div>
                      <div className="py-1 px-1.5 rounded-xl bg-[var(--surface-3)] border border-[var(--line)] text-[var(--ink)]">
                        <span className="block text-[10px] font-bold">نزده</span>
                        <strong className="text-xs sm:text-sm font-black">{data.unanswered}</strong>
                        <span className="text-[9px] block text-[var(--muted)] font-bold">
                          {unansweredPct}٪
                        </span>
                      </div>
                    </div>

                    {/* Segmented Progress Bar: Green (Correct) + Red (Wrong) + Muted (Unanswered) */}
                    <div className="space-y-1 pt-0.5">
                      <div className="w-full h-3 bg-[var(--surface-3)] rounded-full border border-[var(--line-strong)] overflow-hidden flex shadow-inner">
                        {data.correct > 0 && (
                          <div
                            className="h-full bg-emerald-500 transition-all duration-500"
                            style={{ width: `${correctPct}%` }}
                            title={`صحیح: ${data.correct} (${correctPct}٪)`}
                          />
                        )}
                        {data.wrong > 0 && (
                          <div
                            className="h-full bg-rose-500 transition-all duration-500"
                            style={{ width: `${wrongPct}%` }}
                            title={`غلط: ${data.wrong} (${wrongPct}٪)`}
                          />
                        )}
                        {data.unanswered > 0 && (
                          <div
                            className="h-full bg-slate-300 dark:bg-slate-600 transition-all duration-500"
                            style={{ width: `${unansweredPct}%` }}
                            title={`بی‌پاسخ: ${data.unanswered} (${unansweredPct}٪)`}
                          />
                        )}
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-[var(--muted)] font-bold px-0.5">
                        <span>کل سؤالات: {data.total}</span>
                        <span>درصد خام: {data.rawPct}٪</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: مرور پاسخ‌نامه (Wireframe 11 Phone 3 & 4) */}
        {finishedTab === "questions" && (
          <div className="space-y-4">
            {/* Filter Chips: همه, صحیح, غلط, نزده */}
            <div className="grid grid-cols-4 gap-1.5 p-1 bg-[var(--surface)] rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)]">
              <button
                type="button"
                onClick={() => setResultFilter("all")}
                className={cn(
                  "py-2 rounded-xl transition-all",
                  resultFilter === "all"
                    ? "bg-[var(--ink)] text-[var(--surface)]"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
              >
                همه ({totalQuestions})
              </button>
              <button
                type="button"
                onClick={() => setResultFilter("correct")}
                className={cn(
                  "py-2 rounded-xl transition-all",
                  resultFilter === "correct"
                    ? "bg-[var(--brand-green)] text-[var(--ink-on-color)]"
                    : "text-emerald-700 hover:bg-emerald-50"
                )}
              >
                صحیح ({score.correct})
              </button>
              <button
                type="button"
                onClick={() => setResultFilter("wrong")}
                className={cn(
                  "py-2 rounded-xl transition-all",
                  resultFilter === "wrong"
                    ? "bg-[var(--pastel-red)] text-white"
                    : "text-[var(--pastel-red)] hover:bg-red-50"
                )}
              >
                غلط ({score.wrong})
              </button>
              <button
                type="button"
                onClick={() => setResultFilter("unanswered")}
                className={cn(
                  "py-2 rounded-xl transition-all",
                  resultFilter === "unanswered"
                    ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)]"
                    : "text-[var(--muted)] hover:bg-slate-100"
                )}
              >
                نزده ({score.unanswered})
              </button>
            </div>

            {/* Questions List */}
            <div className="space-y-2.5">
              {filteredQuestions.map((q) => {
                const isAnswered = Boolean(q.selectedOptionId);
                const isCorrect = q.selectedOptionId === q.snapshot.correctOptionId;
                const originalIndex = sData.questions.findIndex((item) => item.id === q.id) + 1;

                return (
                  <div key={q.id} className="card-neo p-4 bg-[var(--surface)] space-y-3">
                    <button
                      type="button"
                      onClick={() => setExpandedResultId(expandedResultId === q.id ? null : q.id)}
                      className="flex items-center justify-between gap-3 w-full text-right"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "w-9 h-9 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center font-black text-xs",
                            !isAnswered
                              ? "bg-[var(--surface-2)] text-[var(--muted)]"
                              : isCorrect
                              ? "bg-[var(--brand-green)] text-[var(--ink-on-color)]"
                              : "bg-[var(--pastel-red)] text-white"
                          )}
                        >
                          {!isAnswered ? (
                            "—"
                          ) : isCorrect ? (
                            <Check size={16} className="stroke-[3]" />
                          ) : (
                            <X size={16} className="stroke-[3]" />
                          )}
                        </div>
                        <div>
                          <strong className="block text-xs font-black text-[var(--ink)]">
                            سؤال {originalIndex}
                          </strong>
                          <span className="text-[10px] text-[var(--muted)] font-bold">
                            {q.snapshot.subject} {q.snapshot.chapter ? `• ${q.snapshot.chapter}` : ""}
                          </span>
                        </div>
                      </div>

                      {(() => {
                        if (!isAnswered) {
                          if (!q.visited) {
                            return (
                              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-slate-300 bg-slate-100 dark:bg-slate-900/40 text-slate-500">
                                دیده‌نشده —
                              </span>
                            );
                          }
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-slate-400 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              رد شده (نزده) ⏭️
                            </span>
                          );
                        }
                        if (isCorrect) {
                          if (q.confidence === "doubtful") {
                            return (
                              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-amber-400 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200">
                                صحیح با شک ⭕
                              </span>
                            );
                          }
                          if (q.confidence === "guess") {
                            return (
                              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-purple-400 bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200">
                                شانس تصادفی (حدس) ⚡
                              </span>
                            );
                          }
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200">
                              تسلط مطمئن ✓
                            </span>
                          );
                        }
                        // Wrong answers:
                        if (q.confidence === "doubtful") {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-amber-400 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200">
                              خطای تردید (شک) ⭕
                            </span>
                          );
                        }
                        if (q.confidence === "guess") {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-rose-400 bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200">
                              ریسک غلط (حدس منفی) ⚡
                            </span>
                          );
                        }
                        return (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-rose-500 bg-rose-200 dark:bg-rose-950 text-rose-950 dark:text-rose-100 shadow-[1px_1px_0px_#e11d48]">
                            تله علمی (غلط مطمئن) ⚠️
                          </span>
                        );
                      })()}
                    </button>

                    {expandedResultId === q.id && (
                      <div className="pt-3 border-t border-[var(--line)] space-y-3 text-right">
                        <div className="text-xs font-bold leading-relaxed text-[var(--ink)]">
                          <ContentRenderer blocks={q.snapshot.content} />
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {q.snapshot.options.map((option, optionIndex) => {
                            const isOptionCorrect = option.id === q.snapshot.correctOptionId;
                            const isOptionSelected = option.id === q.selectedOptionId;
                            return (
                              <div
                                key={option.id}
                                className={cn(
                                  "p-2.5 rounded-xl border-2 text-xs font-bold flex items-center gap-2",
                                  isOptionCorrect
                                    ? "bg-[var(--pastel-green-soft)] border-[var(--line-strong)] text-[var(--ink)]"
                                    : isOptionSelected && !isOptionCorrect
                                    ? "bg-[var(--pastel-red-soft)] border-[var(--line-strong)] text-[var(--pastel-red)]"
                                    : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)]"
                                )}
                              >
                                <span className="w-5 h-5 rounded-md bg-[var(--surface)] border border-[var(--line-strong)] flex items-center justify-center font-black text-[10px]">
                                  {PERSIAN_LETTERS[optionIndex]}
                                </span>
                                <div className="flex-1">
                                  <ContentRenderer blocks={option.content} />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        {q.snapshot.explanation.length > 0 && (
                          <div className="p-3 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-xs font-bold text-[var(--ink)] space-y-1">
                            <strong className="block font-black text-[var(--brand-orange)]">پاسخ تشریحی:</strong>
                            <ContentRenderer blocks={q.snapshot.explanation} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 3: تحلیل اطمینان (Wireframe 12 Phone 4) */}
        {finishedTab === "confidence" && (
          <div className="card-neo p-5 space-y-4 bg-[var(--surface)]">
            <h3 className="text-sm font-black text-[var(--ink)]">تحلیل میزان اطمینان و شبیه‌ساز اثر شک و حدس</h3>
            <div className="space-y-2.5">
              <div className="p-3.5 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-[var(--line-strong)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-green)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center font-black">
                    <Check size={20} className="stroke-[3]" />
                  </div>
                  <div>
                    <strong className="block text-xs font-black text-[var(--ink)]">مطمئن بودم</strong>
                    <span className="text-[10px] text-[var(--muted)] font-bold">{sureAttempts.length} سؤال</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-[var(--ink)]">{sureAccuracy}٪ دقت</span>
                  <span className="block text-[10px] text-[var(--muted)] font-bold">{sureCorrect} صحیح</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--brand-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink-on-color)] flex items-center justify-center font-black">
                    <AlertCircle size={20} />
                  </div>
                  <div>
                    <strong className="block text-xs font-black text-[var(--ink)]">شک داشتم</strong>
                    <span className="text-[10px] text-[var(--muted)] font-bold">{doubtfulAttempts.length} سؤال</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-[var(--ink)]">{doubtfulAccuracy}٪ دقت</span>
                  <span className="block text-[10px] text-[var(--muted)] font-bold">{doubtfulCorrect} صحیح</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-[var(--line-strong)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-500 border-2 border-[var(--line-strong)] text-white flex items-center justify-center font-black">
                    <HelpCircle size={20} />
                  </div>
                  <div>
                    <strong className="block text-xs font-black text-rose-700 dark:text-rose-400">حدس زدم</strong>
                    <span className="text-[10px] text-[var(--muted)] font-bold">{guessAttempts.length} سؤال</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-base font-black text-rose-700 dark:text-rose-400">{guessAccuracy}٪ دقت</span>
                  <span className="block text-[10px] text-[var(--muted)] font-bold">{guessCorrect} صحیح</span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100 dark:bg-slate-900/60 border-2 border-[var(--line-strong)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-slate-200 dark:bg-slate-800 border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center font-black">
                    <span className="text-base">⏭️</span>
                  </div>
                  <div>
                    <strong className="block text-xs font-black text-[var(--ink)]">رد کردن / بلد نبودم</strong>
                    <span className="text-[10px] text-[var(--muted)] font-bold">{skippedAttempts.length} سؤال</span>
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-xs font-black text-emerald-700 dark:text-emerald-400">
                    <SignedNumber value={Math.round((skippedAttempts.length * (penaltyNum / penaltyDen)) * 10) / 10} showPlus={true} /> نمره ذخیره شد
                  </span>
                  <span className="block text-[10px] text-[var(--muted)] font-bold">اجتناب هوشمندانه از نمره منفی</span>
                </div>
              </div>
            </div>

            {/* Simulation Cards for this specific session */}
            <div className="space-y-2 pt-2 border-t border-[var(--line-strong)]/20">
              <strong className="text-xs font-black text-[var(--ink)] block">
                شبیه‌ساز رفتار تستی در این آزمون («اگه نمی‌زدم چی می‌شد؟»):
              </strong>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <span className="text-[10px] font-bold text-[var(--muted)] block">درصد کسب‌شده</span>
                  <strong className="text-base font-black font-mono text-[var(--ink)]">
                    <SignedPercent value={percentage} showPlus={false} />
                  </strong>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <span className="text-[10px] font-bold text-amber-600 block">بدون شک‌ها</span>
                  <strong className="text-base font-black font-mono text-[var(--ink)]">
                    <SignedPercent value={sessionSim.totals.overallWithoutDoubt} showPlus={false} />
                  </strong>
                  <span className={cn("text-[9px] font-black block font-mono", sessionSim.totals.totalDoubtfulNetGain >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                    <SignedPercent value={sessionSim.totals.totalDoubtfulNetGain} showPlus={true} /> اثر
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <span className="text-[10px] font-bold text-rose-600 block">بدون حدس‌ها</span>
                  <strong className="text-base font-black font-mono text-[var(--ink)]">
                    <SignedPercent value={sessionSim.totals.overallWithoutGuess} showPlus={false} />
                  </strong>
                  <span className={cn("text-[9px] font-black block font-mono", sessionSim.totals.totalGuessNetGain >= 0 ? "text-[var(--brand-green)]" : "text-red-500")}>
                    <SignedPercent value={sessionSim.totals.totalGuessNetGain} showPlus={true} /> اثر
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-1">
                  <span className="text-[10px] font-bold text-[var(--brand-green)] block">فقط مطمئن‌ها</span>
                  <strong className="text-base font-black font-mono text-[var(--ink)]">
                    <SignedPercent value={sessionSim.totals.overallOnlySure} showPlus={false} />
                  </strong>
                  <span className="text-[9px] font-bold text-[var(--muted)] block">{sureAccuracy}٪ دقت</span>
                </div>
              </div>
            </div>

            {/* Smart Insight Card */}
            <div className="p-3.5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--brand-orange)] border-2 border-[var(--line-strong)] flex items-center justify-center flex-shrink-0 text-white">
                <Lightbulb size={20} />
              </div>
              <p className="text-[11px] font-bold text-[var(--ink)] leading-relaxed">
                {doubtfulAttempts.length === 0 && guessAttempts.length === 0
                  ? "در تمام پاسخ‌ها با اطمینان کامل عمل کرده‌اید. تمرکز بسیار خوبی داشته‌اید!"
                  : sessionSim.totals.totalDoubtfulNetGain > 0
                  ? `پاسخ به سؤالات شک‌دار در این آزمون ${formatSignedPercentString(sessionSim.totals.totalDoubtfulNetGain, true)} به درصد شما اضافه کرده است. به شک‌های ۵۰-۵۰ خود اعتماد کنید.`
                  : sessionSim.totals.totalDoubtfulNetGain < 0
                  ? `پاسخ به سؤالات شک‌دار باعث نمره منفی و افت درصد شما (${formatSignedPercentString(sessionSim.totals.totalDoubtfulNetGain, false)}) شده است. تا اطمینان نیافته‌اید علامت نزنید.`
                  : "سؤالات شک‌دار و حدسی اثر متعادلی بر درصد شما داشته‌اند."}
              </p>
            </div>
          </div>
        )}

        {/* AI Analysis Export Card (TASK-026) */}
        <div className="card-neo p-4 sm:p-5 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-violet-100 dark:bg-violet-950/50 border-2 border-[var(--line-strong)] text-violet-700 dark:text-violet-300 flex items-center justify-center shrink-0">
              <Sparkles size={16} />
            </div>
            <div>
              <h4 className="text-xs sm:text-sm font-black text-[var(--ink)]">خروجی هوشمند برای تحلیل هوش مصنوعی</h4>
              <p className="text-[11px] text-[var(--muted)] font-bold">دانلود فایل استاندارد جلسه با حفظ حریم خصوصی و بدون شناسه شخصی</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => {
                try {
                  const exportData = buildSessionExport(sData, "mistakes");
                  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                    type: "application/json;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `testino-session-${sData.id.slice(0, 8)}-analysis-mistakes.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "خطا در استخراج خروجی جلسه");
                }
              }}
              className="py-2.5 px-3 rounded-2xl bg-[var(--pastel-yellow-soft)] border-2 border-[var(--line-strong)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>فقط سؤالات اشتباه و شک‌دار</span>
            </button>
            <button
              type="button"
              onClick={() => {
                try {
                  const exportData = buildSessionExport(sData, "full");
                  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
                    type: "application/json;charset=utf-8",
                  });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `testino-session-${sData.id.slice(0, 8)}-analysis-full.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                } catch (err) {
                  alert(err instanceof Error ? err.message : "خطا در استخراج خروجی جلسه");
                }
              }}
              className="py-2.5 px-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center gap-2 transition-all cursor-pointer"
            >
              <Download size={15} />
              <span>تمام سؤالات و گزینه‌ها</span>
            </button>
          </div>
        </div>

        {/* 3. Action Buttons */}
        <div className="space-y-2 pt-2">
          <Link
            href="/analytics/"
            className="btn-neo-orange w-full py-4 text-sm font-black flex items-center justify-center gap-2"
          >
            <BarChart3 size={18} />
            <span>مشاهده تحلیل کامل و روندها</span>
          </Link>
          <Link
            href="/"
            className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] block text-center"
          >
            بازگشت به خانه
          </Link>
        </div>
      </div>
    );
  }

  // =========================================================================
  // VIEW 3: RUNNING (ACTIVE SOLVING ENVIRONMENT - MATCHING SHEET 1 PHONE 3)
  // =========================================================================
  const isDoubtful = current?.confidence === "doubtful" || flaggedIndices.has(index);

  return (
    <div
      className={cn(
        "exam-player max-w-4xl mx-auto space-y-4 pb-10 transition-colors duration-200",
        isExamPaper && "exam-paper-theme"
      )}
      data-exam-paper={isExamPaper ? "true" : undefined}
    >
      {/* Top Slim Progress Bar (Neo Style) */}
      <div className="w-full bg-[var(--surface-3)] h-3 rounded-full overflow-hidden border-2 border-[var(--line-strong)]">
        <div
          className="bg-[var(--brand-orange)] h-full transition-all duration-300 ease-out"
          style={{
            width: isOpenEnded
              ? `${Math.min(100, Math.max(10, ((index + 1) / Math.max(totalQuestions, index + 1)) * 100))}%`
              : `${((index + 1) / totalQuestions) * 100}%`,
          }}
        />
      </div>

      {/* Top Nav Bar (Timer, Pause, Counter, Exam Paper Toggle, Tools, Nav Grid) */}
      <div className="flex items-center justify-between gap-2 px-1">
        {/* Pause & Timer */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={sData.state === "RUNNING" ? pause : begin}
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            title={sData.state === "RUNNING" ? "توقف موقت" : "ادامه"}
          >
            {sData.state === "RUNNING" ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <div className="flex items-center gap-1.5 text-xs font-black text-[var(--ink)] bg-[var(--surface)] px-3 py-2 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            <Clock size={14} className="text-[var(--brand-orange)]" />
            <span>{formatTimer(persistedSeconds + elapsedSeconds)}</span>
          </div>
        </div>

        {/* Counter & Action Drawers */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-[var(--ink-on-color)] bg-[var(--pastel-yellow)] px-3 py-2 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            {isOpenEnded ? `سؤال ${index + 1} (پیوسته)` : `${index + 1} از ${totalQuestions}`}
          </span>
          {/* Exam Paper Mode Toggle */}
          <button
            type="button"
            onClick={() => setIsExamPaper((prev) => !prev)}
            className={cn(
              "px-2.5 py-2 rounded-2xl border-2 border-[var(--line-strong)] text-xs font-black flex items-center gap-1.5 shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all",
              isExamPaper
                ? "bg-amber-200 text-stone-950 border-stone-800"
                : "bg-[var(--surface)] text-[var(--ink)]"
            )}
            title="حالت دفترچه کاغذی کنکور (کاهش خستگی چشم و حواس‌پرتی)"
          >
            <FileText size={15} />
            <span className="hidden sm:inline">دفترچه</span>
          </button>
          {current && <QuestionTrustActions question={current.snapshot} compact />}
          {pending && (
            <span className="text-[10px] font-black text-[var(--muted)] animate-pulse hidden sm:inline">
              در حال ذخیره…
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              setShowNavSheet(!showNavSheet);
            }}
            className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            title="ناوبری سؤالات"
          >
            <List size={18} />
          </button>
        </div>
      </div>

      {/* Paused / Inactivity Notice */}
      {(sData.state === "PAUSED" || gapNotice) && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/50 border-2 border-amber-400 text-amber-900 dark:text-amber-200 text-xs font-bold flex flex-col sm:flex-row items-center justify-between gap-3.5 shadow-[2px_2px_0px_var(--neo-shadow)]">
          <div className="flex items-center gap-2.5 text-center sm:text-right justify-center sm:justify-start">
            <AlertCircle size={18} className="text-amber-600 flex-shrink-0" />
            <span>
              {gapNotice
                ? "وقفه یا جابه‌جایی طولانی شناسایی شد؛ آزمون برای عدم محاسبه زمان غیرفعال، متوقف شد."
                : "آزمون در وضعیت توقف موقت قرار دارد. زمان‌سنج متوقف شده است."}
            </span>
          </div>
          <div className="w-full sm:w-auto flex items-center justify-center">
            <button
              type="button"
              onClick={() => {
                setGapNotice(false);
                void begin();
              }}
              className="btn-neo-orange px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all shrink-0 w-full sm:w-auto flex items-center justify-center gap-2 cursor-pointer text-center"
            >
              <Play size={15} className="fill-current" />
              <span>ادامه آزمون</span>
            </button>
          </div>
        </div>
      )}

      {current && <div className="flex justify-end"><QuestionTrustActions question={current.snapshot} compact /></div>}

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-rose-50 dark:bg-rose-950/50 border-2 border-rose-400 text-rose-800 dark:text-rose-200 text-xs font-bold flex items-center justify-between gap-3 shadow-[2px_2px_0px_var(--neo-shadow)]">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => save(current?.selectedOptionId ?? null, current?.confidence ?? null, index)}
            className="px-3 py-1.5 rounded-xl bg-rose-600 text-white font-black text-xs hover:bg-rose-700 transition-colors shrink-0"
          >
            تلاش مجدد
          </button>
        </div>
      )}

      {/* Tools Drawer (Wireframe 09 Phone 5) */}
      {showToolsSheet && (
        <div className="card-neo p-5 space-y-4 bg-[var(--surface-cream)]">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
            <div className="flex items-center gap-2">
              <Wrench size={16} className="text-[var(--brand-orange)]" />
              <strong className="text-xs font-black text-[var(--ink)]">ابزارهای آزمون</strong>
            </div>
            <button
              onClick={() => setShowToolsSheet(false)}
              className="text-xs font-black text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1"
            >
              <span>بستن</span>
              <X size={14} />
            </button>
          </div>

          {/* Text Zoom */}
          <div className="flex items-center justify-between text-xs font-black">
            <span className="text-[var(--muted)]">اندازه متن سؤال:</span>
            <div className="flex items-center gap-1.5">
              {(["normal", "large", "xlarge"] as const).map((sz) => {
                const labels = { normal: "۱۰۰٪", large: "۱۱۵٪", xlarge: "۱۳۰٪" };
                const isSelected = fontSize === sz;
                return (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => setFontSize(sz)}
                    className={cn(
                      "px-2.5 py-1 rounded-xl text-[11px] font-black border-2 transition-all",
                      isSelected
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]"
                    )}
                  >
                    {labels[sz]}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Quick Note / Scratchpad */}
          <div className="space-y-1.5">
            <label className="text-xs font-black text-[var(--muted)] block">یادداشت سریع (چرک‌نویس):</label>
            <textarea
              value={quickNote}
              onChange={(e) => setQuickNote(e.target.value)}
              placeholder="محاسبات سریع یا نکته را اینجا بنویسید..."
              rows={2}
              className="w-full p-2.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-xs font-bold text-[var(--ink)] focus:outline-none shadow-[2px_2px_0px_var(--neo-shadow)]"
            />
          </div>

          {/* Finish Button in Tools */}
          <button
            type="button"
            onClick={() => {
              setShowToolsSheet(false);
              setShowFinishConfirm(true);
            }}
            className="w-full py-2.5 rounded-xl bg-[var(--pastel-red)] text-white border-2 border-[var(--line-strong)] font-black text-xs shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
          >
            پایان و تحویل آزمون
          </button>
        </div>
      )}

      {/* Navigation Grid Sheet (Wireframe 10 / Screen 10) */}
      {showNavSheet && (() => {
        const sureCount = sData.questions.filter(
          (q) => q.selectedOptionId && (q.confidence === "sure" || !q.confidence)
        ).length;
        const doubtfulCount = sData.questions.filter(
          (q) => q.selectedOptionId && q.confidence === "doubtful"
        ).length;
        const guessCount = sData.questions.filter(
          (q) => q.selectedOptionId && q.confidence === "guess"
        ).length;
        const skippedCount = sData.questions.filter(
          (q) => !q.selectedOptionId && q.visited
        ).length;
        const unvisitedCount = sData.questions.filter((q) => !q.visited).length;

        return (
          <div className="card-neo p-5 space-y-4 bg-[var(--surface)]">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--line)]">
              <strong className="text-xs sm:text-sm font-black text-[var(--ink)]">
                ناوبری سؤالات آزمون (وضعیت پاسخ‌برگ)
              </strong>
              <button
                onClick={() => setShowNavSheet(false)}
                className="text-xs font-black text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1"
              >
                <span>بستن</span>
                <X size={14} />
              </button>
            </div>

            {/* Header Summary Badges: 4 Cognitive States + Unvisited */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center text-[10px] font-black">
              <div className="p-2 rounded-xl bg-[var(--surface-2)] border border-[var(--line)]">
                <span className="text-[var(--muted)] block">لودشده</span>
                <span className="text-xs text-[var(--ink)] font-black">{totalQuestions}</span>
              </div>
              <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 text-emerald-700 dark:text-emerald-300">
                <span className="block">مطمئن (✓)</span>
                <span className="text-xs font-black">{sureCount}</span>
              </div>
              <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 text-amber-700 dark:text-amber-300">
                <span className="block">با شک (⭕)</span>
                <span className="text-xs font-black">{doubtfulCount}</span>
              </div>
              <div className="p-2 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-300 text-purple-700 dark:text-purple-300">
                <span className="block">حدس زده (⚡)</span>
                <span className="text-xs font-black">{guessCount}</span>
              </div>
              <div className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-300 text-rose-700 dark:text-rose-300">
                <span className="block">رد شده (⏭️)</span>
                <span className="text-xs font-black">{skippedCount}</span>
              </div>
              <div className="p-2 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)]">
                <span className="block">دیده‌نشده</span>
                <span className="text-xs font-black">{unvisitedCount}</span>
              </div>
            </div>

            {/* Filter Chips: 4 Cognitive States + Unvisited */}
            <div className="flex items-center gap-1.5 p-1 bg-[var(--surface-cream)] rounded-2xl border-2 border-[var(--line-strong)] text-[11px] font-black overflow-x-auto">
              {[
                { id: "all", label: `همه (${totalQuestions})` },
                { id: "sure", label: `مطمئن ✓ (${sureCount})` },
                { id: "doubtful", label: `با شک ⭕ (${doubtfulCount})` },
                { id: "guess", label: `حدس زده ⚡ (${guessCount})` },
                { id: "skipped", label: `رد شده ⏭️ (${skippedCount})` },
                { id: "unvisited", label: `دیده‌نشده (${unvisitedCount})` },
              ].map((flt) => {
                const isSelected = navFilter === flt.id;
                return (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => setNavFilter(flt.id as "all" | "sure" | "doubtful" | "guess" | "skipped" | "unvisited")}
                    className={cn(
                      "px-2.5 py-1.5 rounded-xl transition-all border-2 shrink-0 whitespace-nowrap",
                      isSelected
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-transparent text-[var(--muted)] hover:text-[var(--ink)]"
                    )}
                  >
                    {flt.label}
                  </button>
                );
              })}
            </div>

            {/* Number Grid with Indicator Badges */}
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-64 overflow-y-auto pr-0.5">
              {sData.questions.map((q, qIdx) => {
                const answered = Boolean(q.selectedOptionId);
                const isDoubtful = answered && q.confidence === "doubtful";
                const isGuess = answered && q.confidence === "guess";
                const isSure = answered && !isDoubtful && !isGuess;
                const isSkipped = !answered && q.visited;
                const isUnvisited = !q.visited;
                const isCurrent = qIdx === index;

                if (navFilter === "sure" && !isSure) return null;
                if (navFilter === "doubtful" && !isDoubtful) return null;
                if (navFilter === "guess" && !isGuess) return null;
                if (navFilter === "skipped" && !isSkipped) return null;
                if (navFilter === "unvisited" && !isUnvisited) return null;

                return (
                  <button
                    key={q.id}
                    type="button"
                    // eslint-disable-next-line react-hooks/refs
                    onClick={() => handleNavSelectQuestion(qIdx)}
                    className={cn(
                      "py-2 px-1 rounded-xl text-xs font-black transition-all border-2 flex flex-col items-center justify-center gap-0.5",
                      isCurrent
                        ? "border-[var(--line-strong)] bg-[var(--brand-orange)] text-white shadow-[3px_3px_0px_var(--neo-shadow)] scale-105"
                        : isDoubtful
                        ? "border-[var(--line-strong)] bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : isGuess
                        ? "border-[var(--line-strong)] bg-purple-100 dark:bg-purple-950/60 text-purple-950 dark:text-purple-200 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : isSure
                        ? "border-[var(--line-strong)] bg-[var(--pastel-green)] text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : isSkipped
                        ? "border-[var(--line-strong)] bg-rose-100 dark:bg-rose-950/60 text-rose-950 dark:text-rose-200 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] opacity-60"
                    )}
                  >
                    <span>{qIdx + 1}</span>
                    <span className="text-[10px] leading-none font-bold">
                      {isDoubtful ? "⭕" : isGuess ? "⚡" : isSure ? "✓" : isSkipped ? "⏭️" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Group Reading / Cloze Passage Panel */}
      {hasPassage && current && (
        <div
          className={cn(
            "card-neo p-4 sm:p-5 space-y-3 bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] transition-all",
            isPassagePinned && "sticky top-3 z-20"
          )}
        >
          <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-[var(--pastel-blue)] border border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <BookOpen size={15} />
              </div>
              <strong className="text-xs sm:text-sm font-black text-[var(--ink)]">
                متن درک مطلب (Passage / Cloze Test)
              </strong>
              {passageQuestions.length > 0 && (
                <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
                  سؤالات {passageQuestions[0].qIdx + 1} تا {passageQuestions[passageQuestions.length - 1].qIdx + 1}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* Quick Switch between questions of this passage */}
              {passageQuestions.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[10px] font-black text-[var(--muted)] hidden sm:inline">سؤالات:</span>
                  {passageQuestions.map((pq) => {
                    const isCurrentPassageQ = pq.qIdx === index;
                    const isAnswered = Boolean(pq.selectedOptionId);
                    return (
                      <button
                        key={pq.id}
                        type="button"
                        onClick={() => {
                          save(current.selectedOptionId, current.confidence, pq.qIdx);
                        }}
                        className={cn(
                          "w-6 h-6 rounded-md border text-[10px] font-black transition-all flex items-center justify-center",
                          isCurrentPassageQ
                            ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)] scale-110"
                            : isAnswered
                            ? "bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                            : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
                        )}
                        title={`رفتن به سؤال ${pq.qIdx + 1}`}
                      >
                        {pq.qIdx + 1}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Pin Toggle Button */}
              <button
                type="button"
                onClick={() => setIsPassagePinned(!isPassagePinned)}
                className={cn(
                  "p-1.5 rounded-lg border text-xs font-black transition-all flex items-center gap-1",
                  isPassagePinned
                    ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                    : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
                )}
                title={isPassagePinned ? "سنجاق شده در بالای صفحه (همیشه در دید)" : "سنجاق کردن متن در بالا"}
              >
                {isPassagePinned ? <Pin size={13} className="fill-current" /> : <PinOff size={13} />}
                <span className="text-[10px] hidden md:inline">{isPassagePinned ? "سنجاق‌شده" : "سنجاق"}</span>
              </button>
            </div>
          </div>

          {/* Scrollable Passage Body with Neo Scrollbar */}
          <div
            dir="ltr"
            className="max-h-52 sm:max-h-64 overflow-y-auto pr-2 pl-1 text-xs sm:text-sm leading-relaxed text-[var(--ink)] font-medium neo-scrollbar select-text"
          >
            <div dir="ltr" className="font-sans text-left leading-relaxed">
              <ContentRenderer blocks={current.snapshot.groupContent!} />
            </div>
          </div>
        </div>
      )}

      {/* Question Statement Card (Wireframe 09 Phone 2 & 4) */}
      {current && (
        <div className="card-neo p-5 sm:p-6 space-y-4 bg-[var(--surface)]">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="inline-block text-[11px] font-black px-3 py-1 rounded-xl bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
                {current.snapshot.subject} {current.snapshot.chapter ? `• ${current.snapshot.chapter}` : ""}
              </span>
              {current.confidence === "doubtful" ? (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-amber-100 dark:bg-amber-950/60 border-2 border-amber-400 text-amber-950 dark:text-amber-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                  <span>⭕</span>
                  <span>با شک</span>
                </span>
              ) : current.confidence === "guess" ? (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-rose-100 dark:bg-rose-950/60 border-2 border-rose-400 text-rose-950 dark:text-rose-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                  <span>❌</span>
                  <span>حدس زدم</span>
                </span>
              ) : current.selectedOptionId ? (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 text-emerald-950 dark:text-emerald-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                  <span>✓</span>
                  <span>مطمئن</span>
                </span>
              ) : (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <span>❌</span>
                  <span>بی‌پاسخ</span>
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => toggleFlag(index)}
              className={cn(
                "p-2 rounded-xl border-2 transition-all",
                isDoubtful
                  ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
              )}
              title="نشان‌گذاری سؤال"
            >
              <Bookmark size={16} fill={isDoubtful ? "currentColor" : "none"} />
            </button>
          </div>

          <div
            className={cn(
              "font-bold leading-relaxed text-[var(--ink)] transition-all",
              fontSize === "large"
                ? "text-base sm:text-lg"
                : fontSize === "xlarge"
                ? "text-lg sm:text-xl"
                : "text-sm sm:text-base"
            )}
          >
            <ContentRenderer blocks={current.snapshot.content} />
          </div>
        </div>
      )}

      {/* 4 Interactive Option Cards (الف, ب, ج, د) */}
      <div className="space-y-2.5">
        {options.map((option, optIdx) => {
          if (!option) return null;
          const isSelected = current?.selectedOptionId === option.id;
          const letter = PERSIAN_LETTERS[optIdx] || String(optIdx + 1);

          // Instant feedback evaluated view
          if (isCurrentRevealed && current) {
            const isCorrect = option.id === current.snapshot.correctOptionId;
            const isUserWrong = isSelected && !isCorrect;

            return (
              <div
                key={option.id}
                className={cn(
                  "w-full p-4 rounded-2xl border-2 text-right transition-all flex items-center gap-3.5",
                  isCorrect
                    ? "border-emerald-500 bg-[var(--pastel-green-soft)] text-emerald-950 dark:text-emerald-100 shadow-[3px_3px_0px_#10b981]"
                    : isUserWrong
                    ? "border-rose-500 bg-[var(--pastel-red-soft)] text-rose-950 dark:text-rose-100 shadow-[3px_3px_0px_#f43f5e]"
                    : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] opacity-60"
                )}
              >
                {/* Persian Letter Badge */}
                <div
                  className={cn(
                    "w-8 h-8 rounded-xl border-2 flex items-center justify-center font-black text-xs flex-shrink-0",
                    isCorrect
                      ? "bg-emerald-500 text-white border-emerald-600"
                      : isUserWrong
                      ? "bg-rose-500 text-white border-rose-600"
                      : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)]"
                  )}
                >
                  {letter}
                </div>

                {/* Option Content */}
                <div
                  className={cn(
                    "flex-1 text-right font-bold",
                    fontSize === "large" ? "text-sm sm:text-base" : fontSize === "xlarge" ? "text-base sm:text-lg" : "text-xs sm:text-sm",
                    isCorrect ? "text-emerald-950 dark:text-emerald-100 font-black" : isUserWrong ? "text-rose-950 dark:text-rose-100 font-black" : "text-[var(--ink)]"
                  )}
                >
                  <ContentRenderer blocks={option.content} />
                </div>

                {/* Status Badge */}
                {isCorrect && (
                  <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
                    <Check size={14} className="stroke-[3]" />
                    <span>پاسخ صحیح</span>
                  </span>
                )}
                {isUserWrong && (
                  <span className="px-2.5 py-1 rounded-xl bg-rose-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
                    <X size={14} className="stroke-[3]" />
                    <span>انتخاب شما</span>
                  </span>
                )}
              </div>
            );
          }

          // Normal interactive option button
          return (
            <button
              key={option.id}
              type="button"
              onClick={() => {
                if (isSelected) {
                  save(null, null, index);
                } else {
                  const nextConf = current?.confidence === "doubtful" ? "doubtful" : current?.confidence === "guess" ? "guess" : "sure";
                  save(option.id, nextConf, index);
                }
              }}
              className={cn(
                "w-full p-4 rounded-2xl border-2 text-right transition-all flex items-center gap-3.5 cursor-pointer",
                isSelected
                  ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5"
                  : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-cream)]"
              )}
            >
              {/* Persian Letter Badge */}
              <div
                className={cn(
                  "w-8 h-8 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center font-black text-xs flex-shrink-0 transition-colors",
                  isSelected ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)]" : "bg-[var(--surface-cream)] text-[var(--ink-on-color)]"
                )}
              >
                {letter}
              </div>

              {/* Option Content */}
              <div
                className={cn(
                  "flex-1 text-right font-bold text-[var(--ink)]",
                  fontSize === "large" ? "text-sm sm:text-base" : fontSize === "xlarge" ? "text-base sm:text-lg" : "text-xs sm:text-sm"
                )}
              >
                <ContentRenderer blocks={option.content} />
              </div>

              {/* Radio Indicator */}
              <div
                className={cn(
                  "w-6 h-6 rounded-full border-2 border-[var(--line-strong)] flex items-center justify-center flex-shrink-0 transition-all",
                  isSelected ? "bg-[var(--ink)]" : "bg-[var(--surface)]"
                )}
              >
                {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[var(--surface)]" />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Instant Feedback: شناسنامه تست و پاسخ تشریحی ۳ گامی */}
      {isCurrentRevealed && current && (
        <div className="card-neo p-5 space-y-4 bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)]">
          {/* Header: شناسنامه تست */}
          <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-[var(--line)] flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                <BookOpen size={16} />
              </div>
              <div>
                <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                  شناسنامه و تحلیل تست کنکور
                </strong>
                <span className="text-[10px] text-[var(--muted)] font-bold">
                  بررسی مفهومی، دام‌های تستی و راهبرد حل
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap text-[10px] font-black">
              <span className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--ink)] shadow-sm">
                درس: {current.snapshot.subject}
              </span>
              {current.snapshot.chapter && (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)] text-[var(--muted)] shadow-sm">
                  فصل: {current.snapshot.chapter}
                </span>
              )}
              {current.snapshot.topic && (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--pastel-blue-soft)] border border-[var(--line-strong)] text-[var(--ink)] shadow-sm">
                  مبحث: {current.snapshot.topic}
                </span>
              )}
              {current.snapshot.externalKey && (
                <span className="px-2.5 py-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] text-[var(--muted)]">
                  شناسه: {current.snapshot.externalKey}
                </span>
              )}
            </div>
          </div>

          {/* Quick Evaluation Banner */}
          {current.selectedOptionId === current.snapshot.correctOptionId ? (
            <div className="p-3 rounded-2xl bg-[var(--pastel-green-soft)] border-2 border-emerald-400 text-emerald-900 dark:text-emerald-200 text-xs font-black flex items-center gap-2.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-emerald-500 text-white flex items-center justify-center shrink-0">
                <Check size={16} className="stroke-[3]" />
              </div>
              <div>
                <span className="block font-black text-xs sm:text-sm">پاسخ شما کاملاً درست بود! 🎉</span>
                <span className="text-[10px] sm:text-[11px] opacity-85 font-medium">تسلط خوبی روی این تست دارید. تحلیل و نکته تستی زیر را هم مرور کنید.</span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-[var(--pastel-red-soft)] border-2 border-rose-400 text-rose-900 dark:text-rose-200 text-xs font-black flex items-center gap-2.5 shadow-sm">
              <div className="w-7 h-7 rounded-lg bg-rose-500 text-white flex items-center justify-center shrink-0">
                <AlertCircle size={16} />
              </div>
              <div>
                <span className="block font-black text-xs sm:text-sm">پاسخ نادرست است! ⚠️</span>
                <span className="text-[10px] sm:text-[11px] opacity-85 font-medium">ایده، دام تستی و تحلیل ۳ گامی زیر را با دقت بخوانید.</span>
              </div>
            </div>
          )}

          {/* Explanation Content */}
          {current.snapshot.explanation && current.snapshot.explanation.length > 0 ? (
            <div className="space-y-2 pt-1 text-right">
              <div className="text-xs sm:text-sm font-bold leading-relaxed text-[var(--ink)] space-y-2">
                <ContentRenderer blocks={current.snapshot.explanation} />
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[var(--surface-2)] text-xs text-[var(--muted)] font-bold text-right">
              پاسخ تشریحی برای این سؤال ثبت نشده است.
            </div>
          )}
        </div>
      )}

      {/* Confidence Action Pills & Clear Selection (only when not yet revealed): شک دارم (⭕) | حدس زدم (⚡) | پاک کردن (↺) */}
      {!isCurrentRevealed && (
        <div className="flex items-center gap-2.5 pt-1">
          {/* 1. شک دارم ⭕ */}
          <button
            type="button"
            onClick={() => {
              const nextConf = current?.confidence === "doubtful" ? (current?.selectedOptionId ? "sure" : null) : "doubtful";
              save(current?.selectedOptionId ?? null, nextConf, index);
              toggleFlag(index);
            }}
            className={cn(
              "py-2.5 px-3 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex-1 flex items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer",
              current?.confidence === "doubtful"
                ? "bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-500 shadow-[2px_2px_0px_#f59e0b]"
                : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
            title="اگر بین دو یا سه گزینه تردید دارید"
          >
            <span className="text-sm">⭕</span>
            <span>{current?.confidence === "doubtful" ? "با شک پاسخ دادم" : "شک دارم"}</span>
          </button>

          {/* 2. حدس زدم ⚡ */}
          <button
            type="button"
            onClick={() => {
              const nextConf = current?.confidence === "guess" ? (current?.selectedOptionId ? "sure" : null) : "guess";
              save(current?.selectedOptionId ?? null, nextConf, index);
            }}
            className={cn(
              "py-2.5 px-3 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex-1 flex items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer",
              current?.confidence === "guess"
                ? "bg-purple-100 dark:bg-purple-950/70 text-purple-950 dark:text-purple-200 border-purple-500 shadow-[2px_2px_0px_#a855f7]"
                : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
            title="اگر بدون اطمینان علمی و صرفاً بر پایه شانس گزینه زده‌اید"
          >
            <span className="text-sm">⚡</span>
            <span>{current?.confidence === "guess" ? "حدسی پاسخ دادم" : "حدس زدم"}</span>
          </button>

          {/* 3. پاک کردن انتخاب گزینه */}
          {current?.selectedOptionId && (
            <button
              type="button"
              onClick={() => save(null, null, index)}
              className="py-2.5 px-3 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-rose-600 shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex items-center justify-center gap-1 text-xs font-bold transition-all shrink-0 cursor-pointer"
              title="پاک کردن انتخاب گزینه"
            >
              <RotateCcw size={14} />
              <span className="hidden sm:inline">پاک کردن</span>
            </button>
          )}
        </div>
      )}

      {poolExhausted && (
        <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 text-xs font-black border-2 border-amber-300 shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-2">
          <AlertCircle size={16} />
          <span>تمامی سوالات موجود در بانک برای این دروس به پایان رسیدند. می‌توانید آزمون را تحویل دهید.</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 text-red-700 text-xs font-black border-2 border-red-300 shadow-[2px_2px_0px_var(--neo-shadow)]">
          {error}
        </div>
      )}

      {/* Bottom Navigation: Next / Prev / Finish / Reveal */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="button"
          onClick={handlePrev}
          disabled={index === 0 || pending}
          className="py-3.5 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <ChevronRight size={18} />
          <span>سؤال قبلی</span>
        </button>

        {/* Instant Feedback: Submit & Reveal button if option selected but not revealed */}
        {isInstantFeedback && !isCurrentRevealed && current?.selectedOptionId ? (
          <button
            type="button"
            onClick={handleRevealAnswer}
            disabled={pending}
            className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2 font-black shadow-[3px_3px_0px_var(--neo-shadow)]"
          >
            <Sparkles size={18} />
            <span>ثبت و بررسی پاسخ 🔍</span>
          </button>
        ) : index < totalQuestions - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={pending}
            className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2 font-black shadow-[3px_3px_0px_var(--neo-shadow)]"
          >
            <span>{isCurrentRevealed ? "ادامه و سؤال بعدی" : "سؤال بعدی"}</span>
            <ChevronLeft size={18} />
          </button>
        ) : isOpenEnded && !poolExhausted ? (
          <div className="flex-1 flex gap-2">
            <button
              type="button"
              onClick={handleNext}
              disabled={pending}
              className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2 font-black"
            >
              <span>{pending ? "در حال دریافت سؤال بعدی…" : "سؤال بعدی (پیوسته)"}</span>
              <ChevronLeft size={18} />
            </button>
            <button
              type="button"
              onClick={() => setShowFinishConfirm(true)}
              disabled={pending}
              className="py-3.5 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-green)] text-[var(--ink-on-color)] text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            >
              <span>تحویل آزمون</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowFinishConfirm(true)}
            disabled={pending}
            className="py-3.5 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-green)] text-[var(--ink-on-color)] text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex-1 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <CheckCircle2 size={18} />
            <span>{isCurrentRevealed ? "مشاهده کارنامه نهایی 🏆" : "پایان و ثبت آزمون"}</span>
          </button>
        )}
      </div>

      {/* 3-Option Confirmation Dialog (Spec Section 0.8 & 15) */}
      {showFinishConfirm && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowFinishConfirm(false)}>
          <section
            className="card-neo max-w-md mx-auto p-6 bg-[var(--surface)] space-y-4 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finish-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
              <AlertCircle size={28} />
            </div>
            <h2 id="finish-title" className="text-lg font-black text-[var(--ink)]">
              تعیین وضعیت پایان آزمون
            </h2>
            <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
              {sData.questions.filter((item) => !item.selectedOptionId).length} سؤال بی‌پاسخ مانده است. نحوهٔ ثبت جلسه را انتخاب کنید:
            </p>

            <div className="space-y-2.5 pt-1 text-right">
              {/* Option 1: ذخیره و بعداً ادامه می‌دهم */}
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-cream)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer"
                disabled={pending}
                onClick={async () => {
                  await pause();
                  setShowFinishConfirm(false);
                  router.push("/sessions/");
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0">
                  <Pause size={16} />
                </div>
                <div>
                  <strong className="block text-xs font-black text-[var(--ink)]">ذخیره و خروج (ادامه بعداً)</strong>
                  <span className="text-[11px] text-[var(--muted)] font-medium">وضعیت آزمون ذخیره شده و بعداً از همین سؤال ادامه می‌دهید.</span>
                </div>
              </button>

              {/* Option 2: همین‌جا تمام کن (ارزیابی سؤالات دیده‌شده) */}
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer"
                disabled={pending}
                onClick={async () => {
                  await finish();
                  setShowFinishConfirm(false);
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0">
                  <Check size={16} />
                </div>
                <div>
                  <strong className="block text-xs font-black text-[var(--ink)]">همین‌جا تمام کن (محاسبه عملکرد تا اینجا)</strong>
                  <span className="text-[11px] text-[var(--muted)] font-medium">آزمون به پایان می‌رسد و کارنامه سؤالات فعلی محاسبه می‌شود.</span>
                </div>
              </button>

              {/* Option 3: تحویل کامل کنکوری */}
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-green)] text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer"
                disabled={pending}
                onClick={async () => {
                  await finish();
                  setShowFinishConfirm(false);
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-white border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 text-emerald-800">
                  <CheckCircle2 size={16} />
                </div>
                <div>
                  <strong className="block text-xs font-black">تحویل کامل کنکوری</strong>
                  <span className="text-[11px] opacity-90 font-medium">تمام سؤالات باقیمانده به عنوان سفید/نزده در کارنامه لحاظ می‌شوند.</span>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                onClick={() => setShowFinishConfirm(false)}
              >
                انصراف و ادامهٔ آزمون
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
