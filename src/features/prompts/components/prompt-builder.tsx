"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Copy,
  Check,
  Download,
  BookOpen,
  Binary,
  Globe,
  MoonStar,
  PieChart,
  Briefcase,
  TrendingDown,
  TrendingUp,
  Cpu,
  Factory,
  Target,
  CheckCircle2,
  Sliders,
  FileCode,
  ArrowRight,
  UploadCloud,
  Bot,
  PenTool,
  ChevronDown,
  ChevronUp,
  GraduationCap,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";
import {
  SUBJECT_CONFIGS,
  buildSubjectPrompt,
  type PromptGenerationParams,
  type SubjectPromptConfig,
} from "../domain/prompt-templates";
import { cn } from "@/lib/utils";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";
import { useDatabase } from "@/providers/database-provider";
import { useQuery } from "@tanstack/react-query";
import { findSubjectPromptConfig } from "@/features/questions/domain/subject-registry";
import { toEnDigits, sanitizeIntegerInput, parseSafeInt } from "@/lib/number-utils";

const YEARS = [1405, 1404, 1403, 1402, 1401, 1400, 1399];
type SourceKind = "EXAM" | "AI" | "BOOK" | "OTHER";

export function PromptBuilder() {
  const { db, status } = useDatabase();
  const profilesQuery = useQuery({
    queryKey: ["profiles"],
    queryFn: () => db.listProfiles(),
    enabled: status === "ready",
  });
  const profile = profilesQuery.data?.[0];
  const profileSubjects = useMemo(() => profile?.subjects ?? [], [profile]);

  // Scope: "profile" (default if profile subjects exist) or "all"
  const [subjectScope, setSubjectScope] = useState<"profile" | "all">("profile");
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("universal");
  const [activeProfileSubject, setActiveProfileSubject] = useState<{
    id?: string;
    name: string;
    coefficient: number;
    targetPercentage?: number;
    questionCount?: number;
  } | null>(null);

  const [sourceKind, setSourceKind] = useState<SourceKind>("EXAM");
  const [sourceTitle, setSourceTitle] = useState<string>("");
  const [year, setYear] = useState<number>(1401);
  const [isCustomYear, setIsCustomYear] = useState<boolean>(false);
  const [customYear, setCustomYear] = useState<string>("1398");

  // String-backed input state allows natural typing, backspace, and Persian numeral support without fighting user
  const [startQInput, setStartQInput] = useState<string>("1");
  const [endQInput, setEndQInput] = useState<string>("30");

  const startQ = useMemo(() => {
    return parseSafeInt(startQInput, 0);
  }, [startQInput]);

  const endQ = useMemo(() => {
    return parseSafeInt(endQInput, 0);
  }, [endQInput]);

  const isAllQuestions = startQ === 0 && endQ === 0;

  const effectiveStartQ = useMemo(() => {
    if (isAllQuestions) return 0;
    if (startQ > 0 && endQ > 0 && startQ > endQ) return endQ;
    return startQ;
  }, [isAllQuestions, startQ, endQ]);

  const effectiveEndQ = useMemo(() => {
    if (isAllQuestions) return 0;
    if (startQ > 0 && endQ > 0 && startQ > endQ) return startQ;
    return endQ;
  }, [isAllQuestions, startQ, endQ]);

  const [keyCsv, setKeyCsv] = useState<string>("");
  const [csvDragging, setCsvDragging] = useState<boolean>(false);
  const csvFileInputRef = useRef<HTMLInputElement>(null);

  const [customNotes, setCustomNotes] = useState<string>("");
  const [enforceCapsuleLeitner, setEnforceCapsuleLeitner] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);

  // Accordion / Collapsible states for clean decluttered UI
  const [isSubjectPickerOpen, setIsSubjectPickerOpen] = useState<boolean>(false);
  const [isCsvSectionOpen, setIsCsvSectionOpen] = useState<boolean>(false);
  const [isNotesSectionOpen, setIsNotesSectionOpen] = useState<boolean>(false);

  // Auto-initialize with user's first profile subject if available
  const [initialized, setInitialized] = useState(false);
  useEffect(() => {
    if (!initialized && profileSubjects.length > 0) {
      const first = profileSubjects[0];
      const cfg = findSubjectPromptConfig(first.name);
      queueMicrotask(() => {
        setSelectedSubjectId(cfg.id);
        setActiveProfileSubject(first);
        setStartQInput(String(cfg.defaultStartQ));
        setEndQInput(String(cfg.defaultEndQ));
        setSubjectScope("profile");
        setInitialized(true);
      });
    }
  }, [profileSubjects, initialized]);

  // CSV file helper
  const handleCsvFile = (file: File) => {
    if (!file) return;
    file
      .text()
      .then((txt) => {
        setKeyCsv(txt.trim());
      })
      .catch(() => {});
  };

  const handleCsvDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setCsvDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleCsvFile(file);
  };

  // When profile subject clicked
  const handleSelectProfileSubject = (sub: {
    id?: string;
    name: string;
    coefficient: number;
    targetPercentage?: number;
    questionCount?: number;
  }) => {
    const cfg = findSubjectPromptConfig(sub.name);
    setSelectedSubjectId(cfg.id);
    setActiveProfileSubject(sub);
    setStartQInput(String(cfg.defaultStartQ));
    setEndQInput(String(cfg.defaultEndQ));
    setIsSubjectPickerOpen(false);
  };

  // When general subject clicked
  const handleSelectGeneralSubject = (subjId: string) => {
    setSelectedSubjectId(subjId);
    setActiveProfileSubject(null);
    const config = SUBJECT_CONFIGS[subjId] || SUBJECT_CONFIGS.universal;
    setStartQInput(String(config.defaultStartQ));
    setEndQInput(String(config.defaultEndQ));
    setIsSubjectPickerOpen(false);
  };

  const currentConfig: SubjectPromptConfig = useMemo(() => {
    if (activeProfileSubject) {
      return findSubjectPromptConfig(activeProfileSubject.name);
    }
    return SUBJECT_CONFIGS[selectedSubjectId] || SUBJECT_CONFIGS.universal;
  }, [activeProfileSubject, selectedSubjectId]);

  // Build the live prompt
  const generatedPrompt = useMemo(() => {
    const effectiveYear = isCustomYear ? customYear.trim() : year;
    const notesParts: string[] = [];
    if (enforceCapsuleLeitner) {
      notesParts.push("تأکید ویژه بر گام ۵ پاسخ تشریحی: نکته طلایی کپسولی باید فوق‌العاده کوتاه، جذاب، خوش‌خوان و کاملاً آماده برای ثبت در فلاش‌کارت جعبه لایتنر باشد.");
    }
    if (customNotes.trim()) {
      notesParts.push(customNotes.trim());
    }
    const effectiveCustomNotes = notesParts.length > 0 ? notesParts.join("\n\n") : undefined;

    const params: PromptGenerationParams = {
      subjectId: selectedSubjectId,
      forceSubjectTitle: activeProfileSubject ? activeProfileSubject.name : undefined,
      sourceKind,
      sourceTitle: sourceTitle.trim() || undefined,
      year: sourceKind === "EXAM" ? effectiveYear : undefined,
      startQ: effectiveStartQ,
      endQ: effectiveEndQ,
      keyCsv: keyCsv.trim() || undefined,
      customNotes: effectiveCustomNotes,
      includeGroups: selectedSubjectId === "ENG",
    };
    return buildSubjectPrompt(params);
  }, [
    selectedSubjectId,
    activeProfileSubject,
    sourceKind,
    sourceTitle,
    year,
    isCustomYear,
    customYear,
    effectiveStartQ,
    effectiveEndQ,
    keyCsv,
    customNotes,
    enforceCapsuleLeitner,
  ]);

  // Copy prompt to clipboard
  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(generatedPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Fallback
    }
  };

  // Download prompt as .txt
  const handleDownloadTxt = () => {
    const blob = new Blob([generatedPrompt], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const rangeTag = isAllQuestions ? "all" : `q${effectiveStartQ}-q${effectiveEndQ}`;
    a.download = `prompt-${currentConfig.abbreviation.toLowerCase()}-${year}-${rangeTag}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Helper icons
  const getSubjectIcon = (iconName: string) => {
    switch (iconName) {
      case "Globe":
        return <Globe size={20} />;
      case "MoonStar":
        return <MoonStar size={20} />;
      case "Binary":
        return <Binary size={20} />;
      case "PieChart":
        return <PieChart size={20} />;
      case "Briefcase":
        return <Briefcase size={20} />;
      case "TrendingDown":
        return <TrendingDown size={20} />;
      case "TrendingUp":
        return <TrendingUp size={20} />;
      case "Cpu":
        return <Cpu size={20} />;
      case "Factory":
        return <Factory size={20} />;
      case "Target":
        return <Target size={20} />;
      default:
        return <Sparkles size={20} />;
    }
  };

  const handleSendToAi = (url: string) => {
    handleCopyPrompt();
    window.open(url, "_blank", "noopener,noreferrer");
  };

  return (
    <div className="page prompt-builder-page max-w-7xl mx-auto space-y-5 pb-16 px-3 sm:px-6">
      {/* 4-Step Pipeline Navigation */}
      <BankNavTabs activeTab="prompts" />

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--line)] pb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-[var(--ink)] flex items-center gap-2">
            <Sparkles className="text-[var(--testino-orange)] fill-current" size={26} />
            <span>پرامپت بیلدر هوشمند تستیونو</span>
          </h1>
          <p className="text-xs text-[var(--muted)] font-bold mt-0.5">
            تولید خودکار پرامپت استخراج سؤالات دروس کنکور ارشد مدیریت با خروجی JSON خالص.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCopyPrompt}
            className="h-10 sm:h-11 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--testino-orange)] text-white text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            <span>{copied ? "کپی شد!" : "کپی پرامپت"}</span>
          </button>
        </div>
      </div>

      {/* Balanced 2-Column Controls Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Right Column: Subject & Key CSV */}
        <div className="space-y-4">
          {/* Card 1: Subject Selection */}
          <div className="testino-card p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] flex items-center gap-2">
                <BookOpen size={17} className="text-[var(--testino-orange)]" />
                <span>۱. انتخاب درس کنکوری</span>
              </span>
              <button
                type="button"
                onClick={() => setIsSubjectPickerOpen(!isSubjectPickerOpen)}
                className="text-xs font-black text-[var(--testino-orange)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{isSubjectPickerOpen ? "بستن لیست" : "تغییر درس"}</span>
                {isSubjectPickerOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>

            {/* Currently Selected Subject Hero Card */}
            <div
              onClick={() => setIsSubjectPickerOpen(!isSubjectPickerOpen)}
              className="p-3.5 sm:p-4 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)] transition-all cursor-pointer flex items-center justify-between gap-3 shadow-[2px_2px_0px_var(--neo-shadow)]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-2xl bg-orange-100 dark:bg-orange-950/60 text-[var(--testino-orange)] flex items-center justify-center font-black shrink-0 border border-orange-200 dark:border-orange-800">
                  {getSubjectIcon(currentConfig.iconName || "Sparkles")}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm sm:text-base font-black text-[var(--ink)] truncate">
                      {activeProfileSubject ? activeProfileSubject.name : currentConfig.titleFa}
                    </span>
                    {activeProfileSubject && (
                      <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border border-emerald-300 dark:border-emerald-800 flex items-center gap-1">
                        <Target size={11} />
                        <span>درس هدف شما</span>
                      </span>
                    )}
                    <span className="text-[10px] font-mono font-black px-1.5 py-0.5 rounded-md bg-[var(--surface)] border border-[var(--line)] text-[var(--muted)]">
                      {currentConfig.abbreviation}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--muted)] font-bold mt-1 flex-wrap">
                    <span>
                      ضریب {activeProfileSubject ? (activeProfileSubject.coefficient ?? currentConfig.coefficient) : currentConfig.coefficient}
                    </span>
                    {activeProfileSubject?.targetPercentage ? (
                      <>
                        <span>•</span>
                        <span className="text-emerald-700 dark:text-emerald-400">
                          هدف {activeProfileSubject.targetPercentage}٪
                        </span>
                      </>
                    ) : null}
                    <span>•</span>
                    <span>سؤالات آزمون {isAllQuestions ? "همه سؤالات (۰ تا ۰)" : `${effectiveStartQ} تا ${effectiveEndQ}`}</span>
                  </div>
                </div>
              </div>

              <span className="text-xs font-black py-1.5 px-3 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shrink-0">
                {isSubjectPickerOpen ? "بستن" : "تغییر"}
              </span>
            </div>

            {/* Scope-Aware Subjects Grid (Profile Subjects vs All Konkur Subjects) */}
            {isSubjectPickerOpen && (
              <div className="pt-2 space-y-3 animate-in fade-in duration-150 border-t border-[var(--line)] mt-3">
                {/* Scope selector tabs */}
                <div className="flex items-center p-1 rounded-xl bg-[var(--surface-2)] border border-[var(--line)] gap-1">
                  <button
                    type="button"
                    onClick={() => setSubjectScope("profile")}
                    className={cn(
                      "flex-1 py-1.5 px-2 text-xs font-black rounded-lg transition-all text-center cursor-pointer flex items-center justify-center gap-1",
                      subjectScope === "profile"
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    )}
                  >
                    <Target size={12} className="text-[var(--brand-orange)]" />
                    <span>دروس هدف من ({profileSubjects.length} درس)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubjectScope("all")}
                    className={cn(
                      "flex-1 py-1.5 px-2 text-xs font-black rounded-lg transition-all text-center cursor-pointer flex items-center justify-center gap-1",
                      subjectScope === "all"
                        ? "bg-[var(--surface)] text-[var(--ink)] shadow-sm border border-[var(--line)]"
                        : "text-[var(--muted)] hover:text-[var(--ink)]"
                    )}
                  >
                    <BookOpen size={12} />
                    <span>همه دروس کنکور ({Object.keys(SUBJECT_CONFIGS).length} درس)</span>
                  </button>
                </div>

                {/* Tab Content: Profile Subjects */}
                {subjectScope === "profile" && (
                  <div>
                    {profileSubjects.length === 0 ? (
                      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 text-center space-y-2">
                        <p className="text-xs font-bold text-amber-900 dark:text-amber-200">
                          شما هنوز درسی به برنامه مطالعاتی خود در پروفایل اضافه نکرده‌اید.
                        </p>
                        <Link
                          href="/profiles/"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-600 text-white text-xs font-black shadow hover:bg-amber-700 transition-all"
                        >
                          <span>تنظیم دروس هدف در پروفایل</span>
                          <ArrowRight size={13} />
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto p-1">
                          {profileSubjects.map((sub) => {
                            const cfg = findSubjectPromptConfig(sub.name);
                            const isSelected = activeProfileSubject?.name === sub.name;
                            return (
                              <button
                                key={sub.id || sub.name}
                                type="button"
                                onClick={() => handleSelectProfileSubject(sub)}
                                className={cn(
                                  "p-3 rounded-2xl border text-right transition-all flex flex-col justify-between gap-2 cursor-pointer relative",
                                  isSelected
                                    ? "border-[var(--testino-orange)] bg-orange-50 dark:bg-orange-950/40 shadow-[2px_2px_0px_var(--neo-shadow)]"
                                    : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                                )}
                              >
                                <div className="flex items-center justify-between w-full">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="text-[var(--testino-orange)] shrink-0">
                                      {getSubjectIcon(cfg.iconName || "Sparkles")}
                                    </span>
                                    <span className="text-xs font-black truncate">{sub.name}</span>
                                  </div>
                                  <span className="text-[10px] font-mono font-bold text-[var(--muted)]">
                                    {cfg.abbreviation}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px] text-[var(--muted)] font-bold">
                                  <span>ضریب {sub.coefficient}</span>
                                  {sub.targetPercentage && (
                                    <span className="text-emerald-700 dark:text-emerald-400 font-black">
                                      هدف {sub.targetPercentage}٪
                                    </span>
                                  )}
                                  <span>سؤال {cfg.defaultStartQ}-{cfg.defaultEndQ}</span>
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        <div className="pt-1 flex items-center justify-between px-1">
                          <span className="text-[11px] text-[var(--muted)] font-bold">
                            داده‌های استخراج‌شده مستقیماً با نام‌های برنامه شما هماهنگ می‌شوند.
                          </span>
                          <Link
                            href="/profiles/"
                            className="text-[11px] font-black text-[var(--testino-orange)] hover:underline flex items-center gap-1"
                          >
                            <span>مدیریت دروس</span>
                            <ExternalLink size={12} />
                          </Link>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Tab Content: All Konkur Subjects */}
                {subjectScope === "all" && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[340px] overflow-y-auto p-1">
                    {Object.values(SUBJECT_CONFIGS).map((item) => {
                      const isSelected = !activeProfileSubject && selectedSubjectId === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleSelectGeneralSubject(item.id)}
                          className={cn(
                            "p-3 rounded-2xl border text-right transition-all flex flex-col justify-between gap-1.5 cursor-pointer",
                            isSelected
                              ? "border-[var(--testino-orange)] bg-orange-50 dark:bg-orange-950/40 shadow-[2px_2px_0px_var(--neo-shadow)]"
                              : "border-[var(--line)] bg-[var(--surface)] hover:bg-[var(--surface-2)]"
                          )}
                        >
                          <div className="flex items-center justify-between w-full">
                            <span className="text-xs font-black truncate">{item.titleFa}</span>
                            <span className="text-[10px] font-mono font-bold text-[var(--muted)]">
                              {item.abbreviation}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] text-[var(--muted)] font-bold">
                            <span>ضریب {item.coefficient}</span>
                            <span>سؤال {item.defaultStartQ}-{item.defaultEndQ}</span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Card 3: Official Key CSV (Accordion) */}
          <div className="testino-card p-4 space-y-3">
            <div
              onClick={() => setIsCsvSectionOpen(!isCsvSectionOpen)}
              className="flex items-center justify-between cursor-pointer border-b border-[var(--line)] pb-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
                  <CheckCircle2 size={16} className={keyCsv.trim() ? "text-emerald-500" : "text-[var(--muted)]"} />
                  <span>۳. کلید رسمی سازمان سنجش (CSV)</span>
                </span>
                {keyCsv.trim() ? (
                  <span className="testino-chip text-[10px] font-black bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    تزریق شد ({keyCsv.trim().split("\n").filter(Boolean).length} سؤال)
                  </span>
                ) : (
                  <span className="testino-chip text-[10px] font-bold bg-neutral-100 text-neutral-600">
                    اختیاری
                  </span>
                )}
              </div>
              <button type="button" className="text-[var(--muted)] hover:text-[var(--ink)]">
                {isCsvSectionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {isCsvSectionOpen && (
              <div className="space-y-3 pt-1 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[var(--muted)] font-bold">ورود کلید رسمی (CSV):</span>
                  <button
                    type="button"
                    onClick={() => {
                      const sampleLines = [];
                      const s = isAllQuestions ? 1 : Math.max(1, effectiveStartQ);
                      const e = isAllQuestions ? 5 : Math.max(s, effectiveEndQ);
                      for (let q = s; q <= Math.min(s + 4, e); q++) {
                        sampleLines.push(`${q},${((q % 4) + 1).toString()}`);
                      }
                      setKeyCsv(sampleLines.join("\n"));
                    }}
                    className="text-[11px] font-bold text-[var(--testino-orange)] hover:underline cursor-pointer shrink-0"
                  >
                    تولید نمونه تستی
                  </button>
                </div>

                {/* Drag & Drop File Zone */}
                <input
                  ref={csvFileInputRef}
                  type="file"
                  accept=".csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleCsvFile(file);
                  }}
                />
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setCsvDragging(true);
                  }}
                  onDragLeave={() => setCsvDragging(false)}
                  onDrop={handleCsvDrop}
                  onClick={() => csvFileInputRef.current?.click()}
                  className={cn(
                    "p-3 rounded-xl border-2 border-dashed text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-1.5",
                    csvDragging
                      ? "border-[var(--testino-orange)] bg-orange-50 dark:bg-orange-950/30"
                      : "border-[var(--line)] bg-[var(--surface-2)]/60 hover:bg-[var(--surface-2)]"
                  )}
                >
                  <UploadCloud size={20} className="text-[var(--muted)]" />
                  <div className="text-[11px] font-bold text-[var(--muted)]">
                    فایل CSV کلید را اینجا رها کنید، یا <span className="text-[var(--testino-orange)] underline">کلیک کنید</span>
                  </div>
                </div>

                {/* CSV Raw Text Area */}
                <textarea
                  rows={3}
                  value={keyCsv}
                  onChange={(e) => setKeyCsv(e.target.value)}
                  placeholder={`شماره,گزینه\n${effectiveStartQ || 1},1\n${(effectiveStartQ || 1) + 1},4\n...`}
                  className="w-full p-2.5 text-xs font-mono rounded-xl border border-[var(--line)] bg-[var(--surface)] text-left"
                  dir="ltr"
                />
              </div>
            )}
          </div>
        </div>

        {/* Left Column: Source, Year, Range & Custom Notes */}
        <div className="space-y-4">
          {/* Card 2: Source Kind & Parameters */}
          <div className="testino-card p-4 sm:p-5 space-y-3.5">
            <div className="flex items-center justify-between border-b border-[var(--line)] pb-3">
              <span className="text-xs sm:text-sm font-black text-[var(--ink)] flex items-center gap-2">
                <Sliders size={17} className="text-[var(--testino-orange)]" />
                <span>۲. منبع، سال و بازه سؤالات</span>
              </span>
              <span className="testino-chip text-[11px] font-black bg-blue-50 text-blue-800 dark:bg-blue-950 dark:text-blue-200">
                {sourceKind === "EXAM"
                  ? `کنکور ${isCustomYear ? customYear : year}`
                  : sourceKind === "AI"
                  ? "تألیفی AI"
                  : sourceKind === "BOOK"
                  ? "کتاب تست"
                  : "سایر منابع"}
              </span>
            </div>

            {/* Source Kind Selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-black text-[var(--muted)]">نوع منبع سؤالات:</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: "EXAM", label: "کنکور سراسری", icon: GraduationCap },
                  { id: "AI", label: "تألیفی هوش مصنوعی", icon: Bot },
                  { id: "BOOK", label: "کتاب تست", icon: BookOpen },
                  { id: "OTHER", label: "سایر منابع", icon: PenTool },
                ].map((item) => {
                  const isSelected = sourceKind === item.id;
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSourceKind(item.id as SourceKind)}
                      className={cn(
                        "p-2.5 text-xs font-black rounded-2xl border transition-all flex items-center justify-center gap-1.5 cursor-pointer",
                        isSelected
                          ? "bg-[var(--ink)] text-[var(--surface)] border-[var(--ink)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                          : "bg-[var(--surface)] border-[var(--line)] hover:bg-[var(--surface-2)] text-[var(--ink)]"
                      )}
                    >
                      <Icon size={15} />
                      <span className="truncate">{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Year Selection for Exam */}
            {sourceKind === "EXAM" && (
              <div className="space-y-2 p-3 rounded-2xl bg-[var(--surface-2)]/50 border border-[var(--line)]">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black text-[var(--muted)]">سال برگزاری کنکور سراسری:</label>
                  <button
                    type="button"
                    onClick={() => setIsCustomYear(!isCustomYear)}
                    className="text-[11px] font-bold text-[var(--testino-orange)] hover:underline cursor-pointer"
                  >
                    {isCustomYear ? "انتخاب سال‌های پرتکرار" : "سایر سال‌ها / دستی"}
                  </button>
                </div>

                {!isCustomYear ? (
                  <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                    {YEARS.map((y) => (
                      <button
                        key={y}
                        type="button"
                        onClick={() => setYear(y)}
                        className={cn(
                          "py-1.5 text-xs font-mono font-black rounded-xl border transition-all cursor-pointer",
                          year === y
                            ? "bg-[var(--testino-orange)] text-white border-[var(--line)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                            : "bg-[var(--surface)] border-[var(--line)] hover:bg-[var(--surface-2)]"
                        )}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                ) : (
                  <div>
                    <input
                      type="text"
                      value={customYear}
                      onChange={(e) => setCustomYear(toEnDigits(e.target.value))}
                      placeholder="مثال: 1398 یا نوبت دوم 1403"
                      className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)]"
                      dir="rtl"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Additional Inputs for Non-Exam Sources */}
            {sourceKind === "BOOK" && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-[var(--surface-2)]/50 border border-[var(--line)]">
                <label className="text-xs font-black text-[var(--muted)]">نام کتاب یا مؤسسه طراح (اختیاری):</label>
                <input
                  type="text"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder="مثال: کتاب ۲۰۰۰ تست مدیریت مالی دکتر مناجاتی"
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)]"
                  dir="rtl"
                />
              </div>
            )}

            {sourceKind === "AI" && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-[var(--surface-2)]/50 border border-[var(--line)]">
                <label className="text-xs font-black text-[var(--muted)]">هدف یا سناریوی طراحی سؤال تألیفی (اختیاری):</label>
                <input
                  type="text"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder="مثال: شبیه‌ساز کنکور با تمرکز بر سؤالات ترکیبی و مفهومی"
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)]"
                  dir="rtl"
                />
              </div>
            )}

            {sourceKind === "OTHER" && (
              <div className="space-y-1.5 p-3 rounded-2xl bg-[var(--surface-2)]/50 border border-[var(--line)]">
                <label className="text-xs font-black text-[var(--muted)]">عنوان منبع (اختیاری):</label>
                <input
                  type="text"
                  value={sourceTitle}
                  onChange={(e) => setSourceTitle(e.target.value)}
                  placeholder="مثال: جزوه کلاسی دکتر مقیمی - آزمون دوره‌ای"
                  className="w-full px-3 py-2 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)]"
                  dir="rtl"
                />
              </div>
            )}

            {/* Range Start - End with Persian & English digits and 0 to 0 support */}
            <div className="space-y-2 pt-1 border-t border-[var(--line)]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-black text-[var(--muted)]">بازه سؤالات آزمون:</label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setStartQInput("0");
                      setEndQInput("0");
                    }}
                    className={cn(
                      "px-2.5 py-1 text-[11px] font-black rounded-lg border transition-all cursor-pointer flex items-center gap-1",
                      isAllQuestions
                        ? "bg-emerald-600 text-white border-emerald-600 shadow-sm"
                        : "bg-[var(--surface-2)] border-[var(--line)] hover:border-[var(--testino-orange)] text-[var(--ink)]"
                    )}
                  >
                    <Sparkles size={12} className={isAllQuestions ? "text-white" : "text-[var(--testino-orange)]"} />
                    <span>همه سؤالات (۰ تا ۰)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStartQInput(String(currentConfig.defaultStartQ));
                      setEndQInput(String(currentConfig.defaultEndQ));
                    }}
                    className="px-2 py-1 text-[11px] font-bold rounded-lg border border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--ink)] cursor-pointer"
                  >
                    پیش‌فرض ({currentConfig.defaultStartQ} تا {currentConfig.defaultEndQ})
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black text-[var(--muted)]">از سؤال شماره:</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={startQInput}
                    onChange={(e) => setStartQInput(sanitizeIntegerInput(e.target.value))}
                    onBlur={() => {
                      if (!startQInput.trim()) setStartQInput("0");
                    }}
                    placeholder="مثلاً ۱ یا ۰"
                    className="w-full px-3 py-2 text-sm font-black text-center rounded-xl border-2 border-[var(--line)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)] focus:border-[var(--testino-orange)] focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-black text-[var(--muted)]">تا سؤال شماره:</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    dir="ltr"
                    value={endQInput}
                    onChange={(e) => setEndQInput(sanitizeIntegerInput(e.target.value))}
                    onBlur={() => {
                      if (!endQInput.trim()) setEndQInput("0");
                    }}
                    placeholder="مثلاً ۳۰ یا ۰"
                    className="w-full px-3 py-2 text-sm font-black text-center rounded-xl border-2 border-[var(--line)] bg-[var(--surface)] shadow-[2px_2px_0px_var(--neo-shadow)] focus:border-[var(--testino-orange)] focus:outline-none"
                  />
                </div>
              </div>

              {isAllQuestions && (
                <div className="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 flex items-center gap-2 text-xs font-black text-emerald-800 dark:text-emerald-200 animate-in fade-in duration-150">
                  <Sparkles size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                  <span>حالت استخراج همه سؤالات فعال است (۰ تا ۰): در پرامپت نوشته می‌شود «هر سوالی که تو فایلی که بهت دادم می‌بینی»</span>
                </div>
              )}

              {!isAllQuestions && startQ > 0 && endQ > 0 && startQ > endQ && (
                <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-200 animate-in fade-in duration-150">
                  شماره شروع ({startQ}) از پایان ({endQ}) بزرگ‌تر است. در پرامپت به صورت خودکار ({effectiveStartQ} تا {effectiveEndQ}) اعمال می‌شود.
                </div>
              )}
            </div>
          </div>

          {/* Card 4: Custom Notes (Accordion) */}
          <div className="testino-card p-4 space-y-3">
            <div
              onClick={() => setIsNotesSectionOpen(!isNotesSectionOpen)}
              className="flex items-center justify-between cursor-pointer border-b border-[var(--line)] pb-2.5"
            >
              <div className="flex items-center gap-2">
                <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
                  <Sliders size={16} className={customNotes.trim() ? "text-[var(--testino-orange)]" : "text-[var(--muted)]"} />
                  <span>۴. دستورات و نکات سفارشی</span>
                </span>
                {customNotes.trim() ? (
                  <span className="testino-chip text-[10px] font-black bg-blue-100 text-blue-800">
                    دستور ثبت شد
                  </span>
                ) : (
                  <span className="testino-chip text-[10px] font-bold bg-neutral-100 text-neutral-600">
                    اختیاری
                  </span>
                )}
              </div>
              <button type="button" className="text-[var(--muted)] hover:text-[var(--ink)]">
                {isNotesSectionOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
            </div>

            {isNotesSectionOpen && (
              <div className="pt-1 animate-in fade-in duration-150">
                <textarea
                  rows={3}
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="هر دستور اختصاصی مد نظر دارید (مثلاً: در بخش تشریحی حتماً نام کتاب مرجع قید شود)..."
                  className="w-full p-2.5 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)] leading-relaxed"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Area: Full-width Final Prompt Viewer */}
      <div className="testino-card p-5 sm:p-6 space-y-4 shadow-[3px_3px_0px_var(--neo-shadow)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-black text-[var(--ink)] flex items-center gap-2">
              <FileCode size={18} className="text-[var(--testino-orange)]" />
              <span>متن نهایی پرامپت استخراج</span>
            </span>
            <span className="testino-chip bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200 text-xs font-black">
              درس: {activeProfileSubject ? activeProfileSubject.name : currentConfig.titleFa}
            </span>
            <span className="testino-chip bg-neutral-100 text-neutral-800 dark:bg-neutral-800 dark:text-neutral-200 text-xs font-bold">
              سؤالات {startQ} تا {endQ} ({sourceKind === "EXAM" ? `کنکور ${isCustomYear ? customYear : year}` : "سایر"})
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownloadTxt}
              className="h-10 sm:h-11 px-3.5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] text-xs font-black hover:bg-[var(--surface)] transition-all flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_var(--neo-shadow)]"
              title="دانلود فایل متنی پرامپت"
            >
              <Download size={15} />
              <span className="hidden sm:inline">دانلود TXT</span>
            </button>

            <button
              type="button"
              onClick={handleCopyPrompt}
              className="h-10 sm:h-11 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--testino-orange)] text-white text-xs font-black flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all"
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? "کپی شد!" : "کپی پرامپت"}</span>
            </button>
          </div>
        </div>

        {/* Quick Send to External AI Chat Platforms */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-2xl bg-[var(--surface-2)] border border-[var(--line)]">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black text-[var(--ink)] flex items-center gap-1.5">
              <Sparkles size={14} className="text-[var(--testino-orange)]" />
              <span>ارسال مستقیم پرامپت (کپی خودکار + باز کردن چت):</span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[
              { name: "ChatGPT", url: "https://chatgpt.com/" },
              { name: "Claude", url: "https://claude.ai/" },
              { name: "Gemini", url: "https://gemini.google.com/" },
              { name: "DeepSeek", url: "https://chat.deepseek.com/" },
            ].map((ai) => (
              <button
                key={ai.name}
                type="button"
                onClick={() => handleSendToAi(ai.url)}
                className="px-3 py-1.5 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface-3)] transition-all flex items-center gap-1.5 cursor-pointer"
                title={`کپی پرامپت و باز کردن ${ai.name}`}
              >
                <ExternalLink size={12} className="text-[var(--muted)]" />
                <span>{ai.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Educational Constitution & Adaptive Architecture Banner */}
        <div className="p-3.5 sm:p-4 rounded-2xl border-2 border-[var(--line-strong)] bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent shadow-[3px_3px_0px_var(--neo-shadow)] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--testino-orange)] text-white flex items-center justify-center font-black shadow-sm shrink-0">
              <ShieldCheck size={17} />
            </div>
            <h4 className="text-xs sm:text-sm font-black text-[var(--ink)]">
              معماری تحلیل پاسخ تشریحی
            </h4>
          </div>

          <label className="flex items-center gap-2 cursor-pointer bg-[var(--surface)] px-3 py-1.5 rounded-xl border border-[var(--line)] shadow-sm hover:border-[var(--testino-orange)] transition-colors select-none">
            <input
              type="checkbox"
              checked={enforceCapsuleLeitner}
              onChange={(e) => setEnforceCapsuleLeitner(e.target.checked)}
              className="w-4 h-4 rounded text-[var(--testino-orange)] accent-[var(--testino-orange)] cursor-pointer"
            />
            <span className="text-xs font-black text-[var(--ink)]">
              تأکید مضاعف بر خلاصه کپسولی (جعبه لایتنر)
            </span>
          </label>
        </div>

        {/* Prompt Text Viewer Box */}
        <div className="relative">
          <pre
            dir="auto"
            className="w-full max-h-[560px] overflow-y-auto p-4 sm:p-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] font-mono text-xs leading-relaxed whitespace-pre-wrap select-all shadow-inner"
          >
            {generatedPrompt}
          </pre>
        </div>
      </div>
    </div>
  );
}
