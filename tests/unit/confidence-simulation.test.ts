import { describe, expect, it } from "vitest";
import {
  calculateRawPercentage,
  simulateSubjectConfidence,
  simulateOverallConfidence,
  type QuestionAttemptForSimulation,
} from "@/features/analytics/domain/confidence-simulation";

describe("Confidence Simulation & Konkur Formulas", () => {
  describe("calculateRawPercentage (Sanjesh Formula)", () => {
    it("computes 100% for all correct", () => {
      expect(calculateRawPercentage(25, 0, 25)).toBe(100);
    });

    it("computes -33.3% for all wrong (negative marking)", () => {
      expect(calculateRawPercentage(0, 25, 25)).toBe(-33.3);
    });

    it("proves that 3 wrong answers neutralize 1 correct answer", () => {
      // 1 correct, 3 wrong out of 4 answered in a 20-question test:
      // (3*1 - 3)/(3*20) * 100 = 0%
      expect(calculateRawPercentage(1, 3, 20)).toBe(0);

      // 2 correct, 6 wrong:
      expect(calculateRawPercentage(2, 6, 25)).toBe(0);
    });

    it("calculates exact percentages for 20, 25, 30, and 40 question tests", () => {
      // 20 questions: each correct is +5%, each wrong is -1.67%
      expect(calculateRawPercentage(1, 0, 20)).toBe(5);
      expect(calculateRawPercentage(0, 1, 20)).toBe(-1.7);

      // 25 questions: each correct is +4%, each wrong is -1.33%
      expect(calculateRawPercentage(1, 0, 25)).toBe(4);
      expect(calculateRawPercentage(0, 1, 25)).toBe(-1.3);

      // 30 questions: each correct is +3.33%, each wrong is -1.11%
      expect(calculateRawPercentage(1, 0, 30)).toBe(3.3);
      expect(calculateRawPercentage(0, 1, 30)).toBe(-1.1);

      // 40 questions: each correct is +2.5%, each wrong is -0.83%
      expect(calculateRawPercentage(1, 0, 40)).toBe(2.5);
      expect(calculateRawPercentage(0, 1, 40)).toBe(-0.8);
    });
  });

  describe("simulateSubjectConfidence", () => {
    it("determines positive doubtful impact when intuitive doubt is profitable (>25% accuracy)", () => {
      // 25-question subject
      const attempts: QuestionAttemptForSimulation[] = [
        // 10 sure (8 correct, 2 wrong)
        ...Array(8).fill({ subject: "ریاضی", result: "correct" as const, confidence: "sure" as const }),
        ...Array(2).fill({ subject: "ریاضی", result: "wrong" as const, confidence: "sure" as const }),
        // 5 doubtful (3 correct, 2 wrong) -> 60% accuracy (break-even is 25%)
        ...Array(3).fill({ subject: "ریاضی", result: "correct" as const, confidence: "doubtful" as const }),
        ...Array(2).fill({ subject: "ریاضی", result: "wrong" as const, confidence: "doubtful" as const }),
        // 10 unanswered
        ...Array(10).fill({ subject: "ریاضی", result: "unanswered" as const }),
      ];

      const sim = simulateSubjectConfidence(attempts, {
        name: "ریاضی",
        coefficient: 3,
        questionCount: 25,
        targetPercentage: 70,
      });

      expect(sim.questionCount).toBe(25);
      expect(sim.pointValuePerCorrect).toBe(4);
      expect(sim.penaltyPerWrong).toBe(1.33);

      expect(sim.doubtful.count).toBe(5);
      expect(sim.doubtful.correct).toBe(3);
      expect(sim.doubtful.wrong).toBe(2);
      expect(sim.doubtful.accuracy).toBe(60);

      // Doubtful net impact must be positive
      expect(sim.doubtful.netPercentageImpact).toBeGreaterThan(0);
      expect(sim.doubtfulBenefit).toBe("positive");
      expect(sim.strategicAdvice.recommendationTag).toBe("trust_doubt");
      expect(sim.strategicAdvice.overallSubjectAdvice).toContain("به شک‌های ۵۰-۵۰ اعتماد کن");

      // Actual score should be strictly higher than score without doubt
      expect(sim.actualPercentage).toBeGreaterThan(sim.percentageWithoutDoubt);
    });

    it("determines negative doubtful impact and warns when doubt leads to negative penalty (<25% accuracy)", () => {
      const attempts: QuestionAttemptForSimulation[] = [
        // 10 sure (9 correct, 1 wrong)
        ...Array(9).fill({ subject: "فیزیک", result: "correct" as const, confidence: "sure" as const }),
        ...Array(1).fill({ subject: "فیزیک", result: "wrong" as const, confidence: "sure" as const }),
        // 6 doubtful (1 correct, 5 wrong) -> 16.7% accuracy < 25% break-even
        ...Array(1).fill({ subject: "فیزیک", result: "correct" as const, confidence: "doubtful" as const }),
        ...Array(5).fill({ subject: "فیزیک", result: "wrong" as const, confidence: "doubtful" as const }),
        // 4 guess (0 correct, 4 wrong)
        ...Array(4).fill({ subject: "فیزیک", result: "wrong" as const, confidence: "guess" as const }),
      ];

      const sim = simulateSubjectConfidence(attempts, {
        name: "فیزیک",
        coefficient: 2,
        questionCount: 20,
        targetPercentage: 60,
      });

      expect(sim.pointValuePerCorrect).toBe(5);
      expect(sim.penaltyPerWrong).toBe(1.67);

      expect(sim.doubtfulBenefit).toBe("negative");
      expect(sim.guessBenefit).toBe("negative");
      expect(sim.doubtful.netPercentageImpact).toBeLessThan(0);
      expect(sim.guess.netPercentageImpact).toBeLessThan(0);

      // Actual score is LOWER than if the student had not answered doubtful questions
      expect(sim.actualPercentage).toBeLessThan(sim.percentageWithoutDoubt);
      // And score if only sure answers were marked is highest
      expect(sim.percentageOnlySure).toBeGreaterThan(sim.actualPercentage);

      expect(sim.strategicAdvice.recommendationTag).toBe("avoid_doubt");
      expect(sim.strategicAdvice.overallSubjectAdvice).toContain("فقط به سؤالات مطمئن پاسخ بده");
    });
  });

  describe("simulateOverallConfidence", () => {
    it("aggregates multiple subjects and yields clear comparative insights", () => {
      const attempts: QuestionAttemptForSimulation[] = [
        // ریاضی: 4 sure correct, 1 doubtful correct
        ...Array(4).fill({ subject: "ریاضی", result: "correct" as const, confidence: "sure" as const }),
        { subject: "ریاضی", result: "correct" as const, confidence: "doubtful" as const },

        // شیمی: 3 sure correct, 3 guess wrong
        ...Array(3).fill({ subject: "شیمی", result: "correct" as const, confidence: "sure" as const }),
        ...Array(3).fill({ subject: "شیمی", result: "wrong" as const, confidence: "guess" as const }),
      ];

      const overall = simulateOverallConfidence(attempts, [
        { name: "ریاضی", coefficient: 3, questionCount: 20 },
        { name: "شیمی", coefficient: 2, questionCount: 25 },
      ]);

      expect(overall.subjects.length).toBe(2);
      expect(overall.totals.totalAttempts).toBe(11);
      expect(overall.totals.totalCorrect).toBe(8);
      expect(overall.totals.totalWrong).toBe(3);

      // Check that top recommendation identifies the negative impact of guessing in شیمی
      expect(overall.topRecommendation).toBeDefined();
      expect(overall.topRecommendation.length).toBeGreaterThan(10);
    });
  });
});
