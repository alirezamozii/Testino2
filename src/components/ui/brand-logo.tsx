import React from "react";
import { cn } from "@/lib/utils";

interface BrandLogoProps {
  variant?: "full" | "icon" | "wordmark" | "stacked";
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
  iconClassName?: string;
  wordmarkClassName?: string;
  priority?: boolean;
}

const sizeConfig = {
  sm: { icon: "w-7 h-7", iconW: 28, iconH: 28, wordmark: "h-6.5", wordmarkW: 104, wordmarkH: 26 },
  md: { icon: "w-9 h-9", iconW: 36, iconH: 36, wordmark: "h-8", wordmarkW: 128, wordmarkH: 32 },
  lg: { icon: "w-14 h-14", iconW: 56, iconH: 56, wordmark: "h-11", wordmarkW: 176, wordmarkH: 44 },
  xl: { icon: "w-24 h-24", iconW: 96, iconH: 96, wordmark: "h-16", wordmarkW: 256, wordmarkH: 64 },
};

export function BrandLogo({
  variant = "full",
  size = "md",
  className,
  iconClassName,
  wordmarkClassName,
}: BrandLogoProps) {
  const conf = sizeConfig[size] || sizeConfig.md;
  const isStacked = variant === "stacked";

  return (
    <div
      className={cn(
        "brand-logo-container inline-flex items-center select-none",
        isStacked ? "flex-col gap-2 justify-center" : "gap-2.5",
        className
      )}
    >
      {variant !== "wordmark" && (
        <img
          src="/logo.png"
          alt="لوگوی تستینو"
          width={conf.iconW}
          height={conf.iconH}
          className={cn("brand-logo-icon object-contain shrink-0 drop-shadow-xs", conf.icon, iconClassName)}
          loading="eager"
        />
      )}

      {variant !== "icon" && (
        <div className="brand-logo-wordmark flex items-center">
          <img
            src="/name.png"
            alt="تستینو Testino"
            width={conf.wordmarkW}
            height={conf.wordmarkH}
            className={cn("object-contain w-auto dark:hidden", conf.wordmark, wordmarkClassName)}
            loading="eager"
          />
          <img
            src="/name-dark.png"
            alt="تستینو Testino"
            width={conf.wordmarkW}
            height={conf.wordmarkH}
            className={cn("object-contain w-auto hidden dark:block", conf.wordmark, wordmarkClassName)}
            loading="eager"
          />
        </div>
      )}
    </div>
  );
}
