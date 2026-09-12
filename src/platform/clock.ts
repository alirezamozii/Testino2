export interface ClockPort {
  monotonicNow(): number;
  utcNow(): number;
}

export class SystemClock implements ClockPort {
  monotonicNow(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  utcNow(): number {
    return Date.now();
  }
}

export class FakeClock implements ClockPort {
  private monotonic: number;
  private utc: number;

  constructor(initialUtc = 1700000000000, initialMonotonic = 0) {
    this.utc = initialUtc;
    this.monotonic = initialMonotonic;
  }

  monotonicNow(): number {
    return this.monotonic;
  }

  utcNow(): number {
    return this.utc;
  }

  advance(ms: number): void {
    if (ms < 0) throw new Error("Cannot rewind fake clock");
    this.monotonic += ms;
    this.utc += ms;
  }

  setUtc(utc: number): void {
    this.utc = utc;
  }
}

let defaultClock: ClockPort = new SystemClock();

export function getDefaultClock(): ClockPort {
  return defaultClock;
}

export function setDefaultClock(clock: ClockPort): void {
  defaultClock = clock;
}
