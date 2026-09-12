export const ALGORITHM_VERSION = 1;

export interface MasteryAttempt {
  result: "correct" | "wrong" | "unanswered";
  confidence?: "sure" | "doubtful" | "guess" | null;
  activeMs?: number;
  finalizedAt: number;
}

export function calculateQualityScore(attempt: MasteryAttempt): number {
  if (attempt.result === "wrong" || attempt.result === "unanswered") {
    return 0;
  }
  // If correct:
  if (attempt.confidence === "guess") return 0.4;
  if (attempt.confidence === "doubtful") return 0.6;
  if (attempt.confidence === null || attempt.confidence === undefined) return 0.75;
  if (attempt.confidence === "sure") return 1.0;
  return 0.75;
}

/**
 * Calculates mastery level (0..100) based on up to 5 most recent attempts
 * ordered from oldest to newest with weights 1..n.
 */
export function calculateMastery(
  recentAttempts: MasteryAttempt[]
): { mastery: number; algorithmVersion: number } {
  if (!recentAttempts.length) {
    return { mastery: 0, algorithmVersion: ALGORITHM_VERSION };
  }

  // Take at most 5 recent attempts
  const attempts = recentAttempts.slice(-5);
  let totalWeightedQuality = 0;
  let totalWeight = 0;

  for (let i = 0; i < attempts.length; i++) {
    const weight = i + 1; // 1..n
    const quality = calculateQualityScore(attempts[i]);
    totalWeightedQuality += weight * quality;
    totalWeight += weight;
  }

  const mastery = Math.round((100 * totalWeightedQuality) / totalWeight);
  return {
    mastery: Math.min(100, Math.max(0, mastery)),
    algorithmVersion: ALGORITHM_VERSION,
  };
}
