import { describe, it, expect } from "vitest";
import {
  extractQuestionPassageTarget,
  highlightPassageTargets,
} from "../../src/features/exams/domain/passage-underliner";
import type { ContentBlock } from "../../src/features/questions/domain/question-schema";

describe("passage-underliner", () => {
  describe("extractQuestionPassageTarget", () => {
    it("extracts target and paragraph number from question statement", () => {
      const q = 'The underlined word “his” in paragraph 1 refers to .................... .';
      const result = extractQuestionPassageTarget(q);
      expect(result.targets).toEqual(["his"]);
      expect(result.paragraphNumber).toBe(1);
    });

    it("extracts target and paragraph number 3", () => {
      const q = 'The underlined word “initiated” in paragraph 3 is closest in meaning to .................... .';
      const result = extractQuestionPassageTarget(q);
      expect(result.targets).toEqual(["initiated"]);
      expect(result.paragraphNumber).toBe(3);
    });

    it("extracts ordinal paragraph reference (second paragraph)", () => {
      const q = 'In the second paragraph, the word "discreet" is closest in meaning to:';
      const result = extractQuestionPassageTarget(q);
      expect(result.targets).toEqual(["discreet"]);
      expect(result.paragraphNumber).toBe(2);
    });

    it("extracts Persian target and paragraph number", () => {
      const q = 'در بند سوم، زیر واژه «تمرکززدایی» خط کشیده شده است که اشاره به کدام مفهوم دارد؟';
      const result = extractQuestionPassageTarget(q);
      expect(result.targets).toEqual(["تمرکززدایی"]);
      expect(result.paragraphNumber).toBe(3);
    });

    it("returns empty targets when no target word is present", () => {
      const q = "What is the primary purpose of the author in this passage?";
      const result = extractQuestionPassageTarget(q);
      expect(result.targets).toEqual([]);
      expect(result.paragraphNumber).toBeUndefined();
    });
  });

  describe("highlightPassageTargets with paragraph isolation", () => {
    it("strictly isolates highlighting to the specified paragraph and leaves other paragraphs untouched", () => {
      const blocks: ContentBlock[] = [
        {
          type: "text",
          value:
            "Maslow wrote about his theory in early years.\n\nMcGregor credited Maslow on his work in later years.",
        },
      ];

      // Question targets "his" in paragraph 1
      const result = highlightPassageTargets(blocks, ["his"], 1);
      const text = (result[0] as { value: string }).value;

      // Paragraph 1 should have "his" highlighted
      expect(text).toContain("Maslow wrote about <u>his</u> theory");

      // Paragraph 2 MUST NOT have "his" highlighted
      expect(text).toContain("McGregor credited Maslow on his work");
      expect(text).not.toContain("credited Maslow on <u>his</u> work");
      expect(text).not.toContain("¶");
    });

    it("strips stale highlights from other questions (e.g. motivation when testing his)", () => {
      const blocks: ContentBlock[] = [
        {
          type: "text",
          value:
            "Maslow theory of <u>motivation</u> led to his developmental work.\n\nFurther research on <u>motivation</u> expanded.",
        },
      ];

      // Question targets ONLY "his" in paragraph 1
      const result = highlightPassageTargets(blocks, ["his"], 1);
      const text = (result[0] as { value: string }).value;

      // "motivation" tag should be stripped so it does not distract the student
      expect(text).not.toContain("<u>motivation</u>");
      expect(text).toContain("Maslow theory of motivation led to <u>his</u> developmental work.");
      expect(text).not.toContain("¶");
    });

    it("supports Persian target word highlighting in specified paragraph", () => {
      const blocks: ContentBlock[] = [
        {
          type: "text",
          value: "مقدمه کلی بر نظریه‌ها.\n\nدر این راستا، مفهوم تمرکززدایی نقشی محوری در توسعه ساختار دارد.",
        },
      ];

      const result = highlightPassageTargets(blocks, ["تمرکززدایی"], 2);
      const text = (result[0] as { value: string }).value;

      expect(text).toContain("در این راستا، مفهوم <u>تمرکززدایی</u>");
      expect(text).not.toContain("¶");
    });
  });
});
