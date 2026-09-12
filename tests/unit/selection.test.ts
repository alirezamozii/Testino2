import { describe, expect, it } from "vitest";
import { selectQuestions, type QuestionCandidate } from "@/features/exams/domain/selection";

describe("Question Selection Engine", () => {
  const sampleQuestions: QuestionCandidate[] = [
    { id: "q1", subject: "مدیریت", groupId: null, status: "published", hasAttempts: false },
    { id: "q2", subject: "مدیریت", groupId: null, status: "published", hasAttempts: true, lastResult: "correct" },
    { id: "q3", subject: "مدیریت", groupId: null, status: "published", hasAttempts: true, lastResult: "wrong" },
    { id: "q4", subject: "آمار", groupId: null, status: "published", hasAttempts: true, lastResult: "wrong", dueAt: 1000 },
    { id: "q5", subject: "آمار", groupId: null, status: "draft", hasAttempts: false }, // draft should never be selected
  ];

  it("filters by mode: new (only questions without attempts)", () => {
    const outcome = selectQuestions(sampleQuestions, { mode: "new", requestedCount: 10 });
    expect(outcome.selectedIds).toEqual(["q1"]);
    expect(outcome.actualCount).toBe(1);
  });

  it("filters by mode: wrong (only questions answered wrong)", () => {
    const outcome = selectQuestions(sampleQuestions, { mode: "wrong", requestedCount: 10 });
    expect(outcome.selectedIds).toContain("q3");
    expect(outcome.selectedIds).toContain("q4");
    expect(outcome.selectedIds).not.toContain("q2");
    expect(outcome.selectedIds).not.toContain("q1");
  });

  it("filters by mode: due (only questions with dueAt <= now)", () => {
    const outcome = selectQuestions(sampleQuestions, { mode: "due", requestedCount: 10, now: 1500 });
    expect(outcome.selectedIds).toEqual(["q4"]);
  });

  it("never includes draft questions in pool", () => {
    const outcome = selectQuestions(sampleQuestions, { mode: "random", requestedCount: 10 });
    expect(outcome.selectedIds).not.toContain("q5");
  });

  it("preserves group integrity and reports overshoot warning", () => {
    const groupQuestions: QuestionCandidate[] = [
      { id: "g1", subject: "زبان", groupId: "group-reading", status: "published", hasAttempts: false },
      { id: "g2", subject: "زبان", groupId: "group-reading", status: "published", hasAttempts: false },
      { id: "g3", subject: "زبان", groupId: "group-reading", status: "published", hasAttempts: false },
    ];

    const outcome = selectQuestions(groupQuestions, { mode: "random", requestedCount: 1 });
    // All 3 members of the group must be included
    expect(outcome.selectedIds).toHaveLength(3);
    expect(outcome.overshootCount).toBe(2);
    expect(outcome.warnings.some((w) => w.includes("یکپارچگی سؤالات گروهی"))).toBe(true);
  });

  it("produces identical selection for identical seed", () => {
    const outcome1 = selectQuestions(sampleQuestions, { mode: "random", requestedCount: 3, seed: "test-seed-42" });
    const outcome2 = selectQuestions(sampleQuestions, { mode: "random", requestedCount: 3, seed: "test-seed-42" });
    expect(outcome1.selectedIds).toEqual(outcome2.selectedIds);
  });

  it("never includes questions belonging to incomplete groups in exam pool", () => {
    const questionsWithIncomplete: QuestionCandidate[] = [
      { id: "inc1", subject: "زبان", groupId: "group-incomplete", isGroupIncomplete: true, status: "published", hasAttempts: false },
      { id: "valid1", subject: "زبان", groupId: null, status: "published", hasAttempts: false },
    ];
    const outcome = selectQuestions(questionsWithIncomplete, { mode: "random", requestedCount: 10 });
    expect(outcome.selectedIds).toEqual(["valid1"]);
    expect(outcome.selectedIds).not.toContain("inc1");
  });
});
