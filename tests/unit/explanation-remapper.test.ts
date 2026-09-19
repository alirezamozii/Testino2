import { describe, expect, it } from "vitest";
import { remapExplanationForShuffle } from "@/features/exams/domain/explanation-remapper";
import type { ContentBlock } from "@/features/questions/domain/question-schema";

describe("remapExplanationForShuffle", () => {
  const originalOptions = [
    { id: "opt-1", content: [{ type: "text" as const, value: "برنامه‌ریزی" }] },
    { id: "opt-2", content: [{ type: "text" as const, value: "سازماندهی" }] },
    { id: "opt-3", content: [{ type: "text" as const, value: "هدایت" }] },
    { id: "opt-4", content: [{ type: "text" as const, value: "کنترل" }] },
  ];

  it("returns original blocks unchanged when options are not shuffled", () => {
    const blocks: ContentBlock[] = [
      { type: "text", value: "گزینه ۱ درست است و گزینه ۲ غلط است." },
    ];
    const result = remapExplanationForShuffle(blocks, originalOptions, originalOptions);
    expect(result[0]).toEqual(blocks[0]);
  });

  it("remaps Persian option references when options are reversed (4, 3, 2, 1)", () => {
    // Reversed order:
    // New index 0 (الف): opt-4 ("کنترل")
    // New index 1 (ب): opt-3 ("هدایت")
    // New index 2 (ج): opt-2 ("سازماندهی")
    // New index 3 (د): opt-1 ("برنامه‌ریزی")
    const shuffledOptions = [
      originalOptions[3],
      originalOptions[2],
      originalOptions[1],
      originalOptions[0],
    ];

    const blocks: ContentBlock[] = [
      {
        type: "text",
        value: "پاسخ صحیح گزینه ۲ است.\nبررسی سایر گزینه‌ها:\n1) گزینه ۱ نادرست است.\n3) گزینه ۳ اشتباه است.\n4) گزینه ۴ رد می‌شود.",
      },
    ];

    const result = remapExplanationForShuffle(blocks, originalOptions, shuffledOptions);
    const text = (result[0] as any).value;

    // Original 2 (opt-2 "سازماندهی") is now at new index 2 -> گزینه ۳ (ج)
    expect(text).toContain("گزینه ۳ (ج)");
    // Original 1 (opt-1 "برنامه‌ریزی") is now at new index 3 -> گزینه ۴ (د)
    expect(text).toContain("۴) [گزینه د]");
    expect(text).toContain("گزینه ۴ (د)");
    // Original 3 (opt-3 "هدایت") is now at new index 1 -> گزینه ۲ (ب)
    expect(text).toContain("۲) [گزینه ب]");
    expect(text).toContain("گزینه ۲ (ب)");
    // Original 4 (opt-4 "کنترل") is now at new index 0 -> گزینه ۱ (الف)
    expect(text).toContain("۱) [گزینه الف]");
    expect(text).toContain("گزینه ۱ (الف)");
  });

  it("remaps English Option references and bullet lists correctly", () => {
    const engOriginal = [
      { id: "o1", content: [{ type: "text" as const, value: "discovery" }] },
      { id: "o2", content: [{ type: "text" as const, value: "source" }] },
      { id: "o3", content: [{ type: "text" as const, value: "cause" }] },
      { id: "o4", content: [{ type: "text" as const, value: "agreement" }] },
    ];

    // Shuffled: o4, o3, o2, o1
    const engShuffled = [engOriginal[3], engOriginal[2], engOriginal[1], engOriginal[0]];

    const blocks: ContentBlock[] = [
      {
        type: "text",
        value: `Step 2: Option 2 is correct.
Step 3: Distractor analysis:
1) discovery: the act of finding something new.
3) cause: a reason that produces an effect.
4) agreement: harmony or concord.`,
      },
    ];

    const result = remapExplanationForShuffle(blocks, engOriginal, engShuffled);
    const text = (result[0] as any).value;

    // Option 2 (source) moved to pos 3 (ج)
    expect(text).toContain("Option 3 (ج) is correct");
    // 1) discovery (o1) moved to pos 4 (د)
    expect(text).toContain("۴) [گزینه د] discovery");
    // 3) cause (o3) moved to pos 2 (ب)
    expect(text).toContain("۲) [گزینه ب] cause");
    // 4) agreement (o4) moved to pos 1 (الف)
    expect(text).toContain("۱) [گزینه الف] agreement");
  });
});
