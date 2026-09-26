"use client";

import React, { useEffect, useRef, useState } from "react";
import { BookOpen, Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import type { SessionView } from "@/database/app-database";
import type { ContentBlock } from "@/features/questions/domain/question-schema";

export interface ExamPassagePanelProps {
  currentQuestion: SessionView["questions"][number];
  currentIndex: number;
  isCloze: boolean;
  displayGroupContent?: ContentBlock[];
  passageQuestions: Array<SessionView["questions"][number] & { qIdx: number }>;
  onSelectQuestion: (index: number) => void;
}

export function ExamPassagePanel({
  currentQuestion,
  currentIndex,
  isCloze,
  displayGroupContent,
  passageQuestions,
  onSelectQuestion,
}: ExamPassagePanelProps) {
  const [isPassagePinned, setIsPassagePinned] = useState(true);
  const passageScrollRef = useRef<HTMLDivElement>(null);
  const currentGroupId = currentQuestion.snapshot.groupId;
  const hasPassage = Boolean(
    currentQuestion.snapshot.groupContent && currentQuestion.snapshot.groupContent.length > 0
  );

  // Auto-scroll passage container to active paragraph or target underlined word/phrase when question changes
  useEffect(() => {
    if (!currentGroupId || !hasPassage) return;
    const timer = setTimeout(() => {
      const targetEl = passageScrollRef.current?.querySelector(".para-active, u, mark");
      if (targetEl) {
        targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 150);
    return () => clearTimeout(timer);
  }, [currentIndex, currentGroupId, hasPassage]);

  if (!hasPassage) return null;

  return (
    <div
      className={cn(
        "card-neo p-4 sm:p-5 space-y-3 bg-[var(--surface-cream)] border-2 border-[var(--line-strong)] shadow-[3px_3px_0px_var(--neo-shadow)] transition-all",
        isPassagePinned && "sticky top-3 z-20"
      )}
    >
      <div className="flex items-center justify-between pb-2 border-b border-[var(--line)] gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[var(--pastel-blue)] border border-[var(--line-strong)] flex items-center justify-center text-[var(--ink-on-color)]">
            <BookOpen size={15} />
          </div>
          <strong className="text-xs sm:text-sm font-black text-[var(--ink)]">
            {isCloze
              ? "متن کلوزتست (Cloze Test)"
              : currentQuestion.snapshot.groupKind === "shared"
              ? "متن مشترک (Shared Passage)"
              : "متن درک مطلب (Reading Passage)"}
          </strong>
          {passageQuestions.length > 0 && (
            <span className="text-[10px] font-black px-2 py-0.5 rounded-lg bg-[var(--pastel-yellow)] text-[var(--ink-on-color)] border border-[var(--line-strong)]">
              سؤالات {passageQuestions[0].qIdx + 1} تا {passageQuestions[passageQuestions.length - 1].qIdx + 1}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Quick Switch between questions of this passage */}
          {passageQuestions.length > 1 && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-black text-[var(--muted)] hidden sm:inline">سؤالات:</span>
              {passageQuestions.map((pq) => {
                const isCurrentPassageQ = pq.qIdx === currentIndex;
                const isAnswered = Boolean(pq.selectedOptionId);
                return (
                  <button
                    key={pq.id}
                    type="button"
                    onClick={() => onSelectQuestion(pq.qIdx)}
                    className={cn(
                      "w-8 h-8 rounded-md border text-[11px] font-black transition-all flex items-center justify-center shrink-0 cursor-pointer",
                      isCurrentPassageQ
                        ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)] scale-110"
                        : isAnswered
                        ? "bg-[var(--pastel-green)] text-[var(--ink-on-color)] border-[var(--line-strong)]"
                        : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:border-[var(--line-strong)]"
                    )}
                    title={`رفتن به سؤال ${pq.qIdx + 1}`}
                  >
                    {pq.qIdx + 1}
                  </button>
                );
              })}
            </div>
          )}

          {/* Pin Toggle Button */}
          <button
            type="button"
            onClick={() => setIsPassagePinned(!isPassagePinned)}
            className={cn(
              "p-1.5 rounded-lg border text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
              isPassagePinned
                ? "bg-[var(--brand-orange)] text-white border-[var(--line-strong)] shadow-[1px_1px_0px_var(--neo-shadow)]"
                : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
            )}
            title={isPassagePinned ? "سنجاق شده در بالای صفحه (همیشه در دید)" : "سنجاق کردن متن در بالا"}
          >
            {isPassagePinned ? <Pin size={13} className="fill-current" /> : <PinOff size={13} />}
            <span className="text-[10px] hidden md:inline">{isPassagePinned ? "سنجاق‌شده" : "سنجاق"}</span>
          </button>
        </div>
      </div>

      {/* Scrollable Passage Body with Neo Scrollbar */}
      <div
        ref={passageScrollRef}
        dir="ltr"
        className="max-h-52 sm:max-h-64 overflow-y-auto pr-2 pl-1 text-xs sm:text-sm leading-relaxed text-[var(--ink)] font-medium neo-scrollbar select-text scroll-smooth"
      >
        <div dir="ltr" className="font-sans text-left leading-relaxed">
          <ContentRenderer blocks={displayGroupContent || currentQuestion.snapshot.groupContent!} />
        </div>
      </div>
    </div>
  );
}
