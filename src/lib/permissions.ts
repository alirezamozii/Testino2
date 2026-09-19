import { getSupabaseClient } from "@/platform/auth/supabase-client";

export const OWNER_EMAILS = [
  "alirezakaregar05@gmail.com",
  "alirezakaregar01@gmail.com",
];

export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  return OWNER_EMAILS.some((o) => o.toLowerCase() === clean);
}

export async function getCurrentUserEmail(): Promise<string | null> {
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data } = await supabase.auth.getUser();
      if (data?.user?.email) {
        return data.user.email;
      }
    }
  } catch {
    // ignore
  }

  try {
    const cached = localStorage.getItem("testino_auth_email");
    if (cached) return cached;
  } catch {
    // ignore
  }

  return null;
}

export async function checkIsOwner(): Promise<boolean> {
  const email = await getCurrentUserEmail();
  return isOwnerEmail(email);
}
