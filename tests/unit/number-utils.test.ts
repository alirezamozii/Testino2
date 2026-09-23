import { describe, it, expect } from "vitest";
import { toEnDigits, toFaDigits, parseSafeInt, sanitizeIntegerInput } from "@/lib/number-utils";

describe("number-utils", () => {
  it("converts Persian digits to English digits", () => {
    expect(toEnDigits("۱۲۳۴۵۶۷۸۹۰")).toBe("1234567890");
    expect(toEnDigits("سوال ۲۵ تا ۷۰")).toBe("سوال 25 تا 70");
  });

  it("converts Arabic digits to English digits", () => {
    expect(toEnDigits("١٢٣٤٥٦٧٨٩٠")).toBe("1234567890");
  });

  it("converts English digits to Persian digits", () => {
    expect(toFaDigits("1234567890")).toBe("۱۲۳۴۵۶۷۸۹۰");
  });

  it("safely parses integer with Persian/Arabic numbers", () => {
    expect(parseSafeInt("۰")).toBe(0);
    expect(parseSafeInt("۲۵")).toBe(25);
    expect(parseSafeInt("٠٥")).toBe(5);
    expect(parseSafeInt("", 1)).toBe(1);
    expect(parseSafeInt(null, 10)).toBe(10);
    expect(parseSafeInt(0, 5)).toBe(0); // 0 is valid and should not fallback
  });

  it("sanitizes live user input smoothly without snap-back on empty", () => {
    expect(sanitizeIntegerInput("")).toBe("");
    expect(sanitizeIntegerInput("۰")).toBe("0");
    expect(sanitizeIntegerInput("۰۰")).toBe("0");
    expect(sanitizeIntegerInput("۰۵")).toBe("5");
    expect(sanitizeIntegerInput("۲۵")).toBe("25");
    expect(sanitizeIntegerInput("abc۱۲۳xyz")).toBe("123");
    expect(sanitizeIntegerInput("500", { max: 100 })).toBe("100");
  });
});
