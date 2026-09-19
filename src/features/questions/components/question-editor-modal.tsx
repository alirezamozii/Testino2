"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */
/* The editor intentionally hydrates a modal form from persisted JSON when it opens. */
/* eslint-disable react-hooks/set-state-in-effect */

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Plus,
  Trash2,
  Image as ImageIcon,
  Code,
  FileText,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UploadCloud,
  Sparkles,
  Users,
} from "lucide-react";
import type { ContentBlock, StoredQuestion } from "@/features/questions/domain/question-schema";
import { useDatabase } from "@/providers/database-provider";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { optimizeImageForUpload } from "@/features/media/domain/image-optimizer";
import { SubjectAutocomplete } from "@/components/ui/subject-autocomplete";
import { publishQuestionToCommunity } from "@/platform/community-questions";
import { registerSubject } from "@/platform/shared-subjects";
import { checkIsOwner } from "@/lib/permissions";

interface AttachedImage {
  id: string;
  url: string;
  alt: string;
}

export interface QuestionEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuestion?: StoredQuestion | null;
  defaultSubject?: string;
  onSaved?: (savedQuestionId: string) => void;
}

function extractOptionText(opt: any): string {
  if (!opt) return "";
  if (typeof opt === "string") return opt.trim();
  if (typeof opt.content === "string") return opt.content.trim();
  if (Array.isArray(opt.content)) {
    return opt.content
      .map((block: any) => {
        if (!block) return "";
        if (typeof block === "string") return block;
        if (block.type === "text" && typeof block.value === "string") return block.value;
        if (block.type === "formula" && typeof block.latex === "string") return block.latex;
        if (typeof block.value === "string") return block.value;
        return "";
      })
      .filter(Boolean)
      .join(" ")
      .trim();
  }
  if (typeof opt.value === "string") return opt.value.trim();
  return "";
}

interface ResolvedOptionSlot {
  item: any;
  text: string;
}

interface ResolvedFourOptions {
  a: ResolvedOptionSlot;
  b: ResolvedOptionSlot;
  c: ResolvedOptionSlot;
  d: ResolvedOptionSlot;
}

const OPTION_ALIAS_MAP: Record<"a" | "b" | "c" | "d", string[]> = {
  a: ["a", "1", "o-1", "opt-1", "option-1", "opt_1", "option_1", "q1", "الف", "۱"],
  b: ["b", "2", "o-2", "opt-2", "option-2", "opt_2", "option_2", "q2", "ب", "۲"],
  c: ["c", "3", "o-3", "opt-3", "option-3", "opt_3", "option_3", "q3", "ج", "۳"],
  d: ["d", "4", "o-4", "opt-4", "option-4", "opt_4", "option_4", "q4", "د", "۴"],
};

function resolveFourOptions(rawOptions: any[]): ResolvedFourOptions {
  const options = Array.isArray(rawOptions) ? rawOptions : [];

  const matched: Record<"a" | "b" | "c" | "d", any> = {
    a: null,
    b: null,
    c: null,
    d: null,
  };

  const usedIndexes = new Set<number>();

  // Pass 1: Try matching by key / aliases
  (["a", "b", "c", "d"] as const).forEach((slot) => {
    const aliases = OPTION_ALIAS_MAP[slot];
    const foundIdx = options.findIndex((o, idx) => {
      if (usedIndexes.has(idx)) return false;
      const k = String(o?.key ?? "").trim().toLowerCase();
      return aliases.includes(k);
    });
    if (foundIdx !== -1) {
      matched[slot] = options[foundIdx];
      usedIndexes.add(foundIdx);
    }
  });

  // Pass 2: Fill unmatched slots in sequence from remaining options by array order
  (["a", "b", "c", "d"] as const).forEach((slot, slotIdx) => {
    if (!matched[slot]) {
      const unusedIdx = options.findIndex((_, idx) => !usedIndexes.has(idx));
      if (unusedIdx !== -1) {
        matched[slot] = options[unusedIdx];
        usedIndexes.add(unusedIdx);
      } else if (options[slotIdx]) {
        matched[slot] = options[slotIdx];
      }
    }
  });

  return {
    a: { item: matched.a, text: extractOptionText(matched.a) },
    b: { item: matched.b, text: extractOptionText(matched.b) },
    c: { item: matched.c, text: extractOptionText(matched.c) },
    d: { item: matched.d, text: extractOptionText(matched.d) },
  };
}

function resolveCorrectKey(
  target: any,
  resolved: ResolvedFourOptions
): "a" | "b" | "c" | "d" | "" {
  if (!target) return "";

  const correctOptionId = target.correctOptionId;
  const correctOptionKey = target.correctOptionKey ?? target.correctOption;

  // 1. Check if correctOptionId matches the ID of any resolved option
  if (correctOptionId) {
    if (resolved.a.item?.id && resolved.a.item.id === correctOptionId) return "a";
    if (resolved.b.item?.id && resolved.b.item.id === correctOptionId) return "b";
    if (resolved.c.item?.id && resolved.c.item.id === correctOptionId) return "c";
    if (resolved.d.item?.id && resolved.d.item.id === correctOptionId) return "d";

    // Check if correctOptionId was itself stored as an alias key
    const rawIdStr = String(correctOptionId).trim().toLowerCase();
    for (const [slot, aliases] of Object.entries(OPTION_ALIAS_MAP) as ["a" | "b" | "c" | "d", string[]][]) {
      if (aliases.includes(rawIdStr)) return slot;
    }
  }

  // 2. Check if correctOptionKey is provided
  if (correctOptionKey !== undefined && correctOptionKey !== null) {
    const rawKeyStr = String(correctOptionKey).trim().toLowerCase();

    if (resolved.a.item?.key && String(resolved.a.item.key).trim().toLowerCase() === rawKeyStr) return "a";
    if (resolved.b.item?.key && String(resolved.b.item.key).trim().toLowerCase() === rawKeyStr) return "b";
    if (resolved.c.item?.key && String(resolved.c.item.key).trim().toLowerCase() === rawKeyStr) return "c";
    if (resolved.d.item?.key && String(resolved.d.item.key).trim().toLowerCase() === rawKeyStr) return "d";

    for (const [slot, aliases] of Object.entries(OPTION_ALIAS_MAP) as ["a" | "b" | "c" | "d", string[]][]) {
      if (aliases.includes(rawKeyStr)) return slot;
    }
  }

  // 3. Fallback: Check index in target.options if target.options has an option matching correctOptionId
  if (correctOptionId && Array.isArray(target.options)) {
    const idx = target.options.findIndex((o: any) => o.id === correctOptionId || o.key === correctOptionId);
    if (idx === 0) return "a";
    if (idx === 1) return "b";
    if (idx === 2) return "c";
    if (idx === 3) return "d";
  }

  return "";
}

export function QuestionEditorModal({
  isOpen,
  onClose,
  initialQuestion,
  defaultSubject,
  onSaved,
}: QuestionEditorModalProps) {
  const { db } = useDatabase();
  const cache = useQueryClient();

  const isEditMode = Boolean(initialQuestion);
  const [activeTab, setActiveTab] = useState<"form" | "json">("form");

  // Form Fields
  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [questionText, setQuestionText] = useState("");
  const [images, setImages] = useState<AttachedImage[]>([]);
  const [optA, setOptA] = useState("");
  const [optB, setOptB] = useState("");
  const [optC, setOptC] = useState("");
  const [optD, setOptD] = useState("");
  const [existingOptionIds, setExistingOptionIds] = useState<{
    a?: string;
    b?: string;
    c?: string;
    d?: string;
  }>({});
  const [correctKey, setCorrectKey] = useState<"a" | "b" | "c" | "d" | "">("");
  const [explanationText, setExplanationText] = useState("");

  // JSON Editor State
  const [rawJson, setRawJson] = useState("");
  const [jsonError, setJsonError] = useState("");

  // Common State
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;
    void checkIsOwner().then((val) => {
      if (mounted) setIsOwner(val);
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Initialize or reset form when modal opens or question changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialQuestion) {
      setSubject(initialQuestion.subject || "");
      setChapter(initialQuestion.chapter || "");
      setTopic(initialQuestion.topic || "");

      // Extract text and images from content blocks
      const textBlocks: string[] = [];
      const extractedImages: AttachedImage[] = [];

      (initialQuestion.content || []).forEach((block, idx) => {
        if (block.type === "text") {
          textBlocks.push(block.value);
        } else if (block.type === "image") {
          const src =
            (block as any).url ||
            (block as any).dataUrl ||
            (block.mediaKey?.startsWith("data:") ? block.mediaKey : "");
          extractedImages.push({
            id: `img-${idx}-${Date.now()}`,
            url: src || "",
            alt: block.alt || `تصویر شماره ${idx + 1}`,
          });
        }
      });

      setQuestionText(textBlocks.join("\n\n"));
      setImages(extractedImages);

      // Options: resolve flexibly by key aliases or array order
      const resolved = resolveFourOptions(initialQuestion.options || []);
      setOptA(resolved.a.text);
      setOptB(resolved.b.text);
      setOptC(resolved.c.text);
      setOptD(resolved.d.text);

      setExistingOptionIds({
        a: resolved.a.item?.id,
        b: resolved.b.item?.id,
        c: resolved.c.item?.id,
        d: resolved.d.item?.id,
      });

      // Correct Key: resolve flexibly from correctOptionId or correctOptionKey
      const key = resolveCorrectKey(initialQuestion, resolved);
      setCorrectKey(key);

      // Explanation
      let expText = "";
      if (Array.isArray(initialQuestion.explanation)) {
        expText = initialQuestion.explanation
          .map((b: any) => (b.type === "text" ? b.value : (b.type === "formula" ? b.latex : (b as any).value || "")))
          .filter(Boolean)
          .join("\n\n");
      } else if (typeof initialQuestion.explanation === "string") {
        expText = initialQuestion.explanation;
      }
      setExplanationText(expText);

      // Sync JSON
      const corrOpt = (initialQuestion.options || []).find((o) => o.id === initialQuestion.correctOptionId);
      const jsonCorrectKey = corrOpt?.key || (initialQuestion as any).correctOptionKey || key || undefined;

      const fullObj = {
        id: initialQuestion.id,
        subject: initialQuestion.subject,
        chapter: initialQuestion.chapter,
        topic: initialQuestion.topic,
        content: initialQuestion.content,
        options: initialQuestion.options,
        correctOptionKey: jsonCorrectKey,
        explanation: initialQuestion.explanation || [],
        shuffleSafe: initialQuestion.shuffleSafe ?? true,
      };
      setRawJson(JSON.stringify(fullObj, null, 2));
    } else {
      // New Question default
      setSubject(defaultSubject || "");
      setChapter("");
      setTopic("");
      setQuestionText("");
      setImages([]);
      setOptA("");
      setOptB("");
      setOptC("");
      setOptD("");
      setExistingOptionIds({});
      setCorrectKey("");
      setExplanationText("");

      const emptyObj = {
        subject: defaultSubject || "",
        chapter: null,
        topic: null,
        content: [{ type: "text", value: "" }],
        options: [
          { key: "a", content: [{ type: "text", value: "" }] },
          { key: "b", content: [{ type: "text", value: "" }] },
          { key: "c", content: [{ type: "text", value: "" }] },
          { key: "d", content: [{ type: "text", value: "" }] },
        ],
        correctOptionKey: "a",
        explanation: [],
        shuffleSafe: true,
      };
      setRawJson(JSON.stringify(emptyObj, null, 2));
    }

    setActiveTab("form");
    setJsonError("");
    setErrorMsg("");
  }, [isOpen, initialQuestion, defaultSubject]);

  if (!isOpen) return null;

  // Sync Form to JSON when switching to JSON tab
  const handleTabSwitch = (tab: "form" | "json") => {
    if (tab === "json" && activeTab === "form") {
      // Build content blocks from form
      const contentBlocks: ContentBlock[] = [];
      if (questionText.trim()) {
        contentBlocks.push({ type: "text", value: questionText.trim(), direction: "rtl" });
      }
      images.forEach((img) => {
        contentBlocks.push({
          type: "image",
          url: img.url,
          dataUrl: img.url,
          alt: img.alt || "تصویر سوال",
        } as any);
      });

      const optionsBlocks = [
        { key: "a", content: [{ type: "text" as const, value: optA.trim() }] },
        { key: "b", content: [{ type: "text" as const, value: optB.trim() }] },
        { key: "c", content: [{ type: "text" as const, value: optC.trim() }] },
        { key: "d", content: [{ type: "text" as const, value: optD.trim() }] },
      ];

      const expBlocks: ContentBlock[] = explanationText.trim()
        ? [{ type: "text", value: explanationText.trim(), direction: "rtl" }]
        : [];

      const currentPayload = {
        ...(initialQuestion?.id ? { id: initialQuestion.id } : {}),
        subject: subject.trim(),
        chapter: chapter.trim() || null,
        topic: topic.trim() || null,
        content: contentBlocks,
        options: optionsBlocks,
        correctOptionKey: correctKey || null,
        explanation: expBlocks,
        shuffleSafe: true,
      };

      setRawJson(JSON.stringify(currentPayload, null, 2));
      setJsonError("");
    } else if (tab === "form" && activeTab === "json") {
      // Parse JSON into form fields
      try {
        const parsed = JSON.parse(rawJson);
        if (parsed.subject !== undefined) setSubject(parsed.subject || "");
        if (parsed.chapter !== undefined) setChapter(parsed.chapter || "");
        if (parsed.topic !== undefined) setTopic(parsed.topic || "");

        // Content
        if (Array.isArray(parsed.content)) {
          const texts: string[] = [];
          const imgs: AttachedImage[] = [];
          parsed.content.forEach((b: any, i: number) => {
            if (b.type === "text") texts.push(b.value || "");
            else if (b.type === "image") {
              imgs.push({
                id: `img-${i}-${Date.now()}`,
                url: b.url || b.dataUrl || (b.mediaKey?.startsWith("data:") ? b.mediaKey : ""),
                alt: b.alt || `تصویر ${i + 1}`,
              });
            }
          });
          setQuestionText(texts.join("\n\n"));
          setImages(imgs);
        }

        // Options
        if (Array.isArray(parsed.options)) {
          const resolved = resolveFourOptions(parsed.options);
          setOptA(resolved.a.text);
          setOptB(resolved.b.text);
          setOptC(resolved.c.text);
          setOptD(resolved.d.text);

          setExistingOptionIds({
            a: resolved.a.item?.id,
            b: resolved.b.item?.id,
            c: resolved.c.item?.id,
            d: resolved.d.item?.id,
          });

          const k = resolveCorrectKey(parsed, resolved);
          setCorrectKey(k);
        }

        // Explanation
        if (Array.isArray(parsed.explanation)) {
          const exp = parsed.explanation
            .map((b: any) => (b.type === "text" ? b.value : (b.type === "formula" ? b.latex : b.value || "")))
            .filter(Boolean)
            .join("\n\n");
          setExplanationText(exp);
        } else if (typeof parsed.explanation === "string") {
          setExplanationText(parsed.explanation);
        }

        setJsonError("");
      } catch {
        setJsonError("خطا در ساختار JSON: فرمت کد معتبر نیست.");
        return;
      }
    }

    setActiveTab(tab);
  };

  // Image Upload Handling (Multiple files support with smart optimization)
  const handleImageFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith("image/")) continue;

      try {
        const optimized = await optimizeImageForUpload(file, {
          maxDimension: 1800,
          quality: 0.88,
        });

        setImages((prev) => [
          ...prev,
          {
            id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url: optimized.dataUrl,
            alt: file.name.replace(/\.[^/.]+$/, "") || "تصویر سوال",
          },
        ]);
      } catch {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            setImages((prev) => [
              ...prev,
              {
                id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                url: result,
                alt: file.name.replace(/\.[^/.]+$/, "") || "تصویر سوال",
              },
            ]);
          }
        };
        reader.readAsDataURL(file);
      }
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const updateImageAlt = (id: string, newAlt: string) => {
    setImages((prev) => prev.map((img) => (img.id === id ? { ...img, alt: newAlt } : img)));
  };

  // Save changes (Works for both Manual and JSON mode)
  const handleSave = async () => {
    setErrorMsg("");
    setJsonError("");
    setIsSaving(true);

    try {
      let finalSubject = "";
      let finalChapter: string | null = null;
      let finalTopic: string | null = null;
      let finalContent: ContentBlock[] = [];
      let finalOptions: Array<{ id?: string; key: string; content: ContentBlock[] }> = [];
      let finalCorrectKey: string | null = null;
      let finalExplanation: ContentBlock[] = [];
      let finalShuffleSafe = true;

      if (activeTab === "form") {
        if (!subject.trim()) throw new Error("نام درس الزامی است.");
        if (!questionText.trim() && images.length === 0) {
          throw new Error("متن سؤال یا حداقل یک تصویر باید وارد شود.");
        }
        if (!optA.trim() || !optB.trim() || !optC.trim() || !optD.trim()) {
          throw new Error("هر ۴ گزینه (الف، ب، ج، د) باید دارای متن باشند.");
        }

        finalSubject = subject.trim();
        finalChapter = chapter.trim() || null;
        finalTopic = topic.trim() || null;

        // Content: text blocks followed by image blocks
        if (questionText.trim()) {
          finalContent.push({ type: "text", value: questionText.trim(), direction: "rtl" });
        }
        images.forEach((img) => {
          finalContent.push({
            type: "image",
            url: img.url,
            dataUrl: img.url,
            alt: img.alt || "تصویر سوال",
          } as any);
        });

        finalOptions = [
          { ...(existingOptionIds.a ? { id: existingOptionIds.a } : {}), key: "a", content: [{ type: "text", value: optA.trim() }] },
          { ...(existingOptionIds.b ? { id: existingOptionIds.b } : {}), key: "b", content: [{ type: "text", value: optB.trim() }] },
          { ...(existingOptionIds.c ? { id: existingOptionIds.c } : {}), key: "c", content: [{ type: "text", value: optC.trim() }] },
          { ...(existingOptionIds.d ? { id: existingOptionIds.d } : {}), key: "d", content: [{ type: "text", value: optD.trim() }] },
        ];

        finalCorrectKey = correctKey || null;

        if (explanationText.trim()) {
          finalExplanation.push({ type: "text", value: explanationText.trim(), direction: "rtl" });
        }
      } else {
        // Parse from JSON Tab
        let parsed: any;
        try {
          parsed = JSON.parse(rawJson);
        } catch {
          setJsonError("خطای گرامری در JSON: لطفاً فرمت کد را تصحیح کنید.");
          throw new Error("ساختار JSON نامعتبر است.");
        }

        if (!parsed.subject?.trim()) throw new Error("فیلد subject در JSON الزامی است.");
        if (!Array.isArray(parsed.content) || parsed.content.length === 0) {
          throw new Error("فیلد content باید یک آرایه با حداقل یک عضو باشد.");
        }
        if (!Array.isArray(parsed.options) || parsed.options.length !== 4) {
          throw new Error("فیلد options باید دقیقاً دارای ۴ گزینه باشد.");
        }

        finalSubject = parsed.subject.trim();
        finalChapter = parsed.chapter?.trim() || null;
        finalTopic = parsed.topic?.trim() || null;
        finalContent = typeof parsed.content === "string" ? [{ type: "text", value: parsed.content }] : parsed.content;

        finalOptions = parsed.options.map((opt: any, idx: number) => {
          const defaultKey = ["a", "b", "c", "d"][idx] || String(idx + 1);
          if (typeof opt === "string") {
            return { key: defaultKey, content: [{ type: "text", value: opt.trim() }] };
          }
          const key = opt.key ? String(opt.key).trim() : defaultKey;
          let content = opt.content;
          if (typeof content === "string") {
            content = [{ type: "text", value: content.trim() }];
          } else if (!Array.isArray(content)) {
            content = [{ type: "text", value: "" }];
          }
          return {
            ...(opt.id ? { id: opt.id } : {}),
            key,
            content,
          };
        });

        if (parsed.correctOptionKey !== undefined && parsed.correctOptionKey !== null) {
          const rawKey = String(parsed.correctOptionKey).trim();
          if (finalOptions.some((o: any) => o.key === rawKey)) {
            finalCorrectKey = rawKey;
          } else {
            const resolved = resolveFourOptions(finalOptions);
            const resolvedKey = resolveCorrectKey({ correctOptionKey: rawKey }, resolved);
            finalCorrectKey = resolvedKey || rawKey;
          }
        } else {
          finalCorrectKey = null;
        }

        finalExplanation = typeof parsed.explanation === "string"
          ? [{ type: "text", value: parsed.explanation.trim() }]
          : Array.isArray(parsed.explanation) ? parsed.explanation : [];
        finalShuffleSafe = parsed.shuffleSafe ?? true;
      }

      if (isEditMode && initialQuestion?.id) {
        // Update existing question
        await (db as any).updateQuestion(initialQuestion.id, {
          subject: finalSubject,
          chapter: finalChapter,
          topic: finalTopic,
          content: finalContent,
          options: finalOptions,
          correctOptionKey: finalCorrectKey,
          explanation: finalExplanation,
          shuffleSafe: finalShuffleSafe,
        });

        const targetId = initialQuestion.id;
        const targetCorrectOptId = finalCorrectKey
          ? finalOptions.find((o) => o.key === finalCorrectKey)?.id || initialQuestion.correctOptionId
          : null;

        if (isOwner) {
          void publishQuestionToCommunity({
            id: targetId,
            subject: finalSubject,
            chapter: finalChapter,
            topic: finalTopic,
            content: finalContent,
            options: finalOptions,
            correctOptionKey: finalCorrectKey,
            correctOptionId: targetCorrectOptId,
            explanation: finalExplanation,
            shuffleSafe: finalShuffleSafe,
          });
        }

        await cache.invalidateQueries({ queryKey: ["question", initialQuestion.id] });
        await cache.invalidateQueries({ queryKey: ["questions"] });
        await cache.invalidateQueries({ queryKey: ["questions-all-subjects"] });

        if (onSaved) onSaved(initialQuestion.id);
      } else {
        // Create new question
        const newId = await db.createQuestion({
          subject: finalSubject,
          chapter: finalChapter,
          topic: finalTopic,
          content: finalContent,
          options: finalOptions,
          correctOptionKey: finalCorrectKey,
          explanation: finalExplanation,
          shuffleSafe: finalShuffleSafe,
        });

        // Auto publish new question to community repository only if platform owner
        if (isOwner) {
          void publishQuestionToCommunity({
            id: newId,
            subject: finalSubject,
            chapter: finalChapter,
            topic: finalTopic,
            content: finalContent,
            options: finalOptions,
            correctOptionKey: finalCorrectKey,
            explanation: finalExplanation,
            shuffleSafe: finalShuffleSafe,
          });
        }

        await cache.invalidateQueries({ queryKey: ["questions"] });
        await cache.invalidateQueries({ queryKey: ["questions-all-subjects"] });

        if (onSaved) onSaved(newId);
      }

      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || "خطا در ذخیره سؤال");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      data-modal="true"
      role="dialog"
      aria-modal="true"
      className="modal-overlay fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-6 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1.25rem))] bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="bg-[var(--surface)] text-[var(--ink)] border-2 border-[var(--line-strong)] rounded-3xl shadow-[6px_6px_0px_var(--neo-shadow)] w-full max-w-3xl max-h-[86vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b-2 border-[var(--line)] flex flex-wrap items-center justify-between gap-3 bg-[var(--surface-cream)]">
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-[var(--surface)] border border-[var(--line)] shadow-[1px_1px_0px_var(--neo-shadow)]">
              {activeTab === "form" ? (
                <FileText size={18} className="text-[var(--testino-orange)]" />
              ) : (
                <Code size={18} className="text-purple-600" />
              )}
            </span>
            <div>
              <h2 className="text-base sm:text-lg font-black leading-tight">
                {isEditMode ? "ویرایش سؤال" : "افزودن سؤال جدید"}
              </h2>
              <p className="text-[11px] text-[var(--muted)] font-bold">
                {isEditMode ? "تغییر محتوا، گزینه‌ها یا تصاویر سؤال" : "ثبت در بانک سؤالات شخصی"}
              </p>
            </div>
          </div>

          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-1.5 bg-[var(--surface-2)] p-1 rounded-2xl border border-[var(--line)]">
            <button
              type="button"
              onClick={() => handleTabSwitch("form")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
                activeTab === "form"
                  ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              <FileText size={13} />
              <span>ویرایش دستی</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch("json")}
              className={cn(
                "px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1 cursor-pointer",
                activeTab === "json"
                  ? "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] shadow-[2px_2px_0px_var(--neo-shadow)]"
                  : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              <Code size={13} />
              <span>ویرایش با JSON</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl border border-[var(--line)] bg-[var(--surface)] flex items-center justify-center text-[var(--muted)] hover:text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer shadow-[1px_1px_0px_var(--neo-shadow)]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Role Notice Banner */}
        {isOwner ? (
          <div className="px-4 sm:px-5 py-2.5 bg-amber-500/10 border-b border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={15} className="text-amber-600 shrink-0" />
              <span>
                <strong>دسترسی مدیر کل (Owner):</strong> هرگونه تغییر در سؤال در دیتابیس ابری همگام‌سازی شده و برای تمام کاربران آپدیت می‌شود.
              </span>
            </div>
            <span className="shrink-0 text-[10px] bg-amber-500/20 text-amber-800 dark:text-amber-200 px-2.5 py-0.5 rounded-full font-black border border-amber-500/30">
              مدیر سیستم
            </span>
          </div>
        ) : (
          <div className="px-4 sm:px-5 py-2.5 bg-blue-500/10 border-b border-blue-500/30 text-blue-800 dark:text-blue-200 text-xs font-bold flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileText size={15} className="text-blue-600 shrink-0" />
              <span>
                <strong>دسترسی کاربر:</strong> تغییرات شما صرفاً در دیتابیس دستگاه شما ذخیره شده و تغییری در سؤالات ابری یا سایر کاربران ایجاد نخواهد کرد.
              </span>
            </div>
            <span className="shrink-0 text-[10px] bg-blue-500/20 text-blue-800 dark:text-blue-200 px-2.5 py-0.5 rounded-full font-black border border-blue-500/30">
              ویرایش محلی
            </span>
          </div>
        )}

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {errorMsg && (
            <div className="p-3 rounded-2xl bg-red-50 dark:bg-red-950/40 border-2 border-red-500 text-red-700 dark:text-red-300 text-xs font-black flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* TAB 1: FORM MODE */}
          {activeTab === "form" && (
            <div className="space-y-4">
              {/* Category row: Subject, Chapter, Topic */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-black block">نام درس *</label>
                  <SubjectAutocomplete
                    value={subject}
                    onChange={setSubject}
                    placeholder="مثلاً: ریاضی، زیست، آمار..."
                    inputClassName="bg-[var(--surface-2)] border-2 border-[var(--line)] py-2 focus:bg-[var(--surface)] focus:border-[var(--testino-orange)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black block">فصل (اختیاری)</label>
                  <input
                    type="text"
                    placeholder="مثلاً: فصل ۲: تابع"
                    value={chapter}
                    onChange={(e) => setChapter(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border-2 border-[var(--line)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--testino-orange)]"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-black block">مبحث (اختیاری)</label>
                  <input
                    type="text"
                    placeholder="مثلاً: دامنه و برد"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    className="w-full bg-[var(--surface-2)] border-2 border-[var(--line)] rounded-xl px-3 py-2 text-xs font-bold text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--testino-orange)]"
                  />
                </div>
              </div>

              {/* Question Text */}
              <div className="space-y-1.5">
                <label className="text-xs font-black block">متن صورت سؤال *</label>
                <textarea
                  rows={3}
                  placeholder="صورت سؤال را اینجا بنویسید..."
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border-2 border-[var(--line)] rounded-xl p-3 text-xs font-bold text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--testino-orange)] leading-relaxed"
                />
              </div>

              {/* MULTIPLE IMAGES SECTION */}
              <div className="p-3.5 rounded-2xl bg-[var(--surface-cream)] border-2 border-[var(--line)] space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-black">
                    <ImageIcon size={16} className="text-[var(--testino-orange)]" />
                    <span>پیوست تصویر یا جدول ({images.length})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="btn-neo-orange px-3 py-1.5 text-xs font-black flex items-center gap-1.5 shadow-[1.5px_1.5px_0px_var(--neo-shadow)] cursor-pointer"
                  >
                    <Plus size={14} />
                    <span>افزودن عکس / جدول</span>
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleImageFiles(e.target.files)}
                  />
                </div>

                {images.length === 0 ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="p-4 rounded-xl border-2 border-dashed border-[var(--line-strong)] text-center text-xs text-[var(--muted)] font-bold cursor-pointer hover:bg-[var(--surface)] transition-colors flex flex-col items-center gap-1.5"
                  >
                    <UploadCloud size={20} className="text-[var(--muted)]" />
                    <span>برای افزودن عکس، نمودار یا عکس جدول به سؤال اینجا کلیک کنید</span>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="p-2 rounded-xl bg-[var(--surface)] border-2 border-[var(--line)] space-y-2 relative group shadow-[1px_1px_0px_var(--neo-shadow)]"
                      >
                        <div className="h-28 rounded-lg overflow-hidden bg-white border border-[var(--line)]/20 flex items-center justify-center">
                          <img
                            src={img.url}
                            alt={img.alt}
                            className="max-h-full max-w-full object-contain"
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={img.alt}
                            onChange={(e) => updateImageAlt(img.id, e.target.value)}
                            placeholder="توضیح عکس (Alt)..."
                            className="w-full bg-[var(--surface-2)] border border-[var(--line)] rounded-lg px-2 py-1 text-[10px] font-bold"
                          />
                          <button
                            type="button"
                            onClick={() => removeImage(img.id)}
                            className="w-7 h-7 rounded-lg bg-red-100 hover:bg-red-200 dark:bg-red-950 dark:hover:bg-red-900 text-red-600 flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                            title="حذف تصویر"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <span className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-black/60 text-white text-[9px] font-black pointer-events-none">
                          #{idx + 1}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 4 Options Grid */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black block">گزینه‌های چهارگانه و انتخاب کلید صحیح:</label>
                  <span className="text-[10px] font-bold text-[var(--muted)]">
                    دایره کنار گزینه صحیح را تیک بزنید
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Option A */}
                  <div
                    className={cn(
                      "p-3 rounded-2xl border-2 transition-all space-y-1",
                      correctKey === "a"
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">گزینه ۱ (الف)</span>
                      <button
                        type="button"
                        onClick={() => setCorrectKey("a")}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 transition-all cursor-pointer",
                          correctKey === "a"
                            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                            : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
                        )}
                      >
                        {correctKey === "a" && <Check size={10} />}
                        <span>{correctKey === "a" ? "پاسخ صحیح ✓" : "انتخاب به عنوان کلید"}</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="متن گزینه ۱..."
                      value={optA}
                      onChange={(e) => setOptA(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl p-2 text-xs font-bold text-[var(--ink)] focus:outline-none"
                    />
                  </div>

                  {/* Option B */}
                  <div
                    className={cn(
                      "p-3 rounded-2xl border-2 transition-all space-y-1",
                      correctKey === "b"
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">گزینه ۲ (ب)</span>
                      <button
                        type="button"
                        onClick={() => setCorrectKey("b")}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 transition-all cursor-pointer",
                          correctKey === "b"
                            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                            : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
                        )}
                      >
                        {correctKey === "b" && <Check size={10} />}
                        <span>{correctKey === "b" ? "پاسخ صحیح ✓" : "انتخاب به عنوان کلید"}</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="متن گزینه ۲..."
                      value={optB}
                      onChange={(e) => setOptB(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl p-2 text-xs font-bold text-[var(--ink)] focus:outline-none"
                    />
                  </div>

                  {/* Option C */}
                  <div
                    className={cn(
                      "p-3 rounded-2xl border-2 transition-all space-y-1",
                      correctKey === "c"
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">گزینه ۳ (ج)</span>
                      <button
                        type="button"
                        onClick={() => setCorrectKey("c")}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 transition-all cursor-pointer",
                          correctKey === "c"
                            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                            : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
                        )}
                      >
                        {correctKey === "c" && <Check size={10} />}
                        <span>{correctKey === "c" ? "پاسخ صحیح ✓" : "انتخاب به عنوان کلید"}</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="متن گزینه ۳..."
                      value={optC}
                      onChange={(e) => setOptC(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl p-2 text-xs font-bold text-[var(--ink)] focus:outline-none"
                    />
                  </div>

                  {/* Option D */}
                  <div
                    className={cn(
                      "p-3 rounded-2xl border-2 transition-all space-y-1",
                      correctKey === "d"
                        ? "border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30 shadow-[2px_2px_0px_var(--neo-shadow)]"
                        : "border-[var(--line)] bg-[var(--surface-2)]"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black">گزینه ۴ (د)</span>
                      <button
                        type="button"
                        onClick={() => setCorrectKey("d")}
                        className={cn(
                          "px-2 py-0.5 rounded-lg text-[10px] font-black border flex items-center gap-1 transition-all cursor-pointer",
                          correctKey === "d"
                            ? "bg-emerald-600 text-white border-emerald-700 shadow-sm"
                            : "bg-[var(--surface)] text-[var(--muted)] border-[var(--line)] hover:text-[var(--ink)]"
                        )}
                      >
                        {correctKey === "d" && <Check size={10} />}
                        <span>{correctKey === "d" ? "پاسخ صحیح ✓" : "انتخاب به عنوان کلید"}</span>
                      </button>
                    </div>
                    <textarea
                      rows={2}
                      placeholder="متن گزینه ۴..."
                      value={optD}
                      onChange={(e) => setOptD(e.target.value)}
                      className="w-full bg-[var(--surface)] border border-[var(--line)] rounded-xl p-2 text-xs font-bold text-[var(--ink)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Explanation Text */}
              <div className="space-y-1">
                <label className="text-xs font-black block">پاسخ تشریحی (اختیاری)</label>
                <textarea
                  rows={2}
                  placeholder="توضیحات و راه‌حل پاسخ صحیح..."
                  value={explanationText}
                  onChange={(e) => setExplanationText(e.target.value)}
                  className="w-full bg-[var(--surface-2)] border-2 border-[var(--line)] rounded-xl p-3 text-xs font-bold text-[var(--ink)] focus:outline-none focus:bg-[var(--surface)] focus:border-[var(--testino-orange)]"
                />
              </div>
            </div>
          )}

          {/* TAB 2: RAW JSON MODE */}
          {activeTab === "json" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs font-black">
                <span>ویرایشگر مستقیم کد ساختار سؤال (JSON):</span>
                <button
                  type="button"
                  onClick={() => {
                    try {
                      const p = JSON.parse(rawJson);
                      setRawJson(JSON.stringify(p, null, 2));
                      setJsonError("");
                    } catch {
                      setJsonError("کد JSON دارای خطا است و قابل قالب‌بندی نیست.");
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[var(--surface-2)] border border-[var(--line)] text-[11px] hover:bg-[var(--surface)] transition-colors cursor-pointer"
                >
                  مرتب‌سازی خودکار (Format)
                </button>
              </div>

              {jsonError && (
                <div className="p-2.5 rounded-xl bg-red-100 dark:bg-red-950/50 border border-red-400 text-red-700 dark:text-red-300 text-xs font-bold">
                  {jsonError}
                </div>
              )}

              <textarea
                rows={16}
                value={rawJson}
                onChange={(e) => {
                  setRawJson(e.target.value);
                  setJsonError("");
                }}
                dir="ltr"
                className="w-full font-mono text-xs p-3 rounded-2xl bg-[#0f172a] text-[#38bdf8] border-2 border-[var(--line-strong)] focus:outline-none focus:ring-2 focus:ring-[var(--testino-orange)] leading-relaxed"
                placeholder="JSON سؤال را اینجا بنویسید..."
              />
              <p className="text-[11px] text-[var(--muted)] font-bold">
                * در حالت JSON می‌توانید آرایهٔ بلوک‌های تصویری (image)، فرمول‌های لاتک (formula) یا ساختارهای پیشرفته را مستقیماً اصلاح یا اضافه کنید.
              </p>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 border-t-2 border-[var(--line)] bg-[var(--surface-cream)] flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="py-2.5 px-5 rounded-2xl border-2 border-[var(--line-strong)] bg-[var(--surface)] text-[var(--ink)] text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
          >
            انصراف
          </button>

          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="btn-neo-orange py-2.5 px-6 text-xs font-black shadow-[3px_3px_0px_var(--neo-shadow)] flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                <span>در حال ذخیره...</span>
              </>
            ) : (
              <>
                <CheckCircle2 size={16} />
                <span>{isEditMode ? "ذخیرهٔ تغییرات سؤال" : "افزودن سؤال به بانک"}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
