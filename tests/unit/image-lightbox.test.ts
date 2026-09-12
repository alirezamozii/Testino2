import { describe, expect, it } from "vitest";
import {
  clampScale,
  calculateFocalPointZoom,
  calculatePinchTransform,
  MIN_SCALE,
  MAX_SCALE,
} from "@/components/rich-content/image-lightbox";

describe("ImageLightbox Math & Zoom Algorithms", () => {
  it("clamps scale within min and max boundaries", () => {
    expect(clampScale(0.05, MIN_SCALE, MAX_SCALE)).toBe(MIN_SCALE);
    expect(clampScale(10.0, MIN_SCALE, MAX_SCALE)).toBe(MAX_SCALE);
    expect(clampScale(2.5, MIN_SCALE, MAX_SCALE)).toBe(2.5);
  });

  describe("Focal-point Zoom (Pointer / Wheel / Touchpad)", () => {
    it("preserves center position when zooming at container center (0, 0)", () => {
      const result = calculateFocalPointZoom({
        currentScale: 1.0,
        currentPos: { x: 0, y: 0 },
        targetScale: 2.0,
        focalPoint: { x: 0, y: 0 },
      });

      expect(result.nextScale).toBe(2.0);
      expect(result.nextPos.x).toBe(0);
      expect(result.nextPos.y).toBe(0);
    });

    it("keeps focal point fixed under pointer when zooming in", () => {
      // User has cursor at (100, 50) relative to container center
      const focalPoint = { x: 100, y: 50 };
      const currentScale = 1.0;
      const currentPos = { x: 0, y: 0 };
      const targetScale = 2.0;

      const { nextScale, nextPos } = calculateFocalPointZoom({
        currentScale,
        currentPos,
        targetScale,
        focalPoint,
      });

      expect(nextScale).toBe(2.0);

      // Verify mathematical invariance:
      // Position of focal point on image before zoom:
      // imgPointX = (focalPoint.x - currentPos.x) / currentScale = 100 / 1 = 100
      // Position of this image point after zoom:
      // screenX = nextPos.x + imgPointX * nextScale = nextPos.x + 100 * 2
      // screenX must equal focalPoint.x (100)
      const screenX = nextPos.x + 100 * nextScale;
      const screenY = nextPos.y + 50 * nextScale;

      expect(screenX).toBeCloseTo(focalPoint.x, 5);
      expect(screenY).toBeCloseTo(focalPoint.y, 5);
    });

    it("correctly handles successive zooms at different focal points", () => {
      let scale = 1.0;
      let pos = { x: 0, y: 0 };

      // First zoom at (50, 50) to 2x
      const step1 = calculateFocalPointZoom({
        currentScale: scale,
        currentPos: pos,
        targetScale: 2.0,
        focalPoint: { x: 50, y: 50 },
      });
      scale = step1.nextScale;
      pos = step1.nextPos;

      // Second zoom at (-20, 30) to 3x
      const step2 = calculateFocalPointZoom({
        currentScale: scale,
        currentPos: pos,
        targetScale: 3.0,
        focalPoint: { x: -20, y: 30 },
      });

      expect(step2.nextScale).toBe(3.0);
      // Verify second focal point is preserved
      const imgX2 = (-20 - step1.nextPos.x) / step1.nextScale;
      const imgY2 = (30 - step1.nextPos.y) / step1.nextScale;
      const afterScreenX = step2.nextPos.x + imgX2 * step2.nextScale;
      const afterScreenY = step2.nextPos.y + imgY2 * step2.nextScale;

      expect(afterScreenX).toBeCloseTo(-20, 5);
      expect(afterScreenY).toBeCloseTo(30, 5);
    });
  });

  describe("Pinch-to-zoom & Pan (Mobile Touch)", () => {
    it("scales up and tracks midpoint when fingers spread apart", () => {
      const initialScale = 1.0;
      const initialDistance = 100;
      const currentDistance = 200; // 2x pinch
      const initialPos = { x: 0, y: 0 };
      const initialMidpoint = { x: 200, y: 300 };
      const currentMidpoint = { x: 220, y: 310 }; // also moved by (20, 10)
      const containerCenter = { x: 200, y: 300 };

      const result = calculatePinchTransform({
        initialScale,
        initialDistance,
        currentDistance,
        initialPos,
        currentMidpoint,
        initialMidpoint,
        containerCenter,
      });

      expect(result.nextScale).toBe(2.0);
      // Check that delta midpoint translation is incorporated
      expect(result.nextPos.x).toBeCloseTo(20, 5);
      expect(result.nextPos.y).toBeCloseTo(10, 5);
    });

    it("clamps pinch zoom to MAX_SCALE", () => {
      const result = calculatePinchTransform({
        initialScale: 2.0,
        initialDistance: 50,
        currentDistance: 500, // 10x multiplier -> would be 20x without clamp
        initialPos: { x: 0, y: 0 },
        currentMidpoint: { x: 100, y: 100 },
        initialMidpoint: { x: 100, y: 100 },
        containerCenter: { x: 100, y: 100 },
      });

      expect(result.nextScale).toBe(MAX_SCALE);
    });

    it("zooms out smoothly when fingers pinch in (collapse)", () => {
      const result = calculatePinchTransform({
        initialScale: 2.0,
        initialDistance: 200,
        currentDistance: 100, // 0.5x pinch factor -> 1.0 scale
        initialPos: { x: 50, y: 50 },
        currentMidpoint: { x: 150, y: 150 },
        initialMidpoint: { x: 150, y: 150 },
        containerCenter: { x: 150, y: 150 },
      });

      expect(result.nextScale).toBe(1.0);
      expect(result.nextPos.x).toBeCloseTo(25, 5);
      expect(result.nextPos.y).toBeCloseTo(25, 5);
    });

    it("handles pure touch translation when distance does not change", () => {
      const result = calculatePinchTransform({
        initialScale: 1.5,
        initialDistance: 100,
        currentDistance: 100, // no scale change
        initialPos: { x: 10, y: 20 },
        currentMidpoint: { x: 250, y: 350 },
        initialMidpoint: { x: 200, y: 300 }, // moved by (+50, +50)
        containerCenter: { x: 200, y: 300 },
      });

      expect(result.nextScale).toBe(1.5);
      expect(result.nextPos.x).toBeCloseTo(60, 5);
      expect(result.nextPos.y).toBeCloseTo(70, 5);
    });
  });
});
