"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Trophy,
  X,
  Zap,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { LoadingState } from "@/components/ui/testino-ui";
import { SignedPercent } from "@/components/ui/signed-number";
import { useDatabase } from "@/providers/database-provider";
import type { QuestionPoolMode } from "@/database/app-database";
import { cn } from "@/lib/utils";
import { QuestionTrustActions } from "@/features/questions/components/question-trust-actions";
import { remapExplanationForShuffle } from "@/features/exams/domain/explanation-remapper";
import { extractQuestionPassageTarget, highlightPassageTargets } from "@/features/exams/domain/passage-underliner";

const PERSIAN_LETTERS = ["الف", "ب", "ج", "د"];

const PRIORITY_REASONS: Record<number, { text: string; bg: string; textCol: string; border: string }> = {
  0: { text: "غلط قبلی", bg: "bg-red-50 dark:bg-red-950/40", textCol: "text-red-700 dark:text-red-400", border: "border-red-300 dark:border-red-800" },
  1: { text: "دیده‌شده بدون پاسخ", bg: "bg-amber-50 dark:bg-amber-950/40", textCol: "text-amber-800 dark:text-amber-400", border: "border-amber-300 dark:border-amber-800" },
  2: { text: "با شک یا حدس", bg: "bg-amber-50 dark:bg-amber-950/40", textCol: "text-amber-800 dark:text-amber-400", border: "border-amber-300 dark:border-amber-800" },
  3: { text: "موعد تکرار فاصله‌دار", bg: "bg-blue-50 dark:bg-blue-950/40", textCol: "text-blue-800 dark:text-blue-400", border: "border-blue-300 dark:border-blue-800" },
};

export function ReviewRunner() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const subjectParam = searchParams.get("subject");
  const parsedCount = Number.parseInt(searchParams.get("count") || "20", 10);
  const countParam = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 20;
  const modesParam = searchParams.get("modes");

  const { db, status } = useDatabase();
  const cache = useQueryClient();

  const [activeSessionId, setActiveSessionId] = useState<string | null>(idParam);
  const [creatingSession, setCreatingSession] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const sessionAttempted = useRef(false);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [spoilerRevealed, setSpoilerRevealed] = useState<Record<string, boolean>>({});
  const [isFinished, setIsFinished] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const openedAt = useRef<number>(0);

  useEffect(() => {
    if (!openedAt.current) {
      openedAt.current = Date.now();
    }
  }, []);

  // Profiles
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
  const profileId = profilesQuery.data?.[0]?.id;

  // Due reviews list for reason mapping
  const dueQuery = useQuery({
    queryKey: ["due-reviews-map"],
    queryFn: () => db.listDueReviews(),
    enabled: status === "ready",
  });

  const dueItemsMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of dueQuery.data ?? []) {
      map.set(item.questionId, item.priority);
    }
    return map;
  }, [dueQuery.data]);

  // Create session if not provided (Strictly one-shot, no infinite loop!)
  useEffect(() => {
    if (!profileId || activeSessionId || sessionAttempted.current || status !== "ready") return;

    sessionAttempted.current = true;
    let isMounted = true;
    Promise.resolve().then(() => {
      if (isMounted) {
        setCreatingSession(true);
        setSessionError(null);
      }
    });

    void (async () => {
      try {
        const modesList: QuestionPoolMode[] = modesParam
          ? (modesParam.split(",").filter(Boolean) as QuestionPoolMode[])
          : ["wrong", "doubtful", "guess", "due", "skipped"];

        const subjectsParam = searchParams.get("subjects");
        const chaptersParam = searchParams.get("chapters");
        const topicsParam = searchParams.get("topics");
        const sessionIdParam = searchParams.get("sessionId");
        const sessionIdsParam = searchParams.get("sessionIds");
        const sessionIdsList = sessionIdsParam
          ? sessionIdsParam.split(",").map((s) => s.trim()).filter(Boolean)
          : undefined;
        const dateRangeParam = searchParams.get("dateRange") as "all" | "7d" | "30d" | "90d" | null;

        const subjectsList = subjectsParam
          ? subjectsParam.split(",").map((s) => s.trim()).filter(Boolean)
          : (subjectParam && subjectParam !== "all" ? [subjectParam] : undefined);
        const chaptersList = chaptersParam
          ? chaptersParam.split(",").map((c) => c.trim()).filter(Boolean)
          : undefined;
        const topicsList = topicsParam
          ? topicsParam.split(",").map((t) => t.trim()).filter(Boolean)
          : undefined;

        const createdId = await db.createSession(profileId, {
          mode: "due",
          modes: modesList,
          count: countParam,
          subjects: subjectsList,
          chapters: chaptersList,
          topics: topicsList,
          sessionId: sessionIdParam || undefined,
          sessionIds: sessionIdsList,
          dateRange: dateRangeParam || undefined,
          shuffleQuestions: false, // Maintain adaptive mastery order (urgent first!)
        });

        await db.startOrResumeSession(createdId);
        if (isMounted) {
          setActiveSessionId(createdId);
          setCreatingSession(false);
        }
      } catch (err) {
        console.warn("Could not create review session:", err);
        if (isMounted) {
          setCreatingSession(false);
          setSessionError(err instanceof Error ? err.message : "سؤالی برای مرور یافت نشد.");
        }
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [activeSessionId, countParam, db, modesParam, profileId, searchParams, status, subjectParam]);

  // Query the session
  const sessionQuery = useQuery({
    queryKey: ["session", activeSessionId],
    queryFn: () => (activeSessionId ? db.getSession(activeSessionId) : null),
    enabled: Boolean(activeSessionId) && status === "ready",
  });

  const sessionData = sessionQuery.data;
  const questions = useMemo(() => sessionData?.questions ?? [], [sessionData?.questions]);
  const totalQuestions = questions.length;
  const current = questions[selectedIndex];

  // Mark already-answered questions as revealed
  useEffect(() => {
    if (!questions.length) return;
    Promise.resolve().then(() => {
      setRevealed((prev) => {
        const next = { ...prev };
        for (const q of questions) {
          if (q.selectedOptionId) {
            next[q.id] = true;
          }
        }
        return next;
      });
    });
  }, [questions]);

  // Save answer and reveal immediately
  const handleSelectOption = useCallback(
    async (optionId: string, confidence: "sure" | "doubtful" | "guess" = "sure") => {
      if (!activeSessionId || !current) return;
      setPending(true);
      try {
        const elapsed = Date.now() - openedAt.current;
        openedAt.current = Date.now();
        await db.saveAnswer(activeSessionId, current.id, optionId, confidence, elapsed, selectedIndex);
        setRevealed((prev) => ({ ...prev, [current.id]: true }));
        setSpoilerRevealed((prev) => ({ ...prev, [current.id]: true }));
        await cache.invalidateQueries({ queryKey: ["session", activeSessionId] });
      } catch (err) {
        console.error("Failed to save review answer:", err);
      } finally {
        setPending(false);
      }
    },
    [activeSessionId, cache, current, db, selectedIndex]
  );

  // Clear answer to retry
  const handleRetry = useCallback(async () => {
    if (!activeSessionId || !current) return;
    setPending(true);
    try {
      await db.saveAnswer(activeSessionId, current.id, null, null, 0, selectedIndex);
      setRevealed((prev) => ({ ...prev, [current.id]: false }));
      await cache.invalidateQueries({ queryKey: ["session", activeSessionId] });
    } catch (err) {
      console.error("Failed to clear answer for retry:", err);
    } finally {
      setPending(false);
    }
  }, [activeSessionId, cache, current, db, selectedIndex]);

  // Complete review
  const handleFinish = useCallback(async () => {
    if (!activeSessionId) return;
    setPending(true);
    try {
      await db.finishSession(activeSessionId);
      await cache.invalidateQueries({ queryKey: ["session", activeSessionId] });
      await cache.invalidateQueries({ queryKey: ["reviews"] });
      await cache.invalidateQueries({ queryKey: ["dashboard"] });
      await cache.invalidateQueries({ queryKey: ["history"] });
      await cache.invalidateQueries({ queryKey: ["sessions"] });
      await cache.invalidateQueries({ queryKey: ["profile-sessions"] });
      await cache.invalidateQueries({ queryKey: ["review-stats"] });
      await cache.invalidateQueries({ queryKey: ["question-pool-stats"] });
      await cache.invalidateQueries({ queryKey: ["review-study-questions"] });
      setIsFinished(true);
    } catch (err) {
      console.error("Failed to finish review session:", err);
    } finally {
      setPending(false);
    }
  }, [activeSessionId, cache, db]);

  const options = useMemo(() => {
    if (!current?.optionOrder || !current.snapshot?.options) return [];
    return current.optionOrder
      .map((optId) => current.snapshot.options.find((o) => o.id === optId))
      .filter((opt): opt is NonNullable<typeof opt> => Boolean(opt));
  }, [current]);

  const displayExplanation = useMemo(() => {
    if (!current?.snapshot?.explanation) return [];
    return remapExplanationForShuffle(
      current.snapshot.explanation,
      current.snapshot.options,
      options
    );
  }, [current, options]);

  if (creatingSession || sessionQuery.isLoading) {
    return <LoadingState label="در حال فراخوانی و آماده‌سازی سؤالات اولویت‌دار مرور…" />;
  }

  // Graceful Empty / Error State (Prevents Infinite Loop)
  if (sessionError || !questions.length) {
    return (
      <div className="max-w-md mx-auto py-16 px-4 text-center space-y-5">
        <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)] mx-auto shadow-[4px_4px_0px_var(--neo-shadow)]">
          <Sparkles size={32} />
        </div>
        <div>
          <h2 className="text-xl font-black text-[var(--ink)]">
            {sessionError || "سؤالی با شرایط انتخابی برای مرور یافت نشد!"}
          </h2>
          <p className="text-xs text-[var(--muted)] font-bold mt-1.5 leading-relaxed">
            سؤالی در دسته‌های انتخابی شما در انتظار مرور نیست یا هنوز آزمونی با این مشخصات ثبت نشده است. می‌توانید دسته‌های دیگر مانند غلط‌ها، شک‌ها یا سؤالات مسلط را انتخاب کنید.
          </p>
        </div>
        <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5">
          <Link href="/review/" className="btn-neo-orange px-5 py-3 text-xs font-black w-full sm:w-auto">
            بازگشت و تنظیم فیلترهای مرور
          </Link>
          <Link
            href="/review/run/?modes=wrong,doubtful,guess,due,skipped,mastered&count=15"
            className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface-2)] transition-all w-full sm:w-auto"
          >
            مرور تمام تست‌های موجود
          </Link>
        </div>
      </div>
    );
  }

  // Finished Celebration
  if (isFinished || sessionData?.state === "FINISHED") {
    const correctCount = questions.filter(
      (q) => q.selectedOptionId && q.selectedOptionId === q.snapshot.correctOptionId
    ).length;
    const totalCount = questions.length;
    const pct = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;

    return (
      <div className="max-w-md mx-auto py-12 px-4 space-y-6 text-center">
        <div className="w-20 h-20 rounded-3xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)] mx-auto shadow-[4px_4px_0px_var(--neo-shadow)]">
          <Trophy size={40} />
        </div>

        <div>
          <h2 className="text-2xl font-black text-[var(--ink)]">مرور این بخش کامل شد!</h2>
          <p className="text-xs text-[var(--muted)] font-medium mt-1">
            موعدهای تکرار بعدی سؤالات بر اساس پاسخ شما در سیستم لایتنر هوشمند تنظیم شدند.
          </p>
        </div>

        <div className="card-neo p-5 bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-3 shadow-[3px_3px_0px_var(--neo-shadow)]">
          <div className="flex items-center justify-between text-xs font-black border-b border-[var(--line)] pb-2.5">
            <span className="text-[var(--muted)]">سؤالات مرورشده:</span>
            <strong className="text-[var(--ink)]">{totalCount} سؤال</strong>
          </div>
          <div className="flex items-center justify-between text-xs font-black border-b border-[var(--line)] pb-2.5">
            <span className="text-[var(--muted)]">پاسخ‌های صحیح:</span>
            <strong className="text-emerald-600">{correctCount} صحیح</strong>
          </div>
          <div className="flex items-center justify-between text-xs font-black">
            <span className="text-[var(--muted)]">درصد موفقیت:</span>
            <strong className="text-[var(--brand-orange)] text-sm">
              <SignedPercent value={pct} showPlus={false} />
            </strong>
          </div>
        </div>

        <div className="space-y-2 pt-2">
          <Link href="/review/" className="btn-neo-orange w-full py-3.5 text-xs font-black block">
            بازگشت به مرکز مرور
          </Link>
          <Link
            href="/history/"
            className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] text-[var(--ink)] text-xs font-black block shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--pastel-blue)] transition-all"
          >
            مشاهده این جلسه در تاریخچه آزمون‌ها
          </Link>
          <Link
            href="/"
            className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black block shadow-[2px_2px_0px_var(--neo-shadow)]"
          >
            صفحه اصلی
          </Link>
        </div>
      </div>
    );
  }

  const isCurrentRevealed = Boolean(revealed[current.id] || current.selectedOptionId);
  const isCorrect = current.selectedOptionId === current.snapshot.correctOptionId;
  const rawPriority = dueItemsMap.get(current.snapshot.id) ?? 3;
  const reasonInfo = PRIORITY_REASONS[rawPriority] || PRIORITY_REASONS[3];

  // Active Recall Spoiler State: true if revealed manually or already answered
  const isOptionRevealed = Boolean(spoilerRevealed[current.id] || isCurrentRevealed);

  return (
    <div className="review-runner max-w-4xl mx-auto space-y-4 pb-10">
      {/* Top Header */}
      <div className="flex items-center justify-between gap-2 px-1">
        <Link
          href="/review/"
          className="w-10 h-10 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
        >
          <ArrowRight size={18} />
        </Link>

        {/* Progress Counter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-black text-[var(--ink-on-color)] bg-[var(--pastel-yellow)] px-3 py-2 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)]">
            سؤال {selectedIndex + 1} از {totalQuestions}
          </span>
        </div>

        <button
          type="button"
          onClick={() => setShowFinishConfirm(true)}
          disabled={pending}
          className="py-2 px-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
        >
          پایان مرور
        </button>
      </div>

      {/* Slim Progress Bar */}
      <div className="w-full bg-[var(--surface-3)] h-2.5 rounded-full overflow-hidden border-2 border-[var(--line-strong)]">
        <div
          className="bg-[var(--brand-orange)] h-full transition-all duration-300"
          style={{ width: `${((selectedIndex + 1) / totalQuestions) * 100}%` }}
        />
      </div>

      {/* Reason Header Chip */}
      <div className="flex items-center justify-between gap-2 px-1 flex-wrap">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "px-3 py-1 rounded-xl text-xs font-black border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1.5",
              reasonInfo.bg,
              reasonInfo.textCol
            )}
          >
            <Sparkles size={13} />
            <span>علت مرور: {reasonInfo.text}</span>
          </span>
        </div>
        <span className="text-[11px] font-black text-[var(--muted)]">
          {current.snapshot.subject} {current.snapshot.chapter ? `• ${current.snapshot.chapter}` : ""}
        </span>
        <QuestionTrustActions question={current.snapshot} compact />
      </div>

      {/* Attached Passage / Reading / Cloze Content */}
      {current.snapshot.groupContent && current.snapshot.groupContent.length > 0 && (
        <div className="card-neo p-4 sm:p-5 space-y-3 bg-[var(--surface-2)]/70 border-2 border-[var(--line)]">
          <div className="flex items-center gap-2 text-xs font-black text-[var(--testino-orange)]">
            <BookOpen size={14} />
            <span>متن پیوست (Reading / Cloze Passage)</span>
          </div>
          <div dir="ltr" className="max-h-56 overflow-y-auto pr-2 text-xs sm:text-sm leading-relaxed text-[var(--ink)] font-medium neo-scrollbar select-text">
            <ContentRenderer
              blocks={(() => {
                const targetInfo = extractQuestionPassageTarget(current.snapshot.content);
                return highlightPassageTargets(
                  current.snapshot.groupContent,
                  targetInfo.targets,
                  targetInfo.paragraphNumber
                );
              })()}
            />
          </div>
        </div>
      )}

      {/* Question Statement Card */}
      <div className="card-neo p-5 sm:p-6 space-y-4 bg-[var(--surface)]">
        <div className="text-sm sm:text-base font-bold leading-relaxed text-[var(--ink)]">
          <ContentRenderer blocks={current.snapshot.content} />
        </div>
      </div>

      {/* Active Recall Hint & Spoiler Toggle Bar */}
      <div className="flex items-center justify-between gap-2 px-1 text-xs">
        <div className="flex items-center gap-1.5 text-[var(--muted)] font-black">
          <Sparkles size={14} className="text-amber-500" />
          <span>یادآوری فعال: اول در ذهنت پاسخ بده، بعد گزینه‌ها را ببین</span>
        </div>

        {!isCurrentRevealed && (
          <button
            type="button"
            onClick={() =>
              setSpoilerRevealed((prev) => ({
                ...prev,
                [current.id]: !prev[current.id],
              }))
            }
            className="px-3 py-1.5 rounded-xl border-2 border-[var(--line-strong)] bg-[var(--surface-cream)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--pastel-yellow)] transition-all flex items-center gap-1.5 cursor-pointer"
          >
            {isOptionRevealed ? <EyeOff size={14} /> : <Eye size={14} />}
            <span>{isOptionRevealed ? "پوشاندن گزینه‌ها" : "نمایش گزینه‌ها"}</span>
          </button>
        )}
      </div>

      {/* Telegram-Style Spoiler Masked Options Container */}
      <div className="telegram-spoiler relative">
        {/* The 4 Options (Blurred when masked) */}
        <div className={cn("space-y-2.5 transition-all duration-300", !isOptionRevealed && "telegram-spoiler-masked")}>
          {options.map((option, optIdx) => {
            if (!option) return null;
            const letter = PERSIAN_LETTERS[optIdx] || String(optIdx + 1);
            const isSelected = current.selectedOptionId === option.id;
            const isOptionCorrect = option.id === current.snapshot.correctOptionId;
            const isUserWrong = isSelected && !isOptionCorrect;

            // Card styling matching session-player.tsx
            const cardStyle = cn(
              "w-full p-4 rounded-2xl border-2 text-right transition-all flex items-center gap-3.5",
              isCurrentRevealed
                ? isOptionCorrect
                  ? "border-emerald-500 bg-[var(--pastel-green-soft)] text-emerald-950 dark:text-emerald-100 shadow-[3px_3px_0px_#10b981] cursor-default"
                  : isUserWrong
                  ? "border-red-500 bg-[var(--pastel-red-soft)] text-red-950 dark:text-red-100 shadow-[3px_3px_0px_#ef4444] cursor-default"
                  : "border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)] opacity-60 cursor-default"
                : isSelected
                ? "border-[var(--line-strong)] bg-[var(--pastel-blue-soft)] shadow-[4px_4px_0px_var(--neo-shadow)] -translate-y-0.5 cursor-pointer"
                : "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-cream)] cursor-pointer"
            );

            // Badge styling matching session-player.tsx
            const badgeStyle = cn(
              "w-8 h-8 rounded-xl border-2 flex items-center justify-center font-black text-xs shrink-0 transition-colors",
              isCurrentRevealed
                ? isOptionCorrect
                  ? "bg-emerald-500 text-white border-emerald-600"
                  : isUserWrong
                  ? "bg-red-500 text-white border-red-600"
                  : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)]"
                : isSelected
                ? "bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                : "bg-[var(--surface-cream)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
            );

            return (
              <button
                key={option.id}
                type="button"
                disabled={isCurrentRevealed || pending}
                onClick={() => {
                  if (!isOptionRevealed) {
                    setSpoilerRevealed((prev) => ({ ...prev, [current.id]: true }));
                  } else {
                    handleSelectOption(option.id, current.confidence ?? "sure");
                  }
                }}
                className={cardStyle}
              >
                {/* Persian Letter Badge */}
                <div className={badgeStyle}>
                  {letter}
                </div>

                {/* Option Content */}
                <div
                  className={cn(
                    "flex-1 text-right font-bold text-xs sm:text-sm leading-relaxed",
                    isCurrentRevealed
                      ? isOptionCorrect
                        ? "text-emerald-950 dark:text-emerald-100 font-black"
                        : isUserWrong
                        ? "text-red-950 dark:text-red-100 font-black"
                        : "text-[var(--muted)]"
                      : "text-[var(--ink)]"
                  )}
                >
                  <ContentRenderer blocks={option.content} />
                </div>

                {/* Trailing Status Badge or Radio Indicator (matching session-player.tsx) */}
                {isCurrentRevealed ? (
                  isOptionCorrect ? (
                    <span className="px-2.5 py-1 rounded-xl bg-emerald-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
                      <Check size={14} className="stroke-[3]" />
                      <span>پاسخ صحیح</span>
                    </span>
                  ) : isUserWrong ? (
                    <span className="px-2.5 py-1 rounded-xl bg-red-600 text-white text-[10px] sm:text-xs font-black shrink-0 flex items-center gap-1 shadow-sm">
                      <X size={14} className="stroke-[3]" />
                      <span>انتخاب شما</span>
                    </span>
                  ) : null
                ) : (
                  <div
                    className={cn(
                      "w-6 h-6 rounded-full border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 transition-all",
                      isSelected ? "bg-[var(--ink)]" : "bg-[var(--surface)]"
                    )}
                  >
                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[var(--surface)]" />}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Telegram-Style Shimmer Overlay when Spoiler is Active */}
        {!isOptionRevealed && (
          <div
            onClick={() => setSpoilerRevealed((prev) => ({ ...prev, [current.id]: true }))}
            className="telegram-spoiler-overlay animating p-6 text-center select-none"
            title="برای دیدن گزینه‌ها کلیک کنید"
          >
            <div className="w-12 h-12 rounded-2xl bg-[var(--brand-orange)] border-2 border-[var(--line-strong)] text-white flex items-center justify-center shadow-[3px_3px_0px_var(--neo-shadow)] mx-auto mb-2">
              <Eye size={22} />
            </div>
            <div className="font-black text-sm text-[var(--ink)]">
              گزینه‌ها پوشانده شده‌اند
            </div>
            <p className="text-[11px] font-bold text-[var(--muted)] max-w-sm mx-auto mt-1 leading-relaxed">
              اول پاسخ را در ذهنت بساز، بعد برای دیدن گزینه‌ها کلیک کن.
            </p>
          </div>
        )}
      </div>

      {/* Answer Explanation & Immediate Feedback (Shown after selection) */}
      {isCurrentRevealed && (
        <div className="space-y-3 pt-2">
          {/* Result Alert */}
          <div
            className={cn(
              "p-4 rounded-2xl border-2 shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center gap-3",
              isCorrect
                ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200"
                : "bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200"
            )}
          >
            <div
              className={cn(
                "w-10 h-10 rounded-xl border-2 border-[var(--line-strong)] flex items-center justify-center shrink-0 font-bold",
                isCorrect ? "bg-emerald-500 text-white" : "bg-red-500 text-white"
              )}
            >
              {isCorrect ? <Check size={20} className="stroke-[3]" /> : <X size={20} className="stroke-[3]" />}
            </div>
            <div>
              <strong className="block text-sm font-black">
                {isCorrect ? "آفرین! پاسخ کاملاً درست بود." : "پاسخ نادرست بود. نکتهٔ پاسخ تشریحی را با دقت بخوانید."}
              </strong>
              <span className="text-[11px] font-medium opacity-90">
                {isCorrect
                  ? "تسلط شما بر این مبحث افزایش یافت و موعد مرور بعدی در لایتنر هوشمند ثبت شد."
                  : "این تست در اولویت بالای صف مرور باقی می‌ماند تا در جلسات بعدی مجدداً تثبیت شود."}
              </span>
            </div>
          </div>

          {/* Confidence Action Pills matching session-player.tsx */}
          <div className="flex items-center gap-2.5 pt-1">
            {/* 1. شک دارم */}
            <button
              type="button"
              onClick={() => {
                const nextConf = current.confidence === "doubtful" ? "sure" : "doubtful";
                handleSelectOption(current.selectedOptionId!, nextConf);
              }}
              disabled={pending}
              className={cn(
                "py-2.5 px-3 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex-1 flex items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer",
                current.confidence === "doubtful"
                  ? "bg-amber-100 dark:bg-amber-950/70 text-amber-950 dark:text-amber-200 border-amber-500 shadow-[2px_2px_0px_#f59e0b]"
                  : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
              )}
              title="اگر بین دو یا سه گزینه تردید داشتید"
            >
              <HelpCircle size={15} />
              <span>{current.confidence === "doubtful" ? "با شک پاسخ دادم" : "شک داشتم"}</span>
            </button>

            {/* 2. حدس زدم */}
            <button
              type="button"
              onClick={() => {
                const nextConf = current.confidence === "guess" ? "sure" : "guess";
                handleSelectOption(current.selectedOptionId!, nextConf);
              }}
              disabled={pending}
              className={cn(
                "py-2.5 px-3 rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] flex-1 flex items-center justify-center gap-1.5 text-xs font-black transition-all cursor-pointer",
                current.confidence === "guess"
                  ? "bg-purple-100 dark:bg-purple-950/70 text-purple-950 dark:text-purple-200 border-purple-500 shadow-[2px_2px_0px_#8b5cf6]"
                  : "bg-[var(--surface)] text-[var(--ink)] hover:bg-[var(--surface-2)]"
              )}
              title="اگر بدون اطمینان و حدسی پاسخ دادید"
            >
              <Zap size={15} />
              <span>{current.confidence === "guess" ? "حدسی پاسخ دادم" : "حدس زدم"}</span>
            </button>
          </div>

          {/* Explanation Card */}
          {current.snapshot.explanation && current.snapshot.explanation.length > 0 && (
            <div className="card-neo p-5 bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap border-b border-[var(--line)] pb-2">
                <div className="flex items-center gap-2 text-[var(--brand-orange)] font-black text-xs">
                  <Lightbulb size={16} />
                  <span>پاسخ تشریحی و نکته کلیدی:</span>
                </div>
                {(() => {
                  const optIndex = options.findIndex(
                    (o) => o?.id === current.snapshot.correctOptionId
                  );
                  if (optIndex === -1) return null;
                  const letters = ["الف", "ب", "ج", "د"];
                  const displayLetter = optIndex >= 0 && optIndex < 4 ? letters[optIndex] : String(optIndex + 1);
                  return (
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 border border-emerald-400 font-black text-[11px] flex items-center gap-1.5">
                      <span className="w-4 h-4 rounded-md bg-emerald-600 text-white flex items-center justify-center text-[10px]">
                        {displayLetter}
                      </span>
                      گزینه صحیح: {displayLetter}
                    </span>
                  );
                })()}
              </div>
              <div className="text-xs sm:text-sm font-medium leading-relaxed text-[var(--ink)]">
                <ContentRenderer blocks={displayExplanation} />
              </div>
            </div>
          )}

          {/* Actions: Next, Retry, Finish */}
          <div className="flex items-center gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleRetry}
              disabled={pending}
              className="py-3 px-4 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-1.5 cursor-pointer"
              title="پاک کردن و پاسخ مجدد"
            >
              <RotateCcw size={15} />
              <span>پاسخ مجدد</span>
            </button>

            {selectedIndex < totalQuestions - 1 ? (
              <button
                type="button"
                onClick={() => {
                  setSelectedIndex((prev) => prev + 1);
                }}
                className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>سؤال بعدی</span>
                <ChevronLeft size={18} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setShowFinishConfirm(true)}
                disabled={pending}
                className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
              >
                <CheckCircle2 size={18} />
                <span>پایان مرور و مشاهده کارنامه</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Prev / Next Nav (if question not answered yet) */}
      {!isCurrentRevealed && (
        <div className="flex items-center justify-between gap-3 pt-2">
          <button
            type="button"
            disabled={selectedIndex === 0}
            onClick={() => setSelectedIndex((prev) => Math.max(0, prev - 1))}
            className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <ChevronRight size={16} />
            <span>سؤال قبلی</span>
          </button>

          <button
            type="button"
            disabled={selectedIndex === totalQuestions - 1}
            onClick={() => setSelectedIndex((prev) => Math.min(totalQuestions - 1, prev + 1))}
            className="py-3 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] disabled:opacity-30 disabled:pointer-events-none transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>سؤال بعدی</span>
            <ChevronLeft size={16} />
          </button>
        </div>
      )}

      {/* Finish Confirmation — mirrors the exam flow's confirm dialog so review
          can never be closed by a single accidental tap */}
      {showFinishConfirm && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={() => setShowFinishConfirm(false)}>
          <section
            className="card-neo max-w-md mx-auto p-6 bg-[var(--surface)] space-y-4 text-center"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-finish-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
              <Trophy size={26} />
            </div>
            <h2 id="review-finish-title" className="text-lg font-black text-[var(--ink)]">
              مرور تمام شد؟
            </h2>
            <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
              {questions.filter((q) => !q.selectedOptionId).length > 0
                ? `${questions.filter((q) => !q.selectedOptionId).length} سؤال بدون پاسخ مانده و نزده ثبت می‌شود.`
                : "همهٔ سؤالات این مرور پاسخ داده شده‌اند."}
            </p>

            <div className="space-y-2.5 pt-1 text-right">
              <button
                type="button"
                className="w-full p-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--brand-orange)] text-white shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center gap-3 cursor-pointer disabled:opacity-60"
                disabled={pending}
                onClick={() => void handleFinish()}
              >
                <div className="w-8 h-8 rounded-xl bg-white/20 border-2 border-white/30 flex items-center justify-center shrink-0">
                  {pending ? <RotateCcw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
                </div>
                <div>
                  <strong className="block text-xs font-black">پایان مرور و مشاهده کارنامه</strong>
                  <span className="text-[11px] opacity-90 font-medium">موعد تکرار سؤالات در لایتنر ثبت می‌شود.</span>
                </div>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                onClick={() => setShowFinishConfirm(false)}
              >
                انصراف و ادامهٔ مرور
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
