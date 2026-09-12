import { describe, expect, it } from "vitest";
import { FakeClock, SystemClock } from "@/platform/clock";
import {
  AppError,
  ConflictError,
  OperationOutcomeUnknownError,
  StorageUnavailableError,
  ValidationError,
} from "@/lib/errors";

describe("ClockPort", () => {
  it("SystemClock returns reasonable monotonic and utc timestamps", () => {
    const clock = new SystemClock();
    const utc1 = clock.utcNow();
    const mono1 = clock.monotonicNow();

    expect(utc1).toBeGreaterThan(1700000000000);
    expect(mono1).toBeGreaterThanOrEqual(0);
  });

  it("FakeClock advances deterministically", () => {
    const clock = new FakeClock(1000, 0);
    expect(clock.utcNow()).toBe(1000);
    expect(clock.monotonicNow()).toBe(0);

    clock.advance(2500);
    expect(clock.utcNow()).toBe(3500);
    expect(clock.monotonicNow()).toBe(2500);

    expect(() => clock.advance(-1)).toThrow("Cannot rewind fake clock");
  });
});

describe("Standard App Errors", () => {
  it("creates typed errors with correct codes and retryability", () => {
    const validation = new ValidationError("داده نامعتبر است", [
      { path: "options", code: "custom", message: "تکراری" },
    ]);
    expect(validation.code).toBe("VALIDATION_ERROR");
    expect(validation.retryable).toBe(false);
    expect(validation.fieldIssues).toHaveLength(1);

    const storage = new StorageUnavailableError();
    expect(storage.code).toBe("STORAGE_UNAVAILABLE");
    expect(storage.retryable).toBe(true);

    const conflict = new ConflictError();
    expect(conflict.code).toBe("CONFLICT_ERROR");
    expect(conflict.retryable).toBe(true);

    const unknownOutcome = new OperationOutcomeUnknownError();
    expect(unknownOutcome.code).toBe("OPERATION_OUTCOME_UNKNOWN");
    expect(unknownOutcome.retryable).toBe(true);

    expect(storage).toBeInstanceOf(AppError);
  });
});
