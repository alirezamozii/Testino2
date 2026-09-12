import { describe, expect, it } from "vitest";
import { buildSessionExport, sessionAnalysisExportSchema } from "@/features/ai/domain/export-builder";
import type { SessionView } from "@/database/app-database";

describe("AI & Session Performance Export (TASK-026)", () => {
  const sampleSession: SessionView = {
    id: "sess-secret-uuid-12345",
    state: "FINISHED",
    currentOrdinal: 2,
    questions: [
      {
        id: "sq-1",
        sessionId: "sess-secret-uuid-12345",
        ordinal: 0,
        selectedOptionId: "opt-1",
        confidence: "sure",
        visited: true,
        activeMs: 45000,
        optionOrder: ["opt-1", "opt-2", "opt-3", "opt-4"],
        snapshot: {
          id: "q-db-secret-uuid-1",
          externalKey: "ext-q1",
          subject: "فیزیک",
          chapter: "حرکت‌شناسی",
          topic: "حرکت با شتاب ثابت",
          content: [{ type: "text", value: "سرعت اولیه چقدر است؟" }],
          options: [
            { id: "opt-1", key: "1", content: [{ type: "text", value: "۱۰ متر بر ثانیه" }] },
            { id: "opt-2", key: "2", content: [{ type: "text", value: "۲۰ متر بر ثانیه" }] },
            { id: "opt-3", key: "3", content: [{ type: "text", value: "۳۰ متر بر ثانیه" }] },
            { id: "opt-4", key: "4", content: [{ type: "text", value: "۴۰ متر بر ثانیه" }] },
          ],
          correctOptionId: "opt-1", // CORRECT & SURE
          explanation: [{ type: "text", value: "با استفاده از معادله سرعت-زمان." }],
          status: "published",
          shuffleSafe: true,
          createdAt: 1000,
        },
      },
      {
        id: "sq-2",
        sessionId: "sess-secret-uuid-12345",
        ordinal: 1,
        selectedOptionId: "opt-2",
        confidence: "doubtful",
        visited: true,
        activeMs: 60000,
        optionOrder: ["opt-1", "opt-2", "opt-3", "opt-4"],
        snapshot: {
          id: "q-db-secret-uuid-2",
          externalKey: "ext-q2",
          subject: "زبان انگلیسی",
          chapter: "ریدینگ",
          topic: "درک مطلب",
          groupId: "group-secret-uuid-1",
          groupContent: [{ type: "text", value: "متن ریدینگ عمومی کنکور..." }],
          groupKind: "reading",
          content: [{ type: "text", value: "What is the author's main point?" }],
          options: [
            { id: "opt-1", key: "1", content: [{ type: "text", value: "Point A" }] },
            { id: "opt-2", key: "2", content: [{ type: "text", value: "Point B" }] },
            { id: "opt-3", key: "3", content: [{ type: "text", value: "Point C" }] },
            { id: "opt-4", key: "4", content: [{ type: "text", value: "Point D" }] },
          ],
          correctOptionId: "opt-1", // WRONG (user chose opt-2)
          explanation: [{ type: "text", value: "The passage states in paragraph 2..." }],
          status: "published",
          shuffleSafe: false,
          createdAt: 2000,
        },
      },
    ],
  };

  it("exports full session and strictly validates against Section 7 session-analysis schema", () => {
    const exported = buildSessionExport(sampleSession, "full");
    const validated = sessionAnalysisExportSchema.safeParse(exported);
    expect(validated.success).toBe(true);

    expect(exported.exportType).toBe("session-analysis");
    expect(exported.scope).toBe("full");
    expect(exported.session.summary.total).toBe(2);
    expect(exported.session.summary.correct).toBe(1);
    expect(exported.session.summary.wrong).toBe(1);
    expect(exported.questions).toHaveLength(2);
    expect(exported.attempts).toHaveLength(2);

    // Question alias & option key checks
    expect(exported.questions[0].alias).toBe("q1");
    expect(exported.questions[0].options[0].key).toBe("a");
    expect(exported.attempts[0].result).toBe("correct");

    // Group alias resolution checks
    expect(exported.questions[1].groupAlias).toBe("group-1");
    expect(exported.groups).toHaveLength(1);
    expect(exported.groups[0].alias).toBe("group-1");
    expect(exported.groups[0].kind).toBe("reading");
  });

  it("filters to mistakes (wrong/doubtful/unanswered) when scope is 'mistakes'", () => {
    const exported = buildSessionExport(sampleSession, "mistakes");
    expect(exported.scope).toBe("mistakes");
    // Only the wrong question should be in the exported questions/attempts
    expect(exported.questions).toHaveLength(1);
    expect(exported.attempts).toHaveLength(1);
    expect(exported.questions[0].subject).toBe("زبان انگلیسی");
    expect(exported.attempts[0].result).toBe("wrong");
    // Summary retains full session stats to preserve true denominator
    expect(exported.session.summary.total).toBe(2);
  });

  it("ensures no internal secret tokens or database UUIDs are leaked into export", () => {
    const exported = buildSessionExport(sampleSession, "full");
    const jsonStr = JSON.stringify(exported);

    expect(jsonStr).not.toContain("sess-secret-uuid-12345");
    expect(jsonStr).not.toContain("q-db-secret-uuid-1");
    expect(jsonStr).not.toContain("q-db-secret-uuid-2");
    expect(jsonStr).not.toContain("group-secret-uuid-1");
    expect(jsonStr).not.toContain("token");
    expect(jsonStr).not.toContain("password");
  });
});
