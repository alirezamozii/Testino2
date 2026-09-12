import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

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

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const callbackUrl = redirectTo || (origin ? `${origin}/settings` : undefined);

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
    const { data, error } = await client.auth.getUser();
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
  const pending = window.localStorage.getItem("testino_pending_auth");
  if (!pending) return { success: false, error: null };

  const config = getSupabaseConfig();
  if (!config.isConfigured) return { success: false, error: null };

  try {
    const parsed = JSON.parse(pending) as { email?: string; password?: string };
    if (!parsed.email || !parsed.password) return { success: false, error: null };

    // 1. Try sign in first (in case account already exists on remote)
    const signIn = await signInWithEmail(parsed.email, parsed.password);
    if (signIn.user) {
      window.localStorage.removeItem("testino_pending_auth");
      return { success: true, error: null };
    }

    // 2. If not found, try sign up
    const signUp = await signUpWithEmail(parsed.email, parsed.password);
    if (signUp.user) {
      window.localStorage.removeItem("testino_pending_auth");
      return { success: true, error: null };
    }

    return { success: false, error: signUp.error };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
