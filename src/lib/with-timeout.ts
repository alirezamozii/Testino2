/**
 * Races a promise against a timer so a stalled network/storage call can never
 * wedge the caller forever (e.g. sync stuck on "pushing" with a dead socket,
 * or an auth button spinning endlessly behind a captive portal).
 *
 * The underlying operation keeps running in the background — we only release
 * the caller with a rejection so the UI can recover and retry.
 */
export class WithTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WithTimeoutError";
  }
}

export function withTimeout<T>(
  promise: PromiseLike<T>,
  timeoutMs: number,
  label = "عملیات شبکه"
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new WithTimeoutError(`${label} بیش از ${Math.round(timeoutMs / 1000)} ثانیه طول کشید و متوقف شد.`));
    }, timeoutMs);
  });

  // Promise.resolve() also settles thenables (supabase-js PostgrestBuilder
  // implements .then but is not a real Promise subclass).
  return Promise.race([Promise.resolve(promise), timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}
