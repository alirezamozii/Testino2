import { describe, expect, it } from "vitest";
import {
  tableBlockSchema,
  chartBlockSchema,
  textBlockSchema,
  formulaBlockSchema,
} from "@/features/questions/domain/question-schema";

describe("Rich Content Block Schema Validation", () => {
  it("validates text block with emphasis and direction", () => {
    const valid = textBlockSchema.safeParse({
      type: "text",
      value: "متن تأکیدشده",
      direction: "rtl",
      emphasis: "strong",
    });
    expect(valid.success).toBe(true);

    const empty = textBlockSchema.safeParse({
      type: "text",
      value: "   ",
    });
    expect(empty.success).toBe(false);
  });

  it("validates formula block", () => {
    const valid = formulaBlockSchema.safeParse({
      type: "formula",
      latex: "\\sum_{i=1}^n x_i",
      display: true,
    });
    expect(valid.success).toBe(true);
  });

  it("enforces rectangular table dimensions (all rows match header count)", () => {
    const validTable = {
      type: "table",
      headers: [
        { type: "text", value: "ستون ۱" },
        { type: "text", value: "ستون ۲" },
      ],
      rows: [
        [
          { type: "text", value: "الف" },
          { type: "text", value: "ب" },
        ],
        [
          { type: "text", value: "ج" },
          { type: "text", value: "د" },
        ],
      ],
    };
    expect(tableBlockSchema.safeParse(validTable).success).toBe(true);

    const nonRectangular = {
      type: "table",
      headers: [
        { type: "text", value: "ستون ۱" },
        { type: "text", value: "ستون ۲" },
      ],
      rows: [
        [{ type: "text", value: "تنها یک سلول" }], // Missing second column
      ],
    };
    const result = tableBlockSchema.safeParse(nonRectangular);
    expect(result.success).toBe(false);
  });

  it("enforces chart series length matches labels length", () => {
    const validChart = {
      type: "chart",
      chartType: "bar",
      labels: ["۱۳۹۸", "۱۳۹۹", "۱۴۰۰"],
      series: [{ name: "فروش", values: [10, 20, 30] }],
    };
    expect(chartBlockSchema.safeParse(validChart).success).toBe(true);

    const mismatchedChart = {
      type: "chart",
      chartType: "bar",
      labels: ["۱۳۹۸", "۱۳۹۹", "۱۴۰۰"],
      series: [{ name: "فروش", values: [10, 20] }], // Only 2 values for 3 labels
    };
    expect(chartBlockSchema.safeParse(mismatchedChart).success).toBe(false);
  });
});
