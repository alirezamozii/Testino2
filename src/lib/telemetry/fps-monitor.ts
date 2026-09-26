"use client";

export interface FpsSnapshot {
  currentFps: number;
  avgFps: number;
  minFps: number;
  droppedFrames: number;
  jankCount: number; // frames taking > 50ms (severe stutter)
  smoothnessScore: number; // 0 - 100%
  sampleDurationSec: number;
}

class FpsTracker {
  private running = false;
  private rafId = 0;
  private lastTime = 0;
  private frameCount = 0;
  private startTime = 0;
  private droppedFrames = 0;
  private jankCount = 0;
  private minFps = 60;
  private recentFrameDurations: number[] = [];
  private currentFps = 60;

  start() {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    this.lastTime = performance.now();
    this.startTime = this.lastTime;
    this.frameCount = 0;
    this.droppedFrames = 0;
    this.jankCount = 0;
    this.minFps = 60;
    this.recentFrameDurations = [];

    const loop = (now: number) => {
      if (!this.running) return;

      const delta = now - this.lastTime;
      this.lastTime = now;
      this.frameCount++;

      if (delta > 0) {
        this.recentFrameDurations.push(delta);
        if (this.recentFrameDurations.length > 60) {
          this.recentFrameDurations.shift();
        }

        // Frame took longer than 18.5ms (dropped frame on 60Hz screen)
        if (delta > 18.5) {
          this.droppedFrames++;
        }
        // Severe jank > 50ms
        if (delta > 50) {
          this.jankCount++;
        }

        const instantFps = Math.min(120, Math.round(1000 / delta));
        if (instantFps < this.minFps && instantFps > 0) {
          this.minFps = instantFps;
        }

        // Compute rolling FPS over last ~60 frames
        const sumDelta = this.recentFrameDurations.reduce((a, b) => a + b, 0);
        this.currentFps = Math.min(120, Math.round((this.recentFrameDurations.length / sumDelta) * 1000));
      }

      this.rafId = requestAnimationFrame(loop);
    };

    this.rafId = requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
    if (this.rafId !== 0 && typeof window !== "undefined") {
      cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
  }

  getSnapshot(): FpsSnapshot {
    const elapsedSec = Math.max(0.1, (performance.now() - (this.startTime || performance.now())) / 1000);
    const avgFps = Math.min(120, Math.round(this.frameCount / elapsedSec));
    const dropRate = this.frameCount > 0 ? this.droppedFrames / this.frameCount : 0;
    const smoothnessScore = Math.max(0, Math.min(100, Math.round((1 - dropRate) * 100)));

    return {
      currentFps: this.currentFps || 60,
      avgFps: avgFps || 60,
      minFps: this.minFps === 60 && this.frameCount < 10 ? 60 : this.minFps,
      droppedFrames: this.droppedFrames,
      jankCount: this.jankCount,
      smoothnessScore,
      sampleDurationSec: Math.round(elapsedSec * 10) / 10,
    };
  }

  reset() {
    this.stop();
    this.start();
  }
}

export const fpsTracker = new FpsTracker();
