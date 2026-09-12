"use client";

import { createContext, useContext, useEffect, useState } from "react";

export type AppTheme = "light" | "dark";

export interface AccentOption {
  id: string;
  name: string;
  color: string;
  hover: string;
  soft: string;
  darkColor: string;
  darkHover: string;
  darkSoft: string;
  ink: string;
  darkInk: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  {
    id: "blue",
    name: "آبی کلاسیک",
    color: "#2563eb",
    hover: "#1d4ed8",
    soft: "#dbeafe",
    darkColor: "#3b82f6",
    darkHover: "#60a5fa",
    darkSoft: "rgba(59, 130, 246, 0.2)",
    ink: "#ffffff",
    darkInk: "#ffffff",
  },
  {
    id: "orange",
    name: "نارنجی تستینو",
    color: "#f95721",
    hover: "#ea4610",
    soft: "#ffedd5",
    darkColor: "#fb713b",
    darkHover: "#f97316",
    darkSoft: "rgba(249, 115, 22, 0.25)",
    ink: "#ffffff",
    darkInk: "#ffffff",
  },
  {
    id: "emerald",
    name: "سبز زمردی",
    color: "#059669",
    hover: "#047857",
    soft: "#d1fae5",
    darkColor: "#10b981",
    darkHover: "#34d399",
    darkSoft: "rgba(16, 185, 129, 0.2)",
    ink: "#ffffff",
    darkInk: "#0f172a",
  },
  {
    id: "violet",
    name: "بنفش رویال",
    color: "#7c3aed",
    hover: "#6d28d9",
    soft: "#ede9fe",
    darkColor: "#8b5cf6",
    darkHover: "#a78bfa",
    darkSoft: "rgba(139, 92, 246, 0.2)",
    ink: "#ffffff",
    darkInk: "#ffffff",
  },
  {
    id: "teal",
    name: "فیروزه‌ای زنده",
    color: "#0d9488",
    hover: "#0f766e",
    soft: "#ccfbf1",
    darkColor: "#14b8a6",
    darkHover: "#2dd4bf",
    darkSoft: "rgba(20, 184, 166, 0.2)",
    ink: "#ffffff",
    darkInk: "#0f172a",
  },
  {
    id: "ruby",
    name: "یاقوتی آتشین",
    color: "#e11d48",
    hover: "#be123c",
    soft: "#ffe4e6",
    darkColor: "#f43f5e",
    darkHover: "#fb7185",
    darkSoft: "rgba(244, 63, 94, 0.2)",
    ink: "#ffffff",
    darkInk: "#ffffff",
  },
  {
    id: "amber",
    name: "کهربایی گرم",
    color: "#d97706",
    hover: "#b45309",
    soft: "#fef3c7",
    darkColor: "#f59e0b",
    darkHover: "#fbbf24",
    darkSoft: "rgba(245, 158, 11, 0.2)",
    ink: "#ffffff",
    darkInk: "#0f172a",
  },
  {
    id: "coral",
    name: "مرجانی پرشور",
    color: "#e05638",
    hover: "#c84225",
    soft: "#ffe5df",
    darkColor: "#f87171",
    darkHover: "#fca5a5",
    darkSoft: "rgba(248, 113, 113, 0.2)",
    ink: "#ffffff",
    darkInk: "#0f172a",
  },
  {
    id: "indigo",
    name: "نیلی عمیق",
    color: "#4f46e5",
    hover: "#4338ca",
    soft: "#e0e7ff",
    darkColor: "#6366f1",
    darkHover: "#818cf8",
    darkSoft: "rgba(99, 102, 241, 0.2)",
    ink: "#ffffff",
    darkInk: "#ffffff",
  },
  {
    id: "fuchsia",
    name: "فوشیا شارپ",
    color: "#c026d3",
    hover: "#a21caf",
    soft: "#fae8ff",
    darkColor: "#d946ef",
    darkHover: "#e879f9",
    darkSoft: "rgba(217, 70, 239, 0.2)",
    ink: "#ffffff",
    darkInk: "#ffffff",
  },
];

interface ThemeContextType {
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  accent: string;
  setAccent: (accentId: string) => void;
  activeAccent: AccentOption;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  accent: "orange",
  setAccent: () => {},
  activeAccent: ACCENT_OPTIONS[1],
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<AppTheme>(() => {
    if (typeof window === "undefined") return "light";
    try {
      const saved = localStorage.getItem("testino-theme");
      if (saved === "dark") return "dark";
      if (saved === "light" || saved === "paper") return "light";
      return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    } catch {
      return "light";
    }
  });

  const [accent, setAccentState] = useState<string>(() => {
    if (typeof window === "undefined") return "orange";
    try {
      const saved = localStorage.getItem("testino-accent");
      if (saved && ACCENT_OPTIONS.some((a) => a.id === saved)) {
        return saved;
      }
      return "orange";
    } catch {
      return "orange";
    }
  });

  const activeAccent = ACCENT_OPTIONS.find((a) => a.id === accent) || ACCENT_OPTIONS[1];

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-theme", theme);
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }

    const isDark = theme === "dark";
    const mainColor = isDark ? activeAccent.darkColor : activeAccent.color;
    const hoverColor = isDark ? activeAccent.darkHover : activeAccent.hover;
    const softColor = isDark ? activeAccent.darkSoft : activeAccent.soft;
    const inkColor = isDark ? activeAccent.darkInk : activeAccent.ink;

    root.style.setProperty("--brand-blue", mainColor);
    root.style.setProperty("--brand-blue-dark", hoverColor);
    root.style.setProperty("--accent-primary", mainColor);
    root.style.setProperty("--accent-primary-hover", hoverColor);
    root.style.setProperty("--accent-primary-soft", softColor);
    root.style.setProperty("--accent-primary-ink", inkColor);
    root.style.setProperty("--accent", softColor);
    root.style.setProperty("--testino-orange", mainColor);
    root.style.setProperty("--brand-orange", mainColor);
    root.style.setProperty("--pastel-orange", mainColor);
  }, [theme, accent, activeAccent]);

  function setTheme(newTheme: AppTheme) {
    setThemeState(newTheme);
    try {
      localStorage.setItem("testino-theme", newTheme);
    } catch {
      // Fallback
    }
  }

  function setAccent(newAccentId: string) {
    if (ACCENT_OPTIONS.some((a) => a.id === newAccentId)) {
      setAccentState(newAccentId);
      try {
        localStorage.setItem("testino-accent", newAccentId);
      } catch {
        // Fallback
      }
    }
  }

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        accent,
        setAccent,
        activeAccent,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

