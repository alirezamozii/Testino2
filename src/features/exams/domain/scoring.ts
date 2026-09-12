export interface ScoredAttempt {
  result: "correct" | "wrong" | "unanswered";
  visited: boolean;
}

export interface ScorePolicy {
  penaltyNumerator: number;
  penaltyDenominator: number;
}

export function calculateScore(attempts: ScoredAttempt[], policy: ScorePolicy) {
  const correct = attempts.filter((attempt) => attempt.result === "correct").length;
  const wrong = attempts.filter((attempt) => attempt.result === "wrong").length;
  const unanswered = attempts.length - correct - wrong;
  const unvisited = attempts.filter((attempt) => !attempt.visited).length;
  const total = attempts.length;
  const netPoints = correct - wrong * (policy.penaltyNumerator / policy.penaltyDenominator);
  return {
    correct,
    wrong,
    unanswered,
    unvisited,
    total,
    netPoints,
    percentage: total === 0 ? null : (netPoints / total) * 100,
  };
}
