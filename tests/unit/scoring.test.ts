import { describe, expect, it } from "vitest";
import { calculateScore } from "@/features/exams/domain/scoring";

describe("calculateScore", () => {
  it("keeps unvisited answers inside unanswered without treating them as wrong", () => {
    const score = calculateScore([
      { result: "correct", visited: true },
      { result: "wrong", visited: true },
      { result: "unanswered", visited: true },
      { result: "unanswered", visited: false },
    ], { penaltyNumerator: 1, penaltyDenominator: 3 });

    expect(score).toMatchObject({ correct: 1, wrong: 1, unanswered: 2, unvisited: 1, total: 4 });
    expect(score.percentage).toBeCloseTo(16.666, 2);
  });

  it("returns null when there is no final data", () => {
    expect(calculateScore([], { penaltyNumerator: 0, penaltyDenominator: 1 }).percentage).toBeNull();
  });
});
