import { describe, expect, it } from "vitest";
import { parseImportJson } from "@/features/questions/domain/importer";

describe("Question Groups & Importer", () => {
  it("marks a group as complete when all questionKeys are present", () => {
    const payload = {
      schemaVersion: "1.0",
      defaults: { subject: "زبان عمومی" },
      groups: [
        {
          key: "reading-1",
          kind: "reading",
          content: [{ type: "text", value: "متن درک مطلب نمونه." }],
          questionKeys: ["q1", "q2"],
        },
      ],
      questions: [
        {
          key: "q1",
          content: [{ type: "text", value: "سؤال ۱ درک مطلب" }],
          options: [
            { key: "a", content: [{ type: "text", value: "۱" }] },
            { key: "b", content: [{ type: "text", value: "۲" }] },
            { key: "c", content: [{ type: "text", value: "۳" }] },
            { key: "d", content: [{ type: "text", value: "۴" }] },
          ],
          correctOptionKey: "a",
        },
        {
          key: "q2",
          content: [{ type: "text", value: "سؤال ۲ درک مطلب" }],
          options: [
            { key: "a", content: [{ type: "text", value: "۱" }] },
            { key: "b", content: [{ type: "text", value: "۲" }] },
            { key: "c", content: [{ type: "text", value: "۳" }] },
            { key: "d", content: [{ type: "text", value: "۴" }] },
          ],
          correctOptionKey: "b",
        },
      ],
    };

    const parsed = parseImportJson(JSON.stringify(payload));
    expect(parsed.valid).toHaveLength(2);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].status).toBe("complete");
    expect(parsed.groups[0].missingKeys).toHaveLength(0);
  });

  it("marks a group as incomplete and flags a warning when member questions are missing", () => {
    const payload = {
      schemaVersion: "1.0",
      defaults: { subject: "زبان عمومی" },
      groups: [
        {
          key: "reading-1",
          kind: "reading",
          content: [{ type: "text", value: "متن درک مطلب نمونه." }],
          questionKeys: ["q1", "q2_missing"],
        },
      ],
      questions: [
        {
          key: "q1",
          content: [{ type: "text", value: "سؤال ۱" }],
          options: [
            { key: "a", content: [{ type: "text", value: "۱" }] },
            { key: "b", content: [{ type: "text", value: "۲" }] },
            { key: "c", content: [{ type: "text", value: "۳" }] },
            { key: "d", content: [{ type: "text", value: "۴" }] },
          ],
          correctOptionKey: "a",
        },
      ],
    };

    const parsed = parseImportJson(JSON.stringify(payload));
    expect(parsed.valid).toHaveLength(1); // q1 is valid and imported
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].status).toBe("incomplete");
    expect(parsed.groups[0].missingKeys).toContain("q2_missing");
    expect(parsed.issues.some((issue) => issue.isWarning && issue.path === "groups")).toBe(true);
  });

  it("resolves question numbers (sourceNumber) to generated system keys seamlessly without false warnings", () => {
    // Exactly replicating AI output: no explicit 'key', but sourceNumber: '8', '9', '10' and questionKeys: ['8', '9', '10']
    const payload = {
      schemaVersion: "1.0",
      defaults: {
        subject: "زبان عمومی و تخصصی",
        source: {
          kind: "EXAM",
          title: "کنکور کارشناسی ارشد مدیریت سال 1405",
          year: 1405,
        },
      },
      groups: [
        {
          key: "group-cloze-1",
          kind: "cloze",
          subject: "زبان عمومی و تخصصی",
          content: "Modern psychologists have many interests...",
          questionKeys: ["8", "9", "10"],
        },
      ],
      questions: [
        {
          sourceNumber: "8",
          groupKey: "group-cloze-1",
          chapter: "Cloze Test",
          topic: "Grammar",
          content: "Question 8 text...",
          options: ["drawing", "draw", "drawn", "to draw"],
          correctOptionKey: "1",
        },
        {
          sourceNumber: "9",
          groupKey: "group-cloze-1",
          chapter: "Cloze Test",
          topic: "Grammar",
          content: "Question 9 text...",
          options: ["A", "B", "C", "D"],
          correctOptionKey: "2",
        },
        {
          sourceNumber: "10",
          groupKey: "group-cloze-1",
          chapter: "Cloze Test",
          topic: "Grammar",
          content: "Question 10 text...",
          options: ["A", "B", "C", "D"],
          correctOptionKey: "3",
        },
      ],
    };

    const parsed = parseImportJson(JSON.stringify(payload));
    expect(parsed.valid).toHaveLength(3);
    expect(parsed.groups).toHaveLength(1);
    expect(parsed.groups[0].status).toBe("complete");
    expect(parsed.groups[0].missingKeys).toHaveLength(0);

    // Group's questionKeys should now contain the actual question keys, not raw "8", "9", "10"
    const q8Key = parsed.valid[0].key;
    const q9Key = parsed.valid[1].key;
    const q10Key = parsed.valid[2].key;
    expect(parsed.groups[0].group.questionKeys).toEqual([q8Key, q9Key, q10Key]);

    // No warning issues should have been emitted
    const groupWarnings = parsed.issues.filter((i) => i.isWarning && i.path === "groups");
    expect(groupWarnings).toHaveLength(0);
  });

  it("handles Persian numerals in question numbers when matching groups", () => {
    const payload = {
      schemaVersion: "1.0",
      defaults: { subject: "ادبیات" },
      groups: [
        {
          key: "group-persian-1",
          kind: "reading",
          content: "متن نمونه",
          questionKeys: ["۱", "۲"],
        },
      ],
      questions: [
        {
          sourceNumber: "1",
          groupKey: "group-persian-1",
          content: "سؤال یک",
          options: ["الف", "ب", "ج", "د"],
          correctOptionKey: "1",
        },
        {
          sourceNumber: "۲",
          groupKey: "group-persian-1",
          content: "سؤال دو",
          options: ["الف", "ب", "ج", "د"],
          correctOptionKey: "2",
        },
      ],
    };

    const parsed = parseImportJson(JSON.stringify(payload));
    expect(parsed.valid).toHaveLength(2);
    expect(parsed.groups[0].status).toBe("complete");
    expect(parsed.groups[0].missingKeys).toHaveLength(0);
  });

  it("handles multiple JSON envelopes pasted together seamlessly", () => {
    const env1 = {
      schemaVersion: "1.0",
      defaults: {
        subject: "زبان",
        source: { kind: "EXAM", title: "کنکور 1405", year: 1405 },
      },
      groups: [
        {
          key: "group-cloze-1",
          kind: "cloze",
          content: "Passage 1405",
          questionKeys: ["8"],
        },
      ],
      questions: [
        {
          sourceNumber: "8",
          groupKey: "group-cloze-1",
          content: "Question 8 (1405)",
          options: ["A", "B", "C", "D"],
          correctOptionKey: "1",
        },
      ],
    };

    const env2 = {
      schemaVersion: "1.0",
      defaults: {
        subject: "زبان",
        source: { kind: "EXAM", title: "کنکور 1404", year: 1404 },
      },
      groups: [
        {
          key: "group-cloze-1",
          kind: "cloze",
          content: "Passage 1404",
          questionKeys: ["8"],
        },
      ],
      questions: [
        {
          sourceNumber: "8",
          groupKey: "group-cloze-1",
          content: "Question 8 (1404)",
          options: ["A", "B", "C", "D"],
          correctOptionKey: "2",
        },
      ],
    };

    // Paste two JSONs back-to-back
    const concatenated = `${JSON.stringify(env1)}\n\n${JSON.stringify(env2)}`;
    const parsed = parseImportJson(concatenated);

    expect(parsed.valid).toHaveLength(2);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0].status).toBe("complete");
    expect(parsed.groups[1].status).toBe("complete");
    // Group keys should be disambiguated so they don't collide
    expect(parsed.groups[0].group.key).not.toBe(parsed.groups[1].group.key);
  });
});
