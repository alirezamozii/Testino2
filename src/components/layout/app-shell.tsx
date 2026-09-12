"use client";

import React, { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Bell,
  BookOpen,
  Home,
  Moon,
  Play,
  RefreshCw,
  RotateCcw,
  Settings,
  Sun,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/ui/brand-logo";
import { useDatabase } from "@/providers/database-provider";
import { useSync } from "@/providers/sync-provider";
import { useTheme } from "@/providers/theme-provider";
import { SplashScreen } from "./splash-screen";

const navigation = [
  { href: "/", label: "خانه", icon: Home },
  { href: "/bank/", label: "بانک سؤال", icon: BookOpen },
  { href: "/sessions/", label: "آزمون‌ها", icon: Play },
  { href: "/review/", label: "مرور", icon: RotateCcw },
  { href: "/analytics/", label: "تحلیل", icon: BarChart3 },
];

const navHrefs = navigation.map((n) =>
  n.href.endsWith("/") && n.href !== "/" ? n.href.slice(0, -1) : n.href
);

function isCurrent(pathname: string, href: string) {
  const normPath = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname;
  const normHref = href.endsWith("/") && href !== "/" ? href.slice(0, -1) : href;

  if (normHref === "/" || normHref === "") return normPath === "/" || normPath === "";
  if (normPath === normHref) return true;

  if (normHref === "/bank" && (normPath.startsWith("/bank") || normPath.startsWith("/import"))) {
    return true;
  }

  // Check if another nav item is a more specific match for this pathname
  const hasMoreSpecificNavMatch = navHrefs.some(
    (other) =>
      other !== normHref &&
      other.length > normHref.length &&
      (normPath === other || normPath.startsWith(`${other}/`))
  );

  if (hasMoreSpecificNavMatch) return false;

  return normPath.startsWith(`${normHref}/`);
}

function subscribeSplash(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getSplashSnapshot() {
  try {
    if (typeof window !== "undefined") {
      if (new URLSearchParams(window.location.search).has("splash")) {
        return true;
      }
      if (new URLSearchParams(window.location.search).has("nosplash")) {
        return false;
      }
      const seen = localStorage.getItem("testino_seen_splash") || sessionStorage.getItem("testino_seen_splash");
      return !seen;
    }
    return false;
  } catch {
    return false;
  }
}

function getServerSplashSnapshot() {
  return false;
}

function SyncStatusIndicator({ databaseReady }: { databaseReady: boolean }) {
  const { status, isOnline, isSyncing, pendingCount, syncNow } = useSync();
  const [justSynced, setJustSynced] = useState(false);
  const [hasWaited, setHasWaited] = useState(false);

  useEffect(() => {
    if (!databaseReady) {
      const timer = setTimeout(() => setHasWaited(true), 1000);
      return () => clearTimeout(timer);
    }
  }, [databaseReady]);

  const handleClick = async () => {
    if (isSyncing || !databaseReady) return;
    try {
      await syncNow();
      setJustSynced(true);
      setTimeout(() => setJustSynced(false), 2500);
    } catch {
      // ignore
    }
  };

  if (!databaseReady && !hasWaited) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 border border-[var(--border)] shadow-[1px_1px_0px_var(--neo-shadow)] select-none">
        <i className="loading w-2 h-2 rounded-full border-2 border-slate-400 border-t-transparent animate-spin inline-block" />
        <span>در حال آماده‌سازی…</span>
      </span>
    );
  }

  if (!databaseReady && hasWaited) {
    return (
      <button
        type="button"
        onClick={() => window.location.reload()}
        title="دیتابیس در حالت محلی فعال است یا نیاز به بازنشانی دارد."
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-slate-200 transition-all cursor-pointer select-none"
      >
        <span className="w-2 h-2 rounded-full bg-slate-400" />
        <span>محلی</span>
      </button>
    );
  }

  if (!isOnline || status === "offline") {
    return (
      <button
        type="button"
        onClick={handleClick}
        title="حالت کاملاً آفلاین — تمام آزمون‌ها و تغییرات به صورت محلی ذخیره می‌شوند و بعد از اتصال همگام‌سازی خواهند شد."
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-2 border-[var(--border)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-slate-200 dark:hover:bg-slate-700 transition-all cursor-pointer select-none active:translate-x-[1px] active:translate-y-[1px]"
      >
        <span className="w-2 h-2 rounded-full bg-slate-400 dark:bg-slate-500" />
        <span>آفلاین</span>
      </button>
    );
  }

  if (isSyncing) {
    let syncText = "در حال همگام‌سازی…";
    if (status === "pushing") syncText = "در حال ارسال تغییرات…";
    else if (status === "pulling") syncText = "در حال دریافت داده‌ها…";
    else if (status === "merging") syncText = "در حال ادغام داده‌ها…";

    return (
      <div
        title={syncText}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-2 border-amber-400 dark:border-amber-600 shadow-[2px_2px_0px_var(--neo-shadow)] select-none animate-pulse"
      >
        <RefreshCw size={11} className="animate-spin text-amber-600 dark:text-amber-400" />
        <span className="hidden sm:inline">{syncText}</span>
        <span className="sm:hidden">همگام‌سازی…</span>
      </div>
    );
  }

  if (status === "error") {
    return (
      <button
        type="button"
        onClick={handleClick}
        title="خطا در اتصال به سرور ابری — کلیک کنید تا مجدداً تلاش شود."
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-2 border-rose-400 dark:border-rose-600 shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-rose-100 dark:hover:bg-rose-900/40 transition-all cursor-pointer select-none active:translate-x-[1px] active:translate-y-[1px]"
      >
        <span className="w-2 h-2 rounded-full bg-rose-500" />
        <span>تلاش مجدد</span>
      </button>
    );
  }

  // Online state
  return (
    <button
      type="button"
      onClick={handleClick}
      title={
        pendingCount > 0
          ? `${pendingCount} تغییر محلی در صف ارسال — برای همگام‌سازی کلیک کنید`
          : "آنلاین و متصل به فضای ابری — کلیک کنید برای همگام‌سازی دستی"
      }
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-2 border-emerald-400 dark:border-emerald-600 shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-emerald-100 dark:hover:bg-emerald-900/40 transition-all cursor-pointer select-none active:translate-x-[1px] active:translate-y-[1px]"
    >
      <span className="w-2 h-2 rounded-full bg-emerald-500" />
      <span>{justSynced ? "همگام شد ✓" : pendingCount > 0 ? `آنلاین (${pendingCount})` : "آنلاین"}</span>
    </button>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const database = useDatabase();
  const { theme, setTheme } = useTheme();
  const isSplashUnseen = useSyncExternalStore(
    subscribeSplash,
    getSplashSnapshot,
    getServerSplashSnapshot
  );
  const router = useRouter();
  const [dismissedSplash, setDismissedSplash] = useState(false);
  const showSplash = isSplashUnseen && !dismissedSplash;

  // Auto-hide bottom nav when any modal or dialog is open
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const checkModalState = () => {
      const modal = document.querySelector(
        '[data-modal="true"], [role="dialog"], .modal-overlay, .dialog-backdrop, .modal-backdrop'
      );
      const open = Boolean(modal);
      setIsModalOpen(open);
      if (open) {
        document.body.classList.add("modal-open");
      } else {
        document.body.classList.remove("modal-open");
      }
    };

    checkModalState();

    const observer = new MutationObserver(() => {
      checkModalState();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-modal", "role", "class"],
    });

    return () => {
      observer.disconnect();
      document.body.classList.remove("modal-open");
    };
  }, []);

  const owner = useQuery({
    queryKey: ["owner-shell"],
    queryFn: () => database.db.getCurrentOwner(),
    enabled: database.status === "ready",
  });

  const profiles = useQuery({
    queryKey: ["profiles-shell"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });

  const handleFinishSplash = () => {
    setDismissedSplash(true);
    try {
      localStorage.setItem("testino_seen_splash", "true");
      sessionStorage.setItem("testino_seen_splash", "true");
    } catch {
      // ignore
    }
    const hasProfile = Boolean(profiles.data && profiles.data.length > 0);
    const hasCompletedOnboarding =
      typeof window !== "undefined" && localStorage.getItem("testino_onboarding_completed") === "true";
    if (!hasProfile && !hasCompletedOnboarding) {
      router.push("/onboarding/");
    }
  };

  const focused =
    pathname.startsWith("/sessions/run") || pathname.startsWith("/onboarding");

  const hasNoSplash = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("nosplash");
  const stepMatch = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("step") : null;
  const initialStep = stepMatch ? Math.max(1, Math.min(4, parseInt(stepMatch, 10) || 1)) : 1;

  if (showSplash && !hasNoSplash) {
    return (
      <SplashScreen
        initialStep={initialStep}
        onFinish={handleFinishSplash}
        hasProfile={Boolean(profiles.data && profiles.data.length > 0)}
      />
    );
  }

  if (database.status === "error") {
    const isIframe = typeof window !== "undefined" && window.self !== window.top;
    return (
      <main className="focus-shell flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card p-6 rounded-2xl border shadow-sm text-center space-y-4">
          <h2 className="text-lg font-bold text-foreground">عدم دسترسی به پایگاه داده مرورگر</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {database.message || "ذخیره‌سازی محلی آماده نشد."}
          </p>
          {isIframe && (
            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 p-3 rounded-lg">
              اگر در محیط پیش‌نمایش هستید، سیاست‌های امنیتی آی‌فریم در مرورگر ممکن است دسترسی به ذخیره‌سازی آفلاین را محدود کرده باشند. باز کردن در تب جدید این مورد را حل می‌کند.
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:opacity-90"
            >
              بارگذاری مجدد
            </button>
            {isIframe && (
              <a
                href={typeof window !== "undefined" ? window.location.href : "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-lg text-sm font-medium hover:bg-secondary/80 inline-flex items-center justify-center gap-1.5"
              >
                باز کردن در تب جدید
              </a>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (focused) return <main className="focus-shell">{children}</main>;

  const contentMarkup = (
    <div className="app-shell">
      {/* Desktop Navigation Rail */}
      <aside className="desktop-rail group" aria-label="ناوبری اصلی">
        <Link href="/" className="brand-lockup group" aria-label="تستینو، خانه">
          <BrandLogo size="md" />
        </Link>
        <p className="brand-motto">آزمون امروز، موفقیت فردا</p>

        <nav className="rail-links">
          {navigation.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              className={cn("rail-link", isCurrent(pathname, href) && "active")}
              title={label}
            >
              <span className="rail-icon-wrap">
                <Icon size={20} className="shrink-0" />
              </span>
              <span className="rail-label">{label}</span>
            </Link>
          ))}
        </nav>

        <div className="rail-footer">
          <div className="rail-divider" aria-hidden="true" />
          <Link
            href="/settings/"
            className={cn("rail-profile", isCurrent(pathname, "/settings/") && "active")}
            title="تنظیمات حساب کاربری"
          >
            <span className="avatar">
              <UserRound size={19} />
            </span>
            <span className="rail-profile-info">
              <strong>{owner.data?.displayName || "کاربر تستینو"}</strong>
              <small className={owner.data?.kind === "account" ? "text-blue-600 dark:text-blue-400 font-bold" : ""}>
                {owner.data?.kind === "account" ? "حساب گوگل متصل" : "پروفایل محلی"}
              </small>
            </span>
          </Link>
        </div>
      </aside>

      {/* Main App Column */}
      <section className="app-column">
        {/* Top Bar matching wireframe */}
        <header className="app-topbar">
          <Link href="/" className="brand-lockup mobile-brand group" aria-label="تستینو، خانه">
            <BrandLogo size="sm" />
          </Link>

          <div className="topbar-actions">
            <SyncStatusIndicator databaseReady={database.status === "ready"} />

            {/* Notifications Bell */}
            <Link
              href="/history/"
              className="icon-button relative"
              aria-label="اعلان‌ها و تاریخچه"
            >
              <Bell size={18} />
              <span className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-[var(--testino-orange)]" />
            </Link>

            {/* Theme Toggle Button */}
            <button
              type="button"
              className="icon-button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              title={`تغییر حالت نمایش (فعلی: ${theme === "dark" ? "شب" : "روز"})`}
              aria-label="تغییر حالت نمایش"
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            {/* Mobile Settings Button */}
            <Link
              href="/settings/"
              className="icon-button mobile-settings"
              aria-label="تنظیمات"
            >
              <Settings size={18} />
            </Link>
          </div>
        </header>

        {/* Page Content */}
        <main className="app-content">{children}</main>
      </section>

      {/* Mobile Bottom Navigation (Floating Neo-Brutalist Dock) */}
      <nav
        className={cn("mobile-bottom-nav", isModalOpen && "nav-hidden")}
        aria-label="ناوبری اصلی"
        aria-hidden={isModalOpen ? "true" : undefined}
      >
        {navigation.map(({ href, label, icon: Icon }) => {
          const active = isCurrent(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              className={cn("bottom-nav-item", active && "active")}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-icon-wrapper">
                <Icon size={19} strokeWidth={active ? 2.4 : 1.9} />
              </span>
              <span className="nav-label">{label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );

  // Native responsive layout
  return contentMarkup;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <ShellInner>{children}</ShellInner>;
}
