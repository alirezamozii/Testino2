import { describe, expect, it } from "vitest";
import { seededShuffle } from "@/features/exams/domain/shuffle";

describe("seededShuffle", () => {
  it("is deterministic and keeps every member", () => {
    const source = ["a", "b", "c", "d", "e"];
    const first = seededShuffle(source, "fixed-seed");
    expect(seededShuffle(source, "fixed-seed")).toEqual(first);
    expect([...first].sort()).toEqual(source);
    expect(source).toEqual(["a", "b", "c", "d", "e"]);
  });
});
