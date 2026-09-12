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
});
