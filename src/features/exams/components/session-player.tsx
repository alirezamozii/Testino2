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
  Download,
  HelpCircle,
  Hourglass,
  Laptop,
  Lightbulb,
  List,
  Loader2,
  LogOut,
  Pause,
  Pin,
  PinOff,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  X,
  XCircle,
  Zap,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { ExamTimerChip } from "./exam-timer-chip";
import { calculateScore } from "../domain/scoring";
import { remapExplanationForShuffle } from "../domain/explanation-remapper";
import { extractQuestionPassageTarget, highlightPassageTargets } from "../domain/passage-underliner";

import { buildSessionExport } from "@/features/ai/domain/export-builder";
import { simulateOverallConfidence } from "@/features/analytics/domain/confidence-simulation";
import { SignedNumber, SignedPercent, formatSignedPercentString } from "@/components/ui/signed-number";
import { useDatabase } from "@/providers/database-provider";
import { extractQuestionSortKey, extractOriginalQuestionNumber, type SessionView } from "@/database/app-database";
import { cn } from "@/lib/utils";

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
  const [isPassagePinned, setIsPassagePinned] = useState(true);
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

  const [resultFilter, setResultFilter] = useState<"all" | "correct" | "wrong" | "unanswered">("all");
  const [navFilter, setNavFilter] = useState<"all" | "sure" | "doubtful" | "guess" | "skipped" | "unvisited">("all");
  const [finishedTab, setFinishedTab] = useState<"breakdown" | "questions" | "confidence">("breakdown");
  const [expandedResultId, setExpandedResultId] = useState<string | null>(null);
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

  const hasPassage = Boolean(
    current?.snapshot.groupContent && current.snapshot.groupContent.length > 0
  );

  const currentGroupId = current?.snapshot.groupId;
  const isCloze = Boolean(
    current?.snapshot.groupKind === "cloze" ||
      (current?.snapshot.chapter && current.snapshot.chapter.toLowerCase().includes("cloze"))
  );

  const passageScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll passage container to active paragraph or target underlined word/phrase when question changes
  useEffect(() => {
    if (!currentGroupId || !hasPassage) return;
    const timer = setTimeout(() => {
      const targetEl = passageScrollRef.current?.querySelector(".para-active, u, mark");
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [index, currentGroupId, hasPassage]);

  const passageQuestions = useMemo(() => {
    return (session.data?.questions ?? [])
      .map((q, qIdx) => ({ ...q, qIdx }))
      .filter((q) => currentGroupId && q.snapshot.groupId === currentGroupId)
      .sort((a, b) => {
        const numA = extractQuestionSortKey(a.snapshot);
        const numB = extractQuestionSortKey(b.snapshot);
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB;
        }
        if (a.snapshot.externalKey && b.snapshot.externalKey) {
          return a.snapshot.externalKey.localeCompare(b.snapshot.externalKey, undefined, { numeric: true });
        }
        return a.qIdx - b.qIdx;
      });
  }, [currentGroupId, session.data?.questions]);

  // Dynamic Cloze Blanks Numbering & Smart Target Underlining
  const displayGroupContent = useMemo(() => {
    if (!current?.snapshot.groupContent) {
      return current?.snapshot.groupContent;
    }

    let blocks = current.snapshot.groupContent;

    if (isCloze && passageQuestions.length > 0) {
      const mappings = passageQuestions.map((pq, posIdx) => ({
        origNum: extractOriginalQuestionNumber(pq.snapshot) || (pq.snapshot.source?.number ? String(pq.snapshot.source.number) : undefined),
        posNum: String(posIdx + 1),
        targetNum: pq.qIdx + 1,
      }));

      blocks = blocks.map((block) => {
        if (block.type !== "text" || typeof block.value !== "string") return block;
        let text = block.value;

        // 1. Explicit replacement if original source numbers are known
        for (const m of mappings) {
          if (m.origNum && m.origNum !== String(m.targetNum)) {
            text = text.replace(new RegExp(`(\\()\\s*${m.origNum}\\s*(\\))`, "g"), `(${m.targetNum})`);
            text = text.replace(new RegExp(`(\\[)\\s*${m.origNum}\\s*(\\])`, "g"), `[${m.targetNum}]`);
          }
        }

        // 2. Sequential replacement of all blank placeholders in the cloze passage
        // e.g. ............(8) or (8) or [8] -> mapped in sequential order to passageQuestions[blankIdx].qIdx + 1
        let blankCounter = 0;
        text = text.replace(/([_\\.]{2,}\s*)?([(\[])\s*\d+\s*([)\]])/g, (match, prefix, open, close) => {
          if (blankCounter < passageQuestions.length) {
            const target = passageQuestions[blankCounter].qIdx + 1;
            blankCounter++;
            return `${prefix || ""}${open}${target}${close}`;
          }
          return match;
        });

        return { ...block, value: text };
      });
    }

    // Smart target word/phrase underlining & paragraph isolation for Reading Comprehension
    if (current?.snapshot.content) {
      const targetInfo = extractQuestionPassageTarget(current.snapshot.content);
      blocks = highlightPassageTargets(blocks, targetInfo.targets, targetInfo.paragraphNumber);
    }

    return blocks;
  }, [current, isCloze, passageQuestions]);

  // Align blank in active question statement to actual session question number
  const displayQuestionContent = useMemo(() => {
    if (!current?.snapshot.content || !isCloze || passageQuestions.length === 0) {
      return current?.snapshot.content;
    }

    const targetNum = index + 1;
    const origNum = extractOriginalQuestionNumber(current.snapshot) || (current.snapshot.source?.number ? String(current.snapshot.source.number) : undefined);

    return current.snapshot.content.map((block) => {
      if (block.type !== "text" || typeof block.value !== "string") return block;
      let text = block.value;

      if (origNum && origNum !== String(targetNum)) {
        text = text.replace(new RegExp(`(\\()\\s*${origNum}\\s*(\\))`, "g"), `(${targetNum})`);
        text = text.replace(new RegExp(`(\\[)\\s*${origNum}\\s*(\\])`, "g"), `[${targetNum}]`);
      }

      // Also replace any unresolved blank marker if present
      text = text.replace(/([_\\.]{2,}\s*)?([(\[])\s*\d+\s*([)\]])/, (match, prefix, open, close) => {
        return `${prefix || ""}${open}${targetNum}${close}`;
      });

      return { ...block, value: text };
    });
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
    const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
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
  }, [cache, current, database.db, id, index, isOpenEnded, session, totalQuestions]);

  const handleNavSelectQuestion = useCallback(
    (targetIndex: number) => {
      if (id && current) {
        const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
        void database.db
          .recordQuestionVisit(id, current.id, elapsed, targetIndex)
          .catch(() => undefined);
      }
      setSelectedIndex(targetIndex);
      openedAt.current = performance.now();
      setShowNavSheet(false);
    },
    [current, database.db, id]
  );

  const handlePrev = useCallback(async () => {
    if (!id || !current) return;
    if (index > 0) {
      const elapsed = openedAt.current === null ? 0 : performance.now() - openedAt.current;
      setSelectedIndex(index - 1);
      openedAt.current = performance.now();
      void database.db
        .recordQuestionVisit(id, current.id, elapsed, index - 1)
        .catch(() => undefined);
    }
  }, [current, database.db, id, index]);

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
            <strong className="font-black text-[var(--ink)]">
              {sData.config?.durationMinutes
                ? `${sData.config.durationMinutes.toLocaleString("fa-IR")} دقیقه`
                : "بدون محدودیت زمانی"}
            </strong>
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-[var(--pastel-orange-soft)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)]">
                <BookOpen size={18} />
              </div>
              <span className="text-[var(--muted)] font-bold">موضوعات</span>
            </div>
            <strong className="font-black text-[var(--ink)] max-w-[180px] truncate">
              {sData.config?.subjectFilter || "تمام دروس"}
            </strong>
          </div>
        </div>

        <button
          type="button"
          onClick={begin}
          disabled={isStarting}
          className="btn-neo-orange w-full py-4 text-base font-black flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
        >
          {isStarting ? (
            <>
              <Loader2 size={20} className="animate-spin" />
              <span>در حال راه‌اندازی آزمون…</span>
            </>
          ) : (
            <>
              <Play size={20} className="fill-current" />
              <span>شروع آزمون</span>
            </>
          )}
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
                                صحیح با شک
                              </span>
                            );
                          }
                          if (q.confidence === "guess") {
                            return (
                              <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-purple-400 bg-purple-100 dark:bg-purple-950/60 text-purple-900 dark:text-purple-200">
                                شانس تصادفی (حدس)
                              </span>
                            );
                          }
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-emerald-400 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200">
                              تسلط مطمئن
                            </span>
                          );
                        }
                        // Wrong answers:
                        if (q.confidence === "doubtful") {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-amber-400 bg-amber-100 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200">
                              خطای تردید (شک)
                            </span>
                          );
                        }
                        if (q.confidence === "guess") {
                          return (
                            <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-rose-400 bg-rose-100 dark:bg-rose-950/60 text-rose-900 dark:text-rose-200">
                              ریسک غلط (حدس منفی)
                            </span>
                          );
                        }
                        return (
                          <span className="text-[11px] font-black px-2.5 py-1 rounded-xl border-2 border-rose-500 bg-rose-200 dark:bg-rose-950 text-rose-950 dark:text-rose-100 shadow-[1px_1px_0px_#e11d48]">
                            تله علمی (غلط مطمئن)
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
                          {(() => {
                            const orderedOptions = q.optionOrder?.length
                              ? q.optionOrder
                                  .map((optId) => q.snapshot.options.find((o) => o.id === optId))
                                  .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt))
                              : q.snapshot.options;

                            return (
                              <>
                                {orderedOptions.map((option, optionIndex) => {
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
                                {q.snapshot.explanation.length > 0 && (
                                  <div className="p-3 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-xs font-bold text-[var(--ink)] space-y-1 mt-2">
                                    <strong className="block font-black text-[var(--brand-orange)]">پاسخ تشریحی:</strong>
                                    <ContentRenderer blocks={remapExplanationForShuffle(q.snapshot.explanation, q.snapshot.options, orderedOptions)} />
                                  </div>
                                )}
                              </>
                            );
                          })()}
                        </div>
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
  // Bookmark is a pure visual marker (persisted locally); confidence is the persisted state.
  const isFlagged = flaggedIndices.has(index);

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
    <div className="exam-player max-w-4xl mx-auto space-y-4 pb-10 transition-colors duration-200">
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
      <div className="flex items-center justify-between gap-1.5 sm:gap-2 px-0.5">
        {/* Pause & Timer */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={sData.state === "RUNNING" ? pause : begin}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all shrink-0 cursor-pointer"
            title={sData.state === "RUNNING" ? "توقف موقت" : "ادامه"}
          >
            {sData.state === "RUNNING" ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <ExamTimerChip
            durationMinutes={durationMinutes}
            persistedSeconds={persistedSeconds}
            isRunning={sData.state === "RUNNING"}
            isRevealed={isCurrentRevealed}
            onGapDetected={() => setGapNotice(true)}
            onAutoPause={() => {
              if (id) {
                void database.db.pauseSession(id).then(() => {
                  void cache.invalidateQueries({ queryKey: ["session", id] });
                });
              }
            }}
            resetTrigger={index}
          />
        </div>


        {/* Counter & Action Drawers */}
        <div className="flex items-center gap-1 sm:gap-2 min-w-0">
          <span className="text-[11px] sm:text-xs font-black text-[var(--ink-on-color)] bg-[var(--pastel-yellow)] px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] whitespace-nowrap shrink-0">
            {isOpenEnded ? `سؤال ${index + 1}` : `${index + 1} از ${totalQuestions}`}
          </span>
          {/* Source Button (منبع سؤال) */}
          <button
            type="button"
            onClick={() => setShowSourceModal(true)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-[11px] sm:text-xs font-black flex items-center gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
            title="مشاهده منبع و مشخصات این سؤال"
          >
            <BookOpen size={14} className="text-[var(--brand-orange)]" />
            <span className="hidden xs:inline">منبع</span>
          </button>
          <button
            type="button"
            onClick={() => setShowNavSheet(!showNavSheet)}
            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl sm:rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all shrink-0 cursor-pointer"
            title="پاسخ‌برگ و ناوبری سؤالات"
          >
            <List size={16} />
          </button>
          <button
            type="button"
            onClick={() => setShowFinishConfirm(true)}
            className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-[11px] sm:text-xs font-black flex items-center gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-all cursor-pointer shrink-0"
            title="خروج یا پایان آزمون"
          >
            <LogOut size={14} />
            <span className="hidden sm:inline">خروج</span>
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
                ? "به‌خاطر ترک صفحه، آزمون موقتاً متوقف شد تا زمانی ثبت نشود."
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
      {showSourceModal && current && (
        <div
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          onClick={() => setShowSourceModal(false)}
        >
          <div
            className="card-neo w-full max-w-md p-5 sm:p-6 space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                  <BookOpen size={16} />
                </div>
                <strong className="text-sm font-black text-[var(--ink)]">منبع و مشخصات سؤال</strong>
              </div>
              <button
                type="button"
                onClick={() => setShowSourceModal(false)}
                className="w-8 h-8 rounded-xl border-2 border-[var(--line)] hover:border-[var(--line-strong)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] transition-all cursor-pointer"
              >
                <X size={15} />
              </button>
            </div>

            <div className="space-y-3 text-xs sm:text-sm font-medium">
              <div className="flex items-start justify-between p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)]">
                <span className="text-[var(--muted)] font-bold">عنوان منبع:</span>
                <strong className="font-black text-[var(--ink)] text-right max-w-[240px]">
                  {current.snapshot.source?.title || "کنکور سراسری یا بانک سوالات"}
                </strong>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--muted)] font-bold">نوع منبع:</span>
                  <strong className="font-black text-[var(--ink)] text-xs">
                    {current.snapshot.source?.kind === "EXAM"
                      ? "آزمون سراسری (کنکور)"
                      : current.snapshot.source?.kind === "AI"
                      ? "طراحی تألیفی استاندارد"
                      : "کتاب تست مرجع و استاندارد"}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex flex-col gap-1">
                  <span className="text-[10px] text-[var(--muted)] font-bold">سال برگزاری:</span>
                  <strong className="font-black text-[var(--ink)] text-xs font-mono">
                    {current.snapshot.source?.year ? String(current.snapshot.source.year) : "نامشخص"}
                  </strong>
                </div>
              </div>

              {current?.snapshot && extractOriginalQuestionNumber(current.snapshot) && (
                <div className="p-2.5 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] flex items-center justify-between">
                  <span className="text-[10px] sm:text-xs text-[var(--muted)] font-bold">شماره در کنکور / آزمون اصلی:</span>
                  <strong className="font-black text-[var(--ink)] text-xs sm:text-sm font-mono">
                    سؤال {extractOriginalQuestionNumber(current.snapshot)} کنکور
                  </strong>
                </div>
              )}

              <div className="p-2.5 rounded-xl bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] text-[11px] font-bold text-[var(--ink)] space-y-1">
                <div>
                  <span className="text-[var(--muted)]">درس: </span>
                  <span className="font-black">{current.snapshot.subject}</span>
                </div>
                {current.snapshot.chapter && (
                  <div>
                    <span className="text-[var(--muted)]">فصل: </span>
                    <span className="font-black">{current.snapshot.chapter}</span>
                  </div>
                )}
                {current.snapshot.topic && (
                  <div>
                    <span className="text-[var(--muted)]">مبحث: </span>
                    <span className="font-black">{current.snapshot.topic}</span>
                  </div>
                )}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowSourceModal(false)}
              className="btn-neo-orange w-full py-2.5 text-xs font-black cursor-pointer"
            >
              متوجه شدم
            </button>
          </div>
        </div>
      )}

      {/* Navigation Grid Sheet (Wireframe 10 / Screen 10) */}
      {showNavSheet && (
        <div className="card-neo p-5 sm:p-6 space-y-4 bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] animate-in fade-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b-2 border-[var(--line)]">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
                  <List size={16} />
                </div>
                <div>
                  <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                    پاسخ‌برگ و ناوبری سؤالات
                  </strong>
                  <span className="text-[10px] sm:text-[11px] text-[var(--muted)] font-bold">
                    برای پرش به هر سؤال روی شماره آن کلیک کنید
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowNavSheet(false)}
                className="px-3 py-1.5 rounded-xl border-2 border-[var(--line)] hover:border-[var(--line-strong)] bg-[var(--surface-2)] text-xs font-black text-[var(--muted)] hover:text-[var(--ink)] flex items-center gap-1.5 transition-all cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
              >
                <span>بستن</span>
                <X size={14} />
              </button>
            </div>

            {/* Filter Tabs Grid — clean, balanced on mobile (3 cols) and desktop (6 cols) */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {([
                { id: "all", label: "همه سؤالات", count: totalQuestions, badgeTone: "bg-[var(--line)] text-[var(--ink)]" },
                { id: "sure", label: "مطمئن", count: sureCount, badgeTone: "bg-emerald-200 dark:bg-emerald-900 text-emerald-900 dark:text-emerald-100" },
                { id: "doubtful", label: "با شک", count: doubtfulCount, badgeTone: "bg-amber-200 dark:bg-amber-900 text-amber-900 dark:text-amber-100" },
                { id: "guess", label: "حدس", count: guessCount, badgeTone: "bg-purple-200 dark:bg-purple-900 text-purple-900 dark:text-purple-100" },
                { id: "skipped", label: "رد شده", count: skippedCount, badgeTone: "bg-slate-200 dark:bg-slate-700 text-slate-900 dark:text-slate-100" },
                { id: "unvisited", label: "دیده‌نشده", count: unvisitedCount, badgeTone: "bg-[var(--surface-3)] text-[var(--muted)]" },
              ] as const).map((flt) => {
                const isSelected = navFilter === flt.id;
                return (
                  <button
                    key={flt.id}
                    type="button"
                    onClick={() => setNavFilter(flt.id)}
                    className={cn(
                      "py-2 px-2.5 rounded-xl text-xs font-black border-2 transition-all flex items-center justify-between gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] cursor-pointer",
                      isSelected
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] -translate-y-0.5"
                        : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--line-strong)]"
                    )}
                  >
                    <span className="truncate">{flt.label}</span>
                    <span
                      className={cn(
                        "text-[10px] font-mono font-bold px-1.5 py-0.5 rounded-md leading-none",
                        isSelected ? "bg-white/25 text-white" : flt.badgeTone
                      )}
                    >
                      {new Intl.NumberFormat("fa-IR").format(flt.count)}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Number Grid with Indicator Badges */}
            <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-2.5 max-h-72 overflow-y-auto p-1 pr-1.5 neo-scrollbar">
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
                    onClick={() => handleNavSelectQuestion(qIdx)}
                    className={cn(
                      "min-h-[52px] rounded-xl text-xs font-black transition-all border-2 flex flex-col items-center justify-center gap-1 shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] cursor-pointer",
                      isCurrent
                        ? "border-[var(--line-strong)] bg-[var(--brand-orange)] text-white scale-105 ring-2 ring-[var(--brand-orange)]/40"
                        : isDoubtful
                        ? "border-[var(--line-strong)] bg-amber-100 dark:bg-amber-950/60 text-amber-950 dark:text-amber-200"
                        : isGuess
                        ? "border-[var(--line-strong)] bg-purple-100 dark:bg-purple-950/60 text-purple-950 dark:text-purple-200"
                        : isSure
                        ? "border-[var(--line-strong)] bg-[var(--pastel-green)] text-[var(--ink-on-color)]"
                        : isSkipped
                        ? "border-[var(--line-strong)] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200"
                        : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--ink)]"
                    )}
                  >
                    <span className="text-sm font-black font-mono">{qIdx + 1}</span>
                    <span className="text-[10px] leading-none font-black opacity-80">
                      {isDoubtful ? "شک" : isGuess ? "حدس" : isSure ? "✓" : isSkipped ? "رد" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Sheet Footer with Quick Summary and Direct Finish Action */}
            <div className="pt-3 border-t-2 border-[var(--line)] flex items-center justify-between flex-wrap gap-2 text-xs font-black">
              <div className="text-[var(--muted)]">
                پاسخ داده‌شده: <strong className="text-[var(--ink)]">{sureCount + doubtfulCount + guessCount}</strong> از <strong className="text-[var(--ink)]">{totalQuestions}</strong>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowNavSheet(false);
                    setShowAbandonConfirm(true);
                  }}
                  className="px-3 py-1.5 rounded-xl bg-red-50 hover:bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 font-black text-xs border-2 border-red-300 dark:border-red-900/60 shadow-[2px_2px_0px_var(--neo-shadow)] transition-all cursor-pointer"
                  title="انصراف بدون ثبت"
                >
                  انصراف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNavSheet(false);
                    setShowFinishConfirm(true);
                  }}
                  className="px-3.5 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-black text-xs border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] transition-all cursor-pointer"
                >
                  تحویل آزمون
                </button>
                <button
                  type="button"
                  onClick={() => setShowNavSheet(false)}
                  className="px-3 py-1.5 rounded-xl bg-[var(--surface)] text-[var(--ink)] font-black text-xs border-2 border-[var(--line)] hover:border-[var(--line-strong)] transition-all cursor-pointer"
                >
                  بستن
                </button>
              </div>
            </div>
          </div>
      )}

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
                {isCloze
                  ? "متن کلوزتست (Cloze Test)"
                  : current.snapshot.groupKind === "shared"
                  ? "متن مشترک (Shared Passage)"
                  : "متن درک مطلب (Reading Passage)"}
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
                          handleNavSelectQuestion(pq.qIdx);
                        }}
                        className={cn(
                          "w-8 h-8 rounded-md border text-[11px] font-black transition-all flex items-center justify-center shrink-0",
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
            ref={passageScrollRef}
            dir="ltr"
            className="max-h-52 sm:max-h-64 overflow-y-auto pr-2 pl-1 text-xs sm:text-sm leading-relaxed text-[var(--ink)] font-medium neo-scrollbar select-text scroll-smooth"
          >
            <div dir="ltr" className="font-sans text-left leading-relaxed">
              <ContentRenderer blocks={displayGroupContent || current.snapshot.groupContent!} />
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
                  <HelpCircle size={12} />
                  <span>با شک</span>
                </span>
              ) : current.confidence === "guess" ? (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-[var(--brand-purple)]/20 dark:bg-purple-950/60 border-2 border-[var(--brand-purple)] text-purple-950 dark:text-purple-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                  <Zap size={12} />
                  <span>حدس زدم</span>
                </span>
              ) : current.selectedOptionId ? (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 border-2 border-emerald-400 text-emerald-950 dark:text-emerald-200 shadow-[1px_1px_0px_var(--neo-shadow)] flex items-center gap-1">
                  <Check size={12} />
                  <span>مطمئن</span>
                </span>
              ) : (
                <span className="text-[11px] font-black px-2.5 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 flex items-center gap-1">
                  <XCircle size={12} />
                  <span>بی‌پاسخ</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => toggleFlag(index)}
                className={cn(
                  "p-2 rounded-xl border-2 transition-all",
                  isFlagged
                    ? "bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                    : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
                )}
                title="نشان‌گذاری سؤال برای مرور بعدی"
              >
                <Bookmark size={16} fill={isFlagged ? "currentColor" : "none"} />
              </button>
            </div>
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
            <ContentRenderer blocks={displayQuestionContent || current.snapshot.content} />
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
                    ? "border-red-500 bg-[var(--pastel-red-soft)] text-red-950 dark:text-red-100 shadow-[3px_3px_0px_#ef4444]"
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
                      ? "bg-red-500 text-white border-red-600"
                      : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)]"
                  )}
                >
                  {letter}
                </div>

                {/* Option Content */}
                <div
                  className={cn(
                    "flex-1 text-right font-bold",
                    fontSize === "large" ? "text-base sm:text-lg" : fontSize === "xlarge" ? "text-lg sm:text-xl" : "text-sm sm:text-base",
                    isCorrect ? "text-emerald-950 dark:text-emerald-100 font-black" : isUserWrong ? "text-red-950 dark:text-red-100 font-black" : "text-[var(--ink)]"
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
                  <span className="px-2.5 py-1 rounded-xl bg-red-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
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
                "w-full p-3.5 sm:p-4 rounded-2xl border-2 text-right transition-colors flex items-center gap-3 sm:gap-3.5 cursor-pointer active:scale-[0.99]",
                isSelected
                  ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[3px_3px_0px_var(--neo-shadow)]"
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
                  fontSize === "large" ? "text-base sm:text-lg" : fontSize === "xlarge" ? "text-lg sm:text-xl" : "text-sm sm:text-base"
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

          {/* Explanation Content */}
          {current.snapshot.explanation && current.snapshot.explanation.length > 0 ? (
            <div className="pt-1 text-right text-xs sm:text-sm font-bold leading-relaxed text-[var(--ink)] space-y-2">
              <ContentRenderer blocks={displayExplanation} />
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-[var(--surface-2)] text-xs text-[var(--muted)] font-bold text-right">
              پاسخ تشریحی برای این سؤال ثبت نشده است.
            </div>
          )}
        </div>
      )}

      {/* Confidence Action Pills & Clear Selection (only when not yet revealed): شک دارم | حدس زدم | پاک کردن */}
      {!isCurrentRevealed && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3 pt-1 w-full">
          {/* 1. شک دارم */}
          <button
            type="button"
            onClick={() => {
              const nextConf = current?.confidence === "doubtful" ? (current?.selectedOptionId ? "sure" : null) : "doubtful";
              save(current?.selectedOptionId ?? null, nextConf, index);
            }}
            className={cn(
              "w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 text-xs sm:text-sm font-black transition-all cursor-pointer active:scale-[0.98]",
              current?.confidence === "doubtful"
                ? "bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-500 shadow-[2px_2px_0px_#f59e0b]"
                : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
            title="اگر بین دو یا سه گزینه تردید دارید"
          >
            <HelpCircle size={16} />
            <span>{current?.confidence === "doubtful" ? "با شک" : "شک دارم"}</span>
          </button>

          {/* 2. حدس زدم */}
          <button
            type="button"
            onClick={() => {
              const nextConf = current?.confidence === "guess" ? (current?.selectedOptionId ? "sure" : null) : "guess";
              save(current?.selectedOptionId ?? null, nextConf, index);
            }}
            className={cn(
              "w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 text-xs sm:text-sm font-black transition-all cursor-pointer active:scale-[0.98]",
              current?.confidence === "guess"
                ? "bg-purple-100 dark:bg-purple-950/70 text-purple-950 dark:text-purple-200 border-purple-500 shadow-[2px_2px_0px_#a855f7]"
                : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
            )}
            title="اگر بدون اطمینان علمی و صرفاً بر پایه شانس گزینه زده‌اید"
          >
            <Zap size={16} />
            <span>{current?.confidence === "guess" ? "حدسی" : "حدس زدم"}</span>
          </button>

          {/* 3. پاک کردن انتخاب گزینه */}
          {current?.selectedOptionId ? (
            <button
              type="button"
              onClick={() => save(null, null, index)}
              className="col-span-2 sm:col-span-1 w-full py-2.5 sm:py-3 px-3.5 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--muted)] hover:text-rose-600 shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center justify-center gap-1.5 text-xs sm:text-sm font-bold transition-all shrink-0 cursor-pointer active:scale-[0.98]"
              title="پاک کردن انتخاب گزینه"
            >
              <RotateCcw size={15} />
              <span>پاک کردن انتخاب</span>
            </button>
          ) : (
            <div className="hidden sm:block" />
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
      <div className="flex items-center gap-2 sm:gap-3 pt-2">
        <button
          type="button"
          onClick={handlePrev}
          disabled={index === 0 || pending}
          className="py-3 sm:py-3.5 px-3.5 sm:px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs sm:text-sm font-black shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] disabled:opacity-30 disabled:pointer-events-none transition-colors flex items-center gap-1 sm:gap-1.5 cursor-pointer shrink-0"
        >
          <ChevronRight size={17} />
          <span>سؤال قبلی</span>
        </button>

        {/* Instant Feedback: Submit & Reveal button if option selected but not revealed */}
        {isInstantFeedback && !isCurrentRevealed && current?.selectedOptionId ? (
          <button
            type="button"
            onClick={handleRevealAnswer}
            disabled={pending}
            className="btn-neo-orange flex-1 py-3 sm:py-3.5 text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 font-black shadow-[3px_3px_0px_var(--neo-shadow)] cursor-pointer"
          >
            <Sparkles size={17} />
            <span>ثبت و بررسی پاسخ</span>
          </button>
        ) : index < totalQuestions - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            disabled={pending}
            className="btn-neo-orange flex-1 py-3 sm:py-3.5 text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 font-black shadow-[3px_3px_0px_var(--neo-shadow)] cursor-pointer"
          >
            <span>{isCurrentRevealed ? "ادامه و سؤال بعدی" : "سؤال بعدی"}</span>
            <ChevronLeft size={17} />
          </button>
        ) : isOpenEnded && !poolExhausted ? (
          <div className="flex-1 flex gap-2">
            <button
              type="button"
              onClick={handleNext}
              disabled={pending}
              className="btn-neo-orange flex-1 py-3 sm:py-3.5 text-xs sm:text-sm flex items-center justify-center gap-1.5 sm:gap-2 font-black cursor-pointer"
            >
              <span>{pending ? "دریافت سؤال…" : "سؤال بعدی"}</span>
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              onClick={() => setShowFinishConfirm(true)}
              disabled={pending}
              className="py-3 sm:py-3.5 px-3 sm:px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-green)] text-[var(--ink-on-color)] text-xs sm:text-sm font-black shadow-[2px_2px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] transition-colors cursor-pointer shrink-0"
            >
              <span>تحویل آزمون</span>
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowFinishConfirm(true)}
            disabled={pending}
            className="py-3 sm:py-3.5 px-4 sm:px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-green)] text-[var(--ink-on-color)] text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)] active:translate-x-[1px] active:translate-y-[1px] flex-1 flex items-center justify-center gap-1.5 sm:gap-2 transition-colors cursor-pointer"
          >
            <CheckCircle2 size={17} />
            <span>تحویل آزمون</span>
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
            {(() => {
              const unansweredCount = isOpenEnded
                ? sData.questions.slice(0, index + 1).filter((item) => !item.selectedOptionId).length
                : sData.questions.filter((item) => !item.selectedOptionId).length;
              return (
                <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
                  {unansweredCount > 0
                    ? `${unansweredCount.toLocaleString("fa-IR")} سؤال بی‌پاسخ مانده است. نحوهٔ ثبت جلسه را انتخاب کنید:`
                    : "به تمام سؤالات این آزمون پاسخ داده‌اید. نحوهٔ ثبت جلسه را انتخاب کنید:"}
                </p>
              );
            })()}

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold text-right">
                {error}
              </div>
            )}

            <div className="space-y-2.5 pt-1 text-right">
              {/* Option 1: ذخیره و بعداً ادامه می‌دهم */}
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-cream)] text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
                disabled={pending || isFinishing}
                onClick={async () => {
                  await pause();
                  setShowFinishConfirm(false);
                  router.push("/sessions/");
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-[var(--pastel-blue)] border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0">
                  <Pause size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="block text-xs font-black text-[var(--ink)]">ذخیره و خروج موقت (ادامه بعداً)</strong>
                  <span className="text-[11px] text-[var(--muted)] font-medium leading-relaxed block mt-0.5 text-pretty">آزمون ذخیره می‌شود و بعداً از همین سؤال ادامه می‌دهی.</span>
                </div>
              </button>

              {/* Option 2: Final submit — مشاهده کارنامه و ثبت آمار */}
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-green)] text-[var(--ink-on-color)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
                disabled={pending || isFinishing}
                onClick={() => void finish()}
              >
                <div className="w-8 h-8 rounded-xl bg-white border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 text-emerald-800">
                  {isFinishing ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="block text-xs font-black">
                    {isFinishing ? "در حال ثبت و نهایی‌سازی…" : "تحویل آزمون و مشاهده کارنامه"}
                  </strong>
                  <span className="text-[11px] opacity-90 font-medium leading-relaxed block mt-0.5 text-pretty">
                    آزمون پایان یافته و کارنامه و درصدها محاسبه و ثبت می‌شوند.
                  </span>
                </div>
              </button>

              {/* Option 3: انصراف و لغو کامل آزمون (بدون ثبت هیچ داده‌ای) */}
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-rose-50 dark:bg-rose-950/40 text-rose-900 dark:text-rose-200 hover:bg-rose-100 transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
                disabled={pending || isFinishing || isAbandoning}
                onClick={() => {
                  setShowFinishConfirm(false);
                  setShowAbandonConfirm(true);
                }}
              >
                <div className="w-8 h-8 rounded-xl bg-rose-200 dark:bg-rose-900 border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 text-rose-800 dark:text-rose-200">
                  <LogOut size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <strong className="block text-xs font-black">انصراف و لغو آزمون (بدون ثبت داده)</strong>
                  <span className="text-[11px] opacity-80 font-medium leading-relaxed block mt-0.5 text-pretty">آزمون به کلی حذف شده و هیچ کارنامه یا آماری ذخیره نمی‌شود.</span>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                onClick={() => setShowFinishConfirm(false)}
              >
                انصراف و بازگشت به آزمون
              </button>
            </div>
          </section>
        </div>
      )}

      {/* Abandon Confirmation Dialog */}
      {showAbandonConfirm && (
        <div
          className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs"
          role="presentation"
          onMouseDown={() => !isAbandoning && setShowAbandonConfirm(false)}
        >
          <section
            className="card-neo w-full max-w-md mx-auto p-6 bg-[var(--surface)] space-y-4 text-center border-2 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)] animate-in fade-in zoom-in-95 duration-150"
            role="dialog"
            aria-modal="true"
            aria-labelledby="abandon-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-rose-100 dark:bg-rose-950/60 border-2 border-[var(--line-strong)] flex items-center justify-center text-rose-600 dark:text-rose-400">
              <LogOut size={28} />
            </div>

            <div className="space-y-1">
              <h2 id="abandon-title" className="text-lg font-black text-[var(--ink)]">
                انصراف از آزمون
              </h2>
              <p className="text-xs text-[var(--muted)] font-bold leading-relaxed px-2">
                آیا از خروج و انصراف از آزمون مطمئن هستید؟
              </p>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/60 text-amber-900 dark:text-amber-200 text-xs font-bold text-right leading-relaxed space-y-1">
              <p>• هیچ داده، پاسخ یا نتیجه‌ای از این آزمون در سوابق و کارنامه ثبت نخواهد شد.</p>
              <p>• این آزمون کاملاً بسته شده و در لیست «ادامه آزمون» نمایش داده نمی‌شود.</p>
            </div>

            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-300 text-rose-800 text-xs font-bold text-right">
                {error}
              </div>
            )}

            <div className="space-y-2 pt-2">
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-rose-600 hover:bg-rose-700 text-white shadow-[3px_3px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 font-black text-xs sm:text-sm"
                disabled={isAbandoning}
                onClick={() => void abandon()}
              >
                {isAbandoning ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
                <span>{isAbandoning ? "در حال حذف و لغو آزمون…" : "انصراف قطعی و حذف آزمون"}</span>
              </button>

              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                disabled={isAbandoning}
                onClick={() => setShowAbandonConfirm(false)}
              >
                ادامه دادن آزمون
              </button>
            </div>
          </section>
        </div>
      )}

    </div>
  );
}
