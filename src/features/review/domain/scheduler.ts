export interface ReviewAttempt {
  id: string;
  result: "correct" | "wrong" | "unanswered";
  visited: boolean;
  confidence: "sure" | "doubtful" | "guess" | null;
  finalizedAt: number;
}

export interface ReviewState {
  stableStreak: number;
  intervalDays: number;
}

const DAY = 86_400_000;
const INTERVALS = [1, 3, 7, 14, 30] as const;

export function scheduleReview(attempt: ReviewAttempt, previous?: ReviewState) {
  if (!attempt.visited) return null;
  if (attempt.result === "wrong" || attempt.result === "unanswered") {
    return { priority: attempt.result === "wrong" ? 0 : 1, stableStreak: 0, intervalDays: 0, dueAt: attempt.finalizedAt };
  }
  if (attempt.confidence === "doubtful") {
    return { priority: 2, stableStreak: 0, intervalDays: 1, dueAt: attempt.finalizedAt + DAY };
  }
  if (attempt.confidence === "guess") {
    return { priority: 2, stableStreak: 0, intervalDays: 1, dueAt: attempt.finalizedAt + DAY };
  }
  if (attempt.confidence === null) {
    const intervalDays = Math.min(3, previous?.intervalDays || 1);
    return { priority: 3, stableStreak: previous?.stableStreak || 0, intervalDays, dueAt: attempt.finalizedAt + intervalDays * DAY };
  }
  const stableStreak = (previous?.stableStreak || 0) + 1;
  const intervalDays = INTERVALS[Math.min(stableStreak - 1, INTERVALS.length - 1)];
  return { priority: 3, stableStreak, intervalDays, dueAt: attempt.finalizedAt + intervalDays * DAY };
}
