import { describe, expect, it } from "vitest";
import {
  createActiveTimer,
  processHeartbeat,
  HEARTBEAT_INTERVAL_MS,
} from "@/features/exams/domain/active-timer";

describe("Active Monotonic Timer & Heartbeat (TASK-018)", () => {
  it("accumulates delta time accurately for regular heartbeats within 5s", () => {
    const timer = createActiveTimer(1000);

    // Heartbeat 1 after 2000ms
    const step1 = processHeartbeat(timer, 1000 + HEARTBEAT_INTERVAL_MS, true);
    expect(step1.deltaMs).toBe(2000);
    expect(step1.shouldPause).toBe(false);
    expect(step1.gapDetected).toBe(false);
    expect(step1.nextState.accumulatedMs).toBe(2000);

    // Heartbeat 2 after another 2000ms
    const step2 = processHeartbeat(step1.nextState, 1000 + HEARTBEAT_INTERVAL_MS * 2, true);
    expect(step2.deltaMs).toBe(2000);
    expect(step2.nextState.accumulatedMs).toBe(4000);
  });

  it("does not accumulate 1 hour when the system is suspended/in background (gap > 5000ms) and triggers auto-pause", () => {
    const timer = createActiveTimer(1000);

    // Regular heartbeat
    const step1 = processHeartbeat(timer, 3000, true);
    expect(step1.nextState.accumulatedMs).toBe(2000);

    // 1 hour gap (3,600,000 ms) in background / device sleep!
    const step2 = processHeartbeat(step1.nextState, 3000 + 3_600_000, true);
    expect(step2.deltaMs).toBe(0); // 0ms added!
    expect(step2.shouldPause).toBe(true);
    expect(step2.gapDetected).toBe(true);
    // Accumulated time remains strictly 2000ms, not 1 hour!
    expect(step2.nextState.accumulatedMs).toBe(2000);
    expect(step2.nextState.isPaused).toBe(true);
  });

  it("does not accumulate time when visibility is hidden or timer is paused", () => {
    const timer = createActiveTimer(1000);

    // Heartbeat with isVisible = false
    const step = processHeartbeat(timer, 2000, false);
    expect(step.deltaMs).toBe(0);
    expect(step.nextState.accumulatedMs).toBe(0);
  });
});
