"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseClient } from "@/platform/auth/supabase-client";
import { BrandLogo } from "@/components/ui/brand-logo";

/**
 * OAuth PKCE callback landing page.
 *
 * Supabase redirects here with ?code=... (PKCE). Creating the Supabase
 * client triggers detectSessionInUrl + code exchange.
 *
 * Previously ANY auth event (including INITIAL_SESSION with session=null —
 * what fires when the code expired or was already used) redirected silently
 * to onboarding, so users landed signed-out with NO error and retried the
 * whole flow forever. Now: redirect only when a session actually exists,
 * and show an explicit failure state with a retry action otherwise.
 */
export default function AuthCallbackPage() {
  const router = useRouter();
  const redirectedRef = useRef(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const redirect = () => {
      if (redirectedRef.current) return;
      redirectedRef.current = true;
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);

      // If opened as a popup or secondary window/tab with an opener
      if (typeof window !== "undefined") {
        try {
          if (window.opener && window.opener !== window) {
            // Inform opener window of successful login
            window.opener.postMessage({ type: "TESTINO_AUTH_SUCCESS" }, "*");
            // Attempt to close the popup window automatically
            window.close();
            // If window.close() succeeded or was blocked, wait briefly
            setTimeout(() => {
              try {
                window.close();
              } catch {
                // ignore
              }
            }, 300);
          }
        } catch {
          // ignore cross-origin issues
        }
      }

      router.replace("/onboarding/");
    };

    const fail = () => {
      if (redirectedRef.current) return;
      setFailed(true);
    };

    try {
      const client = getSupabaseClient();
      if (!client) {
        redirect();
        return;
      }

      const { data } = client.auth.onAuthStateChange((event, session) => {
        if (session?.user) {
          redirect();
        } else if (event === "INITIAL_SESSION" || event === "SIGNED_OUT") {
          // Check if there is an explicit code in URL before failing
          if (typeof window !== "undefined") {
            const params = new URLSearchParams(window.location.search);
            const code = params.get("code");
            if (code) {
              import("@/platform/auth/supabase-client").then(({ exchangeOAuthCode }) => {
                exchangeOAuthCode(code).then(({ user }) => {
                  if (user) redirect();
                  else fail();
                }).catch(fail);
              }).catch(fail);
              return;
            }
          }
          fail();
        }
      });
      unsubscribe = () => data.subscription.unsubscribe();

      // In addition to onAuthStateChange, explicitly trigger exchange if code is present in URL
      if (typeof window !== "undefined") {
        const params = new URLSearchParams(window.location.search);
        const code = params.get("code");
        if (code) {
          import("@/platform/auth/supabase-client").then(({ exchangeOAuthCode }) => {
            exchangeOAuthCode(code).then(({ user }) => {
              if (user) redirect();
            }).catch(() => {});
          });
        }
      }

      // Safety net: give the exchange ~8s, then show the failure state.
      timeoutId = setTimeout(fail, 8000);
    } catch {
      fail();
    }

    return () => {
      if (unsubscribe) unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [router]);

  return (
    <main className="focus-shell flex items-center justify-center p-6">
      <div className="flex flex-col items-center gap-4 text-center">
        <BrandLogo size="md" />
        {failed ? (
          <>
            <p className="text-sm font-black text-[var(--ink)]">ورود ناموفق بود.</p>
            <p className="text-xs font-bold text-[var(--muted)] leading-5 max-w-xs">
              لینک ورود منقضی شده یا قبلاً استفاده شده است. لطفاً دوباره تلاش کن.
            </p>
            <button
              type="button"
              onClick={() => router.replace("/onboarding/")}
              className="btn-neo-orange px-5 py-2.5 text-xs font-black rounded-2xl"
            >
              بازگشت به تستینو
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-black text-[var(--muted)]">
              در حال بازگشت به تستینو…
            </p>
            <span className="loading w-5 h-5 rounded-full border-2 border-[var(--testino-orange)] border-t-transparent animate-spin inline-block" />
          </>
        )}
      </div>
    </main>
  );
}
