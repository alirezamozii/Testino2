import { describe, expect, it } from "vitest";
import { calculateWeightedTarget } from "@/features/profiles/domain/score-groups";
import { simulateOverallConfidence } from "@/features/analytics/domain/confidence-simulation";

describe("split study subjects and shared exam scoring", () => {
  const subjects = [
    { name: "اقتصاد خرد", coefficient: 2, targetPercentage: 60, questionCount: 10, scoreGroup: "اقتصاد" },
    { name: "اقتصاد کلان", coefficient: 2, targetPercentage: 40, questionCount: 10, scoreGroup: "اقتصاد" },
    { name: "مدیریت", coefficient: 3, targetPercentage: 70, questionCount: 20 },
  ];

  it("applies a shared coefficient once and combines component targets by question count", () => {
    const result = calculateWeightedTarget(subjects);

    expect(result.groups).toHaveLength(2);
    expect(result.totalCoefficient).toBe(5);
    expect(result.groups.find((group) => group.label === "اقتصاد")?.targetPercentage).toBe(50);
    expect(result.percentage).toBe(62);
  });

  it("keeps micro and macro analytics separate but combines them before overall weighting", () => {
    const attempts = [
      ...Array.from({ length: 10 }, () => ({ subject: "اقتصاد خرد", result: "correct" as const })),
      ...Array.from({ length: 10 }, () => ({ subject: "اقتصاد کلان", result: "wrong" as const })),
      ...Array.from({ length: 20 }, () => ({ subject: "مدیریت", result: "correct" as const })),
    ];

    const result = simulateOverallConfidence(attempts, subjects);

    expect(result.subjects).toHaveLength(3);
    // Economy is 33.3% with negative marking across its 20 questions. It has
    // coefficient 2 once; Management is 100% with coefficient 3.
    expect(result.totals.overallActualPercentage).toBe(73.3);
  });
});
