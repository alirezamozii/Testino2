import { describe, it, expect } from "vitest";
import {
  computePassageQuestions,
  transformPassageContent,
} from "@/features/exams/domain/cloze-passage-transformer";
import type { SessionQuestion } from "@/database/app-database";
import type { ContentBlock } from "@/features/questions/domain/question-schema";

function createMockQuestion(
  id: string,
  externalKey: string,
  groupId?: string,
  groupContent?: ContentBlock[]
): SessionQuestion {
  return {
    id,
    sessionId: "sess-1",
    ordinal: 1,
    selectedOptionId: null,
    confidence: null,
    visited: false,
    activeMs: 0,
    optionOrder: [],
    snapshot: {
      id,
      externalKey,
      subject: "ادبیات",
      chapter: null,
      topic: null,
      groupId: groupId ?? null,
      groupContent: groupContent ?? null,
      content: [{ type: "text", value: "Stem" }],
      options: [],
      correctOptionId: "opt-1",
      explanation: [],
      status: "published",
      shuffleSafe: true,
      createdAt: 0,
      source: { kind: "EXAM", year: 1402, title: "کنکور" },
    },
  };
}

describe("cloze-passage-transformer", () => {
  it("computes passage questions in correct order by externalKey or sortKey", () => {
    const mockQuestions: SessionQuestion[] = [
      createMockQuestion("q1", "102", "group-alpha"),
      createMockQuestion("q2", "101", "group-alpha"),
      createMockQuestion("q3", "103", "other-group"),
    ];

    const result = computePassageQuestions(mockQuestions, "group-alpha");
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("q2"); // 101 comes before 102
    expect(result[1].id).toBe("q1");
    expect(result[0].qIdx).toBe(1);
    expect(result[1].qIdx).toBe(0);
  });

  it("transforms cloze passage placeholders with sequential question indices", () => {
    const groupContent: ContentBlock[] = [
      { type: "text", value: "This is a passage with blank (76) and another blank (77)." },
    ];

    const q1 = {
      ...createMockQuestion("q1", "76", "cloze-1", groupContent),
      qIdx: 4, // 5th question in exam (index 4 -> label 5)
    };
    const q2 = {
      ...createMockQuestion("q2", "77", "cloze-1"),
      qIdx: 5, // 6th question in exam (index 5 -> label 6)
    };

    const passageQuestions = [q1, q2];

    const transformed = transformPassageContent(q1, true, passageQuestions);
    expect(transformed).toBeDefined();
    const firstBlock = transformed![0];
    expect(firstBlock.type).toBe("text");
    if (firstBlock.type === "text") {
      expect(firstBlock.value).toContain("(5)");
      expect(firstBlock.value).toContain("(6)");
    }
  });

  it("returns undefined when question has no groupContent", () => {
    const question = {
      ...createMockQuestion("q1", "1"),
      qIdx: 0,
    };

    expect(transformPassageContent(question, false, [])).toBeUndefined();
  });
});
