"use client";

import React, { forwardRef } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                1. NeoButton                                */
/* -------------------------------------------------------------------------- */
export type NeoButtonVariant =
  | "primary"
  | "surface"
  | "outline"
  | "ghost"
  | "danger"
  | "success"
  | "yellow"
  | "blue";

export type NeoButtonSize = "sm" | "md" | "lg" | "icon-sm" | "icon-md";

export interface NeoButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: NeoButtonVariant;
  size?: NeoButtonSize;
  isLoading?: boolean;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
}

const variantStyles: Record<NeoButtonVariant, string> = {
  primary:
    "bg-[var(--brand-orange)] text-white border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--accent-primary-hover)]",
  surface:
    "bg-[var(--surface)] text-[var(--ink)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface-cream)]",
  outline:
    "bg-transparent text-[var(--ink)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface)]",
  ghost:
    "bg-transparent text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface)] border-2 border-transparent",
  danger:
    "bg-rose-500 text-white border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-rose-600 dark:bg-rose-600",
  success:
    "bg-[var(--brand-green)] text-white border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:brightness-105",
  yellow:
    "bg-[var(--pastel-yellow)] text-[var(--ink)] border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:brightness-95",
  blue:
    "bg-[var(--brand-blue)] text-white border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] hover:brightness-105",
};

const sizeStyles: Record<NeoButtonSize, string> = {
  sm: "text-xs font-black px-3 py-1.5 min-h-[36px] rounded-xl gap-1.5",
  md: "text-xs sm:text-sm font-black px-4 py-2.5 min-h-[44px] rounded-2xl gap-2",
  lg: "text-sm sm:text-base font-black px-6 py-3.5 min-h-[50px] rounded-2xl gap-2.5",
  "icon-sm": "w-9 h-9 min-h-[36px] p-0 flex items-center justify-center rounded-xl",
  "icon-md": "w-11 h-11 min-h-[44px] p-0 flex items-center justify-center rounded-2xl",
};

export const NeoButton = forwardRef<HTMLButtonElement, NeoButtonProps>(function NeoButton(
  {
    variant = "primary",
    size = "md",
    isLoading = false,
    disabled = false,
    icon: Icon,
    iconRight: IconRight,
    children,
    className,
    type = "button",
    ...props
  },
  ref
) {
  const isIconOnly = size === "icon-sm" || size === "icon-md";

  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center select-none cursor-pointer transition-all shrink-0",
        "active:translate-x-[1px] active:translate-y-[1px]",
        "disabled:opacity-60 disabled:cursor-not-allowed disabled:active:translate-x-0 disabled:active:translate-y-0",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {isLoading ? (
        <Loader2 size={size === "sm" ? 14 : 17} className="animate-spin shrink-0" />
      ) : Icon ? (
        <Icon size={size === "sm" ? 14 : 17} className="shrink-0" />
      ) : null}

      {!isIconOnly && children}

      {!isLoading && IconRight ? (
        <IconRight size={size === "sm" ? 14 : 17} className="shrink-0" />
      ) : null}
    </button>
  );
});

/* -------------------------------------------------------------------------- */
/*                                 2. NeoCard                                 */
/* -------------------------------------------------------------------------- */
export type NeoCardTone = "surface" | "cream" | "yellow" | "blue" | "danger";

export interface NeoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: NeoCardTone;
  interactive?: boolean;
}

const toneStyles: Record<NeoCardTone, string> = {
  surface: "bg-[var(--surface)] text-[var(--ink)]",
  cream: "bg-[var(--surface-cream)] text-[var(--ink)]",
  yellow: "bg-[var(--pastel-yellow-soft)] text-[var(--ink)] border-[var(--line-strong)]",
  blue: "bg-[var(--pastel-blue-soft)] text-[var(--ink)] border-[var(--line-strong)]",
  danger: "bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-400",
};

export const NeoCard = forwardRef<HTMLDivElement, NeoCardProps>(function NeoCard(
  { tone = "surface", interactive = false, className, children, ...props },
  ref
) {
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-2xl sm:rounded-3xl border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] transition-all",
        toneStyles[tone],
        interactive && "hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_var(--neo-shadow)] cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});

/* -------------------------------------------------------------------------- */
/*                                3. NeoBadge                                 */
/* -------------------------------------------------------------------------- */
export type NeoBadgeVariant = "orange" | "green" | "red" | "blue" | "yellow" | "neutral";

export interface NeoBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: NeoBadgeVariant;
  icon?: LucideIcon;
}

const badgeVariants: Record<NeoBadgeVariant, string> = {
  orange: "bg-[var(--pastel-orange-soft)] text-[var(--brand-orange)] border-[var(--brand-orange)]",
  green: "bg-[var(--pastel-green-soft)] text-emerald-700 dark:text-emerald-300 border-emerald-500",
  red: "bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-400",
  blue: "bg-[var(--pastel-blue-soft)] text-blue-700 dark:text-blue-300 border-blue-400",
  yellow: "bg-[var(--pastel-yellow-soft)] text-amber-800 dark:text-amber-200 border-amber-400",
  neutral: "bg-[var(--surface-cream)] text-[var(--ink)] border-[var(--line-strong)]",
};

export function NeoBadge({
  variant = "neutral",
  icon: Icon,
  className,
  children,
  ...props
}: NeoBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] sm:text-xs font-black border-2 shadow-[1px_1px_0px_var(--neo-shadow)] select-none",
        badgeVariants[variant],
        className
      )}
      {...props}
    >
      {Icon && <Icon size={13} className="shrink-0" />}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/*                                4. NeoInput                                 */
/* -------------------------------------------------------------------------- */
export interface NeoInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: LucideIcon;
}

export const NeoInput = forwardRef<HTMLInputElement, NeoInputProps>(function NeoInput(
  { icon: Icon, className, ...props },
  ref
) {
  return (
    <div className="relative w-full">
      {Icon && (
        <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink)] pointer-events-none">
          <Icon size={17} />
        </div>
      )}
      <input
        ref={ref}
        className={cn(
          "w-full text-xs sm:text-sm font-black rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface-2)] text-[var(--ink)]",
          "placeholder:text-[var(--muted)] placeholder:font-normal",
          "focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--brand-orange)]",
          "shadow-[2px_2px_0px_var(--neo-shadow)] transition-all",
          Icon ? "pr-10 pl-4 py-2.5" : "px-4 py-2.5",
          className
        )}
        {...props}
      />
    </div>
  );
});
