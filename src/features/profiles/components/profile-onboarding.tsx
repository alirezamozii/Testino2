"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { searchSubjects, registerSubject, getPopularSubjects } from "@/platform/shared-subjects";
import {
  ArrowLeft,
  ChevronRight,
  Sparkles,
  Loader2,
} from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
import { useSync } from "@/providers/sync-provider";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/with-timeout";
import { BrandLogo } from "@/components/ui/brand-logo";
import { NeoButton } from "@/components/ui/neo-primitives";
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
import { OnboardingStepper } from "./onboarding-stepper";
import { OnboardingStepIdentity } from "./onboarding-step-identity";
import { OnboardingStepTrack } from "./onboarding-step-track";
import { OnboardingStepSubjects } from "./onboarding-step-subjects";
import { ExistingAccountModal } from "./existing-account-modal";

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
  const [authTab, setAuthTab] = useState<"email" | "google">("google");
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
  const [subjectError, setSubjectError] = useState("");

  // Autocomplete & Community Suggestions from Supabase shared subjects
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [popularSubjects, setPopularSubjects] = useState<string[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const googlePollRef = useRef<number | null>(null);

  // Clear any running Google session polling when the page unmounts.
  useEffect(() => {
    return () => {
      if (googlePollRef.current) window.clearInterval(googlePollRef.current);
    };
  }, []);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { syncNow } = useSync();

  const handleAuthenticatedUser = useCallback(
    async (user: { id: string; email?: string | null; user_metadata?: Record<string, unknown> | null }) => {
      if (!user?.email) return;
      setIsAuthenticated(true);
      setAuthEmail(user.email);
      setAuthUserId(user.id);
      const metaName = (user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || "") as string;
      const existingOwner = await db.getCurrentOwner().catch(() => null);
      const existingName = existingOwner?.displayName?.trim();
      const hasCustomExisting = Boolean(existingName && existingName !== "دانش‌آموز" && existingName !== "کاربر جدید");
      const currentInput = userName.trim();
      const finalName = (hasCustomExisting ? existingName : currentInput) || currentInput || existingName || metaName || user.email.split("@")[0] || "دانش‌آموز";
      setUserName(finalName);
      const avatar = (user.user_metadata?.avatar_url || user.user_metadata?.picture) as string | undefined;
      if (avatar) {
        setAvatarUrl(avatar);
        if (typeof window !== "undefined") {
          localStorage.setItem("testino_avatar_url", avatar);
        }
      }

      setIsAuthLoading(true);
      setError("");

      try {
        await db.linkAuthenticatedAccount(user.id, finalName);
        await queryClient.invalidateQueries({ queryKey: ["owner"] });
        await queryClient.invalidateQueries({ queryKey: ["owner-shell"] });

        // Immediate pull from cloud to sync existing profile & subjects
        await syncNow();

        // Check if user already has an active profile synced from cloud
        const existingProfiles = await db.listProfiles();
        if (existingProfiles.length > 0) {
          localStorage.setItem("testino_onboarding_completed", "true");
          await queryClient.invalidateQueries();
          router.replace("/");
          return;
        }
      } catch {
        // offline fallback: check if local profiles already exist
        try {
          const existingProfiles = await db.listProfiles();
          if (existingProfiles.length > 0) {
            localStorage.setItem("testino_onboarding_completed", "true");
            await queryClient.invalidateQueries();
            router.replace("/");
            return;
          }
        } catch {
          // ignore
        }
      } finally {
        setIsAuthLoading(false);
      }
    },
    [db, queryClient, router, syncNow, userName]
  );

  // Load existing owner or active auth session on mount
  useEffect(() => {
    let active = true;

    // 1. Check local owner from SQLite
    db.getCurrentOwner()
      .then(async (owner) => {
        if (!active || !owner) return;
        if (owner.displayName) {
          setUserName((prev) => prev || owner.displayName);
          setExistingOwnerName(owner.displayName);
        }
        if (owner.kind === "account" && owner.authUserId) {
          setIsAuthenticated(true);
          setAuthEmail(owner.authUserId);
          setAuthUserId(owner.authUserId);

          // If profiles already exist locally, enter immediately
          const localProfiles = await db.listProfiles().catch(() => []);
          if (localProfiles.length > 0) {
            localStorage.setItem("testino_onboarding_completed", "true");
            await queryClient.invalidateQueries();
            if (active) router.replace("/");
            return;
          }

          // Otherwise attempt cloud sync to restore existing profile
          try {
            await syncNow();
            const syncedProfiles = await db.listProfiles().catch(() => []);
            if (syncedProfiles.length > 0) {
              localStorage.setItem("testino_onboarding_completed", "true");
              await queryClient.invalidateQueries();
              if (active) router.replace("/");
              return;
            }
          } catch {
            // ignore
          }
        }
      })
      .catch(() => {});

    // 2. Check active Supabase auth session (e.g. from Google PKCE redirect)
    getCurrentAuthUser()
      .then((user) => {
        if (!active || !user || !user.email) return;
        void handleAuthenticatedUser(user);
      })
      .catch(() => {});

    // Listen to postMessage from popup/secondary tab callback
    const handleAuthMessage = (event: MessageEvent) => {
      if (event.data?.type === "TESTINO_AUTH_SUCCESS") {
        getCurrentAuthUser().then((user) => {
          if (!active || !user?.email) return;
          void handleAuthenticatedUser(user);
        }).catch(() => {});
      }
    };
    window.addEventListener("message", handleAuthMessage);

    return () => {
      active = false;
      window.removeEventListener("message", handleAuthMessage);
    };
  }, [db, handleAuthenticatedUser, queryClient, router, syncNow]);

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

  // Effective track name
  const effectiveTrack = trackName.trim() || "عمومی";

  // Calculate live weighted average based on individual subject targets and coefficients
  const activeSelectedSubjects = selectedSubjects.filter((s) => s.selected);
  const weightedTarget = calculateWeightedTarget(activeSelectedSubjects);
  const totalCoeff = weightedTarget.totalCoefficient;
  const weightedAverage = Math.round(weightedTarget.percentage ?? 0);

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
        await handleAuthenticatedUser(authResult.user);
        return;
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

    // Check if user already has an existing active profile:
    // If so, avoid forcing them to re-enter subjects/exam track and navigate directly to dashboard!
    try {
      const existingProfiles = await db.listProfiles();
      if (existingProfiles.length > 0) {
        localStorage.setItem("testino_onboarding_completed", "true");
        await queryClient.invalidateQueries();
        setIsAuthLoading(false);
        router.push("/");
        router.refresh();
        return;
      }
    } catch {
      // ignore
    }

    setIsAuthLoading(false);

    // If brand new account without profiles, advance to Step 2
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
        setShowManualCodeInput(false);
        setError("");
        await handleAuthenticatedUser(user);
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
          setError("");
          void handleAuthenticatedUser(user);
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

      // If user has an account connected, check if cloud profile exists and enter immediately
      if (isAuthenticated || authUserId) {
        setIsAuthLoading(true);
        try {
          if (authUserId) {
            await db.linkAuthenticatedAccount(authUserId, finalName);
          }
          await syncNow();
          const existingProfiles = await db.listProfiles();
          if (existingProfiles.length > 0) {
            localStorage.setItem("testino_onboarding_completed", "true");
            await queryClient.invalidateQueries();
            router.replace("/");
            return;
          }
        } catch {
          const existingProfiles = await db.listProfiles().catch(() => []);
          if (existingProfiles.length > 0) {
            localStorage.setItem("testino_onboarding_completed", "true");
            await queryClient.invalidateQueries();
            router.replace("/");
            return;
          }
        } finally {
          setIsAuthLoading(false);
        }
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

      // Final check before advancing: if profile exists, enter
      try {
        const existingProfiles = await db.listProfiles();
        if (existingProfiles.length > 0) {
          localStorage.setItem("testino_onboarding_completed", "true");
          await queryClient.invalidateQueries();
          router.replace("/");
          return;
        }
      } catch {
        // ignore
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

    // Subject name updated
  };

  const selectSuggestion = (name: string) => {
    const canonical = canonicalizeSubject(name);
    setNewSubjName(canonical);
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
    setSelectedSubjects((prev) => [
      ...prev,
      {
        name,
        coefficient: Math.max(1, newSubjCoeff),
        targetPercentage: Math.max(0, Math.min(100, newSubjTarget)),
        questionCount: Math.max(1, Math.min(200, newSubjQuestions)),
        scoreGroup: "",
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

  function handleMergeOnboardingSubjects(sourceIdx: number, targetIdx: number) {
    if (sourceIdx === targetIdx) return;
    setSelectedSubjects((prev) => {
      const source = prev[sourceIdx];
      const target = prev[targetIdx];
      if (!source || !target) return prev;
      const groupName = target.scoreGroup.trim() || source.scoreGroup.trim() || `${target.name} و ${source.name}`;
      const sharedCoeff = target.coefficient || source.coefficient || 1;
      return prev.map((s, idx) => {
        if (idx === sourceIdx || idx === targetIdx || (s.scoreGroup && (s.scoreGroup === source.scoreGroup || s.scoreGroup === target.scoreGroup))) {
          return { ...s, scoreGroup: groupName, coefficient: sharedCoeff };
        }
        return s;
      });
    });
  }

  function handleUngroupOnboardingSubject(idx: number) {
    setSelectedSubjects((prev) => {
      const next = [...prev];
      if (next[idx]) {
        next[idx] = { ...next[idx], scoreGroup: "" };
      }
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

          // Deactivate previous profiles so this newly configured profile becomes the sole active profile
          await db.deactivateAllProfiles();

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
      <OnboardingStepper currentStep={step} />

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
              <div className="flex justify-between items-center py-1.5">
                <span className="text-[var(--muted)]">دروس فعال:</span>
                <strong className="text-emerald-600 dark:text-emerald-400 font-black">
                  {activeSelectedSubjects.length} درس
                </strong>
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

          <div className="card-neo p-4 sm:p-7 space-y-5 sm:space-y-6 bg-[var(--surface)]">
            {/* =================================================================== */}
            {/* STEP 1: هویت کاربر و احراز هویت تب‌دار */}
            {/* =================================================================== */}
            {/* STEP 1: Identity & Auth */}
            {step === 1 && (
              <OnboardingStepIdentity
                userName={userName}
                onUserNameChange={setUserName}
                avatarUrl={avatarUrl}
                isAuthenticated={isAuthenticated}
                authEmail={authEmail}
                isAuthLoading={isAuthLoading}
                authTab={authTab}
                onAuthTabChange={setAuthTab}
                emailInput={emailInput}
                onEmailInputChange={setEmailInput}
                passwordInput={passwordInput}
                onPasswordInputChange={setPasswordInput}
                showPassword={showPassword}
                onToggleShowPassword={() => setShowPassword((s) => !s)}
                onEmailAuth={handleEmailAuth}
                onGoogleSignIn={handleGoogleSignIn}
                onDisconnectAuth={handleDisconnectAuth}
                showManualCodeInput={showManualCodeInput}
                manualOAuthCode={manualOAuthCode}
                onManualOAuthCodeChange={setManualOAuthCode}
                onManualOAuthSubmit={handleManualOAuthSubmit}
                isManualExchanging={isManualExchanging}
              />
            )}

            {/* STEP 2: Exam & Track */}
            {step === 2 && (
              <OnboardingStepTrack
                examType={examType}
                onExamTypeChange={setExamType}
                trackName={trackName}
                onTrackNameChange={setTrackName}
              />
            )}

            {/* STEP 3: Subjects & Target */}
            {step === 3 && (
              <OnboardingStepSubjects
                newSubjName={newSubjName}
                onNewSubjNameChange={handleSubjectNameChange}
                newSubjCoeff={newSubjCoeff}
                onNewSubjCoeffChange={setNewSubjCoeff}
                newSubjTarget={newSubjTarget}
                onNewSubjTargetChange={setNewSubjTarget}
                newSubjQuestions={newSubjQuestions}
                onNewSubjQuestionsChange={setNewSubjQuestions}
                subjectError={subjectError}
                suggestions={suggestions}
                showSuggestions={showSuggestions}
                suggestionsLoading={suggestionsLoading}
                popularSubjects={popularSubjects}
                onSelectSuggestion={selectSuggestion}
                onAddCustomSubject={handleAddCustomSubject}
                selectedSubjects={selectedSubjects}
                onToggleSubject={toggleSubject}
                onRemoveSubject={handleRemoveSubject}
                onMergeSubjects={handleMergeOnboardingSubjects}
                onUngroupSubject={handleUngroupOnboardingSubject}
                onUpdateSubjectTarget={updateSubjectTarget}
                weightedAverage={weightedAverage}
                activeSelectedSubjects={activeSelectedSubjects}
              />
            )}

            {/* Wizard Navigation Buttons */}
            <div className="flex items-center gap-3 pt-4 border-t border-[var(--line-strong)]/30">
              {step > 1 && (
                <NeoButton
                  type="button"
                  variant="surface"
                  size="md"
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-1.5"
                >
                  <ChevronRight size={16} />
                  <span>بازگشت</span>
                </NeoButton>
              )}

              {step === 1 && isAuthenticated ? (
                <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                  <NeoButton
                    type="button"
                    variant="primary"
                    size="md"
                    onClick={handleNextStep}
                    disabled={isAuthLoading}
                    className="flex-1 flex items-center justify-center gap-2"
                  >
                    {isAuthLoading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>در حال بررسی و ورود…</span>
                      </>
                    ) : (
                      <>
                        <span>ورود به برنامه</span>
                        <ArrowLeft size={16} />
                      </>
                    )}
                  </NeoButton>
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    disabled={isAuthLoading}
                    className="py-3 px-4 text-xs font-bold text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] rounded-xl border border-[var(--line-strong)] transition-all cursor-pointer text-center"
                  >
                    تنظیم دستی دروس (ادامه)
                  </button>
                </div>
              ) : step < 3 ? (
                <NeoButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleNextStep}
                  disabled={isAuthLoading}
                  className="flex-1 flex items-center justify-center gap-2"
                >
                  <span>ادامه</span>
                  <ArrowLeft size={16} />
                </NeoButton>
              ) : (
                <NeoButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={handleComplete}
                  disabled={saving || activeSelectedSubjects.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span>{saving ? "در حال ثبت اطلاعات…" : "تکمیل و ورود به داشبورد"}</span>
                  <ArrowLeft size={18} />
                </NeoButton>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Existing Account Dialog */}
      <ExistingAccountModal
        isOpen={showExistingAccountDialog}
        onClose={() => setShowExistingAccountDialog(false)}
        existingOwnerName={existingOwnerName}
        onContinueExisting={() => {
          setShowExistingAccountDialog(false);
          setStep((s) => s + 1);
        }}
        onCreateNewLocal={async () => {
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
      />
    </div>
  );
}
