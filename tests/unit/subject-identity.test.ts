import { describe, expect, it } from "vitest";
import {
  canonicalizeSubject,
  canonicalizeSubjectList,
  isSameSubject,
} from "@/features/questions/domain/subject-registry";
import { parseImportJson } from "@/features/questions/domain/importer";

describe("canonical subject identity", () => {
  it("merges reviewed aliases under one canonical display name", () => {
    expect(canonicalizeSubjectList([
      "ریاضی",
      "ریاضی عمومی",
      "آمار",
      "آمار و احتمالات",
      "بازاریابی",
      "مدیریت بازاریابی",
      "اصول و مبانی مدیریت از دیدگاه اسلام",
      "مدیریت از دیدگاه اسلام",
    ])).toEqual([
      "ریاضی عمومی",
      "آمار و احتمالات",
      "مدیریت بازاریابی",
      "مدیریت از دیدگاه اسلام",
    ]);
  });

  it("does not classify an unknown custom subject from a contained short token", () => {
    expect(canonicalizeSubject("روش‌های آمار زیستی پیشرفته")).toBe("روش های آمار زیستی پیشرفته");
    expect(isSameSubject("روش‌های آمار زیستی پیشرفته", "آمار و احتمالات")).toBe(false);
  });

  it("canonicalizes imported defaults and per-question overrides", () => {
    const parsed = parseImportJson(JSON.stringify({
      schemaVersion: "1.0",
      defaults: { subject: "بازاریابی" },
      questions: [{
        key: "q1",
        subject: "تئوری های مدیریت",
        content: [{ type: "text", value: "سؤال" }],
        options: ["الف", "ب", "ج", "د"],
        correctOptionKey: "1",
      }],
    }));

    expect(parsed.envelope.defaults.subject).toBe("مدیریت بازاریابی");
    expect(parsed.valid[0].subject).toBe("تئوری‌های مدیریت");
  });
});
