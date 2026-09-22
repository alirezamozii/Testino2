"use client";

import { useState, useEffect, useRef } from "react";
import { Sparkles, Check } from "lucide-react";
import { searchSubjectDetails, type SubjectSuggestion } from "@/platform/shared-subjects";
import { cn } from "@/lib/utils";

interface SubjectAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  onSelectSuggestion?: (suggestion: SubjectSuggestion) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  autoFocus?: boolean;
}

export function SubjectAutocomplete({
  value,
  onChange,
  onSelectSuggestion,
  placeholder = "نام درس را بنویسید (مثلاً: ریاضی، ادبیات، زیست)...",
  className,
  inputClassName,
  autoFocus = false,
}: SubjectAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SubjectSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced search on input change
  useEffect(() => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);

    if (!value || value.trim().length < 1) {
      searchTimeoutRef.current = setTimeout(() => {
        setSuggestions([]);
        setIsOpen(false);
      }, 0);
      return;
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const results = await searchSubjectDetails(value);
        setSuggestions(results);
        setIsOpen(results.length > 0);
        setHighlightedIndex(-1);
      } catch {
        setSuggestions([]);
      }
    }, 120);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [value]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = (item: SubjectSuggestion) => {
    onChange(item.name);
    if (onSelectSuggestion) {
      onSelectSuggestion(item);
    }
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
    } else if (e.key === "Enter" && highlightedIndex >= 0) {
      e.preventDefault();
      handleSelect(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", className)}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setIsOpen(true);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className={cn(
          "w-full bg-[var(--surface)] border border-[var(--line-strong)]/40 rounded-xl px-3 py-1.5 text-xs font-black text-[var(--ink)] placeholder:text-[var(--muted)] placeholder:font-normal focus:outline-none focus:border-sky-500 shadow-sm",
          inputClassName
        )}
      />

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 top-full mt-1.5 right-0 left-0 bg-[var(--surface)] border-2 border-[var(--line-strong)] rounded-2xl shadow-[4px_4px_0px_var(--neo-shadow)] overflow-hidden animate-in fade-in slide-in-from-top-1 max-h-60 overflow-y-auto">
          <div className="px-3 py-1.5 bg-[var(--surface-2)] border-b border-[var(--line)] text-[10px] font-black text-[var(--muted)] flex items-center justify-between">
            <span className="flex items-center gap-1">
              <Sparkles size={11} className="text-amber-500" />
              <span>پیشنهادات هوشمند و جامعه داوطلبان</span>
            </span>
            <span className="text-[9px]">کلیک یا Enter برای انتخاب</span>
          </div>

          <div className="p-1 space-y-0.5">
            {suggestions.map((item, idx) => {
              const isSelected = item.name.toLowerCase() === value.trim().toLowerCase();
              const isHighlighted = idx === highlightedIndex;

              return (
                <button
                  key={`${item.name}-${idx}`}
                  type="button"
                  onClick={() => handleSelect(item)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={cn(
                    "w-full text-right px-3 py-2 rounded-xl text-xs font-bold transition-all flex items-center justify-between gap-2 cursor-pointer select-none",
                    isHighlighted || isSelected
                      ? "bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-200"
                      : "text-[var(--ink)] hover:bg-[var(--surface-2)]"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "w-2 h-2 rounded-full shrink-0",
                        item.source === "community"
                          ? "bg-emerald-500"
                          : item.source === "custom"
                          ? "bg-purple-500"
                          : "bg-[var(--testino-orange)]"
                      )}
                    />
                    <strong className="font-black text-xs text-[var(--ink)] truncate">
                      {item.name}
                    </strong>
                    {item.category && (
                      <span className="text-[9px] px-1.5 py-0.2 rounded bg-[var(--surface-2)] text-[var(--muted)] border border-[var(--line)] shrink-0">
                        {item.category}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 text-[10px] text-[var(--muted)]">
                    {item.recommendedQuestions && (
                      <span>{item.recommendedQuestions} سؤال</span>
                    )}
                    {item.recommendedCoefficient !== undefined && (
                      <>
                        <span>•</span>
                        <span>ضریب {item.recommendedCoefficient}</span>
                      </>
                    )}
                    {isSelected && <Check size={13} className="text-sky-600 mr-1" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
