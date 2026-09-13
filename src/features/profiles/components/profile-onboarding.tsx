"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { searchSubjects, registerSubject, getPopularSubjects } from "@/platform/shared-subjects";
import {
  ArrowLeft,
  Calendar,
  Check,
  ChevronRight,
  Clock,
  Plus,
  Target,
  Sparkles,
  Trash2,
  User,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  Link2,
} from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/with-timeout";
import { BrandLogo } from "@/components/ui/brand-logo";
import { calculateWeightedTarget } from "@/features/profiles/domain/score-groups";
import { canonicalizeSubject, isSameSubject } from "@/features/questions/domain/subject-registry";
import {
  getSupabaseConfig,
  signInWithGoogle,
  signInWithEmail,
  signUpWithEmail,
  signOut,
  getCurrentAuthUser,
  exchangeOAuthCode,
} from "@/platform/auth/supabase-client";

/** Auth requests must never hang the onboarding spinner forever. */
const AUTH_REQUEST_TIMEOUT_MS = 15_000;

export function ProfileOnboarding() {
  const { db } = useDatabase();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [step, setStep] = useState(1);

  // Step 1: User Identity & Auth
  const [userName, setUserName] = useState("");
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authUserId, setAuthUserId] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [authTab, setAuthTab] = useState<"email" | "google">("email");
  const [manualOAuthCode, setManualOAuthCode] = useState("");
  const [showManualCodeInput, setShowManualCodeInput] = useState(false);
  const [isManualExchanging, setIsManualExchanging] = useState(false);

  // Email+Password fields
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Existing account dialog
  const [showExistingAccountDialog, setShowExistingAccountDialog] = useState(false);
  const [existingOwnerName, setExistingOwnerName] = useState("");

  // Step 2: Exam & Track (manual text inputs only)
  const [examType, setExamType] = useState("");
  const [trackName, setTrackName] = useState("");

  // Step 3: User Subjects (starts EMPTY — all manual)
  const [selectedSubjects, setSelectedSubjects] = useState<
    Array<{ name: string; coefficient: number; selected: boolean; targetPercentage: number; questionCount: number; scoreGroup: string }>
  >([]);

  // Form for adding custom subject
  const [newSubjName, setNewSubjName] = useState("");
  const [newSubjCoeff, setNewSubjCoeff] = useState(3);
  const [newSubjTarget, setNewSubjTarget] = useState(70);
  const [newSubjQuestions, setNewSubjQuestions] = useState(25);
  const [isGroupMergeEnabled, setIsGroupMergeEnabled] = useState(false);
  const [showGroupMerge, setShowGroupMerge] = useState(false);
  const [newSubjScoreGroup, setNewSubjScoreGroup] = useState("");
  const [selectedExistingGroup, setSelectedExistingGroup] = useState("");
  const [subjectError, setSubjectError] = useState("");

  // Autocomplete & Community Suggestions from Supabase shared subjects
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [popularSubjects, setPopularSubjects] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const googlePollRef = useRef<number | null>(null);

  // Clear any running Google session polling when the page unmounts.
  useEffect(() => {
    return () => {
      if (googlePollRef.current) window.clearInterval(googlePollRef.current);
    };
  }, []);

  // Step 4: Study Timeline
  const [timeRemainingMode, setTimeRemainingMode] = useState<"preset" | "custom">("preset");
  const [timePreset, setTimePreset] = useState("۶ ماه");
  const [customTimeMonths, setCustomTimeMonths] = useState(6);
  const [dailyHours, setDailyHours] = useState(6);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Load existing owner or active auth session on mount
  useEffect(() => {
    let active = true;

    // 1. Check local owner from SQLite
    db.getCurrentOwner()
      .then((owner) => {
        if (!active || !owner) return;
        if (owner.displayName) {
          setUserName((prev) => prev || owner.displayName);
          setExistingOwnerName(owner.displayName);
        }
        if (owner.kind === "account" && owner.authUserId) {
          setIsAuthenticated(true);
          setAuthEmail(owner.authUserId);
        }
      })
      .catch(() => {});

    // 2. Check active Supabase auth session (e.g. from Google PKCE redirect)
    getCurrentAuthUser()
      .then((user) => {
        if (!active || !user || !user.email) return;
        setIsAuthenticated(true);
        setAuthEmail(user.email);
        const metaName = (user.user_metadata?.full_name || user.user_metadata?.name || "") as string;
        if (metaName) {
          setUserName((prev) => prev || metaName);
        } else {
          setUserName((prev) => prev || user.email!.split("@")[0]);
        }
        const avatar = user.user_metadata?.avatar_url as string | undefined;
        if (avatar) {
          setAvatarUrl(avatar);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [db]);

  // Load community shared subjects from Supabase when entering Step 3
  useEffect(() => {
    if (step === 3) {
      getPopularSubjects(16)
        .then((list) => {
          if (list && list.length > 0) {
            setPopularSubjects(list);
          }
        })
        .catch(() => {});
    }
  }, [step]);

  // Dismiss suggestions dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Effective track name
  const effectiveTrack = trackName.trim() || "عمومی";

  // Calculate live weighted average based on individual subject targets and coefficients
  const activeSelectedSubjects = selectedSubjects.filter((s) => s.selected);
  const weightedTarget = calculateWeightedTarget(activeSelectedSubjects);
  const totalCoeff = weightedTarget.totalCoefficient;
  const weightedAverage = Math.round(weightedTarget.percentage ?? 0);

  const finalTimeRemaining =
    timeRemainingMode === "preset" ? timePreset : `${customTimeMonths} ماه`;

  // === Auth handlers ===

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const cleanEmail = emailInput.trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes("@")) {
      setError("لطفاً یک آدرس ایمیل معتبر وارد کنید.");
      return;
    }
    if (passwordInput.length < 6) {
      setError("رمز عبور باید حداقل ۶ کاراکتر باشد.");
      return;
    }

    setIsAuthLoading(true);
    const finalName = userName.trim() || cleanEmail.split("@")[0] || "دانش‌آموز";

    // Network calls are timeout-bounded: a hung auth request must release the
    // button spinner (isAuthLoading) instead of blocking onboarding forever.
    let cloudSynced = false;
    let authenticatedUserId = "";
    const config = getSupabaseConfig();

    if (config.isConfigured) {
      try {
        const signInResult = await withTimeout(
          signInWithEmail(cleanEmail, passwordInput),
          AUTH_REQUEST_TIMEOUT_MS,
          "ورود با ایمیل"
        );
        let authResult = signInResult;
        if (!authResult.user) {
          const signInErrMsg = authResult.error?.message || "";
          const lowerMsg = signInErrMsg.toLowerCase();

          // Check if failure is due to incorrect credentials
          if (
            lowerMsg.includes("invalid login credentials") ||
            lowerMsg.includes("invalid credentials") ||
            lowerMsg.includes("invalid password")
          ) {
            // Attempt signup in case this is a brand new user
            const signUpResult = await withTimeout(
              signUpWithEmail(cleanEmail, passwordInput),
              AUTH_REQUEST_TIMEOUT_MS,
              "ساخت حساب"
            );
            if (signUpResult.user) {
              authResult = signUpResult;
            } else {
              const signUpErrMsg = signUpResult.error?.message?.toLowerCase() || "";
              if (
                signUpErrMsg.includes("already registered") ||
                signUpErrMsg.includes("user already registered") ||
                signUpErrMsg.includes("already exist")
              ) {
                setError("رمز عبور وارد شده نادرست است. لطفاً رمز عبور را بررسی کرده و مجدداً تلاش کنید.");
                setIsAuthLoading(false);
                return;
              }
              setError(signUpResult.error?.message || "رمز عبور نادرست است یا حساب کاربری یافت نشد.");
              setIsAuthLoading(false);
              return;
            }
          } else {
            setError(authResult.error?.message || "ایمیل یا رمز عبور نامعتبر است.");
            setIsAuthLoading(false);
            return;
          }
        }

        if (!authResult.user) {
          setError(authResult.error?.message || "خطا در احراز هویت با ایمیل و رمز عبور.");
          setIsAuthLoading(false);
          return;
        }

        cloudSynced = true;
        authenticatedUserId = authResult.user.id;
        setAuthUserId(authResult.user.id);
      } catch (authErr) {
        setError(authErr instanceof Error ? authErr.message : "خطا در برقراری ارتباط با سرور احراز هویت.");
        setIsAuthLoading(false);
        return;
      }
    }

    // Always register locally in SQLite & memory (Offline-First).
    // When the cloud is unreachable or unconfigured we still keep a local
    // owner so onboarding can complete; sync links it later.
    try {
      if (authenticatedUserId) {
        await db.linkAuthenticatedAccount(authenticatedUserId, finalName);
      } else {
        await db.saveOwner(finalName, "local");
      }
      await queryClient.invalidateQueries({ queryKey: ["owner"] });
      await queryClient.invalidateQueries({ queryKey: ["owner-shell"] });

      if (!cloudSynced && !authenticatedUserId && config.isConfigured) {
        localStorage.setItem("testino_pending_auth", JSON.stringify({
          email: cleanEmail,
          password: passwordInput,
          registeredAt: Date.now(),
        }));
      }
    } catch {
      // ignore
    }

    setIsAuthenticated(true);
    setAuthEmail(cleanEmail);
    if (!userName.trim()) {
      setUserName(finalName);
    }
    setIsAuthLoading(false);

    // Automatically advance to Step 2!
    setStep(2);
  }

  async function handleGoogleSignIn() {
    setError("");
    const config = getSupabaseConfig();
    if (!config.isConfigured) {
      setError("تنظیمات Supabase در فایل .env تنظیم نشده است. لطفاً NEXT_PUBLIC_SUPABASE_URL و NEXT_PUBLIC_SUPABASE_ANON_KEY را در فایل .env قرار دهید.");
      return;
    }

    setIsAuthLoading(true);
    try {
      const isNative =
        Boolean((window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.());
      const isElectron =
        typeof window !== "undefined" &&
        (Boolean((window as unknown as { testinoDesktop?: { isElectron?: boolean } }).testinoDesktop?.isElectron) ||
          window.navigator.userAgent.includes("Electron"));
      const origin = typeof window !== "undefined" ? window.location.origin : "";
      const redirectUrl = (!isNative && !isElectron && origin) ? `${origin}/auth/callback` : undefined;

      const { data, error: authError } = await withTimeout(
        signInWithGoogle(redirectUrl),
        AUTH_REQUEST_TIMEOUT_MS,
        "شروع ورود با گوگل"
      );
      if (authError) {
        setError(authError.message);
        setIsAuthLoading(false);
      } else if (isNative || isElectron) {
        // Native and Electron already opened system browser once inside signInWithGoogle
        setError("صفحهٔ ورود با گوگل در مرورگر باز شد. پس از تأیید، به‌صورت خودکار به برنامه بازمی‌گردید.");
        setShowManualCodeInput(true);
        startGoogleSessionPolling();
        // Give 5 seconds then allow interaction so user is never locked
        setTimeout(() => setIsAuthLoading(false), 5000);
      } else if (data?.url) {
        const opened = window.open(data.url, "_blank");
        if (!opened) {
          window.location.assign(data.url);
          return;
        }
        setError("پنجرهٔ ورود گوگل در تب جدید باز شد. پس از تأیید، به‌صورت خودکار به این صفحه بازمی‌گردید.");
        setShowManualCodeInput(true);
        startGoogleSessionPolling();
        setTimeout(() => setIsAuthLoading(false), 5000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در برقراری اتصال با گوگل");
      setIsAuthLoading(false);
    }
  }

  async function handleManualOAuthSubmit() {
    if (!manualOAuthCode.trim()) return;
    setIsManualExchanging(true);
    setError("");
    try {
      const { user, error: exError } = await exchangeOAuthCode(manualOAuthCode);
      if (exError || !user) {
        setError(exError?.message || "کد یا آدرس نامعتبر است. لطفاً دوباره تلاش کنید.");
      } else {
        if (googlePollRef.current) window.clearInterval(googlePollRef.current);
        googlePollRef.current = null;
        setIsAuthenticated(true);
        setAuthEmail(user.email || "");
        setAuthUserId(user.id);
        const metaName = (user.user_metadata?.full_name || user.user_metadata?.name || "") as string;
        setUserName((prev) => prev || metaName || (user.email ? user.email.split("@")[0] : ""));
        const avatar = user.user_metadata?.avatar_url as string | undefined;
        if (avatar) setAvatarUrl(avatar);
        setShowManualCodeInput(false);
        setError("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "خطا در بررسی کد ورود");
    } finally {
      setIsManualExchanging(false);
      setIsAuthLoading(false);
    }
  }

  /**
   * After the OAuth tab flow, the session is persisted by supabase-js in
   * shared localStorage. Poll briefly so this tab picks it up without a
   * manual reload.
   */
  function startGoogleSessionPolling() {
    if (googlePollRef.current) window.clearInterval(googlePollRef.current);
    let elapsed = 0;
    googlePollRef.current = window.setInterval(async () => {
      elapsed += 1500;
      if (elapsed > 120000) {
        if (googlePollRef.current) window.clearInterval(googlePollRef.current);
        googlePollRef.current = null;
        setIsAuthLoading(false);
        return;
      }
      try {
        const user = await getCurrentAuthUser();
        if (user?.email) {
          if (googlePollRef.current) window.clearInterval(googlePollRef.current);
          googlePollRef.current = null;
          setIsAuthenticated(true);
          setAuthEmail(user.email);
          const metaName = (user.user_metadata?.full_name || user.user_metadata?.name || "") as string;
          setUserName((prev) => prev || metaName || user.email!.split("@")[0]);
          const avatar = user.user_metadata?.avatar_url as string | undefined;
          if (avatar) setAvatarUrl(avatar);
          setIsAuthLoading(false);
          setError("");
        }
      } catch {
        // ignore polling errors
      }
    }, 1500);
  }

  async function handleDisconnectAuth() {
    try {
      await signOut();
    } catch {
      // ignore
    }
    setIsAuthenticated(false);
    setAuthEmail("");
    setAvatarUrl(null);
  }

  async function handleNextStep() {
    setError("");
    if (step === 1) {
      const cleanEmail = emailInput.trim().toLowerCase();
      const cleanName = userName.trim();
      const finalName = cleanName || (cleanEmail ? cleanEmail.split("@")[0] : "") || (authEmail ? authEmail.split("@")[0] : "") || "دانش‌آموز";

      if (!cleanName && !cleanEmail && !authEmail) {
        setError("لطفاً نام یا آدرس ایمیل خود را وارد کنید.");
        return;
      }

      // Check if local owner already exists → show dialog
      try {
        const existingOwner = await db.getCurrentOwner();
        if (existingOwner && existingOwner.displayName && !showExistingAccountDialog && !isAuthenticated) {
          setExistingOwnerName(existingOwner.displayName);
          setShowExistingAccountDialog(true);
          return;
        }
      } catch {
        // ignore
      }

      try {
        if (authUserId) {
          await db.linkAuthenticatedAccount(authUserId, finalName);
          setAuthEmail(authEmail.trim() || cleanEmail);
          setIsAuthenticated(true);
        } else {
          await db.saveOwner(finalName, "local");
        }
        await queryClient.invalidateQueries({ queryKey: ["owner"] });
        await queryClient.invalidateQueries({ queryKey: ["owner-shell"] });
      } catch {
        // Non-blocking local commit
      }
    }
    if (step === 2) {
      if (!examType.trim()) {
        setError("لطفاً نوع آزمون خود را وارد کنید.");
        return;
      }
    }
    setStep((s) => s + 1);
  }

  const handleSubjectNameChange = (val: string) => {
    setNewSubjName(val);
    setSubjectError("");

    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    const trimmed = val.trim();
    if (trimmed.length >= 1) {
      setSuggestionsLoading(true);
      debounceRef.current = setTimeout(async () => {
        try {
          const results = await searchSubjects(trimmed);
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        } finally {
          setSuggestionsLoading(false);
        }
      }, 250);
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSuggestionsLoading(false);
    }
  };

  const selectSuggestion = (name: string) => {
    setNewSubjName(canonicalizeSubject(name));
    setShowSuggestions(false);
    setSubjectError("");
  };

  function handleAddCustomSubject(e?: React.FormEvent) {
    if (e) e.preventDefault();
    const name = canonicalizeSubject(newSubjName);
    if (!name) {
      setSubjectError("نام درس الزامی است.");
      return;
    }
    if (selectedSubjects.some((s) => isSameSubject(s.name, name))) {
      setSubjectError("این درس قبلاً در لیست وجود دارد.");
      return;
    }
    const resolvedGroup = isGroupMergeEnabled
      ? (selectedExistingGroup.trim() || newSubjScoreGroup.trim() || name)
      : "";
    const normalizedGroup = resolvedGroup.trim().toLocaleLowerCase("fa-IR");
    const groupPeer = normalizedGroup
      ? selectedSubjects.find((s) => s.scoreGroup.trim().toLocaleLowerCase("fa-IR") === normalizedGroup)
      : undefined;
    setSelectedSubjects((prev) => [
      ...prev,
      {
        name,
        coefficient: groupPeer?.coefficient ?? Math.max(1, newSubjCoeff),
        targetPercentage: Math.max(0, Math.min(100, newSubjTarget)),
        questionCount: Math.max(1, Math.min(200, newSubjQuestions)),
        scoreGroup: resolvedGroup,
        selected: true,
      },
    ]);
    // Save to shared Supabase community catalog in background so other users can see it
    registerSubject(name);
    setNewSubjName("");
    setShowSuggestions(false);
    setNewSubjCoeff(3);
    setNewSubjTarget(70);
    setNewSubjQuestions(25);
    setIsGroupMergeEnabled(false);
    setNewSubjScoreGroup("");
    setSelectedExistingGroup("");
    setSubjectError("");
  }

  function handleRemoveSubject(idx: number) {
    setSelectedSubjects((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleSubject(idx: number) {
    setSelectedSubjects((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], selected: !next[idx].selected };
      return next;
    });
  }

  function updateSubjectTarget(idx: number, target: number) {
    setSelectedSubjects((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], targetPercentage: Math.max(0, Math.min(100, target)) };
      return next;
    });
  }

  // Final Complete: Save to SQLite
  async function handleComplete() {
    setSaving(true);
    setError("");
    try {
      const activeSubjects = selectedSubjects
        .filter((s) => s.selected)
        .map((s) => ({
          name: s.name,
          coefficient: s.coefficient,
          targetPercentage: s.targetPercentage,
          questionCount: s.questionCount,
          scoreGroup: s.scoreGroup || null,
        }));

      if (activeSubjects.length === 0) {
        throw new Error("حداقل یک درس باید برای آزمون اضافه شود.");
      }

      // 1. Save Owner
      const cleanOwnerName = userName.trim() || (isAuthenticated ? authEmail.split("@")[0] : "دانش‌آموز");
      // 2. Create Profile
      const examTitle = examType.trim() || "آزمون تحصیلی";

      // Cold-start OPFS/worker hiccups are transient (worker restart + re-open);
      // one retry turns a rare first-run failure into a self-heal instead of an
      // error screen that loses the whole wizard input.
      let profileId = "";
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          if (isAuthenticated && authUserId) {
            await db.linkAuthenticatedAccount(authUserId, cleanOwnerName);
          } else {
            await db.saveOwner(cleanOwnerName, "local");
          }

          profileId = await db.createProfile({
            name: `${examTitle} - ${effectiveTrack}`,
            targetTrack: effectiveTrack,
            subjects: activeSubjects,
          });

          const persistedProfiles = await db.listProfiles();
          if (persistedProfiles.some((profile) => profile.id === profileId)) break;
          throw new Error("persist-verify-failed");
        } catch (attemptError) {
          if (attempt === 1) {
            if (attemptError instanceof Error && attemptError.message === "persist-verify-failed") {
              throw new Error("پروفایل روی حافظهٔ پایدار تأیید نشد. دوباره تلاش کنید.");
            }
            throw attemptError;
          }
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }

      // 3. Register any new subjects to Supabase catalog so other users can see them
      activeSubjects.forEach((sub) => {
        void registerSubject(sub.name);
      });

      // Cache refreshes must NOT gate navigation: an awaited invalidate could
      // hang on a busy DB and strand the wizard on step 4. The dashboard
      // refetches on mount anyway.
      void queryClient
        .invalidateQueries({ queryKey: ["owner"] })
        .then(() => queryClient.invalidateQueries({ queryKey: ["owner-shell"] }))
        .then(() => queryClient.invalidateQueries({ queryKey: ["profiles"] }))
        .then(() => queryClient.invalidateQueries({ queryKey: ["dashboard"] }))
        .catch(() => undefined);

      // Mark onboarding complete so splash/redirect logic treats the user
      // as fully registered on future visits.
      try {
        localStorage.setItem("testino_onboarding_completed", "true");
      } catch {
        // ignore
      }

      router.push("/");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "خطا در ثبت پروفایل");
    } finally {
      setSaving(false);
    }
  }

  const stepsHeader = [
    { num: 1, label: "مشخصات و حساب" },
    { num: 2, label: "آزمون و رشته" },
    { num: 3, label: "درس‌ها و هدف" },
    { num: 4, label: "برنامه و تکمیل" },
  ];

  return (
    <div className="onboarding-page w-full max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
      {/* Top Brand Bar */}
      <div className="flex items-center justify-between">
        <BrandLogo size="md" />
        <span className="text-xs font-black text-[var(--muted)]">
          راه‌اندازی پروفایل واقعی مطالعه
        </span>
      </div>

      {/* Stepper Header */}
      <div className="card-neo p-4 sm:p-5 bg-[var(--surface)]">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {stepsHeader.map((s, idx) => {
            const isCurrent = step === s.num;
            const isDone = step > s.num;
            return (
              <div key={s.num} className="flex items-center flex-1 last:flex-initial">
                <div className="flex flex-col items-center flex-1">
                  <div
                    className={cn(
                      "w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center font-black text-xs transition-all border-2",
                      isCurrent
                        ? "bg-[var(--testino-orange)] text-white border-[var(--line)] shadow-[2px_2px_0px_var(--line)] scale-110"
                        : isDone
                        ? "bg-[var(--brand-green)] text-[var(--ink-on-color)] border-[var(--line)]"
                        : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line-strong)]"
                    )}
                  >
                    {isDone ? <Check size={16} strokeWidth={3} /> : s.num}
                  </div>

                  <span
                    className={cn(
                      "text-[10px] sm:text-xs font-black mt-1.5 transition-colors whitespace-nowrap",
                      isCurrent
                        ? "text-[var(--testino-orange)] font-black"
                        : isDone
                        ? "text-[var(--ink)]"
                        : "text-[var(--muted)]"
                    )}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < stepsHeader.length - 1 && (
                  <div
                    className={cn(
                      "h-0.5 flex-1 mx-1.5 mb-5 transition-colors rounded-full",
                      step > idx + 1 ? "bg-[var(--brand-green)]" : "bg-[var(--surface-3)]"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Responsive Two-Column Layout on Desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Side: Live Summary & Encouraging Card (Desktop only) */}
        <aside className="hidden lg:block lg:col-span-4 sticky top-6 space-y-4">
          <div className="card-neo p-5 bg-[var(--surface)] space-y-4">
            <div className="flex items-center gap-2.5 pb-3 border-b border-[var(--line-strong)]">
              <div className="w-9 h-9 rounded-xl bg-[var(--pastel-blue)]/40 border-2 border-[var(--line)] flex items-center justify-center text-[var(--ink-on-color)]">
                <Sparkles size={18} />
              </div>
              <div>
                <strong className="text-sm font-black text-[var(--ink)] block">
                  دورنمای برنامه شما
                </strong>
                <span className="text-[10px] text-[var(--muted)] font-bold">
                  اطلاعات واقعی و شخصی‌سازی‌شده
                </span>
              </div>
            </div>

            <div className="space-y-3 text-xs font-bold">
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--line-strong)]/40">
                <span className="text-[var(--muted)]">کاربر:</span>
                <strong className="text-[var(--ink)] font-black truncate max-w-[140px]">
                  {userName || (isAuthenticated ? authEmail : "کاربر جدید")}
                </strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--line-strong)]/40">
                <span className="text-[var(--muted)]">حساب:</span>
                <strong className={cn("font-black", isAuthenticated ? "text-blue-600 dark:text-blue-400" : "text-[var(--ink)]")}>
                  {isAuthenticated ? "حساب متصل" : "پروفایل محلی"}
                </strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--line-strong)]/40">
                <span className="text-[var(--muted)]">نوع آزمون:</span>
                <strong className="text-[var(--ink)] font-black truncate max-w-[140px]">{examType || "—"}</strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--line-strong)]/40">
                <span className="text-[var(--muted)]">رشته / گرایش:</span>
                <strong className="text-[var(--ink)] font-black truncate max-w-[140px]">
                  {effectiveTrack}
                </strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--line-strong)]/40">
                <span className="text-[var(--muted)]">دروس فعال:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-black">
                  {activeSelectedSubjects.length} درس
                </strong>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-[var(--line-strong)]/40">
                <span className="text-[var(--muted)]">فرصت باقی‌مانده:</span>
                <strong className="text-[var(--ink)] font-black">{finalTimeRemaining}</strong>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-[var(--muted)]">مطالعه روزانه:</span>
                <strong className="text-[var(--ink)] font-black">{dailyHours} ساعت</strong>
              </div>
            </div>

            {/* Calculated Weighted Target Badge */}
            {activeSelectedSubjects.length > 0 && (
              <div className="p-4 rounded-2xl bg-[var(--pastel-orange)]/15 border-2 border-[var(--line)] text-center space-y-1">
                <span className="text-[11px] font-black text-[var(--muted)] block">
                  میانگین هدف کل (محاسبه وزنی):
                </span>
                <div className="text-3xl font-black text-[var(--testino-orange)]">
                  {weightedAverage}٪
                </div>
                <span className="text-[10px] text-[var(--muted)] font-bold block">
                  مجموع ضرایب دروس: {totalCoeff}
                </span>
              </div>
            )}
          </div>
        </aside>

        {/* Right Side: Step Wizard Content */}
        <div className="lg:col-span-8 space-y-5">
          {error && (
            <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-2 border-red-400 text-xs font-black shadow-[2px_2px_0px_#EF4444]">
              {error}
            </div>
          )}

          <div className="card-neo p-6 sm:p-7 space-y-6 bg-[var(--surface)]">
            {/* =================================================================== */}
            {/* STEP 1: هویت کاربر و احراز هویت تب‌دار */}
            {/* =================================================================== */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="text-right space-y-1">
                  <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border-2 border-[var(--line)]">
                    گام ۱ از ۴ • هویت و حساب کاربری
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">
                    نام خود را وارد کنید
                  </h2>
                  <p className="text-xs text-[var(--muted)] font-bold leading-relaxed">
                    نام نمایشی شما در کارنامه‌ها و گزارش‌های مطالعه درج می‌شود. اتصال به حساب کاملاً اختیاری است.
                  </p>
                </div>

                {/* Identity & Avatar Card */}
                <div className="p-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] space-y-4">
                  <div className="flex items-center gap-4">
                    {/* Avatar Preview */}
                    <div className="relative shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt="Avatar"
                          className="w-16 h-16 rounded-2xl border-2 border-[var(--line)] object-cover shadow-[3px_3px_0px_var(--line)]"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-2xl bg-[var(--pastel-orange)]/30 border-2 border-[var(--line)] flex items-center justify-center font-black text-xl text-[var(--testino-orange)] shadow-[3px_3px_0px_var(--line)]">
                          {userName.trim() ? userName.trim().slice(0, 2) : <User size={28} className="text-[var(--ink)]" />}
                        </div>
                      )}
                      {isAuthenticated && (
                        <div
                          className="absolute -bottom-1.5 -left-1.5 w-6 h-6 rounded-full bg-[var(--brand-green)] border-2 border-[var(--line)] flex items-center justify-center text-white"
                          title="حساب متصل است"
                        >
                          <Check size={12} strokeWidth={3.5} />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 space-y-1">
                      <label className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
                        <User size={14} className="text-[var(--testino-orange)]" />
                        <span>نام یا لقب نمایشی شما در تستیونو:</span>
                      </label>
                      <input
                        type="text"
                        value={userName}
                        onChange={(e) => {
                          setUserName(e.target.value);
                          if (error) setError("");
                        }}
                        placeholder="نام یا نام خانوادگی خود را بنویسید..."
                        className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-black text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:ring-2 focus:ring-[var(--testino-orange)] shadow-[2px_2px_0px_var(--line)]"
                      />
                    </div>
                  </div>
                </div>

                {/* Auth Connection Card — Tabbed */}
                <div className="p-4 sm:p-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] space-y-4 shadow-[2px_2px_0px_var(--line)]">
                  <div className="flex items-center gap-3 pb-2">
                    <div className="w-11 h-11 rounded-2xl bg-[var(--surface)] dark:bg-slate-900 border-2 border-[var(--line)] flex items-center justify-center shrink-0 shadow-[2px_2px_0px_var(--line)]">
                      <Lock size={20} className="text-[var(--ink)]" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                          اتصال به حساب کاربری
                        </strong>
                        <span className={cn(
                          "text-[10px] font-black px-2 py-0.5 rounded-full border",
                          isAuthenticated
                            ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
                            : "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800"
                        )}>
                          {isAuthenticated ? "متصل شده" : "اختیاری"}
                        </span>
                      </div>
                      <span className="text-[11px] font-bold text-[var(--muted)] block mt-0.5">
                        {isAuthenticated
                          ? `حساب فعال: ${authEmail}`
                          : "برای همگام‌سازی ابری بین دستگاه‌ها (اختیاری)"}
                      </span>
                    </div>
                  </div>

                  {isAuthenticated ? (
                    <div className="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-300 dark:border-emerald-800">
                      <div className="flex items-center gap-2">
                        <Check size={16} className="text-emerald-600" />
                        <span className="text-xs font-black text-emerald-800 dark:text-emerald-300">{authEmail}</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleDisconnectAuth}
                        className="py-1.5 px-3 rounded-xl border border-red-300 text-red-600 bg-red-50 dark:bg-red-950/40 text-xs font-bold hover:bg-red-100 transition-colors"
                      >
                        قطع اتصال
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Auth Tabs */}
                      <div className="flex gap-2 p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line-strong)]">
                        <button
                          type="button"
                          onClick={() => setAuthTab("email")}
                          className={cn(
                            "flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5",
                            authTab === "email"
                              ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs border border-[var(--line)]"
                              : "text-[var(--muted)]"
                          )}
                        >
                          <Mail size={14} />
                          <span>ایمیل و رمز عبور</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setAuthTab("google")}
                          className={cn(
                            "flex-1 py-2 text-xs font-black rounded-lg transition-all flex items-center justify-center gap-1.5",
                            authTab === "google"
                              ? "bg-[var(--surface)] text-[var(--ink)] shadow-xs border border-[var(--line)]"
                              : "text-[var(--muted)]"
                          )}
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                          </svg>
                          <span>ورود با گوگل</span>
                        </button>
                      </div>

                      {/* Email+Password Tab */}
                      {authTab === "email" && (
                        <form onSubmit={handleEmailAuth} className="space-y-3">
                          <p className="text-[11px] font-bold text-[var(--muted)] leading-relaxed">
                            ایمیل و رمز عبور وارد کنید. اگر حساب دارید وارد می‌شوید، در غیر این صورت حساب جدید ساخته می‌شود.
                          </p>
                          <div className="space-y-1">
                            <label className="text-xs font-black text-[var(--ink)]">آدرس ایمیل</label>
                            <input
                              type="email"
                              required
                              value={emailInput}
                              onChange={(e) => setEmailInput(e.target.value)}
                              placeholder="name@example.com"
                              className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--ink)] text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-[var(--testino-orange)]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-black text-[var(--ink)]">رمز عبور</label>
                            <div className="relative">
                              <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={passwordInput}
                                onChange={(e) => setPasswordInput(e.target.value)}
                                placeholder="••••••"
                                className="w-full bg-[var(--surface-2)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-2.5 text-xs font-bold text-[var(--ink)] text-left dir-ltr focus:outline-none focus:ring-2 focus:ring-[var(--testino-orange)] pl-10"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                                title={showPassword ? "پنهان کردن رمز" : "نمایش رمز"}
                              >
                                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                            <span className="block text-[10px] font-bold text-[var(--muted)]">حداقل ۶ کاراکتر</span>
                          </div>
                          <button
                            type="submit"
                            disabled={isAuthLoading}
                            className="btn-neo-orange w-full py-3 text-xs sm:text-sm font-black shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 cursor-pointer"
                          >
                            {isAuthLoading ? (
                              <>
                                <Loader2 size={14} className="animate-spin" />
                                <span>در حال ثبت اطلاعات…</span>
                              </>
                            ) : (
                              <>
                                <span>ادامه</span>
                                <ArrowLeft size={16} />
                              </>
                            )}
                          </button>
                        </form>
                      )}

                      {/* Google Tab */}
                      {authTab === "google" && (
                        <div className="space-y-3">
                          <p className="text-[11px] font-bold text-[var(--muted)] leading-relaxed">
                            با حساب گوگل خود مستقیماً وارد شوید. اگر حساب جدیدی باشد، به‌طور خودکار ثبت‌نام انجام می‌شود.
                          </p>
                          <button
                            type="button"
                            onClick={handleGoogleSignIn}
                            disabled={isAuthLoading}
                            className="py-2.5 px-4 w-full rounded-xl bg-[var(--surface)] dark:bg-slate-900 border-2 border-[var(--line)] text-xs font-black text-[var(--ink)] shadow-[2px_2px_0px_var(--line)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-2"
                          >
                            {isAuthLoading ? (
                              <>
                                <Loader2 size={14} className="animate-spin text-[var(--testino-orange)]" />
                                <span>در حال انتقال به گوگل…</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4" viewBox="0 0 24 24">
                                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                                </svg>
                                <span>ورود با حساب گوگل</span>
                              </>
                            )}
                          </button>

                          {showManualCodeInput && (
                            <div className="p-3 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line-strong)] space-y-2 mt-2">
                              <label className="text-[11px] font-bold text-[var(--ink)] block">
                                اگر مرورگر خودکار به برنامه بازنگشت، آدرس یا کد صفحه مرورگر را اینجا قرار دهید:
                              </label>
                              <div className="flex gap-2">
                                <input
                                  type="text"
                                  value={manualOAuthCode}
                                  onChange={(e) => setManualOAuthCode(e.target.value)}
                                  placeholder="http://localhost:3000/?code=... یا کد"
                                  className="flex-1 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl px-3 py-1.5 text-xs font-mono text-[var(--ink)]"
                                  dir="ltr"
                                />
                                <button
                                  type="button"
                                  onClick={handleManualOAuthSubmit}
                                  disabled={isManualExchanging || !manualOAuthCode.trim()}
                                  className="btn-neo-orange px-3 py-1.5 text-xs font-black rounded-xl disabled:opacity-50"
                                >
                                  {isManualExchanging ? "تأیید…" : "تأیید"}
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  <p className="text-[10px] text-[var(--muted)] font-bold pt-2 border-t border-[var(--line-strong)]/20">
                    💡 اتصال به حساب کاملاً اختیاری است. تستیونو به‌صورت ۱۰۰٪ آفلاین و مستقل روی دستگاه شما کار می‌کند.
                  </p>
                </div>
              </div>
            )}

            {/* =================================================================== */}
            {/* STEP 2: نوع آزمون و رشته — فقط ورودی دستی */}
            {/* =================================================================== */}
            {step === 2 && (
              <div className="space-y-5">
                <div className="text-right space-y-1">
                  <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[var(--pastel-blue)] text-[var(--ink-on-color)] border-2 border-[var(--line)]">
                    مرحله ۲ از ۴
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">
                    نوع آزمون و رشتهٔ شما چیست؟
                  </h2>
                  <p className="text-xs text-[var(--muted)] font-bold">
                    نوع آزمون و رشتهٔ تحصیلی خود را دستی بنویسید.
                  </p>
                </div>

                {/* Manual Exam Type Input */}
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-[var(--ink)] block">
                      نوع آزمون شما:
                    </label>
                    <input
                      type="text"
                      value={examType}
                      onChange={(e) => setExamType(e.target.value)}
                      placeholder="مثلاً: کنکور سراسری، کارشناسی ارشد، استخدامی، المپیاد..."
                      className="w-full bg-[var(--surface-2)] border-2 border-[var(--line)] rounded-2xl px-4 py-3 text-xs font-black text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--testino-orange)] shadow-[2px_2px_0px_var(--line)]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-black text-[var(--ink)] block">
                      عنوان دقیق رشته یا گرایش شما:
                    </label>
                    <input
                      type="text"
                      value={trackName}
                      onChange={(e) => setTrackName(e.target.value)}
                      placeholder="مثلاً: علوم تجربی، مهندسی کامپیوتر، حقوق، پزشکی..."
                      className="w-full bg-[var(--surface-2)] border-2 border-[var(--line)] rounded-2xl px-4 py-3 text-xs font-black text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:bg-[var(--surface)] focus:ring-2 focus:ring-[var(--testino-orange)] shadow-[2px_2px_0px_var(--line)]"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* =================================================================== */}
            {/* STEP 3: تعریف درس‌ها — کاملاً دستی و خالی شروع */}
            {/* =================================================================== */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="text-right space-y-1">
                  <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#6CCB7F] text-[var(--ink)] border-2 border-[var(--line)]">
                    مرحله ۳ از ۴
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">
                    درس‌های فعال آزمون
                  </h2>
                  <p className="text-xs text-[var(--muted)] font-bold">
                    درس‌های واقعی خود را همراه با ضریب و درصد هدف تعریف کنید.
                  </p>
                </div>

                {/* Inline Add Subject Form with Autocomplete & Community Suggestions */}
                <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] space-y-3">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-black text-[var(--ink)] block">
                      + افزودن درس جدید:
                    </strong>
                    <span className="text-[10px] font-bold text-[var(--muted)]">
                      جستجو در بانک دروس
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                    {/* Autocomplete Input */}
                    <div className="sm:col-span-4 relative" ref={suggestionsRef}>
                      <input
                        type="text"
                        placeholder="نام درس (مثلاً: زیست، آمار...)"
                        value={newSubjName}
                        onChange={(e) => handleSubjectNameChange(e.target.value)}
                        onFocus={() => {
                          if (suggestions.length > 0) setShowSuggestions(true);
                        }}
                        className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--ink)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--testino-orange)]"
                      />
                      {suggestionsLoading && (
                        <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--muted)] pointer-events-none">
                          <Loader2 size={13} className="animate-spin text-[var(--testino-orange)]" />
                        </div>
                      )}

                      {/* Autocomplete Dropdown */}
                      {showSuggestions && suggestions.length > 0 && (
                        <div className="absolute top-full right-0 left-0 mt-1 z-30 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-xl shadow-[3px_3px_0px_var(--neo-shadow)] max-h-52 overflow-y-auto divide-y divide-[var(--line)]/15 neo-scrollbar">
                          <div className="p-2 text-[10px] font-black text-[var(--muted)] bg-[var(--surface-2)] flex items-center justify-between sticky top-0 z-10">
                            <span className="flex items-center gap-1">
                              <Sparkles size={11} className="text-amber-500" />
                              دروس موجود در بانک:
                            </span>
                            <span className="text-[9px] text-[var(--testino-orange)]">کلیک برای انتخاب</span>
                          </div>
                          {suggestions.map((item) => (
                            <button
                              key={item}
                              type="button"
                              onClick={() => selectSuggestion(item)}
                              className="w-full text-right px-3 py-2 text-xs font-bold text-[var(--ink)] hover:bg-[var(--surface-cream)] hover:text-[var(--testino-orange)] transition-colors flex items-center justify-between cursor-pointer"
                            >
                              <span>{item}</span>
                              <span className="text-[10px] text-[var(--muted)]">انتخاب ↵</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="sm:col-span-3 flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[var(--muted)] shrink-0">تعداد سؤال:</span>
                      <input
                        type="number"
                        min="1"
                        max="200"
                        value={newSubjQuestions}
                        onChange={(e) => setNewSubjQuestions(Math.max(1, Number(e.target.value)))}
                        className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-2 py-2 text-xs font-black text-center text-[var(--ink)]"
                        title="تعداد سؤالات این درس در دفترچه کنکور"
                      />
                    </div>
                    <div className="sm:col-span-2 flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[var(--muted)] shrink-0">ضریب:</span>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={newSubjCoeff}
                        onChange={(e) => setNewSubjCoeff(Number(e.target.value))}
                        className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-2 py-2 text-xs font-black text-center text-[var(--ink)]"
                      />
                    </div>
                    <div className="sm:col-span-3 flex items-center gap-1.5">
                      <span className="text-[11px] font-bold text-[var(--muted)] shrink-0">هدف:</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={newSubjTarget}
                        onChange={(e) => setNewSubjTarget(Number(e.target.value))}
                        className="w-full bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl px-2 py-2 text-xs font-black text-center text-[var(--ink)]"
                      />
                      <span className="text-[11px] font-bold text-[var(--muted)] shrink-0">٪</span>
                    </div>
                  </div>

                  {/* Shared score group — collapsed by default; only for users whose
                      subjects share one coefficient (e.g. econ micro+macro). */}
                  {!showGroupMerge ? (
                    <button
                      type="button"
                      onClick={() => setShowGroupMerge(true)}
                      className="flex items-center gap-1.5 text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors cursor-pointer"
                    >
                      <Link2 size={13} className="text-[var(--testino-orange)]" />
                      <span>این درس با درس دیگری یک گروه است؟ (اختیاری — برای مثال اقتصاد خرد و کلان)</span>
                    </button>
                  ) : (
                  <div className="p-3 rounded-xl bg-[var(--surface)] border-2 border-[var(--line)] space-y-2.5">
                    <label className="flex items-center gap-2.5 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={isGroupMergeEnabled}
                        onChange={(e) => {
                          setIsGroupMergeEnabled(e.target.checked);
                          if (!e.target.checked) {
                            setSelectedExistingGroup("");
                            setNewSubjScoreGroup("");
                          }
                        }}
                        className="w-4 h-4 shrink-0 rounded border-2 border-[var(--line)] text-[var(--testino-orange)] focus:ring-[var(--testino-orange)] cursor-pointer"
                      />
                      <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5 min-w-0">
                        <Link2 size={13} className="text-[var(--testino-orange)] shrink-0" />
                        <span>ادغام در گروه مشترک (ضریب گروه فقط یک‌بار حساب می‌شود)</span>
                      </span>
                    </label>

                    {isGroupMergeEnabled && (
                      <div className="space-y-2 pt-1.5 border-t border-[var(--line)]/15 animate-in fade-in-50 duration-200">
                        <p className="text-[10px] text-[var(--muted)] font-bold">
                          درس‌های گروه جدا آزمون داده می‌شوند، ولی ضریب گروه فقط یک‌بار در میانگین کل لحاظ می‌شود.
                        </p>

                        {/* Existing active subjects to merge with */}
                        {selectedSubjects.length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[10px] font-black text-[var(--ink)] block">
                              ادغام با یکی از درس‌های فعال موجود:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {selectedSubjects.map((s) => {
                                const groupName = s.scoreGroup || s.name;
                                const isSelected = selectedExistingGroup === groupName;
                                return (
                                  <button
                                    key={s.name}
                                    type="button"
                                    onClick={() => {
                                      setSelectedExistingGroup(groupName);
                                      setNewSubjScoreGroup(groupName);
                                    }}
                                    className={cn(
                                      "px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer",
                                      isSelected
                                        ? "bg-[var(--testino-orange)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                                        : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--testino-orange)]"
                                    )}
                                  >
                                    ادغام با: {s.name} {s.scoreGroup ? `(گروه ${s.scoreGroup})` : ""}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Common presets */}
                        <div className="space-y-1 pt-1">
                          <span className="text-[10px] font-black text-[var(--muted)] block">
                            یا انتخاب گروه‌های پرتکرار کنکور:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {["اقتصاد خرد و کلان", "ریاضی و آمار", "مدیریت مالی"].map((preset) => (
                              <button
                                key={preset}
                                type="button"
                                onClick={() => {
                                  setSelectedExistingGroup(preset);
                                  setNewSubjScoreGroup(preset);
                                }}
                                className={cn(
                                  "px-2 py-0.5 rounded-md text-[10px] font-bold border transition-all cursor-pointer",
                                  selectedExistingGroup === preset
                                    ? "bg-amber-100 text-amber-900 border-amber-400 dark:bg-amber-950 dark:text-amber-200"
                                    : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
                                )}
                              >
                                {preset}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Custom group name input if needed */}
                        <div className="pt-1">
                          <input
                            type="text"
                            value={newSubjScoreGroup}
                            onChange={(e) => {
                              setNewSubjScoreGroup(e.target.value);
                              setSelectedExistingGroup(e.target.value);
                            }}
                            placeholder="یا عنوان دلخواه گروه (مثلاً: اقتصاد)"
                            className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--ink)] placeholder:text-[var(--muted)]"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  )}

                  {/* Community / Popular Subjects Chips */}
                  {popularSubjects.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-[var(--line)]/15">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-[11px] font-black text-[var(--muted)]">
                          <Sparkles size={12} className="text-amber-500" />
                          <span>درس‌های پرکاربرد (برای درج کلیک کنید):</span>
                        </div>
                        <span className="text-[10px] text-[var(--muted)] font-bold">
                          {popularSubjects.length} درس
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1.5 rounded-xl bg-[var(--surface)] border border-[var(--line)]/40 neo-scrollbar">
                        {popularSubjects.map((subName) => {
                          const isAdded = selectedSubjects.some(
                            (s) => s.name.toLowerCase() === subName.toLowerCase()
                          );
                          const isCurrentlyInInput = newSubjName.trim().toLowerCase() === subName.toLowerCase();
                          return (
                            <button
                              key={subName}
                              type="button"
                              onClick={() => {
                                selectSuggestion(subName);
                              }}
                              className={cn(
                                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border-2 transition-all select-none cursor-pointer",
                                isCurrentlyInInput
                                  ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] scale-105"
                                  : isAdded
                                  ? "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
                                  : "bg-[var(--surface-2)] text-[var(--ink)] border-[var(--line)] hover:border-[var(--testino-orange)] hover:bg-[var(--surface-cream)] shadow-[1px_1px_0px_var(--neo-shadow)] active:translate-y-0.5"
                              )}
                              title={
                                isCurrentlyInInput
                                  ? "در فرم درج شده است (ضریب و هدف را تنظیم کنید)"
                                  : isAdded
                                  ? "قبلاً به لیست اضافه شده — کلیک برای ویرایش مجدد"
                                  : "کلیک برای درج در فرم و تنظیم ضریب"
                              }
                            >
                              <span>{subName}</span>
                              {isCurrentlyInInput ? (
                                <span className="text-[10px] bg-white/30 px-1 rounded">درج شد</span>
                              ) : isAdded ? (
                                <Check size={12} className="text-emerald-600" />
                              ) : (
                                <span className="text-[10px] text-[var(--muted)]">↵</span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleAddCustomSubject}
                    className="btn-neo-orange w-full py-2.5 text-xs font-black shadow-[2px_2px_0px_var(--line)] flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus size={15} />
                    <span>افزودن این درس به آزمون</span>
                  </button>
                  {subjectError && (
                    <p className="text-[11px] text-red-600 font-bold">{subjectError}</p>
                  )}
                </div>

                {/* List of Active Subjects */}
                <div className="space-y-2 max-h-72 overflow-y-auto pr-0.5">
                  {selectedSubjects.length === 0 ? (
                    <div className="p-6 text-center rounded-2xl border-2 border-dashed border-[var(--line-strong)] text-xs text-[var(--muted)] font-bold">
                      هنوز درسی اضافه نکرده‌اید. با فرم بالا اولین درس را اضافه کنید.
                    </div>
                  ) : (
                    selectedSubjects.map((s, idx) => (
                      <div
                        key={s.name}
                        className={cn(
                          "p-3 rounded-2xl border-2 text-right transition-all flex items-center justify-between gap-3",
                          s.selected
                            ? "border-[var(--line)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--line)]"
                            : "border-[var(--line-strong)] bg-[var(--surface-2)] opacity-50"
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <button
                            type="button"
                            onClick={() => toggleSubject(idx)}
                            className={cn(
                              "w-6 h-6 rounded-lg border-2 border-[var(--line)] flex items-center justify-center shrink-0 transition-all",
                              s.selected ? "bg-[#6CCB7F] text-[var(--ink)]" : "bg-[var(--surface)]"
                            )}
                          >
                            {s.selected && <Check size={14} strokeWidth={3} />}
                          </button>
                          <div className="min-w-0">
                            <strong className="block text-xs sm:text-sm font-black text-[var(--ink)] truncate">
                              {s.name}
                            </strong>
                            <div className="text-[11px] font-bold text-[var(--muted)] flex flex-wrap items-center gap-2 mt-0.5">
                              <span>ضریب: {s.coefficient}</span>
                              <span>•</span>
                              <span>{s.questionCount} سؤال</span>
                              <span>•</span>
                              <span>هدف: {s.targetPercentage}٪</span>
                              {s.scoreGroup && <><span>•</span><span>گروه: {s.scoreGroup}</span></>}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRemoveSubject(idx)}
                            className="w-8 h-8 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-300 text-red-600 flex items-center justify-center hover:bg-red-100 transition-colors"
                            title="حذف درس"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Per-subject target adjustment (inline) */}
                {activeSelectedSubjects.length > 0 && (
                  <div className="space-y-3 pt-3 border-t-2 border-[var(--line-strong)]/20">
                    {/* Overall Live Calculated Average Card */}
                    <div className="p-4 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] shadow-[3px_3px_0px_var(--line)] flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-[var(--testino-orange)] text-white border-2 border-[var(--line)] flex items-center justify-center shrink-0">
                          <Target size={20} />
                        </div>
                        <div>
                          <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                            میانگین هدف کل (محاسبه خودکار):
                          </strong>
                          <span className="text-[10px] text-[var(--muted)] font-bold">
                            ابتدا اعضای گروه بر اساس تعداد سؤال ترکیب می‌شوند؛ سپس ضریب گروه یک‌بار اعمال می‌شود
                          </span>
                        </div>
                      </div>
                      <span className="text-lg sm:text-2xl font-black px-3 py-1 rounded-xl bg-[var(--testino-orange)] text-white border-2 border-[var(--line)] shadow-[2px_2px_0px_var(--line)]">
                        {weightedAverage}٪
                      </span>
                    </div>

                    {/* Subject sliders */}
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {selectedSubjects.map((s, idx) => {
                        if (!s.selected) return null;
                        return (
                          <div
                            key={s.name}
                            className="p-3 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line)] shadow-[2px_2px_0px_var(--line)] space-y-2"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-[var(--pastel-blue)]/40 text-[var(--ink-on-color)] border border-[var(--line)] shrink-0">
                                  ضریب {s.coefficient}
                                </span>
                                <strong className="text-xs font-black text-[var(--ink)] truncate">
                                  {s.name}
                                </strong>
                              </div>
                              <span className="text-xs font-black px-2 py-0.5 rounded-lg bg-[var(--surface-2)] text-[var(--ink)] border border-[var(--line)] shrink-0">
                                {s.targetPercentage}٪
                              </span>
                            </div>

                            <div className="flex items-center gap-3">
                              <input
                                type="range"
                                min="10"
                                max="100"
                                step="5"
                                value={s.targetPercentage}
                                onChange={(e) => updateSubjectTarget(idx, Number(e.target.value))}
                                className="flex-1 accent-[var(--testino-orange)] cursor-pointer h-2 bg-[var(--surface-3)] rounded-lg border border-[var(--line)]"
                              />
                              <div className="flex items-center gap-1 shrink-0">
                                {[50, 70, 85].map((pct) => (
                                  <button
                                    key={pct}
                                    type="button"
                                    onClick={() => updateSubjectTarget(idx, pct)}
                                    className={cn(
                                      "px-2 py-0.5 text-[10px] font-black rounded-lg border transition-all",
                                      s.targetPercentage === pct
                                        ? "bg-[var(--testino-orange)] text-white border-[var(--line)]"
                                        : "bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line-strong)] hover:border-[var(--line)]"
                                    )}
                                  >
                                    {pct}٪
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* =================================================================== */}
            {/* STEP 4: برنامه زمانی و تأیید نهایی */}
            {/* =================================================================== */}
            {step === 4 && (
              <div className="space-y-5">
                <div className="text-right space-y-1">
                  <span className="inline-block text-[11px] font-black px-2.5 py-0.5 rounded-full bg-[#FFE173] text-[var(--ink)] border-2 border-[var(--line)]">
                    مرحله ۴ از ۴ • برنامه و تکمیل
                  </span>
                  <h2 className="text-xl sm:text-2xl font-black text-[var(--ink)] pt-1">
                    برنامه زمانی مطالعه
                  </h2>
                  <p className="text-xs text-[var(--muted)] font-bold">
                    زمان باقی‌مانده و ساعت مطالعه روزانه را تعیین کنید، سپس پروفایل خود را ثبت کنید.
                  </p>
                </div>

                {/* Flexible Time & Daily Hours */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Time Remaining */}
                  <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] space-y-2">
                    <label className="text-xs font-black text-[var(--ink)] flex items-center gap-2">
                      <Calendar size={14} className="text-[var(--testino-orange)]" />
                      <span>زمان باقی‌مانده تا آزمون</span>
                    </label>

                    <div className="flex items-center gap-1.5 pb-1">
                      {["۳ ماه", "۶ ماه", "۱ سال"].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => {
                            setTimeRemainingMode("preset");
                            setTimePreset(preset);
                          }}
                          className={cn(
                            "flex-1 py-1.5 text-[10px] font-black rounded-xl border-2 transition-all",
                            timeRemainingMode === "preset" && timePreset === preset
                              ? "bg-[var(--testino-orange)] text-white border-[var(--line)]"
                              : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line-strong)]"
                          )}
                        >
                          {preset}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setTimeRemainingMode("custom")}
                        className={cn(
                          "px-2.5 py-1.5 text-[10px] font-black rounded-xl border-2 transition-all",
                          timeRemainingMode === "custom"
                            ? "bg-[var(--testino-orange)] text-white border-[var(--line)]"
                            : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line-strong)]"
                        )}
                      >
                        دلخواه
                      </button>
                    </div>

                    {timeRemainingMode === "custom" && (
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="48"
                          value={customTimeMonths}
                          onChange={(e) => setCustomTimeMonths(Number(e.target.value))}
                          className="w-20 p-2 text-xs font-black bg-[var(--surface)] border-2 border-[var(--line)] rounded-xl text-center text-[var(--ink)]"
                        />
                        <span className="text-xs font-bold text-[var(--muted)]">ماه باقی‌مانده</span>
                      </div>
                    )}
                  </div>

                  {/* Daily study hours */}
                  <div className="p-3.5 rounded-2xl bg-[var(--surface-2)] border-2 border-[var(--line)] space-y-2">
                    <div className="flex justify-between items-center">
                      <label className="text-xs font-black text-[var(--ink)] flex items-center gap-2">
                        <Clock size={14} className="text-[#6CCB7F]" />
                        <span>ساعت مطالعه روزانه</span>
                      </label>
                      <strong className="text-xs font-black px-2 py-0.5 rounded-lg bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)]">
                        {dailyHours} ساعت در روز
                      </strong>
                    </div>

                    <input
                      type="range"
                      min="2"
                      max="14"
                      step="1"
                      value={dailyHours}
                      onChange={(e) => setDailyHours(Number(e.target.value))}
                      className="w-full accent-[#6CCB7F] cursor-pointer h-2 bg-[var(--surface-3)] rounded-lg border border-[var(--line)]"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--muted)] font-black">
                      <span>۲ ساعت</span>
                      <span>۶ ساعت</span>
                      <span>۱۰ ساعت</span>
                      <span>۱۴ ساعت</span>
                    </div>
                  </div>
                </div>

                {/* Final Summary Card */}
                <div className="card-neo p-5 sm:p-6 text-right space-y-3 bg-[var(--surface-2)]">
                  <div className="flex items-center gap-2 pb-2 border-b border-[var(--line-strong)]/30">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-white border-2 border-[var(--line)] flex items-center justify-center shadow-[2px_2px_0px_var(--line)]">
                      <Check size={20} strokeWidth={3} />
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-[var(--ink)]">خلاصه پروفایل شما</h3>
                      <span className="text-[10px] text-[var(--muted)] font-bold">آماده ثبت</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="flex justify-between items-center p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/30">
                      <span className="text-[var(--muted)]">کاربر:</span>
                      <strong className="font-black text-[var(--ink)]">
                        {userName || (isAuthenticated ? authEmail : "دانش‌آموز")}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/30">
                      <span className="text-[var(--muted)]">حساب کاربری:</span>
                      <strong className={cn("font-black", isAuthenticated ? "text-blue-600 dark:text-blue-400" : "text-[var(--ink)]")}>
                        {isAuthenticated ? `متصل (${authEmail})` : "پروفایل محلی"}
                      </strong>
                    </div>
                    <div className="flex justify-between items-center p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/30">
                      <span className="text-[var(--muted)]">آزمون و رشته:</span>
                      <strong className="font-black text-[var(--ink)] truncate max-w-[170px]">{examType || "—"} — {effectiveTrack}</strong>
                    </div>
                    <div className="flex justify-between items-center p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/30">
                      <span className="text-[var(--muted)]">تعداد درس‌های فعال:</span>
                      <strong className="font-black text-emerald-600 dark:text-emerald-400">
                        {activeSelectedSubjects.length} درس
                      </strong>
                    </div>
                    {activeSelectedSubjects.length > 0 && (
                      <div className="flex justify-between items-center p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/30">
                        <span className="text-[var(--muted)]">میانگین هدف کل (محاسبه وزنی):</span>
                        <strong className="font-black text-[var(--testino-orange)]">{weightedAverage}٪</strong>
                      </div>
                    )}
                    <div className="flex justify-between items-center p-2.5 rounded-xl bg-[var(--surface)] border border-[var(--line-strong)]/30">
                      <span className="text-[var(--muted)]">برنامه مطالعه:</span>
                      <strong className="font-black text-[var(--ink)]">{finalTimeRemaining} • روزی {dailyHours} ساعت</strong>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Wizard Navigation Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-[var(--line-strong)]/30">
              {step > 1 && (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="py-3 px-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--line)] hover:translate-x-[1px] hover:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5"
                >
                  <ChevronRight size={16} />
                  <span>بازگشت</span>
                </button>
              )}

              {step < 4 ? (
                <button
                  type="button"
                  onClick={handleNextStep}
                  className="btn-neo-orange flex-1 py-3.5 text-xs sm:text-sm font-black flex items-center justify-center gap-2"
                >
                  <span>ادامه</span>
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleComplete}
                  disabled={saving}
                  className="btn-neo-orange flex-1 py-4 text-xs sm:text-sm font-black flex items-center justify-center gap-2"
                >
                  <span>{saving ? "در حال ثبت اطلاعات…" : "ورود به داشبورد"}</span>
                  <ArrowLeft size={18} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Existing Account Dialog */}
      {showExistingAccountDialog && (
        <div className="dialog-backdrop animate-in fade-in" onClick={() => setShowExistingAccountDialog(false)}>
          <div
            className="card-neo relative p-6 max-w-sm w-full space-y-4 bg-[var(--surface)] rounded-3xl border-3 border-[var(--line-strong)] shadow-[6px_6px_0px_var(--neo-shadow)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-black text-[var(--ink)] text-center">
              حساب قبلی شناسایی شد
            </h3>
            <p className="text-xs font-bold text-[var(--muted)] text-center leading-relaxed">
              حساب «{existingOwnerName}» از قبل روی این دستگاه وجود دارد.
              می‌خواهید وارد همان شوید یا حساب جدید بسازید؟
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowExistingAccountDialog(false);
                  setStep((s) => s + 1);
                }}
                className="btn-neo-orange w-full py-2.5 text-xs font-black"
              >
                وارد حساب «{existingOwnerName}» شو
              </button>
              <button
                type="button"
                onClick={async () => {
                  setShowExistingAccountDialog(false);
                  try {
                    const finalName = userName.trim() || "کاربر جدید";
                    await db.saveOwner(finalName, "local");
                    await queryClient.invalidateQueries({ queryKey: ["owner"] });
                  } catch {
                    // ignore
                  }
                  setStep((s) => s + 1);
                }}
                className="w-full py-2.5 text-xs font-black rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] shadow-[2px_2px_0px_var(--line)]"
              >
                حساب جدید بساز
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
