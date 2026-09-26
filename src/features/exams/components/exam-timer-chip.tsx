"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { createActiveTimer, processHeartbeat, HEARTBEAT_INTERVAL_MS } from "../domain/active-timer";

export interface ExamTimerChipProps {
  sessionId?: string;
  durationMinutes: number | null;
  persistedSeconds: number;
  isRunning: boolean;
  isRevealed: boolean;
  onGapDetected: () => void;
  onAutoPause: () => void;
}

function formatTimer(totalSec: number): string {
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const mmss = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hrs > 0 ? `${hrs}:${mmss}` : mmss;
}

export const ExamTimerChip = memo(function ExamTimerChip({
  sessionId,
  durationMinutes,
  persistedSeconds,
  isRunning,
  isRevealed,
  onGapDetected,
  onAutoPause,
}: ExamTimerChipProps) {
  const [totalSeconds, setTotalSeconds] = useState(persistedSeconds);
  const timerStateRef = useRef(createActiveTimer());
  const prevSessionIdRef = useRef(sessionId);

  // If sessionId changes, synchronize to new session
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionId;
      setTotalSeconds(persistedSeconds);
      timerStateRef.current = createActiveTimer();
    }
  }, [sessionId, persistedSeconds]);

  // Keep totalSeconds smoothly ratcheting upward if database has higher persisted count
  useEffect(() => {
    setTotalSeconds((prev) => Math.max(prev, persistedSeconds));
  }, [persistedSeconds]);

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
        setTotalSeconds((prev) => prev + Math.round(res.deltaMs / 1000));
      }
    }, HEARTBEAT_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [isRunning, isRevealed, onGapDetected, onAutoPause]);

  const remainingSeconds =
    durationMinutes && durationMinutes > 0
      ? Math.max(0, durationMinutes * 60 - totalSeconds)
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
          : formatTimer(totalSeconds)}
      </span>
    </div>
  );
});
