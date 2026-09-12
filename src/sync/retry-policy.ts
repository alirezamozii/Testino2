export interface RetryDecision {
  shouldRetry: boolean;
  delayMs: number;
  isAuthError?: boolean;
}

export class RetryPolicy {
  private baseDelayMs: number;
  private maxDelayMs: number;
  private maxAttempts: number;

  constructor(options?: { baseDelayMs?: number; maxDelayMs?: number; maxAttempts?: number }) {
    this.baseDelayMs = options?.baseDelayMs ?? 1000;
    this.maxDelayMs = options?.maxDelayMs ?? 60000;
    this.maxAttempts = options?.maxAttempts ?? 5;
  }

  calculateDelay(attempt: number): number {
    const rawDelay = Math.min(this.maxDelayMs, this.baseDelayMs * Math.pow(2, attempt));
    const jitter = rawDelay * 0.2 * Math.random();
    return Math.floor(rawDelay + jitter);
  }

  evaluate(error: unknown, attempt: number): RetryDecision {
    if (attempt >= this.maxAttempts) {
      return { shouldRetry: false, delayMs: 0 };
    }

    const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

    // Authentication error: require re-auth before retrying
    if (
      message.includes("unauthorized") ||
      message.includes("jwt") ||
      message.includes("401") ||
      message.includes("احراز هویت")
    ) {
      return { shouldRetry: false, delayMs: 0, isAuthError: true };
    }

    // Unrecoverable schema/conflict errors
    if (message.includes("rejected") || message.includes("duplicate") || message.includes("invalid schema")) {
      return { shouldRetry: false, delayMs: 0 };
    }

    // Network / timeout / server temporary errors
    return {
      shouldRetry: true,
      delayMs: this.calculateDelay(attempt),
    };
  }
}
