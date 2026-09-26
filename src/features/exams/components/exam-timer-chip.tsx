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

  // Precision reference timestamps
  const startTimestampRef = useRef<number | null>(null);
  const startSecondsRef = useRef<number>(persistedSeconds);
  const lastWallCheckRef = useRef<number>(Date.now());

  onGapDetectedRef.current = onGapDetected;
  onAutoPauseRef.current = onAutoPause;

  // If sessionId changes, synchronize to new session
  useEffect(() => {
    if (sessionId !== prevSessionIdRef.current) {
      prevSessionIdRef.current = sessionId;
      setTotalSeconds(persistedSeconds);
      startSecondsRef.current = persistedSeconds;
      startTimestampRef.current = isRunning ? performance.now() : null;
      lastWallCheckRef.current = Date.now();
    }
  }, [sessionId, persistedSeconds, isRunning]);

  // Keep totalSeconds smoothly ratcheting upward if database has higher persisted count
  useEffect(() => {
    if (persistedSeconds === 0) {
      setTotalSeconds(0);
      startSecondsRef.current = 0;
      startTimestampRef.current = isRunning ? performance.now() : null;
    } else {
      setTotalSeconds((prev) => {
        const next = Math.max(prev, persistedSeconds);
        if (next > prev) {
          startSecondsRef.current = next;
          startTimestampRef.current = isRunning ? performance.now() : null;
        }
        return next;
      });
    }
  }, [persistedSeconds, isRunning]);

  const totalSecondsRef = useRef(totalSeconds);
  totalSecondsRef.current = totalSeconds;

  // Stable, high-precision 250ms polling (updates sharply on exact 1000ms boundaries, never skips or groups by 2s)
  useEffect(() => {
    if (!isRunning) {
      startTimestampRef.current = null;
      return;
    }

    // Anchor start
    startTimestampRef.current = performance.now();
    startSecondsRef.current = totalSecondsRef.current;
    lastWallCheckRef.current = Date.now();

    const interval = setInterval(() => {
      const now = performance.now();
      const wallNow = Date.now();

      // Check for device sleep/inactivity gap (> 90 seconds)
      const wallDelta = wallNow - lastWallCheckRef.current;
      lastWallCheckRef.current = wallNow;
      if (wallDelta > 90_000) {
        onGapDetectedRef.current?.();
        onAutoPauseRef.current?.();
        return;
      }

      if (startTimestampRef.current !== null) {
        const elapsedSec = Math.floor((now - startTimestampRef.current) / 1000);
        setTotalSeconds(startSecondsRef.current + elapsedSec);
      }
    }, 250);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const wallNow = Date.now();
        const wallDelta = wallNow - lastWallCheckRef.current;
        lastWallCheckRef.current = wallNow;
        if (wallDelta > 90_000) {
          onGapDetectedRef.current?.();
          onAutoPauseRef.current?.();
        } else if (startTimestampRef.current !== null) {
          const now = performance.now();
          const elapsedSec = Math.floor((now - startTimestampRef.current) / 1000);
          setTotalSeconds(startSecondsRef.current + elapsedSec);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
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
      <span className="font-mono tabular-nums">
        {remainingSeconds !== null
          ? formatTimer(remainingSeconds)
          : formatTimer(totalSeconds)}
      </span>
    </div>
  );
});
