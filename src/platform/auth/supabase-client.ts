import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { withTimeout } from "@/lib/with-timeout";

// Pending offline-credential retry: without a cap, wrong credentials (or an
// email that needs confirmation) would be re-submitted on EVERY sync tick
// (every 30s) forever — Supabase rate-limits and the user sees endless churn.
const PENDING_AUTH_KEY = "testino_pending_auth";
const PENDING_AUTH_ATTEMPTS_KEY = "testino_pending_auth_attempts";
const MAX_PENDING_AUTH_ATTEMPTS = 5;
const AUTH_TIMEOUT_MS = 12_000;

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  isConfigured: boolean;
}

let clientInstance: SupabaseClient | null = null;
let cachedConfigKey = "";

/**
 * Reads Supabase config exclusively from environment variables.
 * No localStorage fallback — credentials are managed via .env only.
 */
export function getSupabaseConfig(): SupabaseConfig {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const anonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "").trim();
  const isConfigured = Boolean(url && anonKey && url.startsWith("http"));
  return { url, anonKey, isConfigured };
}

export function getSupabaseClient(): SupabaseClient | null {
  const config = getSupabaseConfig();
  if (!config.isConfigured) {
    return null;
  }

  const key = `${config.url}::${config.anonKey}`;
  if (clientInstance && cachedConfigKey === key) {
    return clientInstance;
  }

  clientInstance = createClient(config.url, config.anonKey, {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  cachedConfigKey = key;

  return clientInstance;
}

/**
 * Initiates Google OAuth Sign-In with PKCE flow.
 */
export async function signInWithGoogle(redirectTo?: string): Promise<{ data: { url: string | null } | null; error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      error: new Error("تنظیمات Supabase در فایل .env تنظیم نشده است. لطفاً NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY را تنظیم کنید."),
    };
  }

  // On Android (Capacitor) the WebView origin is https://localhost — Google
  // would redirect the SYSTEM browser to an unreachable URL and sign-in
  // dead-ended. Route through the app's custom scheme instead; AndroidManifest
  // declares the matching VIEW intent-filter and the appUrlOpen listener
  // completes the PKCE exchange in-app.
  // (Requires adding `app.testino.mobile://auth/callback` to the Supabase
  //  Dashboard → Auth → Redirect URLs allowlist.)
  const isNative =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl =
    redirectTo ||
    (isNative
      ? "app.testino.mobile://auth/callback"
      : origin
        ? `${origin}/auth/callback`
        : undefined);

  const { data, error } = await client.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: callbackUrl,
      queryParams: {
        access_type: "offline",
        prompt: "consent",
      },
    },
  });

  return { data, error: error ? new Error(error.message) : null };
}

/**
 * Subscribes to Supabase authentication state changes (login, logout, token refresh).
 */
export function onAuthStateChange(callback: (user: User | null) => void): () => void {
  const client = getSupabaseClient();
  if (!client) return () => {};

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });

  return () => {
    subscription.unsubscribe();
  };
}

/**
 * Sign in with email + password via Supabase.
 * If the account does not exist, returns an appropriate error.
 */
export async function signInWithEmail(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      user: null,
      error: new Error("تنظیمات Supabase در فایل .env یافت نشد."),
    };
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: new Error(error.message) };
  return { user: data.user, error: null };
}

/**
 * Sign up with email + password via Supabase.
 * Creates a new account. If the account already exists, returns an error.
 */
export async function signUpWithEmail(email: string, password: string): Promise<{ user: User | null; error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      user: null,
      error: new Error("تنظیمات Supabase در فایل .env یافت نشد."),
    };
  }

  const { data, error } = await client.auth.signUp({ email, password });
  if (error) return { user: null, error: new Error(error.message) };
  return { user: data.user, error: null };
}

/**
 * Signs out from Supabase cloud session.
 */
export async function signOut(): Promise<{ error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: null };

  const { error } = await client.auth.signOut();
  return { error: error ? new Error(error.message) : null };
}

/**
 * Retrieves the current authenticated user from cloud session.
 */
export async function getCurrentAuthUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await withTimeout(client.auth.getUser(), AUTH_TIMEOUT_MS, "بررسی نشست کاربر");
    if (error || !data.user) return null;
    return data.user;
  } catch {
    return null;
  }
}

/**
 * Synchronizes offline-registered credentials with Supabase when online/configured.
 * Tries sign in first; if account does not exist, tries sign up.
 */
export async function syncPendingOfflineAuth(): Promise<{ success: boolean; error: Error | null }> {
  if (typeof window === "undefined") return { success: false, error: null };
  const pending = window.localStorage.getItem(PENDING_AUTH_KEY);
  if (!pending) return { success: false, error: null };

  const config = getSupabaseConfig();
  if (!config.isConfigured) return { success: false, error: null };

  // Attempt cap: give up after N failed rounds so bad credentials don't churn
  // the auth endpoint every 30 seconds. The marker is cleared → the user can
  // simply sign in from the UI next time.
  const attempts = Number(window.localStorage.getItem(PENDING_AUTH_ATTEMPTS_KEY) || "0");
  if (attempts >= MAX_PENDING_AUTH_ATTEMPTS) {
    window.localStorage.removeItem(PENDING_AUTH_KEY);
    window.localStorage.removeItem(PENDING_AUTH_ATTEMPTS_KEY);
    return { success: false, error: new Error("تلاش برای اتصال خودکار حساب بیش از حد مجاز بود؛ لطفاً دستی وارد شوید.") };
  }

  try {
    const parsed = JSON.parse(pending) as { email?: string; password?: string };
    if (!parsed.email || !parsed.password) return { success: false, error: null };

    window.localStorage.setItem(PENDING_AUTH_ATTEMPTS_KEY, String(attempts + 1));

    // 1. Try sign in first (in case account already exists on remote)
    const signIn = await withTimeout(signInWithEmail(parsed.email, parsed.password), AUTH_TIMEOUT_MS, "ورود با حساب ذخیره‌شده");
    if (signIn.user) {
      window.localStorage.removeItem(PENDING_AUTH_KEY);
      window.localStorage.removeItem(PENDING_AUTH_ATTEMPTS_KEY);
      return { success: true, error: null };
    }

    // 2. If not found, try sign up
    const signUp = await withTimeout(signUpWithEmail(parsed.email, parsed.password), AUTH_TIMEOUT_MS, "ساخت حساب ابری");
    if (signUp.user) {
      window.localStorage.removeItem(PENDING_AUTH_KEY);
      window.localStorage.removeItem(PENDING_AUTH_ATTEMPTS_KEY);
      return { success: true, error: null };
    }

    return { success: false, error: signUp.error };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
