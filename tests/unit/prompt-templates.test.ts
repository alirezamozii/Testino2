import { describe, it, expect } from "vitest";
import { buildSubjectPrompt } from "@/features/prompts/domain/prompt-templates";

describe("buildSubjectPrompt", () => {
  it("generates standard prompt for normal question range", () => {
    const prompt = buildSubjectPrompt({
      subjectId: "universal",
      startQ: 1,
      endQ: 30,
    });
    expect(prompt).toContain("سؤالات شماره 1 تا 30 (مجموعاً 30 سؤال)");
    expect(prompt).toContain("تمام 30 سؤال از شماره 1 تا 30");
  });

  it("handles 0 to 0 mode correctly as all questions in file without resetting to defaults", () => {
    const prompt = buildSubjectPrompt({
      subjectId: "universal",
      startQ: 0,
      endQ: 0,
    });
    // Must contain the user's exact required phrasing for 0 to 0 mode
    expect(prompt).toContain("هر سوالی که تو فایلی که بهت دادم می‌بینی");
    // Must NOT contain 0 to 0 broken range phrasing like "سؤالات شماره 0 تا 0 (مجموعاً 1 سؤال)"
    expect(prompt).not.toContain("سؤالات شماره 0 تا 0");
    expect(prompt).not.toContain("تمام 1 سؤال از شماره 0 تا 0");
    // Must contain the all questions directives
    expect(prompt).toContain("دستورالعمل استخراج تمامی سؤالات آزمون سراسری");
    expect(prompt).toContain("هر سوالی که تو فایلی که بهت دادم می‌بینی مربوط به درس");
  });

  it("handles 0 to 0 mode for AI source and Other source", () => {
    const aiPrompt = buildSubjectPrompt({
      subjectId: "universal",
      sourceKind: "AI",
      startQ: 0,
      endQ: 0,
    });
    expect(aiPrompt).toContain("هر سوالی که تو فایلی که بهت دادم می‌بینی");

    const bookPrompt = buildSubjectPrompt({
      subjectId: "universal",
      sourceKind: "BOOK",
      startQ: 0,
      endQ: 0,
    });
    expect(bookPrompt).toContain("هر سوالی که تو فایلی که بهت دادم می‌بینی");
  });
});
