"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles, FileUp, Split, BookOpen } from "lucide-react";
import { cn } from "@/lib/utils";

export type BankTabKey = "prompts" | "import" | "booklet" | "bank";

interface BankNavTabsProps {
  activeTab?: BankTabKey;
}

const TABS: Array<{
  id: BankTabKey;
  href: string;
  step: string;
  title: string;
  icon: typeof Sparkles;
}> = [
  {
    id: "prompts",
    href: "/bank/prompts/",
    step: "گام ۱",
    title: "پرامپت هوشمند",
    icon: Sparkles,
  },
  {
    id: "import",
    href: "/import/",
    step: "گام ۲",
    title: "ورود سؤالات",
    icon: FileUp,
  },
  {
    id: "booklet",
    href: "/bank/booklet/",
    step: "گام ۳",
    title: "دفترچه آزمون",
    icon: Split,
  },
  {
    id: "bank",
    href: "/bank/",
    step: "گام ۴",
    title: "بانک سؤالات",
    icon: BookOpen,
  },
];

export function BankNavTabs({ activeTab }: BankNavTabsProps) {
  const pathname = usePathname();

  const currentTab =
    activeTab ||
    (pathname.includes("/bank/prompts")
      ? "prompts"
      : pathname.includes("/import")
      ? "import"
      : pathname.includes("/bank/booklet")
      ? "booklet"
      : "bank");

  return (
    <div className="w-full bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-2xl p-1.5 sm:p-2 shadow-[3px_3px_0px_var(--neo-shadow)]">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-1.5 sm:gap-2">
        {TABS.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;

          return (
            <Link
              key={tab.id}
              href={tab.href}
              className={cn(
                "py-2 sm:py-2.5 px-2.5 sm:px-3 rounded-xl border-2 transition-all flex items-center justify-center gap-2 group cursor-pointer",
                isActive
                  ? "bg-[var(--testino-orange)] text-white border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] font-black"
                  : "bg-transparent text-[var(--muted)] border-transparent hover:text-[var(--ink)] hover:bg-[var(--surface-2)] font-bold"
              )}
            >
              <div
                className={cn(
                  "w-6 h-6 sm:w-7 sm:h-7 rounded-lg border flex items-center justify-center shrink-0 transition-colors",
                  isActive
                    ? "bg-white/20 border-white/40 text-white"
                    : "bg-[var(--surface-2)] border-[var(--line-strong)]/30 text-[var(--muted)] group-hover:text-[var(--ink)]"
                )}
              >
                <Icon size={14} className="sm:w-3.5 sm:h-3.5" />
              </div>
              <div className="text-right truncate min-w-0">
                <div className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "text-[9px] sm:text-[10px] font-mono px-1 py-0.2 rounded font-black shrink-0",
                      isActive
                        ? "bg-white/20 text-white"
                        : "bg-[var(--surface-2)] text-[var(--muted)]"
                    )}
                  >
                    {tab.step}
                  </span>
                  <span className="text-xs sm:text-sm font-black truncate">{tab.title}</span>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
