import React from "react";
import { cn } from "@/lib/utils";

interface SignedNumberProps {
  value: number | string;
  unit?: string;
  showPlus?: boolean;
  decimals?: number;
  className?: string;
}

/**
 * Ensures numbers with positive (+) or negative (−) signs are rendered
 * strictly on the visual LEFT side of digits in RTL / Persian layouts.
 */
export function SignedNumber({
  value,
  unit = "",
  showPlus = false,
  decimals,
  className,
}: SignedNumberProps) {
  const num = typeof value === "number" ? value : parseFloat(String(value));
  if (isNaN(num)) {
    return (
      <span dir="ltr" className={cn("inline-block font-mono tabular-nums text-left", className)} style={{ unicodeBidi: "isolate" }}>
        {value}{unit}
      </span>
    );
  }

  const isNeg = num < 0;
  const isPos = num > 0;
  const sign = isNeg ? "−" : isPos && showPlus ? "+" : "";
  const absNum = Math.abs(num);
  const formatted = decimals !== undefined
    ? absNum.toFixed(decimals).replace(/\.0+$/, "")
    : absNum;

  return (
    <span
      dir="ltr"
      className={cn(
        "inline-block font-mono tabular-nums text-left",
        className
      )}
      style={{ unicodeBidi: "isolate" }}
    >
      {sign}{formatted}{unit}
    </span>
  );
}

/**
 * Specialized component for signed percentages (e.g. +12.5٪ or −3.2٪)
 * Guaranteed to keep + or − on the left of digits in RTL mode.
 */
export function SignedPercent({
  value,
  showPlus = false,
  decimals = 1,
  className,
}: {
  value: number | string;
  showPlus?: boolean;
  decimals?: number;
  className?: string;
}) {
  return (
    <SignedNumber
      value={value}
      unit="٪"
      showPlus={showPlus}
      decimals={decimals}
      className={className}
    />
  );
}

/**
 * Pure string formatter using Unicode Left-to-Right Isolate (LRI: \u2066 and PDI: \u2069).
 * Used inside plain strings, tooltips, alert messages, and AI prompts.
 * Guarantees that the sign stays on the left of digits even inside RTL Persian paragraphs.
 */
export function formatSignedPercentString(
  value: number,
  showPlus: boolean = true,
  decimals: number = 1
): string {
  if (isNaN(value)) return `0٪`;
  const isNeg = value < 0;
  const isPos = value > 0;
  const sign = isNeg ? "−" : isPos && showPlus ? "+" : "";
  const absFormatted = Math.abs(value).toFixed(decimals).replace(/\.0+$/, "");
  return `\u2066${sign}${absFormatted}٪\u2069`;
}
