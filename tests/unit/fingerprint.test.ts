import { describe, expect, it } from "vitest";
import { computeQuestionFingerprint } from "@/features/questions/domain/fingerprint";
import type { ImportQuestion } from "@/features/questions/domain/question-schema";

describe("Question Canonical Fingerprint", () => {
  it("normalizes Persian letters (ي/ی and ك/ک) and spaces", () => {
    const q1: ImportQuestion = {
      key: "q1",
      subject: "پایگاه داده",
      content: [{ type: "text", value: "حاصل ضرب دكارتی" }],
      options: [
        { key: "a", content: [{ type: "text", value: "گزينه ۱" }] },
        { key: "b", content: [{ type: "text", value: "گزينه ۲" }] },
        { key: "c", content: [{ type: "text", value: "گزينه ۳" }] },
        { key: "d", content: [{ type: "text", value: "گزينه ۴" }] },
      ],
      correctOptionKey: "a",
      explanation: [],
      shuffleSafe: true,
    };

    const q2: ImportQuestion = {
      key: "q2",
      subject: "پايگاه داده", // With arabic yeh
      content: [{ type: "text", value: "حاصل ضرب دکارتی" }], // With persian kaf
      options: [
        { key: "a", content: [{ type: "text", value: "گزینه ۱" }] }, // With persian yeh
        { key: "b", content: [{ type: "text", value: "گزینه ۲" }] },
        { key: "c", content: [{ type: "text", value: "گزینه ۳" }] },
        { key: "d", content: [{ type: "text", value: "گزینه ۴" }] },
      ],
      correctOptionKey: "a",
      explanation: [],
      shuffleSafe: true,
    };

    const fp1 = computeQuestionFingerprint(q1);
    const fp2 = computeQuestionFingerprint(q2);

    expect(fp1).toBe(fp2);
  });

  it("produces identical fingerprints for shuffleSafe questions regardless of option order", () => {
    const qA: ImportQuestion = {
      key: "qa",
      subject: "ریاضی",
      content: [{ type: "text", value: "۲ + ۲" }],
      options: [
        { key: "1", content: [{ type: "text", value: "۳" }] },
        { key: "2", content: [{ type: "text", value: "۴" }] },
        { key: "3", content: [{ type: "text", value: "۵" }] },
        { key: "4", content: [{ type: "text", value: "۶" }] },
      ],
      correctOptionKey: "2",
      explanation: [],
      shuffleSafe: true,
    };

    const qB: ImportQuestion = {
      key: "qb",
      subject: "ریاضی",
      content: [{ type: "text", value: "۲ + ۲" }],
      options: [
        { key: "4", content: [{ type: "text", value: "۶" }] },
        { key: "2", content: [{ type: "text", value: "۴" }] },
        { key: "1", content: [{ type: "text", value: "۳" }] },
        { key: "3", content: [{ type: "text", value: "۵" }] },
      ],
      correctOptionKey: "2",
      explanation: [],
      shuffleSafe: true,
    };

    expect(computeQuestionFingerprint(qA)).toBe(computeQuestionFingerprint(qB));
  });
});
