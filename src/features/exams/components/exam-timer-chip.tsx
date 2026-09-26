"use client";

import React, { memo, useEffect, useRef, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ExamTimerChipProps {
  sessionId?: string;
  durationMinutes: number | null;
  persistedSeconds: number;
  isRunning: boolean;
  onGapDetected?: () => void;
  onAutoPause?: () => void;
}

function formatTimer(totalSec: number): string {
  const safeSec = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(safeSec / 3600);
  const mins = Math.floor((safeSec % 3600) / 60);
  const secs = safeSec % 60;
  const mmss = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  return hrs > 0 ? `${hrs}:${mmss}` : mmss;
}

export const ExamTimerChip = memo(function ExamTimerChip({
  sessionId,
  durationMinutes,
  persistedSeconds,
  isRunning,
  onGapDetected,
  onAutoPause,
}: ExamTimerChipProps) {
  const [totalSeconds, setTotalSeconds] = useState(persistedSeconds);
  const prevSessionIdRef = useRef(sessionId);
  const onGapDetectedRef = useRef(onGapDetected);
  const onAutoPauseRef = useRef(onAutoPause);
  const lastTickRef = useRef<number | null>(null);

  onGapDetectedRef.current = onGapDetected;
  onAutoPauseRef.current = onAutoPause;

  // If sessionId changes, synchronize to new session
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionId;
      setTotalSeconds(persistedSeconds);
      lastTickRef.current = null;
    }
  }, [sessionId, persistedSeconds]);

  // Keep totalSeconds smoothly ratcheting upward if database has higher persisted count
  useEffect(() => {
    setTotalSeconds((prev) => Math.max(prev, persistedSeconds));
  }, [persistedSeconds]);

  // High-efficiency, stable 1-second monotonic tick (1 Hz, near-zero CPU)
  useEffect(() => {
    if (!isRunning) {
      lastTickRef.current = null;
      return;
    }

    lastTickRef.current = performance.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const last = lastTickRef.current ?? now;
      const deltaMs = now - last;
      lastTickRef.current = now;

      // Only if device was suspended or in deep sleep for > 90 seconds
      if (deltaMs > 90_000) {
        onGapDetectedRef.current?.();
        onAutoPauseRef.current?.();
        return;
      }

      // Normal tick: increment by elapsed seconds (typically 1s)
      const secDelta = Math.max(1, Math.round(deltaMs / 1000));
      setTotalSeconds((prev) => prev + secDelta);
    }, 1000);

    return () => clearInterval(interval);
  }, [isRunning]);

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
