"use client";

import React, { useState, useMemo, useRef, useEffect } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FileText,
  Split,
  Eye,
  Edit3,
  Plus,
  UploadCloud,
  BookOpen,
  ArrowRight,
  Layers,
  Search,
  ExternalLink,
  Maximize2,
  ChevronDown,
  ChevronUp,
  Check,
  Filter,
} from "lucide-react";
import { ContentRenderer } from "@/components/rich-content/content-renderer";
import { QuestionEditorModal } from "./question-editor-modal";
import { useDatabase } from "@/providers/database-provider";
import { cn } from "@/lib/utils";
import { BankNavTabs } from "@/components/navigation/bank-nav-tabs";
import type { StoredQuestion } from "@/features/questions/domain/question-schema";

const YEARS = [1405, 1404, 1403, 1402, 1401, 1400, 1399];

export function BookletStudio() {
  const database = useDatabase();
  const cache = useQueryClient();

  // Filters
  const [selectedSourceKind, setSelectedSourceKind] = useState<string>("all");
  const [selectedSubject, setSelectedSubject] = useState<string>("all");
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [selectedChapter, setSelectedChapter] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [isFilterDrawerOpen, setIsFilterDrawerOpen] = useState<boolean>(false);

  // Layout View Mode: "split" (PDF + Questions) | "questions" | "pdf"
  const [viewMode, setViewMode] = useState<"split" | "questions" | "pdf">("split");

  // PDF State
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Editor Modal State
  const [editorOpen, setEditorOpen] = useState<boolean>(false);
  const [editingQuestion, setEditingQuestion] = useState<StoredQuestion | null>(null);

  // Expanded explanations toggle
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  // Query all questions from local database
  const catalogQuery = useQuery({
    queryKey: ["booklet-catalog"],
    queryFn: () => database.db.listQuestions({ limit: 10_000 }),
    enabled: database.status === "ready",
  });

  // Extract unique subjects & chapters
  const allQuestions = useMemo(() => catalogQuery.data || [], [catalogQuery.data]);
  const subjects = useMemo(
    () => [...new Set(allQuestions.map((q) => q.subject).filter(Boolean))],
    [allQuestions]
  );
  const chapters = useMemo(
    () => [
      ...new Set(
        allQuestions
          .filter((q) => selectedSubject === "all" || q.subject === selectedSubject)
          .map((q) => q.chapter)
          .filter((c): c is string => Boolean(c))
      ),
    ],
    [allQuestions, selectedSubject]
  );

  // Filtered & Numerically Sorted Questions (like official exam booklet)
  const filteredQuestions = useMemo(() => {
    return allQuestions
      .filter((q) => {
        if (selectedSourceKind !== "all") {
          const kind = q.source?.kind || "EXAM";
          if (kind !== selectedSourceKind) return false;
        }
        if (selectedSubject !== "all" && q.subject !== selectedSubject) return false;
        if (selectedChapter !== "all" && q.chapter !== selectedChapter) return false;
        if (selectedYear !== "all") {
          const qYear = q.source?.year;
          if (!qYear || String(qYear) !== selectedYear) return false;
        }
        if (searchTerm.trim()) {
          const term = searchTerm.trim().toLowerCase();
          const matchStem = q.content.some(
            (b) => b.type === "text" && b.value.toLowerCase().includes(term)
          );
          const matchChapter = q.chapter?.toLowerCase().includes(term);
          const matchTopic = q.topic?.toLowerCase().includes(term);
          const matchNum = q.source?.number?.includes(term) || q.externalKey.includes(term);
          if (!matchStem && !matchChapter && !matchTopic && !matchNum) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // Natural numerical sort on question source number (e.g. 1, 2, ... 46, 47, ... 160)
        const numA = parseInt(a.source?.number || a.externalKey.match(/\d+$/)?.[0] || "0", 10);
        const numB = parseInt(b.source?.number || b.externalKey.match(/\d+$/)?.[0] || "0", 10);
        if (numA && numB && numA !== numB) return numA - numB;
        return a.createdAt - b.createdAt;
      });
  }, [allQuestions, selectedSourceKind, selectedSubject, selectedChapter, selectedYear, searchTerm]);

  // Handle PDF file select
  const handlePdfFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === "application/pdf") {
      setPdfFile(file);
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      const url = URL.createObjectURL(file);
      setPdfUrl(url);
    }
  };

  // Clean up object URL on unmount
  useEffect(() => {
    return () => {
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    };
  }, [pdfUrl]);

  // Toggle single explanation
  const toggleExplanation = (qId: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [qId]: !prev[qId],
    }));
  };

  // Toggle all explanations
  const toggleAllExplanations = (open: boolean) => {
    const next: Record<string, boolean> = {};
    filteredQuestions.forEach((q) => {
      next[q.id] = open;
    });
    setExpandedExplanations(next);
  };

  return (
    <div className="page booklet-page max-w-full mx-auto space-y-4 pb-16 px-2 sm:px-4">
      {/* 4-Step Pipeline Navigation */}
      <BankNavTabs activeTab="booklet" />

      {/* Top Header Bar */}
      <div className="testino-card p-4 space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Link
              href="/bank/"
              className="p-1.5 rounded-xl border border-[var(--line)] hover:bg-[var(--surface-2)] transition-colors"
              title="بازگشت به بانک سؤالات"
            >
              <ArrowRight size={16} />
            </Link>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-[var(--ink)] flex items-center gap-2">
                <Split className="text-[var(--testino-orange)]" size={24} />
                <span>استودیوی بازبینی ساید‌بای‌ساید و نمای دفترچه‌ای</span>
              </h1>
              <p className="text-xs text-[var(--muted)] font-bold mt-0.5">
                تطبیق کلمه به کلمه و شکل به شکل سؤالات استخراج شده با PDF رسمی کنکور و امکان ویرایش آنی درجا.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher */}
            <div className="h-10 sm:h-11 flex items-center p-1 bg-[var(--surface-2)] rounded-2xl border-2 border-[var(--line-strong)] shadow-[2px_2px_0px_var(--neo-shadow)] text-xs font-black">
              <button
                type="button"
                onClick={() => setViewMode("split")}
                className={cn(
                  "h-8 px-2.5 sm:px-3 rounded-xl transition-all flex items-center gap-1 cursor-pointer",
                  viewMode === "split"
                    ? "bg-[var(--testino-orange)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
                title="نمایش همزمان PDF و سؤالات"
              >
                <Split size={14} />
                <span className="hidden sm:inline">ساید‌بای‌ساید</span>
                <span className="sm:hidden">ساید</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("questions")}
                className={cn(
                  "h-8 px-2.5 sm:px-3 rounded-xl transition-all flex items-center gap-1 cursor-pointer",
                  viewMode === "questions"
                    ? "bg-[var(--testino-orange)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
                title="فقط سؤالات در تمام عرض صفحه"
              >
                <FileText size={14} />
                <span className="hidden sm:inline">فقط سؤالات</span>
                <span className="sm:hidden">سؤالات</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("pdf")}
                className={cn(
                  "h-8 px-2.5 sm:px-3 rounded-xl transition-all flex items-center gap-1 cursor-pointer",
                  viewMode === "pdf"
                    ? "bg-[var(--testino-orange)] text-white shadow-sm"
                    : "text-[var(--muted)] hover:text-[var(--ink)]"
                )}
                title="فقط نمایشگر PDF در تمام عرض صفحه"
              >
                <Eye size={14} />
                <span className="hidden sm:inline">فقط PDF</span>
                <span className="sm:hidden">PDF</span>
              </button>
            </div>

            {/* Quick Add Question */}
            <button
              type="button"
              onClick={() => {
                setEditingQuestion(null);
                setEditorOpen(true);
              }}
              className="h-10 sm:h-11 px-3.5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--testino-orange)] text-white text-xs font-black flex items-center gap-1.5 shadow-[2px_2px_0px_var(--neo-shadow)] hover:translate-x-[1px] hover:translate-y-[1px] transition-all cursor-pointer"
            >
              <Plus size={16} />
              <span>افزودن دستی</span>
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="pt-2 border-t border-[var(--line)] space-y-2">
          {/* Top Line: Search + Mobile Filter Toggle + Batch Actions */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="جستجوی متن، شماره تست، مبحث..."
                className="w-full pl-8 pr-3 py-2 text-xs font-bold rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] shadow-sm"
              />
              <Search size={15} className="absolute left-3 top-2.5 text-[var(--muted)]" />
            </div>

            <button
              type="button"
              onClick={() => setIsFilterDrawerOpen(!isFilterDrawerOpen)}
              className={cn(
                "sm:hidden h-10 px-3 rounded-2xl border-2 text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shrink-0 shadow-[2px_2px_0px_var(--neo-shadow)]",
                isFilterDrawerOpen
                  ? "border-[var(--testino-orange)] bg-orange-50 text-[var(--testino-orange)]"
                  : "border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)]"
              )}
            >
              <Filter size={15} />
              <span>فیلترها</span>
              {((selectedSourceKind !== "all" ? 1 : 0) +
                (selectedSubject !== "all" ? 1 : 0) +
                (selectedYear !== "all" ? 1 : 0) +
                (selectedChapter !== "all" ? 1 : 0)) > 0 && (
                <span className="w-4 h-4 rounded-full bg-[var(--testino-orange)] text-white text-[9px] flex items-center justify-center font-black">
                  {(selectedSourceKind !== "all" ? 1 : 0) +
                    (selectedSubject !== "all" ? 1 : 0) +
                    (selectedYear !== "all" ? 1 : 0) +
                    (selectedChapter !== "all" ? 1 : 0)}
                </span>
              )}
            </button>

            <div className="hidden sm:flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => toggleAllExplanations(true)}
                className="h-10 px-3 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] text-[11px] font-black hover:bg-[var(--surface-2)] cursor-pointer shadow-sm"
              >
                باز کردن پاسخ‌ها
              </button>
              <button
                type="button"
                onClick={() => toggleAllExplanations(false)}
                className="h-10 px-3 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] text-[11px] font-black hover:bg-[var(--surface-2)] cursor-pointer shadow-sm"
              >
                بستن پاسخ‌ها
              </button>
            </div>
          </div>

          {/* Filter Dropdowns Grid (Always visible on sm+, Collapsible on mobile) */}
          <div
            className={cn(
              "grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1",
              !isFilterDrawerOpen && "hidden sm:grid"
            )}
          >
            {/* Source Kind Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-black text-[var(--muted)]">نوع منبع:</label>
              <select
                value={selectedSourceKind}
                onChange={(e) => setSelectedSourceKind(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">تمام منابع</option>
                <option value="EXAM">کنکور سراسری</option>
                <option value="AI">تألیفی هوش مصنوعی</option>
                <option value="PERSONAL">کتاب تست / آزمون / سایر</option>
              </select>
            </div>

            {/* Subject Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-black text-[var(--muted)]">انتخاب درس:</label>
              <select
                value={selectedSubject}
                onChange={(e) => {
                  setSelectedSubject(e.target.value);
                  setSelectedChapter("all");
                }}
                className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">تمام دروس ({allQuestions.length})</option>
                {subjects.map((subj) => (
                  <option key={subj} value={subj}>
                    {subj}
                  </option>
                ))}
              </select>
            </div>

            {/* Year Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-black text-[var(--muted)]">سال کنکور:</label>
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">تمام سال‌ها</option>
                {YEARS.map((y) => (
                  <option key={y} value={String(y)}>
                    سال {y}
                  </option>
                ))}
              </select>
            </div>

            {/* Chapter Filter */}
            <div className="space-y-1">
              <label className="text-[11px] font-black text-[var(--muted)]">فصل:</label>
              <select
                value={selectedChapter}
                onChange={(e) => setSelectedChapter(e.target.value)}
                className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)]"
              >
                <option value="all">تمام فصل‌ها</option>
                {chapters.map((ch) => (
                  <option key={ch} value={ch}>
                    {ch}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Main Workspace Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start h-[calc(100vh-210px)] min-h-[600px]">
        {/* LEFT COLUMN: PDF Viewer (Visible in "split" and "pdf" mode) */}
        {(viewMode === "split" || viewMode === "pdf") && (
          <div
            className={cn(
              "h-full flex flex-col testino-card overflow-hidden transition-all",
              viewMode === "split" ? "lg:col-span-6" : "lg:col-span-12"
            )}
          >
            {/* PDF Header Controls */}
            <div className="p-3 border-b border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2 truncate">
                <FileText size={16} className="text-[var(--testino-orange)] shrink-0" />
                <span className="text-xs font-black truncate">
                  {pdfFile ? pdfFile.name : "نمایشگر PDF دفترچه سؤالات کنکور"}
                </span>
                {pdfFile && (
                  <span className="text-[10px] font-mono text-[var(--muted)]">
                    ({Math.round(pdfFile.size / 1024)} KB)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept="application/pdf"
                  onChange={handlePdfFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => pdfInputRef.current?.click()}
                  className="py-1.5 px-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black hover:bg-[var(--surface-2)] transition-colors flex items-center gap-1 cursor-pointer"
                  title="انتخاب یا تغییر فایل PDF"
                >
                  <UploadCloud size={14} />
                  <span>{pdfFile ? "تغییر PDF" : "انتخاب PDF"}</span>
                </button>

                {pdfUrl && (
                  <a
                    href={pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-1.5 rounded-xl border border-[var(--line)] hover:bg-[var(--surface)] transition-colors"
                    title="باز کردن در تب جداگانه"
                  >
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
            </div>

            {/* PDF Embed or Empty Upload Prompt */}
            <div className="flex-1 w-full bg-neutral-100 dark:bg-neutral-900 overflow-hidden relative">
              {pdfUrl ? (
                <iframe
                  src={pdfUrl}
                  title="دفترچه آزمون"
                  className="w-full h-full border-0"
                />
              ) : (
                <div
                  onClick={() => pdfInputRef.current?.click()}
                  className="w-full h-full flex flex-col items-center justify-center p-6 text-center cursor-pointer hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50 transition-colors"
                >
                  <div className="w-16 h-16 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line)] shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center justify-center text-[var(--testino-orange)] mb-4">
                    <UploadCloud size={32} />
                  </div>
                  <h3 className="text-base font-black text-[var(--ink)]">
                    فایل PDF دفترچه کنکور را اینجا انتخاب کنید
                  </h3>
                  <p className="text-xs text-[var(--muted)] font-bold max-w-sm mt-1.5 leading-relaxed">
                    فایل PDF کنکور (مثلاً «دفترچه_سوالات_۱۴۰۱.pdf») را انتخاب کنید تا مستقیماً در این قاب باز شده و کلمه به کلمه با سؤالات تطبیق داده شود.
                  </p>
                  <span className="mt-4 px-4 py-2 rounded-xl bg-[var(--testino-orange)] text-white text-xs font-black shadow-sm">
                    انتخاب فایل از کامپیوتر
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* RIGHT COLUMN: Continuous Questions Stream (Visible in "split" and "questions" mode) */}
        {(viewMode === "split" || viewMode === "questions") && (
          <div
            className={cn(
              "h-full flex flex-col testino-card overflow-hidden",
              viewMode === "split" ? "lg:col-span-6" : "lg:col-span-12"
            )}
          >
            {/* Stream Header */}
            <div className="p-3 border-b border-[var(--line)] bg-[var(--surface-2)] flex items-center justify-between gap-2 shrink-0">
              <div className="flex items-center gap-2">
                <Layers size={16} className="text-[var(--testino-orange)]" />
                <span className="text-xs font-black">
                  فهرست سؤالات استخراج شده ({filteredQuestions.length} سؤال)
                </span>
              </div>
              <span className="text-[11px] font-bold text-[var(--muted)]">
                مرتب‌سازی پشت سر هم بر اساس شماره سؤال
              </span>
            </div>

            {/* Questions Scrollable Stream */}
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-5">
              {filteredQuestions.length === 0 ? (
                <div className="text-center py-16 text-[var(--muted)] space-y-3">
                  <BookOpen size={36} className="mx-auto text-neutral-400" />
                  <p className="text-sm font-black">هیچ سؤالی با این فیلترها یافت نشد.</p>
                  <p className="text-xs font-bold">می‌توانید فیلترها را تغییر داده یا از بخش «ورود JSON» سؤال اضافه کنید.</p>
                </div>
              ) : (
                filteredQuestions.map((q, qIndex) => {
                  const sNum =
                    q.source?.number ||
                    q.externalKey.match(/q(\d+)/i)?.[1] ||
                    q.externalKey.match(/\d+$/)?.[0] ||
                    String(qIndex + 1);
                  const isExpOpen = Boolean(expandedExplanations[q.id]);

                  return (
                    <div
                      key={q.id}
                      className="p-4 sm:p-5 rounded-2xl border-2 border-[var(--line)] bg-[var(--surface)] shadow-[3px_3px_0px_var(--neo-shadow)] space-y-3 transition-all hover:border-[var(--testino-orange)]"
                    >
                      {/* Question Top Meta & Action Buttons */}
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] pb-2.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="w-8 h-8 rounded-xl bg-[var(--testino-orange)] text-white font-black text-xs flex items-center justify-center shadow-sm">
                            {sNum}
                          </span>
                          <span className="text-xs font-black text-[var(--ink)]">
                            سؤال #{sNum}
                          </span>
                          <span className="testino-chip bg-orange-100 text-orange-800 text-[10px] font-black">
                            {q.subject}
                          </span>
                          {q.chapter && (
                            <span className="testino-chip bg-neutral-100 text-neutral-700 text-[10px] font-bold">
                              {q.chapter}
                            </span>
                          )}
                          {q.topic && (
                            <span className="testino-chip bg-purple-50 text-purple-700 text-[10px] font-bold">
                              {q.topic}
                            </span>
                          )}
                          {q.source?.year && (
                            <span className="testino-chip bg-blue-50 text-blue-700 text-[10px] font-mono font-bold">
                              کنکور {q.source.year}
                            </span>
                          )}
                          {q.source?.kind === "AI" && (
                            <span className="testino-chip bg-emerald-50 text-emerald-700 text-[10px] font-bold">
                              تألیفی AI
                            </span>
                          )}
                          {q.source?.kind === "PERSONAL" && (
                            <span className="testino-chip bg-amber-50 text-amber-800 text-[10px] font-bold">
                              {q.source.title || "تست / کتاب"}
                            </span>
                          )}
                        </div>

                        {/* Inline Actions */}
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingQuestion(q);
                              setEditorOpen(true);
                            }}
                            className="py-1.5 px-2.5 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink)] text-xs font-black hover:bg-[var(--testino-orange)] hover:text-white transition-all flex items-center gap-1 cursor-pointer"
                            title="ویرایش سریع متن، گزینه‌ها یا پیوست تصویر"
                          >
                            <Edit3 size={13} />
                            <span>ویرایش</span>
                          </button>

                          <Link
                            href={`/bank/question/?id=${encodeURIComponent(q.id)}`}
                            className="p-1.5 rounded-xl border border-[var(--line)] hover:bg-[var(--surface-2)] transition-colors text-[var(--muted)]"
                            title="مشاهده صفحه مجزای این سؤال"
                          >
                            <Maximize2 size={13} />
                          </Link>
                        </div>
                      </div>

                      {/* Question Stem Content */}
                      <div className="text-sm font-black text-[var(--ink)] leading-relaxed bg-[var(--surface-2)]/50 p-3.5 rounded-xl border border-[var(--line)]">
                        <ContentRenderer blocks={q.content} />
                      </div>

                      {/* 4 Options Grid */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        {q.options.map((opt, oIdx) => {
                          const isCorrect = opt.id === q.correctOptionId;

                          return (
                            <div
                              key={opt.id || oIdx}
                              className={cn(
                                "p-3 rounded-xl border transition-all flex items-center justify-between gap-2 text-xs font-bold",
                                isCorrect
                                  ? "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-100 shadow-sm"
                                  : "bg-[var(--surface-2)] border-[var(--line)] text-[var(--ink)]"
                              )}
                            >
                              <div className="flex items-center gap-2.5 flex-1 overflow-hidden">
                                <span
                                  className={cn(
                                    "w-6 h-6 rounded-lg flex items-center justify-center font-black text-[11px] shrink-0 border",
                                    isCorrect
                                      ? "bg-emerald-500 text-white border-emerald-500"
                                      : "bg-[var(--surface)] text-[var(--ink)] border-[var(--line)]"
                                  )}
                                >
                                  {["الف", "ب", "ج", "د"][oIdx] || oIdx + 1}
                                </span>
                                <div className="flex-1 overflow-x-auto">
                                  <ContentRenderer blocks={opt.content} />
                                </div>
                              </div>

                              {isCorrect && (
                                <span className="testino-chip bg-emerald-600 text-white text-[10px] font-black shrink-0 flex items-center gap-0.5">
                                  <Check size={12} />
                                  <span>کلید رسمی</span>
                                </span>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* Collapsible Explanation */}
                      {q.explanation && q.explanation.length > 0 && (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => toggleExplanation(q.id)}
                            className="text-xs font-black text-[var(--testino-orange)] hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            {isExpOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                            <span>{isExpOpen ? "بستن پاسخ تشریحی" : "مشاهده تحلیل و پاسخ تشریحی"}</span>
                          </button>

                          {isExpOpen && (
                            <div className="mt-2 p-3.5 rounded-xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 text-xs leading-relaxed space-y-1 animate-in fade-in duration-150">
                              <strong className="block text-blue-900 dark:text-blue-200 font-black mb-1">
                                حل تشریحی و تحلیل علمی:
                              </strong>
                              <ContentRenderer blocks={q.explanation} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Reusable Question Editor Modal (Form / JSON / Multi-Image Attachments) */}
      <QuestionEditorModal
        isOpen={editorOpen}
        onClose={() => {
          setEditorOpen(false);
          setEditingQuestion(null);
        }}
        initialQuestion={editingQuestion}
        defaultSubject={selectedSubject !== "all" ? selectedSubject : undefined}
        onSaved={async () => {
          await cache.invalidateQueries({ queryKey: ["booklet-catalog"] });
          await cache.invalidateQueries({ queryKey: ["questions"] });
          await cache.invalidateQueries({ queryKey: ["dashboard"] });
          setEditorOpen(false);
          setEditingQuestion(null);
        }}
      />
    </div>
  );
}
