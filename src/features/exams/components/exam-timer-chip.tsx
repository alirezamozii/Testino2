"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createActiveTimer, processHeartbeat, HEARTBEAT_INTERVAL_MS } from "../domain/active-timer";

export interface ExamTimerChipProps {
  durationMinutes: number | null;
  persistedSeconds: number;
  isRunning: boolean;
  isRevealed: boolean;
  onGapDetected: () => void;
  onAutoPause: () => void;
  resetTrigger?: unknown;
}

function formatTimer(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mmss = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hrs > 0 ? `${hrs}:${mmss}` : mmss;
}


export const ExamTimerChip = memo(function ExamTimerChip({
  durationMinutes,
  persistedSeconds,
  isRunning,
  isRevealed,
  onGapDetected,
  onAutoPause,
  resetTrigger,
}: ExamTimerChipProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerStateRef = useRef(createActiveTimer());

  // Reset elapsed seconds when resetTrigger (e.g. current question index) changes
  useEffect(() => {
    setElapsedSeconds(0);
    timerStateRef.current = createActiveTimer();
  }, [resetTrigger]);

  useEffect(() => {
    if (!isRunning || isRevealed) return;
    const interval = setInterval(() => {
      const res = processHeartbeat(
        timerStateRef.current,
        performance.now(),
        document.visibilityState === "visible"
      );
      timerStateRef.current = res.nextState;
      if (res.gapDetected || res.shouldPause) {
        onGapDetected();
        onAutoPause();
      } else if (res.deltaMs > 0) {
        setElapsedSeconds((prev) => prev + Math.round(res.deltaMs / 1000));
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRunning, isRevealed, onGapDetected, onAutoPause]);

  const remainingSeconds =
    durationMinutes && durationMinutes > 0
      ? Math.max(0, durationMinutes * 60 - (persistedSeconds + elapsedSeconds))
      : null;
  const isTimeLow = remainingSeconds !== null && remainingSeconds <= 5 * 60;

  return (
    <div
      className={cn(
        "flex items-center gap-1 text-[11px] sm:text-xs font-black bg-[var(--surface)] px-2 sm:px-3 py-1.5 sm:py-2 rounded-xl sm:rounded-2xl border-2 shadow-[2px_2px_0px_var(--neo-shadow)] transition-colors shrink-0",
        isTimeLow
          ? "text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/40 border-red-400"
          : "text-[var(--ink)] bg-[var(--surface)] border-[var(--line-strong)]"
      )}
    >
      <Clock size={13} className={isTimeLow ? "text-red-600" : "text-[var(--brand-orange)]"} />
      <span>
        {remainingSeconds !== null
          ? formatTimer(remainingSeconds)
          : formatTimer(persistedSeconds + elapsedSeconds)}
      </span>
    </div>
  );
});
