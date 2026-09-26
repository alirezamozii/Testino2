"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Hourglass } from "lucide-react";
import { SessionReadyView } from "./session-ready-view";
import { SessionFinishedView } from "./session-finished-view";
import { ExamNavSheet } from "./exam-nav-sheet";
import { FinishConfirmModal, AbandonConfirmModal } from "./exam-confirm-modals";
import { ExamPassagePanel } from "./exam-passage-panel";
import { ExamActiveQuestion } from "./exam-active-question";
import { ExamHeader } from "./exam-header";
import { ExamSourceModal } from "./exam-source-modal";
import { ExamBottomBar } from "./exam-bottom-bar";
import { remapExplanationForShuffle } from "../domain/explanation-remapper";
import {
  computePassageQuestions,
  transformPassageContent,
  transformQuestionContent,
} from "../domain/cloze-passage-transformer";
import { useDatabase } from "@/providers/database-provider";
import type { SessionView } from "@/database/app-database";

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
  const [isStarting, setIsStarting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [error, setError] = useState("");
  // Scratchpad + bookmark flags are restored lazily — safe for SSR because the
  // server render of this component is always the loading state.
  const [flaggedIndices, setFlaggedIndices] = useState<Set<number>>(() => {
    if (typeof window === "undefined" || !id) return new Set();
    try {
      const raw = localStorage.getItem(`testino_exam_tools_${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { flags?: unknown };
        if (Array.isArray(parsed.flags)) return new Set(parsed.flags as number[]);
      }
    } catch {
      // ignore corrupt storage
    }
    return new Set();
  });
  const [showNavSheet, setShowNavSheet] = useState(false);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [fontSize] = useState<"normal" | "large" | "xlarge">("normal");
  const [quickNote] = useState(() => {
    if (typeof window === "undefined" || !id) return "";
    try {
      const raw = localStorage.getItem(`testino_exam_tools_${id}`);
      if (raw) {
        const parsed = JSON.parse(raw) as { note?: unknown };
        if (typeof parsed.note === "string") return parsed.note;
      }
    } catch {
      // ignore corrupt storage
    }
    return "";
  });
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [isAbandoning, setIsAbandoning] = useState(false);

  const [poolExhausted, setPoolExhausted] = useState(false);
  const [gapNotice, setGapNotice] = useState(false);
  const openedAt = useRef<number | null>(null);

  const [revealedIds, setRevealedIds] = useState<Set<string>>(() => new Set());

  const totalQuestions = session.data?.questions.length ?? 1;
  const index = selectedIndex ?? Math.min(session.data?.currentOrdinal ?? 0, Math.max(0, totalQuestions - 1));
  const current = session.data?.questions[index];
  const persistedSeconds = Math.floor((session.data?.questions.reduce((sum, item) => sum + item.activeMs, 0) ?? 0) / 1000);

  // Exam time limit (minutes)
  const durationMinutes = session.data?.config?.durationMinutes ?? null;

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
        queueMicrotask(() => {
          setRevealedIds((prev) => {
            const next = new Set(prev);
            for (const qid of answered) next.add(qid);
            return next;
          });
        });
      }
    }
  }, [isInstantFeedback, session.data?.questions]);

  // Persist scratchpad + bookmark flags for this session (survive reloads / accidental closes)
  // Values are seeded in the lazy initializers above; this only writes them out.
  const persistExamTools = (flags: Set<number>, note: string) => {
    if (!id) return;
    try {
      localStorage.setItem(`testino_exam_tools_${id}`, JSON.stringify({ flags: [...flags], note }));
    } catch {
      // ignore quota errors
    }
  };

  const currentGroupId = current?.snapshot.groupId;
  const isCloze = Boolean(
    current?.snapshot.groupKind === "cloze" ||
      (current?.snapshot.chapter && current.snapshot.chapter.toLowerCase().includes("cloze"))
  );

  const passageQuestions = useMemo(() => {
    return computePassageQuestions(session.data?.questions ?? [], currentGroupId ?? undefined);
  }, [currentGroupId, session.data?.questions]);

  // Dynamic Cloze Blanks Numbering & Smart Target Underlining
  const displayGroupContent = useMemo(() => {
    return current ? transformPassageContent(current, isCloze, passageQuestions) : undefined;
  }, [current, isCloze, passageQuestions]);

  // Align blank in active question statement to actual session question number
  const displayQuestionContent = useMemo(() => {
    return current
      ? transformQuestionContent(current, index + 1, isCloze, passageQuestions.length)
      : undefined;
  }, [current, index, isCloze, passageQuestions.length]);

  // Monotonic timer for recording visit/answer active duration
  useEffect(() => {
    openedAt.current = performance.now();
  }, [current?.id, session.data?.state]);


  const options = useMemo(
    () =>
      current
        ? current.optionOrder
            .map((optionId) => current.snapshot.options.find((option) => option.id === optionId))
            .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
        : [],
    [current]
  );

  const displayExplanation = useMemo(() => {
    if (!current?.snapshot.explanation) return [];
    return remapExplanationForShuffle(
      current.snapshot.explanation,
      current.snapshot.options,
      options
    );
  }, [current, options]);

  const save = useCallback(
    async (optionId: string | null, confidence = current?.confidence ?? null, nextIndex = index) => {
      if (!id || !current) return;
      setPending(true);
      setError("");
      try {
        const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
        // Optimistic cache update so the option checkmark is instant
        cache.setQueryData<SessionView | null>(["session", id], (old) => {
          if (!old) return old;
          return {
            ...old,
            currentOrdinal: nextIndex,
            questions: old.questions.map((q) =>
              q.id === current.id
                ? { ...q, selectedOptionId: optionId, confidence, visited: true }
                : q
            ),
          };
        });
        await database.db.saveAnswer(id, current.id, optionId, confidence, elapsed, nextIndex);
        openedAt.current = performance.now();
        await cache.invalidateQueries({ queryKey: ["session", id] });
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
    // When reading explanation in instant feedback mode, do not bill explanation time to question active solving time
    const elapsed = isCurrentRevealed || openedAt.current === null ? 0 : performance.now() - openedAt.current;
    if (index < totalQuestions - 1) {
      setSelectedIndex(index + 1);
      openedAt.current = performance.now();
      void database.db
        .recordQuestionVisit(id, current.id, elapsed, index + 1)
        .catch(() => undefined);
    } else if (isOpenEnded) {
      setPending(true);
      setError("");
      try {
        await database.db.recordQuestionVisit(id, current.id, elapsed, index);
        openedAt.current = performance.now();
        const appended = await database.db.appendNextUnit(id);
        if (appended && appended.length > 0) {
          await cache.invalidateQueries({ queryKey: ["session", id] });
          await session.refetch();
          setSelectedIndex(index + 1);
        } else {
          setPoolExhausted(true);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "خطا در دریافت سؤال بعدی.");
      } finally {
        setPending(false);
      }
    }
  }, [cache, current, database.db, id, index, isCurrentRevealed, isOpenEnded, session, totalQuestions]);

  const handleNavSelectQuestion = useCallback(
    (targetIndex: number) => {
      if (id && current) {
        const elapsed = isCurrentRevealed || openedAt.current === null ? 0 : performance.now() - openedAt.current;
        void database.db
          .recordQuestionVisit(id, current.id, elapsed, targetIndex)
          .catch(() => undefined);
      }
      setSelectedIndex(targetIndex);
      openedAt.current = performance.now();
      setShowNavSheet(false);
    },
    [current, database.db, id, isCurrentRevealed]
  );

  const handlePrev = useCallback(async () => {
    if (!id || !current) return;
    if (index > 0) {
      const elapsed = isCurrentRevealed || openedAt.current === null ? 0 : performance.now() - openedAt.current;
      setSelectedIndex(index - 1);
      openedAt.current = performance.now();
      void database.db
        .recordQuestionVisit(id, current.id, elapsed, index - 1)
        .catch(() => undefined);
    }
  }, [current, database.db, id, index, isCurrentRevealed]);

  // Auto-pause & flush checkpoint on visibilitychange, blur, pagehide, beforeunload
  useEffect(() => {
    if (!id || !current || session.data?.state !== "RUNNING") return;
    const flushAndPause = () => {
      const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
      openedAt.current = null;
      void database.db
        .recordQuestionVisit(id, current.id, elapsed, index)
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
      persistExamTools(next, quickNote);
      return next;
    });
  }

  async function begin() {
    if (!id) return;
    setIsStarting(true);
    setError("");
    try {
      await database.db.startOrResumeSession(id);
      // SW-update guard reads this: a deploying service worker must NOT
      // SKIP_WAITING mid-exam (route was renamed to /sessions/run long ago).
      try { sessionStorage.setItem("testino_session_running", "true"); } catch { /* ignore */ }
      openedAt.current = performance.now();
      setGapNotice(false);
      await session.refetch();

    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در شروع آزمون.");
    } finally {
      setIsStarting(false);
    }
  }

  async function pause() {
    if (!id) return;
    try {
      if (current) {
        const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
        await database.db.recordQuestionVisit(id, current.id, elapsed, index);
      }
      await database.db.pauseSession(id);
      await session.refetch();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در متوقف کردن آزمون.");
    }
  }

  async function finish() {
    if (!id) return;
    setIsFinishing(true);
    setError("");
    try {
      if (current) {
        const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
        await database.db.recordQuestionVisit(id, current.id, elapsed, index);
      }
      await database.db.finishSession(id);
      try { sessionStorage.removeItem("testino_session_running"); } catch { /* ignore */ }
      await session.refetch();
      await cache.invalidateQueries({ queryKey: ["sessions"] });
      await cache.invalidateQueries({ queryKey: ["dashboard"] });
      setShowFinishConfirm(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در پایان و ثبت آزمون.");
    } finally {
      setIsFinishing(false);
    }
  }

  async function abandon() {
    if (!id) return;
    setIsAbandoning(true);
    setError("");
    try {
      await database.db.abandonSession(id);
      try { sessionStorage.removeItem("testino_session_running"); } catch { /* ignore */ }
      try { localStorage.removeItem(`testino_exam_tools_${id}`); } catch { /* ignore */ }
      await cache.invalidateQueries({ queryKey: ["sessions"] });
      await cache.invalidateQueries({ queryKey: ["session", id] });
      await cache.invalidateQueries({ queryKey: ["dashboard"] });
      setShowAbandonConfirm(false);
      router.replace("/sessions/");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در انصراف از آزمون.");
      setIsAbandoning(false);
    }
  }


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
        <Link href="/sessions/" className="btn-neo-orange inline-flex px-4 py-2 text-xs font-black">
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
      <SessionReadyView
        config={sData.config}
        totalQuestions={totalQuestions}
        isStarting={isStarting}
        onBegin={begin}
      />
    );
  }

  // =========================================================================
  // VIEW 2: FINISHED (RESULT & SESSION ANALYSIS - WIREFRAMES 11 & 12)
  // =========================================================================
  if (sData.state === "FINISHED") {
    return <SessionFinishedView session={sData} />;
  }

  // =========================================================================
  // VIEW 3: RUNNING (ACTIVE SOLVING ENVIRONMENT - MATCHING SHEET 1 PHONE 3)
  // =========================================================================
  // Bookmark is a pure visual marker (persisted locally); confidence is the persisted state.
  const isFlagged = flaggedIndices.has(index);

  return (
    <div className="exam-player max-w-4xl mx-auto space-y-4 pb-10 transition-colors duration-200">
      {/* Top Header & Inactivity Notice */}
      <ExamHeader
        isOpenEnded={isOpenEnded}
        index={index}
        totalQuestions={totalQuestions}
        isRunning={sData.state === "RUNNING"}
        onTogglePlayPause={sData.state === "RUNNING" ? pause : begin}
        sessionId={id}
        durationMinutes={durationMinutes}
        persistedSeconds={persistedSeconds}
        onGapDetected={() => setGapNotice(true)}
        onAutoPause={() => {
          if (id) {
            void database.db.pauseSession(id).then(() => {
              void cache.invalidateQueries({ queryKey: ["session", id] });
            });
          }
        }}
        onOpenSourceModal={() => setShowSourceModal(true)}
        onToggleNavSheet={() => setShowNavSheet(!showNavSheet)}
        onOpenFinishConfirm={() => setShowFinishConfirm(true)}
        isPaused={sData.state === "PAUSED"}
        gapNotice={gapNotice}
        onResumeFromGap={() => {
          setGapNotice(false);
          void begin();
        }}
      />

      {/* Error Banner with Retry */}
      {error && (
        <div className="p-3.5 rounded-2xl bg-red-50 dark:bg-red-950/50 border-2 border-red-400 text-red-800 dark:text-red-200 text-xs font-bold flex items-center justify-between gap-3 shadow-[2px_2px_0px_var(--neo-shadow)]">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => save(current?.selectedOptionId ?? null, current?.confidence ?? null, index)}
            className="px-3 py-1.5 rounded-xl bg-red-600 text-white font-black text-xs hover:bg-red-700 transition-colors shrink-0"
          >
            تلاش مجدد
          </button>
        </div>
      )}

      {/* Source Modal (منبع سؤال) */}
      {current && (
        <ExamSourceModal
          isOpen={showSourceModal}
          onClose={() => setShowSourceModal(false)}
          question={current}
        />
      )}

      {/* Navigation Grid Sheet (Wireframe 10 / Screen 10) */}
      <ExamNavSheet
        isOpen={showNavSheet}
        onClose={() => setShowNavSheet(false)}
        questions={sData.questions}
        currentIndex={index}
        totalQuestions={totalQuestions}
        onSelectQuestion={(qIdx) => handleNavSelectQuestion(qIdx)}
        onOpenAbandonConfirm={() => {
          setShowNavSheet(false);
          setShowAbandonConfirm(true);
        }}
        onOpenFinishConfirm={() => {
          setShowNavSheet(false);
          setShowFinishConfirm(true);
        }}
      />

      {/* Group Reading / Cloze Passage Panel */}
      {current && (
        <ExamPassagePanel
          currentQuestion={current}
          currentIndex={index}
          isCloze={isCloze}
          displayGroupContent={displayGroupContent}
          passageQuestions={passageQuestions}
          onSelectQuestion={handleNavSelectQuestion}
        />
      )}

      {/* Active Question Statement, Options, Feedback & Confidence Pills */}
      {current && (
        <div
          className={`relative transition-all duration-200 ${
            (sData.state === "PAUSED" || gapNotice) ? "cursor-pointer group" : ""
          }`}
          onClick={
            (sData.state === "PAUSED" || gapNotice)
              ? () => {
                  setGapNotice(false);
                  void begin();
                }
              : undefined
          }
        >
          <ExamActiveQuestion
            current={current}
            index={index}
            fontSize={fontSize}
            isFlagged={isFlagged}
            onToggleFlag={toggleFlag}
            displayQuestionContent={displayQuestionContent}
            options={options}
            isCurrentRevealed={isCurrentRevealed}
            displayExplanation={displayExplanation}
            onSaveAnswer={(optionId, confidence) => save(optionId, confidence, index)}
          />
          {(sData.state === "PAUSED" || gapNotice) && (
            <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] rounded-3xl flex items-center justify-center pointer-events-none transition-all">
              <div className="card-neo px-4 py-2 bg-[var(--surface)] text-center shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center gap-2 group-hover:scale-105 transition-transform">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
                <span className="text-xs font-black text-[var(--ink)]">
                  زمان‌سنج متوقف است (کلیک برای ادامه آزمون)
                </span>
              </div>
            </div>
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
      <ExamBottomBar
        index={index}
        totalQuestions={totalQuestions}
        pending={pending}
        isOpenEnded={isOpenEnded}
        poolExhausted={poolExhausted}
        isInstantFeedback={isInstantFeedback}
        isCurrentRevealed={isCurrentRevealed}
        hasSelectedOption={Boolean(current?.selectedOptionId)}
        onPrev={handlePrev}
        onNext={handleNext}
        onRevealAnswer={handleRevealAnswer}
        onOpenFinishConfirm={() => setShowFinishConfirm(true)}
      />

      {/* 3-Option Confirmation Dialog & Abandon Dialog */}
      <FinishConfirmModal
        isOpen={showFinishConfirm}
        onClose={() => setShowFinishConfirm(false)}
        unansweredCount={
          isOpenEnded
            ? sData.questions.slice(0, index + 1).filter((item) => !item.selectedOptionId).length
            : sData.questions.filter((item) => !item.selectedOptionId).length
        }
        isFinishing={isFinishing}
        error={error ?? undefined}
        onPauseAndExit={async () => {
          await pause();
          setShowFinishConfirm(false);
          router.push("/sessions/");
        }}
        onFinalFinish={() => void finish()}
        onSwitchToAbandon={() => {
          setShowFinishConfirm(false);
          setShowAbandonConfirm(true);
        }}
      />

      <AbandonConfirmModal
        isOpen={showAbandonConfirm}
        onClose={() => !isAbandoning && setShowAbandonConfirm(false)}
        isAbandoning={isAbandoning}
        error={error ?? undefined}
        onConfirmAbandon={() => void abandon()}
      />
    </div>
  );
}
