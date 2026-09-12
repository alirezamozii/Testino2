"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, Flag, X } from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
import type { StoredQuestion } from "@/features/questions/domain/question-schema";

const SOURCE_KIND: Record<NonNullable<StoredQuestion["source"]>["kind"], string> = {
  EXAM: "آزمون / کنکور",
  AI: "سؤال تألیفی هوش مصنوعی",
  PERSONAL: "کتاب یا منبع شخصی",
};

export function QuestionTrustActions({ question, compact = false }: { question: Pick<StoredQuestion, "id" | "source" | "reportCount">; compact?: boolean }) {
  const { db, status } = useDatabase();
  const cache = useQueryClient();
  const [sourceOpen, setSourceOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const report = useQuery({ queryKey: ["question-report", question.id], queryFn: () => db.getQuestionReportStatus(question.id), enabled: status === "ready" });
  const count = report.data?.count ?? question.reportCount ?? 0;
  const alreadyReported = report.data?.reportedByCurrentUser ?? false;
  const source = question.source;

  async function submit() {
    setSaving(true); setError("");
    try {
      await db.reportQuestion(question.id, note);
      await cache.invalidateQueries({ queryKey: ["question-report", question.id] });
      await cache.invalidateQueries({ queryKey: ["question", question.id] });
      setReportOpen(false); setNote("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "ثبت گزارش انجام نشد.");
    } finally { setSaving(false); }
  }

  const buttonClass = compact
    ? "inline-flex min-h-8 items-center gap-1 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-2 text-[10px] font-black text-[var(--muted)] hover:text-[var(--ink)]"
    : "inline-flex min-h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--line)] bg-[var(--surface)] px-3 text-xs font-black text-[var(--ink)] hover:bg-[var(--surface-2)]";

  return <>
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => setSourceOpen(true)} className={buttonClass} title="مشاهده منبع این سؤال">
        <BookOpen size={compact ? 13 : 15} /><span>منبع</span>
      </button>
      <button type="button" onClick={() => !alreadyReported && setReportOpen(true)} disabled={alreadyReported} className={`${buttonClass} ${alreadyReported ? "cursor-default border-amber-300 bg-amber-50 text-amber-800 opacity-90" : ""}`} title={alreadyReported ? "گزارش شما قبلاً ثبت شده است" : "گزارش اشکال سؤال"}>
        {alreadyReported ? <Check size={compact ? 13 : 15} /> : <Flag size={compact ? 13 : 15} />}<span>{alreadyReported ? "گزارش شد" : "گزارش"}</span><span className="rounded-full bg-black/10 px-1.5 py-0.5 tabular-nums">{count}</span>
      </button>
    </div>

    {sourceOpen && <Dialog title="منبع سؤال" onClose={() => setSourceOpen(false)}>
      {source ? <div className="space-y-3 text-sm leading-7 text-[var(--ink)]">
        <p><strong>نوع منبع:</strong> {SOURCE_KIND[source.kind]}</p>
        <p><strong>نام منبع:</strong> {source.title || "برای این سؤال نام منبع ثبت نشده است."}</p>
        {source.year && <p><strong>سال:</strong> {source.year}</p>}
        {source.number && <p><strong>شماره در منبع:</strong> {source.number}</p>}
      </div> : <p className="text-sm font-bold leading-7 text-[var(--muted)]">برای این سؤال منبعی ثبت نشده است. هنگام ورود یا ویرایش سؤال می‌توان نام منبع، سال و شماره سؤال را وارد کرد.</p>}
    </Dialog>}

    {reportOpen && <Dialog title="گزارش اشکال سؤال" onClose={() => setReportOpen(false)}>
      <div className="space-y-4"><p className="text-sm font-bold leading-7 text-[var(--muted)]">اگر سؤال، پاسخ، گزینه‌ها یا منبع اشکال دارد گزارش کنید. هر کاربر فقط یک گزارش برای هر سؤال ثبت می‌کند.</p>
        <label className="block text-xs font-black text-[var(--ink)]">توضیح شما <span className="font-bold text-[var(--muted)]">(اختیاری)</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} rows={4} placeholder="مثلاً کلید با پاسخ تشریحی ناسازگار است…" className="mt-2 w-full resize-y rounded-xl border-2 border-[var(--line)] bg-[var(--surface-2)] p-3 text-sm font-medium text-[var(--ink)] outline-none focus:border-[var(--line-strong)]" />
        </label>
        {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-xs font-black text-rose-700">{error}</p>}
        <button type="button" onClick={() => void submit()} disabled={saving} className="btn-neo-orange w-full min-h-11 text-xs font-black disabled:opacity-60">{saving ? "در حال ثبت پایدار…" : "ثبت گزارش"}</button>
      </div>
    </Dialog>}
  </>;
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/45 p-3 sm:items-center backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl border-2 border-[var(--line-strong)] bg-[var(--surface)] p-5 shadow-[6px_6px_0_var(--neo-shadow)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-[var(--ink)]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
            aria-label="بستن"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
