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

export const DEFAULT_SUPABASE_URL = "https://khuuqsmjrjtsmbigpnsx.supabase.co";
export const DEFAULT_SUPABASE_ANON_KEY = "sb_publishable_mLagE8lfm8mnJa5AUSe9Ow_S1U_bxc4";

/**
 * Reads Supabase config from localStorage overrides, environment variables, or project defaults.
 */
export function getSupabaseConfig(): SupabaseConfig {
  const isTest = typeof process !== "undefined" && (process.env.NODE_ENV === "test" || Boolean(process.env.VITEST));
  const fallbackUrl = isTest ? "" : DEFAULT_SUPABASE_URL;
  const fallbackKey = isTest ? "" : DEFAULT_SUPABASE_ANON_KEY;

  let customUrl = "";
  let customKey = "";
  if (typeof window !== "undefined") {
    try {
      customUrl = window.localStorage.getItem("testino_custom_supabase_url") || "";
      customKey = window.localStorage.getItem("testino_custom_supabase_anon_key") || "";
    } catch {
      // ignore
    }
  }

  const url = (customUrl || process.env.NEXT_PUBLIC_SUPABASE_URL || fallbackUrl).trim();
  const anonKey = (
    customKey ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    fallbackKey
  ).trim();
  const isConfigured = Boolean(url && anonKey && url.startsWith("http"));
  return { url, anonKey, isConfigured };
}

export function setCustomSupabaseConfig(url?: string, anonKey?: string) {
  if (typeof window === "undefined") return;
  try {
    if (url && url.trim()) {
      window.localStorage.setItem("testino_custom_supabase_url", url.trim());
    } else {
      window.localStorage.removeItem("testino_custom_supabase_url");
    }
    if (anonKey && anonKey.trim()) {
      window.localStorage.setItem("testino_custom_supabase_anon_key", anonKey.trim());
    } else {
      window.localStorage.removeItem("testino_custom_supabase_anon_key");
    }
    clientInstance = null;
    cachedConfigKey = "";
  } catch {
    // ignore
  }
}

export function resetCustomSupabaseConfig() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem("testino_custom_supabase_url");
    window.localStorage.removeItem("testino_custom_supabase_anon_key");
    clientInstance = null;
    cachedConfigKey = "";
  } catch {
    // ignore
  }
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
 *
 * Per-platform strategy:
 * - Web: standard full-page redirect to `${origin}/auth/callback`.
 * - Capacitor (Android/iOS): Google BLOCKS OAuth inside WebViews, so the
 *   authorize URL must open in the SYSTEM browser (Custom Tabs/SFSafariView)
 *   via @capacitor/browser, with redirectTo pointing at the app's custom
 *   scheme. The OS bounces back into the app, appUrlOpen routes the code
 *   into the SPA and supabase-js completes the PKCE exchange in-app.
 * - Electron: window.location changes to external URLs are intercepted by
 *   the main process (will-navigate → shell.openExternal), so we hand it the
 *   custom-scheme redirectTo and let the shell open the system browser. The
 *   main process registers the scheme and routes the code back to the window.
 */
export async function signInWithGoogle(redirectTo?: string): Promise<{ data: { url: string | null } | null; error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return {
      data: null,
      error: new Error("CONFIG_MISSING"),
    };
  }

  const ua = typeof window !== "undefined" ? window.navigator.userAgent : "";
  const isNative =
    typeof window !== "undefined" &&
    Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
  const isElectron =
    typeof window !== "undefined" &&
    (Boolean((window as unknown as { testinoDesktop?: { isElectron?: boolean } }).testinoDesktop?.isElectron) ||
      ua.includes("Electron"));
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const callbackUrl =
    (isNative || isElectron
      ? "app.testino.mobile://auth/callback"
      : redirectTo || (origin ? `${origin}/auth/callback` : undefined));

  if (isNative) {
    // System browser flow (Google rejects WebView user agents).
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }
    if (data.url) {
      try {
        const { Browser } = await import("@capacitor/browser");
        await Browser.open({ url: data.url });
      } catch (cause) {
        return { data: null, error: new Error(cause instanceof Error ? cause.message : "BROWSER_OPEN_FAILED") };
      }
    }
    return { data, error: null };
  }

  if (isElectron) {
    // Open system browser once; OS deep-link routes back into Electron
    const { data, error } = await client.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl,
        skipBrowserRedirect: true,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });

    if (error) {
      return { data: null, error: new Error(error.message) };
    }
    if (data.url) {
      let opened = false;
      try {
        const desktop = typeof window !== "undefined"
          ? (window as unknown as { testinoDesktop?: { openExternal?: (url: string) => void } }).testinoDesktop
          : undefined;
        if (desktop && typeof desktop.openExternal === "function") {
          desktop.openExternal(data.url);
          opened = true;
        }
      } catch (e) {
        console.warn("Failed to call testinoDesktop.openExternal:", e);
      }
      if (!opened && typeof window !== "undefined") {
        window.open(data.url, "_blank");
      }
    }
    return { data, error: null };
  }

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
 * Exchanges an OAuth PKCE code or full redirect URL for a session.
 * Supports both automatic deep link routes and manual copy-paste fallback.
 */
export async function exchangeOAuthCode(codeOrUrl: string): Promise<{ user: User | null; error: Error | null }> {
  const client = getSupabaseClient();
  if (!client) {
    return { user: null, error: new Error("CONFIG_MISSING") };
  }

  let code = (codeOrUrl || "").trim();
  if (!code) {
    return { user: null, error: new Error("CODE_EMPTY") };
  }

  // Extract ?code=... if full URL or query string was provided
  if (code.includes("code=")) {
    try {
      const parsed = new URL(code.startsWith("http") || code.startsWith("app.") ? code : `https://dummy.com/${code}`);
      code = parsed.searchParams.get("code") || code;
    } catch {
      const match = code.match(/code=([^&]+)/);
      if (match) code = decodeURIComponent(match[1]);
    }
  }

  try {
    const { data, error } = await client.auth.exchangeCodeForSession(code);
    if (error) {
      return { user: null, error: new Error(error.message) };
    }
    return { user: data.user, error: null };
  } catch (err) {
    return { user: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
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

export async function getCurrentAuthUser(): Promise<User | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data: sessionData } = await client.auth.getSession().catch(() => ({ data: { session: null } }));
    if (!sessionData?.session) {
      return null;
    }

    const { data, error } = await withTimeout(client.auth.getUser(), AUTH_TIMEOUT_MS, "بررسی نشست کاربر");
    if (error) {
      if (error.status === 401 || error.status === 403) {
        return null;
      }
      throw error;
    }
    return data?.user || sessionData.session.user;
  } catch (err) {
    const hasSession = await client.auth.getSession().then((res) => Boolean(res.data.session)).catch(() => false);
    if (hasSession) {
      throw err;
    }
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
