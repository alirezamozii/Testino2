import { describe, expect, it } from "vitest";
import {
  calculateMastery,
  calculateQualityScore,
  ALGORITHM_VERSION,
} from "@/features/review/domain/mastery";

describe("Mastery Engine v1 (TASK-021.2)", () => {
  it("computes exact quality scores according to specification", () => {
    expect(calculateQualityScore({ result: "wrong", finalizedAt: 100 })).toBe(0);
    expect(calculateQualityScore({ result: "unanswered", finalizedAt: 100 })).toBe(0);
    expect(calculateQualityScore({ result: "correct", confidence: "guess", finalizedAt: 100 })).toBe(0.4);
    expect(calculateQualityScore({ result: "correct", confidence: "doubtful", finalizedAt: 100 })).toBe(0.6);
    expect(calculateQualityScore({ result: "correct", confidence: null, finalizedAt: 100 })).toBe(0.75);
    expect(calculateQualityScore({ result: "correct", confidence: "sure", finalizedAt: 100 })).toBe(1.0);
  });

  it("calculates weighted5 mastery correctly", () => {
    // 5 attempts: wrong, guess, doubtful, null, sure
    // weights: 1, 2, 3, 4, 5 (sum = 15)
    // weighted qualities: 1*0 + 2*0.4 + 3*0.6 + 4*0.75 + 5*1.0
    // = 0 + 0.8 + 1.8 + 3.0 + 5.0 = 10.6
    // score = round(100 * 10.6 / 15) = round(70.666...) = 71
    const attempts = [
      { result: "wrong" as const, finalizedAt: 10 },
      { result: "correct" as const, confidence: "guess" as const, finalizedAt: 20 },
      { result: "correct" as const, confidence: "doubtful" as const, finalizedAt: 30 },
      { result: "correct" as const, confidence: null, finalizedAt: 40 },
      { result: "correct" as const, confidence: "sure" as const, finalizedAt: 50 },
    ];

    const { mastery, algorithmVersion } = calculateMastery(attempts);
    expect(mastery).toBe(71);
    expect(algorithmVersion).toBe(ALGORITHM_VERSION);
  });

  it("returns 0 for empty attempts", () => {
    expect(calculateMastery([]).mastery).toBe(0);
  });

  it("caps to last 5 attempts only", () => {
    // 10 attempts where first 5 were wrong and last 5 are sure
    const attempts = [
      ...Array(5).fill({ result: "wrong" as const, finalizedAt: 10 }),
      ...Array(5).fill({ result: "correct" as const, confidence: "sure" as const, finalizedAt: 20 }),
    ];
    // Only last 5 sure attempts are used
    expect(calculateMastery(attempts).mastery).toBe(100);
  });
});
