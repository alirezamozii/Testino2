export interface ActiveTimerState {
  lastHeartbeatTime: number;
  accumulatedMs: number;
  isPaused: boolean;
  gapDetected: boolean;
}

export const HEARTBEAT_INTERVAL_MS = 2000;
export const MAX_GAP_MS = 5000;

export function createActiveTimer(now = performance.now()): ActiveTimerState {
  return {
    lastHeartbeatTime: now,
    accumulatedMs: 0,
    isPaused: false,
    gapDetected: false,
  };
}

export function processHeartbeat(
  state: ActiveTimerState,
  now = performance.now(),
  isVisible = true
): {
  nextState: ActiveTimerState;
  deltaMs: number;
  shouldPause: boolean;
  gapDetected: boolean;
} {
  if (state.isPaused || !isVisible) {
    return {
      nextState: { ...state, lastHeartbeatTime: now },
      deltaMs: 0,
      shouldPause: false,
      gapDetected: false,
    };
  }

  const elapsed = Math.max(0, now - state.lastHeartbeatTime);

  // If gap > 5000ms (5s), background suspension / device sleep detected
  // Do NOT record the gap, automatically trigger pause
  if (elapsed > MAX_GAP_MS) {
    return {
      nextState: {
        ...state,
        lastHeartbeatTime: now,
        isPaused: true,
        gapDetected: true,
      },
      deltaMs: 0,
      shouldPause: true,
      gapDetected: true,
    };
  }

  return {
    nextState: {
      ...state,
      lastHeartbeatTime: now,
      accumulatedMs: state.accumulatedMs + elapsed,
      gapDetected: false,
    },
    deltaMs: elapsed,
    shouldPause: false,
    gapDetected: false,
  };
}
