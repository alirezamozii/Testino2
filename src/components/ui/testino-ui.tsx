"use client";

import React, { createContext, useContext, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { AlertCircle, LoaderCircle, Check, AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                            Device View Context                             */
/* -------------------------------------------------------------------------- */
export type DeviceMode = "desktop" | "mobile";

interface DeviceContextType {
  mode: DeviceMode;
  setMode: (mode: DeviceMode) => void;
  toggleMode: () => void;
}

const DeviceContext = createContext<DeviceContextType>({
  mode: "desktop",
  setMode: () => {},
  toggleMode: () => {},
});

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<DeviceMode>(() => {
    if (typeof window === "undefined") return "desktop";
    try {
      const saved = localStorage.getItem("testino_device_mode") as DeviceMode;
      if (saved === "desktop" || saved === "mobile") return saved;
    } catch {
      // ignore
    }
    return "desktop";
  });

  const handleSetMode = (newMode: DeviceMode) => {
    setMode(newMode);
    try {
      localStorage.setItem("testino_device_mode", newMode);
    } catch {
      // ignore
    }
  };

  const toggleMode = () => {
    handleSetMode(mode === "desktop" ? "mobile" : "desktop");
  };

  return (
    <DeviceContext.Provider value={{ mode, setMode: handleSetMode, toggleMode }}>
      {children}
    </DeviceContext.Provider>
  );
}

export function useDevice() {
  return useContext(DeviceContext);
}

/* -------------------------------------------------------------------------- */
/*                         Testino Mascot Component                           */
/* -------------------------------------------------------------------------- */
interface MascotProps {
  pose?: "pencil" | "mountain" | "celebrate" | "thinking" | "reading";
  size?: number | string;
  className?: string;
}

export function TestinoMascot({ pose = "pencil", size = 120, className }: MascotProps) {
  const dim = typeof size === "number" ? `${size}px` : size;

  if (pose === "mountain") {
    return (
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("testino-mascot transition-transform duration-300", className)}
      >
        <circle cx="80" cy="80" r="72" fill="#FEF3C7" opacity="0.6" />
        <path d="M25 135L75 60L105 105L135 135H25Z" fill="#CBD5E1" stroke="#0F172A" strokeWidth="4" strokeLinejoin="round" />
        <path d="M60 82L75 60L90 82L82 78L75 84L68 78L60 82Z" fill="#F8FAFC" />
        <path d="M75 135L110 80L145 135H75Z" fill="#94A3B8" stroke="#0F172A" strokeWidth="4" strokeLinejoin="round" />
        <path d="M100 96L110 80L120 96L115 92L110 97L105 92L100 96Z" fill="#F8FAFC" />
        <path d="M110 80V45" stroke="#0F172A" strokeWidth="4" strokeLinecap="round" />
        <path d="M110 45L138 55L110 65V45Z" fill="#FF6B3D" stroke="#0F172A" strokeWidth="3" strokeLinejoin="round" />
        <g transform="translate(42, 65) scale(0.48)">
          <path d="M40 30C30 30 20 40 20 55C20 70 30 80 40 85C35 95 40 110 55 115C70 120 85 115 95 105C105 115 120 120 135 115C150 110 155 95 150 85C160 80 170 70 170 55C170 40 160 30 150 30C140 18 120 15 105 25C95 15 75 15 65 25C55 18 45 20 40 30Z" fill="#FFAEC9" stroke="#0F172A" strokeWidth="6" strokeLinejoin="round" />
          <path d="M30 55C65 48 125 48 160 55L158 68C125 61 65 61 32 68L30 55Z" fill="#FFE173" stroke="#0F172A" strokeWidth="5" strokeLinejoin="round" />
          <ellipse cx="75" cy="78" rx="6" ry="7" fill="#0F172A" />
          <ellipse cx="115" cy="78" rx="6" ry="7" fill="#0F172A" />
          <path d="M88 88C92 93 98 93 102 88" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" />
        </g>
      </svg>
    );
  }

  if (pose === "celebrate") {
    return (
      <svg
        width={dim}
        height={dim}
        viewBox="0 0 160 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={cn("testino-mascot transition-transform duration-300", className)}
      >
        <circle cx="80" cy="80" r="70" fill="#FEF9C3" opacity="0.5" />
        <circle cx="30" cy="40" r="4" fill="#FF6B3D" />
        <circle cx="130" cy="35" r="5" fill="#3B82F6" />
        <rect x="25" y="80" width="8" height="8" rx="2" fill="#22C55E" transform="rotate(25 25 80)" />
        <rect x="125" y="85" width="8" height="8" rx="2" fill="#EAB308" transform="rotate(-30 125 85)" />
        <path
          d="M45 42C32 42 22 53 22 68C22 84 32 94 42 100C37 111 43 126 58 131C73 136 88 131 98 120C108 131 123 136 138 131C153 126 159 111 154 100C164 94 174 84 174 68C174 53 164 42 151 42C141 30 121 27 106 37C96 27 76 27 66 37C56 30 48 32 45 42Z"
          fill="#FFAEC9"
          stroke="#0F172A"
          strokeWidth="6"
          strokeLinejoin="round"
          transform="translate(-18, -10)"
        />
        <path
          d="M24 55C60 47 116 47 152 55L150 69C116 61 60 61 26 69L24 55Z"
          fill="#FFE173"
          stroke="#0F172A"
          strokeWidth="5"
          strokeLinejoin="round"
          transform="translate(-8, -8)"
        />
        <circle cx="60" cy="68" r="6" fill="#0F172A" />
        <circle cx="96" cy="68" r="6" fill="#0F172A" />
        <path d="M70 78C74 88 82 88 86 78" stroke="#0F172A" strokeWidth="5" strokeLinecap="round" fill="#E11D48" />
        <ellipse cx="50" cy="76" rx="6" ry="4" fill="#FDA4AF" />
        <ellipse cx="106" cy="76" rx="6" ry="4" fill="#FDA4AF" />
        <g transform="translate(100, 60) scale(0.65)">
          <path d="M20 20H60V38C60 48 50 56 40 56C30 56 20 48 20 38V20Z" fill="#FACC15" stroke="#0F172A" strokeWidth="4" />
          <path d="M20 26H10C8 26 6 28 6 30C6 38 12 44 20 44V26Z" fill="#FDE047" stroke="#0F172A" strokeWidth="4" />
          <path d="M60 26H70C72 26 74 28 74 30C74 38 68 44 60 44V26Z" fill="#FDE047" stroke="#0F172A" strokeWidth="4" />
          <path d="M40 56V68" stroke="#0F172A" strokeWidth="5" />
          <rect x="25" y="68" width="30" height="10" rx="3" fill="#0F172A" />
        </g>
      </svg>
    );
  }

  // Default signature pose: Brain holding big yellow pencil with headband
  return (
    <svg
      width={dim}
      height={dim}
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("testino-mascot transition-transform duration-300", className)}
    >
      {/* Background Warm Aura */}
      <ellipse cx="98" cy="106" rx="86" ry="78" fill="#FFF4CC" opacity="0.8" />

      {/* Left Cute Arm (rested/perked on side) */}
      <path
        d="M34 104C24 109 20 120 27 126C33 130 40 125 43 118"
        fill="#FFAEC9"
        stroke="#0F172A"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Main Brain Body */}
      <path
        d="M48 52C36 52 25 63 25 77C25 91 34 102 43 108C39 119 45 131 60 137C75 143 89 137 99 126C109 137 123 143 138 137C153 131 159 119 155 108C164 102 173 91 173 77C173 63 162 52 150 52C140 40 120 37 106 47C96 37 76 37 66 47C56 40 47 42 48 52Z"
        fill="#FFAEC9"
        stroke="#0F172A"
        strokeWidth="5.5"
        strokeLinejoin="round"
      />

      {/* Internal Brain Creases (Subtle folds) */}
      <path d="M60 72C53 81 56 90 64 92" stroke="#F472B6" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M136 72C143 81 140 90 132 92" stroke="#F472B6" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M99 50C99 60 103 66 103 66" stroke="#F472B6" strokeWidth="3.5" strokeLinecap="round" />

      {/* Yellow Martial/Study Headband */}
      <path
        d="M29 74C65 67 125 67 167 74L165 89C125 81 65 81 27 89L29 74Z"
        fill="#FFE173"
        stroke="#0F172A"
        strokeWidth="4.5"
        strokeLinejoin="round"
      />

      {/* Headband Knot Tails (Cute ribbon tie on left side) */}
      <path
        d="M28 80C17 77 9 84 11 94C12 99 19 99 23 95"
        fill="#FFE173"
        stroke="#0F172A"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path
        d="M29 86C19 90 13 100 17 110C19 114 26 112 28 105"
        fill="#FCD34D"
        stroke="#0F172A"
        strokeWidth="4"
        strokeLinejoin="round"
      />

      {/* Symmetrical Kawaii Eyes */}
      {/* Left Eye */}
      <ellipse cx="68" cy="100" rx="6.5" ry="8" fill="#0F172A" />
      <circle cx="66" cy="97" r="2.8" fill="#FFFFFF" />
      <circle cx="70.5" cy="102.5" r="1.3" fill="#FFFFFF" />

      {/* Right Eye (Clean, unobstructed, fully symmetrical!) */}
      <ellipse cx="110" cy="100" rx="6.5" ry="8" fill="#0F172A" />
      <circle cx="108" cy="97" r="2.8" fill="#FFFFFF" />
      <circle cx="112.5" cy="102.5" r="1.3" fill="#FFFFFF" />

      {/* Happy Smile */}
      <path
        d="M84 109C86.5 115 91.5 115 94 109"
        stroke="#0F172A"
        strokeWidth="4"
        strokeLinecap="round"
      />

      {/* Rosy Blush Cheeks */}
      <ellipse cx="54" cy="107" rx="7.5" ry="4" fill="#FB7185" opacity="0.65" />
      <ellipse cx="124" cy="107" rx="7.5" ry="4" fill="#FB7185" opacity="0.65" />

      {/* Pencil Beside Brain (Standing Proudly on the Right Side) */}
      <g transform="translate(166, 18) rotate(12)">
        {/* Wooden Cone & Tip */}
        <polygon points="0,20 18,20 9,0" fill="#FED7AA" stroke="#0F172A" strokeWidth="4" strokeLinejoin="round" />
        <polygon points="6,7 12,7 9,0" fill="#0F172A" />

        {/* Main Yellow Hexagonal Shaft */}
        <rect x="0" y="20" width="18" height="88" rx="3" fill="#FFE173" stroke="#0F172A" strokeWidth="4.5" />
        <line x1="6" y1="20" x2="6" y2="108" stroke="#F59E0B" strokeWidth="2.2" />
        <line x1="12" y1="20" x2="12" y2="108" stroke="#F59E0B" strokeWidth="2.2" />

        {/* Silver Metal Ferrule */}
        <rect x="0" y="108" width="18" height="12" fill="#CBD5E1" stroke="#0F172A" strokeWidth="4" />
        <line x1="2" y1="114" x2="16" y2="114" stroke="#94A3B8" strokeWidth="1.5" />

        {/* Pink Rubber Eraser */}
        <path
          d="M0 120C0 120 0 133 9 133C18 133 18 120 18 120H0Z"
          fill="#F472B6"
          stroke="#0F172A"
          strokeWidth="4"
          strokeLinejoin="round"
        />
      </g>

      {/* Right Arm/Hand Reaching Out to Hold the Pencil from the Side */}
      <path
        d="M144 105C152 103 162 105 168 110"
        stroke="#0F172A"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Cute puffy hand gripping pencil from the side */}
      <g transform="translate(156, 98)">
        <rect x="0" y="3" width="14" height="18" rx="7" fill="#FFAEC9" stroke="#0F172A" strokeWidth="4" />
        <line x1="4" y1="9" x2="10" y2="9" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
        <line x1="4" y1="14" x2="10" y2="14" stroke="#0F172A" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/*                           Step Wizard Indicator                            */
/* -------------------------------------------------------------------------- */
interface StepWizardProps {
  currentStep: number;
  totalSteps?: number;
  labels?: string[];
  className?: string;
  onStepClick?: (step: number) => void;
}

export function StepWizardIndicator({
  currentStep,
  totalSteps = 5,
  labels,
  className,
  onStepClick,
}: StepWizardProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);

  return (
    <div className={cn("w-full py-3 select-none", className)}>
      <div className="flex items-center justify-between relative max-w-md mx-auto px-4">
        <div className="absolute top-1/2 left-8 right-8 h-1 bg-[var(--line)] -translate-y-1/2 z-0" />
        <div
          className="absolute top-1/2 right-8 h-1 bg-[var(--brand-orange)] -translate-y-1/2 z-0 transition-all duration-300"
          style={{
            width: `${((currentStep - 1) / (totalSteps - 1)) * 82}%`,
          }}
        />

        {steps.map((step) => {
          const isDone = step < currentStep;
          const isActive = step === currentStep;

          return (
            <button
              key={step}
              type="button"
              disabled={!onStepClick || step > currentStep}
              onClick={() => onStepClick?.(step)}
              className="relative z-10 flex flex-col items-center group focus:outline-none"
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center font-black text-xs transition-all duration-200 border-2",
                  isDone
                    ? "bg-[var(--brand-green)] border-[var(--brand-green)] text-white shadow-sm"
                    : isActive
                    ? "bg-[var(--brand-orange)] border-[var(--brand-orange)] text-white ring-4 ring-orange-200 dark:ring-orange-950/60 shadow-md scale-110"
                    : "bg-[var(--surface)] border-[var(--line)] text-[var(--muted)]"
                )}
              >
                {isDone ? <Check size={16} strokeWidth={3} /> : step}
              </div>
              {labels && labels[step - 1] && (
                <span
                  className={cn(
                    "text-[10px] mt-1.5 font-bold transition-colors text-center truncate max-w-[64px]",
                    isActive
                      ? "text-[var(--brand-orange)] font-black"
                      : isDone
                      ? "text-[var(--ink)]"
                      : "text-[var(--muted)]"
                  )}
                >
                  {labels[step - 1]}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            Status & Chip Badges                            */
/* -------------------------------------------------------------------------- */
export function StatusPill({
  status,
  count,
  className,
}: {
  status: "correct" | "wrong" | "doubt" | "unanswered" | "all";
  count?: number | string;
  className?: string;
}) {
  const configs = {
    all: { label: "همه", bg: "bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-200", icon: null },
    correct: { label: "صحیح", bg: "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300", icon: Check },
    wrong: { label: "غلط", bg: "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300", icon: X },
    doubt: { label: "شک دارم", bg: "bg-amber-50 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300", icon: AlertTriangle },
    unanswered: { label: "نزده", bg: "bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800/80 dark:text-slate-400", icon: null },
  };

  const conf = configs[status] || configs.all;
  const Icon = conf.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-colors",
        conf.bg,
        className
      )}
    >
      {Icon && <Icon size={13} strokeWidth={2.5} />}
      <span>{conf.label}</span>
      {count !== undefined && <strong className="font-black">({count})</strong>}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                        Standard Existing UI Atoms                          */
/* -------------------------------------------------------------------------- */
export function PageIntro({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action && <div>{action}</div>}
    </header>
  );
}

export function IconTile({
  icon: Icon,
  tone = "blue",
  className,
}: {
  icon: LucideIcon;
  tone?: "blue" | "orange" | "green" | "yellow" | "purple" | "red";
  className?: string;
}) {
  return (
    <span className={cn("ui-icon-tile", `tone-${tone}`, className)}>
      <Icon size={21} />
    </span>
  );
}

export function MetricCard({
  icon,
  tone,
  label,
  value,
  detail,
}: {
  icon: LucideIcon;
  tone?: Parameters<typeof IconTile>[0]["tone"];
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <article className="metric-card">
      <IconTile icon={icon} tone={tone} />
      <span>
        <small>{label}</small>
        <strong>{value}</strong>
        {detail && <em>{detail}</em>}
      </span>
    </article>
  );
}

export function ProgressRing({
  value,
  label,
  size = 116,
}: {
  value: number | null;
  label: string;
  size?: number;
}) {
  const safe = value === null ? 0 : Math.max(0, Math.min(100, value));
  return (
    <div
      className="progress-ring"
      style={{
        width: size,
        height: size,
        background: `conic-gradient(var(--brand-green) ${safe}%, var(--surface-3) 0)`,
      }}
      role="img"
      aria-label={value === null ? `${label}: بدون داده` : `${label}: ${Math.round(safe)} درصد`}
    >
      <span>
        <strong>{value === null ? "—" : `${Math.round(safe)}٪`}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  tone = "blue",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  tone?: Parameters<typeof IconTile>[0]["tone"];
}) {
  return (
    <div className="empty-state">
      <IconTile icon={Icon} tone={tone} />
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function LoadingState({ label = "در حال آماده‌سازی…" }: { label?: string }) {
  return (
    <div className="state-panel" role="status">
      <LoaderCircle className="animate-spin" size={25} />
      <strong>{label}</strong>
    </div>
  );
}

export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="state-panel error" role="alert">
      <AlertCircle size={25} />
      <strong>{message}</strong>
      {retry && (
        <button className="btn-secondary-clean" onClick={retry}>
          تلاش دوباره
        </button>
      )}
    </div>
  );
}

export function MascotBanner({
  title,
  subtitle,
  description,
  badge,
  mood = "happy",
  children,
  action,
}: {
  title: string;
  subtitle?: string;
  description?: string;
  badge?: string;
  mood?: string;
  children?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div data-mood={mood} className="p-4 rounded-3xl bg-gradient-to-r from-[var(--pastel-yellow-soft)] via-[var(--surface)] to-[var(--surface)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-between gap-3">
      <div className="space-y-1">
        {badge && (
          <span className="inline-block text-[10px] font-black px-2 py-0.5 rounded-full bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
            {badge}
          </span>
        )}
        <h3 className="font-black text-sm text-[var(--ink)]">{title}</h3>
        {(subtitle || description) && (
          <p className="text-xs text-[var(--muted)] font-bold">{subtitle || description}</p>
        )}
      </div>
      {children}
      {action}
    </div>
  );
}
