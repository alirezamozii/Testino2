"use client";

import React, { useState, useCallback } from "react";
import { ArrowLeft } from "lucide-react";
import { BrandLogo } from "@/components/ui/brand-logo";
import { TestinoMascot } from "@/components/ui/testino-ui";
import { cn } from "@/lib/utils";

interface SplashScreenProps {
  onFinish: () => void;
  initialStep?: number;
  hasProfile?: boolean;
}

export function SplashScreen({
  onFinish,
  initialStep = 1,
  hasProfile = false,
}: SplashScreenProps) {
  const [step, setStep] = useState<number>(initialStep);
  const [fading, setFading] = useState(false);

  const handleFinish = useCallback(() => {
    setFading(true);
    setTimeout(() => {
      onFinish();
    }, 200);
  }, [onFinish]);

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 bg-[var(--bg)] text-[var(--ink)] flex flex-col justify-between p-6 sm:p-10 select-none transition-opacity duration-300",
        fading ? "opacity-0 pointer-events-none" : "opacity-100 animate-in fade-in"
      )}
    >
      {/* Top Header */}
      <header className="w-full max-w-lg mx-auto flex items-center justify-between">
        <BrandLogo size="md" />
        <button
          type="button"
          onClick={handleFinish}
          className="text-xs font-black text-[var(--muted)] hover:text-[var(--testino-orange)] transition-colors px-3 py-1.5 rounded-full bg-[var(--surface-2)] border border-[var(--line)] flex items-center gap-1 cursor-pointer"
        >
          <span>رد کردن</span>
          <ArrowLeft size={13} />
        </button>
      </header>

      {/* Main Centered Modern Card - Clean, Spacious, Not Cluttered */}
      <main className="w-full max-w-lg mx-auto flex-1 flex flex-col items-center justify-center text-center px-4 py-6">
        {/* Step 1: Welcome & Intro */}
        {step === 1 && (
          <div className="space-y-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 w-full">
            <div className="py-2">
              <TestinoMascot
                pose="pencil"
                size={190}
                className="hover:scale-105 transition-transform drop-shadow-md"
              />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] tracking-tight">
                آزمون هوشمند، آیندهٔ بزرگ‌تر!
              </h1>
              <p className="text-xs sm:text-sm font-bold text-[var(--muted)] max-w-xs mx-auto leading-relaxed">
                سامانهٔ تمرین، شبیه‌ساز آزمون و مرور هوشمند برای داوطلبان برتر
              </p>
            </div>

            <div className="w-full pt-4 space-y-2.5 max-w-xs">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-neo-orange w-full py-3.5 text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--line)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>ادامه</span>
                <ArrowLeft size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Motivation & Immediate Launch to Onboarding */}
        {step === 2 && (
          <div className="space-y-6 flex flex-col items-center animate-in fade-in zoom-in-95 duration-300 w-full">
            <div className="py-2">
              <TestinoMascot
                pose="mountain"
                size={200}
                className="hover:scale-105 transition-transform drop-shadow-md"
              />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] tracking-tight leading-snug">
                یک قدم نزدیک‌تر
                <br />
                به مقصد!
              </h1>
              <p className="text-xs sm:text-sm font-bold text-[var(--muted)] max-w-xs mx-auto leading-relaxed">
                همه چیز آماده است. نام و درس‌های آزمون خود را مشخص کنید و شروع کنید!
              </p>
            </div>

            <div className="w-full pt-4 space-y-2.5 max-w-xs">
              <button
                type="button"
                onClick={handleFinish}
                className="btn-neo-orange w-full py-3.5 text-xs sm:text-sm font-black shadow-[4px_4px_0px_var(--line)] flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>{hasProfile ? "ورود به داشبورد" : "شروع و ساخت حساب"}</span>
                <ArrowLeft size={16} />
              </button>

              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-full py-2 text-xs font-black text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
              >
                بازگشت به گام قبل
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Bottom Minimal Dots */}
      <footer className="w-full max-w-lg mx-auto flex items-center justify-center pb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={cn(
              "h-2 rounded-full transition-all duration-300 cursor-pointer",
              step === 1 ? "w-6 bg-[var(--testino-orange)]" : "w-2 bg-[var(--surface-3)]"
            )}
            aria-label="گام اول"
          />
          <button
            type="button"
            onClick={() => setStep(2)}
            className={cn(
              "h-2 rounded-full transition-all duration-300 cursor-pointer",
              step === 2 ? "w-6 bg-[var(--testino-orange)]" : "w-2 bg-[var(--surface-3)]"
            )}
            aria-label="گام دوم"
          />
        </div>
      </footer>
    </div>
  );
}
