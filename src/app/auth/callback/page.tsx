"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getSupabaseClient } from "@/platform/auth/supabase-client";
import { CheckCircle2, AlertCircle, RefreshCw, ArrowRight } from "lucide-react";
import Link from "next/link";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<"processing" | "success" | "error">("processing");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function handleAuth() {
      const code = searchParams.get("code");
      const error = searchParams.get("error");
      const errorDescription = searchParams.get("error_description");

      if (error || errorDescription) {
        if (mounted) {
          setStatus("error");
          setErrorMessage(errorDescription || error || "خطای ناشناخته در ورود با حساب گوگل");
        }
        return;
      }

      const client = getSupabaseClient();
      if (!client) {
        if (mounted) {
          setStatus("error");
          setErrorMessage("تنظیمات کلاینت ابری یافت نشد.");
        }
        return;
      }

      try {
        if (code) {
          const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else {
          // If hash-based or already exchanged by detectSessionInUrl
          const { data } = await client.auth.getSession();
          if (!data.session) {
            // Give a short delay for auto-detection
            await new Promise((r) => setTimeout(r, 500));
            const { data: retryData } = await client.auth.getSession();
            if (!retryData.session) {
              throw new Error("کد احراز هویت در نشانی دریافت نشد.");
            }
          }
        }

        if (mounted) {
          setStatus("success");
          setTimeout(() => {
            router.replace("/settings");
          }, 1200);
        }
      } catch (err) {
        if (mounted) {
          setStatus("error");
          setErrorMessage(err instanceof Error ? err.message : "خطا در پردازش نشست حساب گوگل");
        }
      }
    }

    handleAuth();

    return () => {
      mounted = false;
    };
  }, [searchParams, router]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="card-neo w-full max-w-md p-6 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[4px_4px_0px_var(--neo-shadow)] text-center space-y-4">
        {status === "processing" && (
          <div className="py-6 space-y-3">
            <RefreshCw className="w-10 h-10 animate-spin mx-auto text-amber-500" />
            <h2 className="text-base font-black text-[var(--ink)]">در حال تکمیل ورود با گوگل...</h2>
            <p className="text-xs text-[var(--muted)]">در حال تایید نشست کاربری و همگام‌سازی اطلاعات.</p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6 space-y-3">
            <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500" />
            <h2 className="text-base font-black text-[var(--ink)]">ورود با موفقیت انجام شد!</h2>
            <p className="text-xs text-[var(--muted)]">در حال انتقال به صفحه تنظیمات...</p>
          </div>
        )}

        {status === "error" && (
          <div className="py-6 space-y-4">
            <AlertCircle className="w-10 h-10 mx-auto text-rose-500" />
            <h2 className="text-base font-black text-rose-600 dark:text-rose-400">خطا در احراز هویت</h2>
            <p className="text-xs text-[var(--muted)] bg-rose-50 dark:bg-rose-950/40 p-3 rounded-xl border border-rose-200 dark:border-rose-800">
              {errorMessage}
            </p>
            <div className="pt-2">
              <Link
                href="/settings"
                className="btn-neo-orange inline-flex items-center gap-2 py-2 px-5 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)]"
              >
                <span>بازگشت به تنظیمات</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
