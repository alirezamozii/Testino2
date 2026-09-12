import { describe, expect, it } from "vitest";
import {
  calculateTargetDimensions,
  optimizeImageForUpload,
} from "@/features/media/domain/image-optimizer";

describe("Image Optimizer & Dimension Calculations", () => {
  it("keeps dimensions intact when already within maxDimension", () => {
    const res = calculateTargetDimensions(1200, 800, 1800);
    expect(res.width).toBe(1200);
    expect(res.height).toBe(800);
    expect(res.scaled).toBe(false);
  });

  it("scales down large landscape images proportionally", () => {
    // 3600 x 1800 with max 1800 -> 1800 x 900
    const res = calculateTargetDimensions(3600, 1800, 1800);
    expect(res.width).toBe(1800);
    expect(res.height).toBe(900);
    expect(res.scaled).toBe(true);
  });

  it("scales down large portrait images proportionally", () => {
    // 2000 x 4000 with max 1800 -> 900 x 1800
    const res = calculateTargetDimensions(2000, 4000, 1800);
    expect(res.width).toBe(900);
    expect(res.height).toBe(1800);
    expect(res.scaled).toBe(true);
  });

  it("preserves aspect ratio accurately for irregular sizes", () => {
    const originalW = 3840;
    const originalH = 2160;
    const res = calculateTargetDimensions(originalW, originalH, 1600);

    const originalAspect = originalW / originalH;
    const targetAspect = res.width / res.height;

    expect(res.width).toBe(1600);
    expect(Math.abs(originalAspect - targetAspect)).toBeLessThan(0.01);
  });

  it("handles edge cases with zero or negative dimensions safely", () => {
    const res = calculateTargetDimensions(0, 0, 1800);
    expect(res.width).toBeGreaterThan(0);
    expect(res.height).toBeGreaterThan(0);
  });

  it("runs in Node environment without crashing via fallback", async () => {
    // Create a dummy Blob in Node environment
    const dummyBlob = new Blob(["dummy test content"], { type: "text/plain" });
    const res = await optimizeImageForUpload(dummyBlob);

    expect(res.dataUrl).toBeDefined();
    expect(res.originalBytes).toBe(dummyBlob.size);
  });
});
