"use client";

import { useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  FileText,
  Copy,
  Check,
  ExternalLink,
  Code2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  GraduationCap,
  BarChart2,
  Target,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useDatabase } from "@/providers/database-provider";
import { parseImportJson } from "@/features/questions/domain/importer";

type AiTab = "generate" | "extract" | "analyze";

export function AiTools() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("tab") as AiTab | null;
  const [activeTab, setActiveTab] = useState<AiTab>(
    initialTab === "analyze" || initialTab === "extract" ? initialTab : "generate"
  );

  const database = useDatabase();
  const queryClient = useQueryClient();

  const profiles = useQuery({
    queryKey: ["profiles"],
    queryFn: () => database.db.listProfiles(),
    enabled: database.status === "ready",
  });
  const profile = profiles.data?.[0];

  const analyticsQuery = useQuery({
    queryKey: ["analytics", profile?.id],
    queryFn: () => (profile ? database.db.analytics(profile.id) : null),
    enabled: database.status === "ready" && Boolean(profile),
  });

  const [subject, setSubject] = useState("");
  const [chapter, setChapter] = useState("");
  const [topic, setTopic] = useState("");
  const [countInput, setCountInput] = useState("15");
  const count = Math.max(1, parseInt(countInput, 10) || 15);
  const [difficulty, setDifficulty] = useState("کنکور سراسری و سازمان سنجش");
  const [includeFormulas, setIncludeFormulas] = useState(true);
  const [userNotes, setUserNotes] = useState("");
  const [copied, setCopied] = useState(false);

  const [analyzeSubject, setAnalyzeSubject] = useState("all");
  const [analysisNotes, setAnalysisNotes] = useState("");
  const [customAnalysisJson, setCustomAnalysisJson] = useState("");
  const [useCustomJson, setUseCustomJson] = useState(false);

  const [testInput, setTestInput] = useState("");
  const [validationResult, setValidationResult] = useState<{
    success: boolean;
    message: string;
    questionCount?: number;
    parsedData?: ReturnType<typeof parseImportJson>;
  } | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccess, setImportSuccess] = useState(false);

  const presets = [5, 10, 15, 20, 25, 30];

  const standardSchemaDocumentation = `
### ساختار استاندارد JSON تستیونو (Testino Schema 1.0):
یک شیء JSON معتبر با ساختار زیر الزامی است:
{
  "schemaVersion": "1.0",
  "defaults": {
    "subject": "${subject || "نام درس"}",
    "chapter": "${chapter || "فصل"}",
    "topic": "${topic || "مبحث"}",
    "source": {
      "kind": "${activeTab === "generate" ? "AI" : "EXAM"}",
      "title": "${activeTab === "generate" ? "تست آموزشی استاندارد" : "دفترچه کنکور سراسری"}"
    }
  },
  "questions": [
    {
      "key": "q-1",
      "subject": "${subject || "نام درس"}",
      "chapter": "${chapter || "فصل"}",
      "topic": "${topic || "مبحث"}",
      "content": [
        {
          "type": "text",
          "value": "صورت سؤال چهارگزینه‌ای به فارسی روان.",
          "direction": "rtl"
        }${includeFormulas ? `,
        {
          "type": "formula",
          "latex": "\\\\frac{-b \\\\pm \\\\sqrt{b^2 - 4ac}}{2a}",
          "display": false
        }` : ""}
      ],
      "options": [
        { "key": "a", "content": [{ "type": "text", "value": "گزینه اول" }] },
        { "key": "b", "content": [{ "type": "text", "value": "گزینه دوم" }] },
        { "key": "c", "content": [{ "type": "text", "value": "گزینه سوم" }] },
        { "key": "d", "content": [{ "type": "text", "value": "گزینه چهارم" }] }
      ],
      "correctOptionKey": "a",
      "explanation": [
        {
          "type": "text",
          "value": "پاسخ تشریحی، اثبات گزینهٔ صحیح و رد دام‌های تستی."
        }
      ],
      "shuffleSafe": true
    }
  ]
}

قواعد ضروری:
1. فقط یک شیء JSON برگردان. هیچ مقدمه، موخره، سلام یا علامت markdown مانند \`\`\`json قرار نده تا مستقیماً parse شود.
2. هر سؤال دقیقاً دارای ۴ گزینه با کلیدهای یکتای ("a", "b", "c", "d") باشد.
3. مقدار correctOptionKey باید دقیقاً برابر کلید گزینهٔ صحیح باشد. اگر در منبع پاسخ مشخص نیست، مقدار را null قرار بده.
4. تمام فرمول‌های ریاضی و فیزیک به صورت LaTeX معتبر در بلوک formula نوشته شوند.
5. مقدار shuffleSafe: اگر گزینه‌ها مستقلند true، اگر وابسته به شماره‌اند («گزینه ۱ و ۲»، «همه موارد») false.`;

  const generatePrompt = `تو یک طراح ارشد سؤالات کنکور سراسری و سازمان سنجش هستی. وظیفه تو طراحی ${count} سؤال چهارگزینه‌ای نو، استاندارد، بدون ابهام و با سطح سختی «${difficulty}» است.

مشخصات آزمون:
- درس: ${subject || "نام درس مورد نظر"}
- فصل: ${chapter || "فصل مورد نظر"}
- مبحث: ${topic || "مبحث مورد نظر"}
- تعداد سؤالات: ${count} سؤال
- سطح دشواری: ${difficulty}
${includeFormulas ? "- فرمول‌های ریاضی، فیزیک یا شیمی به صورت LaTeX استاندارد در بلوک formula درج شوند." : ""}
${userNotes ? `- نکات اختصاصی کاربر:\n${userNotes}` : ""}

قواعد استاندارد کنکور:
1. سؤالات کاملاً استانداردِ کنکور سراسری، با ۴ گزینه متمایز و گزینه‌های انحرافی منطقی و مفهومی باشند.
2. از طرح محاسبات فرسایشی غیرمنطقی یا سؤالات مبهم خودداری کن؛ تمرکز روی سنجش تسلط و مهارت تست‌زنی باشد.
3. برای تمام سؤالات، پاسخ تشریحی کامل و تحلیلی ارائه بده.

${standardSchemaDocumentation}

اکنون ${count} سؤال استاندارد کنکور را طراحی کرده و منحصراً JSON خالص آن را ارائه بده.`;

  const extractPrompt = `تو یک پردازشگر دقیق دفترچه‌های آزمون سراسری و اسناد آموزشی کنکور هستی. وظیفه تو استخراج سؤالات چهارگزینه‌ای موجود در متن، تصویر OCR یا فایل ارائه‌شده و تبدیل آن‌ها به فرمت استاندارد تستیونو است.

مشخصات هدف:
- درس: ${subject || "استخراج از متن یا درج نام درس"}
- فصل: ${chapter || "استخراج از متن"}
- مبحث: ${topic || "مبحث مورد نظر"}
- تعداد سؤال: ${count ? `حداکثر ${count} سؤال موجود در ورودی` : "تمام سؤالات موجود"}
${userNotes ? `- راهنمای کاربر:\n${userNotes}` : ""}

قواعد استخراج کنکوری:
1. تمام متن صورت سؤال و ۴ گزینه را دقیق و بدون تغییر متن یا دستکاری فرمول‌ها استخراج کن.
2. فرمول‌ها، علائم توان، کسر و نمادها را به صورت LaTeX استاندارد در بلوک formula بنویس.
3. اگر کلید پاسخ در ورودی موجود است، مقدار correctOptionKey را ثبت کن؛ اگر نیست، مقدار آن را null بگذار و گزینه‌ای از خودت حدس نزن.

${standardSchemaDocumentation}

اکنون محتوای آزمون پیوست‌شده را پردازش کرده و منحصراً شیء JSON استاندارد تحویل بده:
[متن یا تصویر دفترچه آزمون را اینجا قرار دهید]`;

  const analysisExportData = useMemo(() => {
    if (useCustomJson && customAnalysisJson.trim()) {
      try { return JSON.parse(customAnalysisJson); } catch { return customAnalysisJson; }
    }
    if (!profile) return null;
    const totals = analyticsQuery.data?.totals;
    const pct = totals && totals.total > 0 ? (totals.correct / totals.total) * 100 : null;
    return {
      schemaVersion: "1.0",
      exportType: "performance-analysis",
      profileName: profile.name,
      targetTrack: profile.targetTrack,
      targets: profile.subjects.map((s) => ({ subject: s.name, coefficient: s.coefficient, targetPercentage: s.targetPercentage, questionCount: s.questionCount ?? 25 })),
      totals: totals || { correct: 0, wrong: 0, unanswered: 0, unvisited: 0, total: 0 },
      overallPercentage: pct !== null ? Math.round(pct * 10) / 10 : null,
      averageTimePerQuestionSec: analyticsQuery.data?.averageTimePerQuestionSec || 0,
      bySubject: (analyticsQuery.data?.bySubject || []).filter((s) => analyzeSubject === "all" || s.subject === analyzeSubject),
      weakTopics: analyticsQuery.data?.weakTopics || [],
    };
  }, [analyticsQuery.data, profile, analyzeSubject, useCustomJson, customAnalysisJson]);

  const analyzePrompt = `دادهٔ عملکرد و کارنامهٔ تستیونو را به صورت دقیق و مشاوره‌ای تحلیل کن تا نقاط ضعف، اولویت‌های مرور و گام‌های عملی بعدی برای کنکور مشخص شوند. فقط به داده‌های پیوست تکیه کن.

محدودهٔ بررسی: ${analyzeSubject === "all" ? "تمام دروس کنکور" : `درس «${analyzeSubject}»`}
اهداف ثبت‌شده در پروفایل کنکور:
${JSON.stringify(profile?.subjects.map((s) => ({ درس: s.name, ضریب: s.coefficient, درصد_هدف: `${s.targetPercentage}٪`, تعداد_سؤالات_کنکور: s.questionCount ?? 25 })) ?? [], null, 2)}

قواعد تحلیل مشاوره‌ای:
1. ارزیابی دقیق درصد خام، تعداد غلط‌ها و مقایسه زمان صرف‌شده برای هر سؤال با استاندارد دفترچه کنکور.
2. تفکیک خطاهای ناشی از کمبود وقت و شک از خطاهای ناشی از ضعف مفاهیم پایه.
3. در موضوعاتی که نمونهٔ تستی کم است (زیر ۵ سؤال)، از قضاوت قطعی پرهیز کن و آن را «داده ناکافی» اعلام کن.
4. پیش‌بینی رتبه یا شانس قبولی نده؛ تمرکز باید روی تحلیل فنی و بهبود درصدها باشد.

گزارش تحلیلی به زبان فارسی:
۱. تحلیل واقع‌بینانه وضعیت درصدها و میانگین زمان به تفکیک درس در چند بند موجز.
۲. حداکثر ۵ ضعف اصلی یا الگوی خطا با شواهد عددی (تعداد غلط در هر مبحث).
۳. مباحث دارای اولویت فوری برای مرور و حل تست تکمیلی به ترتیب اهمیت.
۴. فاصلهٔ درصدی فعلی تا درصدهای هدف کنکور.
۵. سه اقدام تمرینی مشخص و اجرایی برای آزمون‌های پیش رو.

${analysisNotes ? `یادداشت و دغدغه‌های دانش‌آموز:\n${analysisNotes}\n` : ""}
داده‌های عملکرد آزمون تستیونو:
${JSON.stringify(analysisExportData, null, 2)}`;

  const currentPrompt = activeTab === "generate" ? generatePrompt : activeTab === "extract" ? extractPrompt : analyzePrompt;

  async function copyToClipboard() {
    try {
      await navigator.clipboard.writeText(currentPrompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  function handleValidateJson() {
    setValidationResult(null);
    setImportSuccess(false);
    if (!testInput.trim()) {
      setValidationResult({ success: false, message: "لطفاً ابتدا خروجی هوش مصنوعی را در کادر قرار دهید." });
      return;
    }
    try {
      let cleaned = testInput.trim();
      if (cleaned.startsWith("```json")) cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "").trim();
      else if (cleaned.startsWith("```")) cleaned = cleaned.replace(/^```/, "").replace(/```$/, "").trim();
      const parsed = parseImportJson(cleaned);
      if (parsed.issues.length > 0) {
        const errorIssues = parsed.issues.filter((i) => !i.isWarning);
        if (errorIssues.length > 0) {
          setValidationResult({ success: false, message: `اعتبارسنجی ناموفق بود: ${errorIssues[0].message} (ردیف ${errorIssues[0].rowIndex})` });
          return;
        }
      }
      setValidationResult({ success: true, message: `ساختار JSON معتبر است. تعداد سؤالات قابل ورود: ${parsed.valid.length}`, questionCount: parsed.valid.length, parsedData: parsed });
    } catch (err) {
      setValidationResult({ success: false, message: err instanceof Error ? err.message : "خطا در پردازش JSON" });
    }
  }

  async function handleImportValidated() {
    if (!validationResult?.parsedData) return;
    setIsImporting(true);
    try {
      await database.db.importQuestions(validationResult.parsedData);
      await queryClient.invalidateQueries({ queryKey: ["questions"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setImportSuccess(true);
      setTestInput("");
      setValidationResult(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "خطا در ورود سؤالات به دیتابیس");
    } finally { setIsImporting(false); }
  }

  return (
    <section className="page max-w-5xl mx-auto space-y-6 pb-16">
      <div className="page-heading">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 mb-2 border border-emerald-200/80 dark:border-emerald-800">
            <Sparkles size={14} />
            <span>پرامپت‌های استاندارد کنکور برای هوش مصنوعی</span>
          </div>
          <h1>دستیار هوشمند کنکور تستیونو</h1>
          <p>تولید تست جدید، استخراج از دفترچه‌های چاپی، و تحلیل مشاوره‌ای کارنامه با مدل‌های زبانی</p>
        </div>
      </div>

      <div className="flex p-1 bg-neutral-100 dark:bg-neutral-800/80 rounded-2xl border border-neutral-200 dark:border-neutral-700/80 max-w-xl">
        <button type="button" onClick={() => setActiveTab("generate")} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all", activeTab === "generate" ? "bg-[var(--surface)] dark:bg-neutral-700 text-emerald-600 dark:text-emerald-400 shadow-sm" : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200")}>
          <Sparkles size={15} /><span>تولید تست جدید</span>
        </button>
        <button type="button" onClick={() => setActiveTab("extract")} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all", activeTab === "extract" ? "bg-[var(--surface)] dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm" : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200")}>
          <FileText size={15} /><span>استخراج از دفترچه</span>
        </button>
        <button type="button" onClick={() => setActiveTab("analyze")} className={cn("flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all", activeTab === "analyze" ? "bg-[var(--surface)] dark:bg-neutral-700 text-purple-600 dark:text-purple-400 shadow-sm" : "text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200")}>
          <BarChart2 size={15} /><span>تحلیل کارنامه</span>
        </button>
      </div>

      <div className="grid split gap-6">
        {activeTab === "analyze" ? (
          <div className="card space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2">
              <BarChart2 size={18} className="text-purple-500" />
              <span>تنظیمات تحلیل کارنامه و مشاوره کنکور</span>
            </h2>
            <div className="field mb-0">
              <label htmlFor="analyze-subject" className="text-xs font-bold">درس مورد بررسی</label>
              <select id="analyze-subject" value={analyzeSubject} onChange={(e) => setAnalyzeSubject(e.target.value)}>
                <option value="all">همهٔ دروس آزمون (کارنامه ترکیبی)</option>
                {profile?.subjects.map((s) => <option key={s.id} value={s.name}>درس {s.name} ({s.questionCount ?? 25} سؤال • هدف: {s.targetPercentage}٪)</option>)}
              </select>
            </div>
            {analyticsQuery.data?.totals && (
              <div className="p-3.5 rounded-xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/40 text-xs space-y-2">
                <span className="font-bold text-purple-900 dark:text-purple-200 flex items-center gap-1.5"><TrendingUp size={14} />خلاصه داده‌های ثبت‌شده در کارنامه شما:</span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center pt-1">
                  <div className="bg-[var(--surface)] dark:bg-neutral-800 p-2 rounded-lg border border-neutral-100 dark:border-neutral-700"><div className="text-neutral-400 text-[10px]">تعداد کل تست‌ها</div><div className="font-bold text-sm">{analyticsQuery.data.totals.total}</div></div>
                  <div className="bg-[var(--surface)] dark:bg-neutral-800 p-2 rounded-lg border border-neutral-100 dark:border-neutral-700"><div className="text-neutral-400 text-[10px]">پاسخ صحیح</div><div className="font-bold text-sm text-emerald-600">{analyticsQuery.data.totals.correct}</div></div>
                  <div className="bg-[var(--surface)] dark:bg-neutral-800 p-2 rounded-lg border border-neutral-100 dark:border-neutral-700"><div className="text-neutral-400 text-[10px]">پاسخ غلط</div><div className="font-bold text-sm text-rose-600">{analyticsQuery.data.totals.wrong}</div></div>
                  <div className="bg-[var(--surface)] dark:bg-neutral-800 p-2 rounded-lg border border-neutral-100 dark:border-neutral-700"><div className="text-neutral-400 text-[10px]">میانگین زمان هر تست</div><div className="font-bold text-sm">{analyticsQuery.data.averageTimePerQuestionSec} ثانیه</div></div>
                </div>
              </div>
            )}
            {profile?.subjects && profile.subjects.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1"><Target size={14} className="text-blue-500" />درصدهای هدف ثبت‌شده در پروفایل شما:</span>
                <div className="flex flex-wrap gap-1.5">{profile.subjects.map((s) => <span key={s.id} className="px-2.5 py-1 rounded-lg text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 font-medium">{s.name}: <strong className="font-mono text-blue-600 dark:text-blue-400">{s.targetPercentage}٪</strong> <span className="text-neutral-400 font-normal">({s.questionCount ?? 25} سؤال)</span></span>)}</div>
              </div>
            )}
            <div className="field mb-0 pt-2">
              <label htmlFor="analyze-notes" className="text-xs font-bold">یادداشت، دغدغه‌ها یا چالش‌های شما (اختیاری)</label>
              <textarea id="analyze-notes" rows={3} value={analysisNotes} onChange={(e) => setAnalysisNotes(e.target.value)} placeholder="مثلاً در سؤالات محاسباتی وقت کم می‌آورم، در دوپاسخی‌ها معمولاً گزینه غلط را انتخاب می‌کنم..." />
            </div>
            <div className="pt-2 border-t border-neutral-100 dark:border-neutral-800 text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium text-neutral-600 dark:text-neutral-400"><input type="checkbox" checked={useCustomJson} onChange={(e) => setUseCustomJson(e.target.checked)} className="rounded text-purple-600 h-3.5 w-3.5" /><span>ورود دستی خروجی JSON یک آزمون خاص</span></label>
              {useCustomJson && (<div className="mt-2"><textarea rows={4} dir="ltr" value={customAnalysisJson} onChange={(e) => setCustomAnalysisJson(e.target.value)} placeholder="خروجی صادرشده از بخش تحلیل یا جلسه آزمون را اینجا قرار دهید..." className="w-full font-mono text-xs p-2.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-[var(--surface)] dark:bg-neutral-900" /></div>)}
            </div>
          </div>
        ) : (
          <div className="card space-y-4">
            <h2 className="text-base font-bold flex items-center gap-2"><GraduationCap size={18} className="text-emerald-500" /><span>مشخصات آزمون و سؤالات</span></h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="field mb-0"><label htmlFor="ai-subject" className="text-xs font-bold">نام درس</label><input id="ai-subject" value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثلاً زیست‌شناسی، شیمی، فیزیک..." /></div>
              <div className="field mb-0"><label htmlFor="ai-chapter" className="text-xs font-bold">فصل</label><input id="ai-chapter" value={chapter} onChange={(e) => setChapter(e.target.value)} placeholder="مثلاً فصل ۳" /></div>
              <div className="field mb-0"><label htmlFor="ai-topic" className="text-xs font-bold">مبحث</label><input id="ai-topic" value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="مثلاً ژنتیک، سینماتیک..." /></div>
            </div>
            {profile && profile.subjects.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1"><span className="text-[11px] text-neutral-400 ml-1">درس‌های کنکوری شما:</span>{profile.subjects.map((s) => <button key={s.id} type="button" onClick={() => setSubject(s.name)} className="px-2.5 py-1 rounded-lg text-xs bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 hover:border-emerald-500 transition-colors font-medium">{s.name}</button>)}</div>
            )}
            <div className="space-y-2 pt-2">
              <div className="flex justify-between items-center"><label htmlFor="ai-count" className="text-xs font-bold">تعداد سؤال مورد نیاز (تایپ دستی یا انتخاب سریع)</label><span className="text-xs text-neutral-400 font-mono">{count} تست</span></div>
              <div className="flex gap-2">
                <input id="ai-count" type="number" min="1" max="100" value={countInput} onChange={(e) => setCountInput(e.target.value)} className="w-24 font-mono font-bold text-center" />
                <div className="flex-1 min-w-0 flex gap-1.5 overflow-x-auto">{presets.map((p) => <button key={p} type="button" onClick={() => setCountInput(String(p))} className={cn("flex-none sm:flex-1 py-1.5 px-2 rounded-lg text-xs font-bold border transition-all whitespace-nowrap", count === p ? "bg-emerald-600 text-white border-emerald-600 shadow-sm" : "bg-neutral-50 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 border-neutral-200 dark:border-neutral-700 hover:bg-neutral-100")}>{new Intl.NumberFormat("fa-IR").format(p)} سؤال</button>)}</div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
              <div className="field mb-0"><label htmlFor="ai-difficulty" className="text-xs font-bold">سطح سؤالات</label><select id="ai-difficulty" value={difficulty} onChange={(e) => setDifficulty(e.target.value)}><option value="کنکور سراسری و سازمان سنجش">کنکور سراسری و سنجش</option><option value="مفهومی، ترکیبی و سخت">مفهومی، ترکیبی و سخت</option><option value="پایه‌ای و آموزشی (مرور اول)">پایه‌ای و آموزشی (مرور اول)</option></select></div>
              <div className="flex items-end pb-1.5"><label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-neutral-700 dark:text-neutral-300"><input type="checkbox" checked={includeFormulas} onChange={(e) => setIncludeFormulas(e.target.checked)} className="rounded text-emerald-600 h-4 w-4" /><span>شامل فرمول‌های ریاضی/فیزیک (LaTeX)</span></label></div>
            </div>
            <div className="field mb-0"><label htmlFor="ai-notes" className="text-xs font-bold">یادداشت یا خواستهٔ اختصاصی (اختیاری)</label><textarea id="ai-notes" rows={2} value={userNotes} onChange={(e) => setUserNotes(e.target.value)} placeholder="مثلاً تمرکز روی دام‌های آموزشی کنکور سال‌های اخیر، عدم استفاده از سؤالات حفظی..." /></div>
          </div>
        )}

        <div className="card space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5">
                <Code2 size={16} className={activeTab === "analyze" ? "text-purple-500" : "text-emerald-500"} />
                {activeTab === "analyze" ? "پرامپت تحلیل مشاوره‌ای کارنامه" : "متن پرامپت آماده کپی"}
              </span>
              <span className="text-[11px] text-neutral-400">{activeTab === "analyze" ? "بدون اسکیماهای زائد تستی" : "قالب استاندارد ۴ گزینه‌ای"}</span>
            </div>
            <div className="relative"><textarea readOnly rows={14} value={currentPrompt} className="font-mono text-xs p-3 leading-relaxed bg-neutral-50 dark:bg-neutral-800/60 border border-neutral-200 dark:border-neutral-700/80 rounded-xl resize-none w-full select-all" /></div>
          </div>
          <div className="space-y-3 pt-2">
            <button type="button" onClick={copyToClipboard} className={cn("button w-full py-3 text-sm flex items-center justify-center gap-2 shadow-md font-bold", activeTab === "analyze" && "bg-purple-600 hover:bg-purple-700")}>
              {copied ? <Check size={18} /> : <Copy size={18} />}
              <span>{copied ? "پرامپت در کلیپ‌بورد کپی شد!" : "کپی پرامپت در کلیپ‌بورد"}</span>
            </button>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-neutral-500 pt-1">
              <span>ارسال مستقیم به:</span>
              <a href="https://chatgpt.com" target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:text-emerald-600 inline-flex items-center gap-1 font-medium">ChatGPT <ExternalLink size={11} /></a>
              <a href="https://claude.ai" target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:text-emerald-600 inline-flex items-center gap-1 font-medium">Claude <ExternalLink size={11} /></a>
              <a href="https://gemini.google.com" target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:text-emerald-600 inline-flex items-center gap-1 font-medium">Gemini <ExternalLink size={11} /></a>
              <a href="https://chat.deepseek.com" target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:text-emerald-600 inline-flex items-center gap-1 font-medium">DeepSeek <ExternalLink size={11} /></a>
            </div>
          </div>
        </div>
      </div>

      {activeTab === "analyze" ? (
        <div className="card p-4 rounded-xl border border-purple-200 dark:border-purple-800/60 bg-purple-50/30 dark:bg-purple-950/10 text-xs text-purple-900 dark:text-purple-200 space-y-1.5 leading-relaxed">
          <div className="flex items-center gap-2 font-bold text-sm text-purple-800 dark:text-purple-300"><BarChart2 size={16} /><span>راهنمای دریافت گزارش مشاوره‌ای کنکور</span></div>
          <p>پرامپت تحلیل کارنامه بالا حاوی آمار واقعی تست‌ها، درصدها، زمان فعال ثبت‌شده و اهداف شماست. با کپی کردن این متن و ارسال به هوش مصنوعی (مانند Claude یا ChatGPT)، یک گزارش تحلیلی انسانی شامل تشخیص ضعف‌های مهارتی، اولویت‌های مرور و گام‌های عملی بعدی برای کنکور دریافت خواهید کرد. این بخش نیازی به اسکیماهای پیچیدهٔ سؤال ندارد و خروجی آن یک راهنمای راهبردی برای مطالعهٔ شماست.</p>
        </div>
      ) : (
        <div className="card space-y-4 border-2 border-dashed border-emerald-500/40 bg-emerald-50/20 dark:bg-emerald-950/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2"><CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400" /><h3 className="font-bold text-base">اعتبارسنجی و ورود سریع پاسخ هوش مصنوعی به بانک</h3></div>
            <span className="text-xs text-neutral-500">پاسخ JSON را اینجا پیست کنید</span>
          </div>
          <textarea rows={5} dir="ltr" value={testInput} onChange={(e) => setTestInput(e.target.value)} placeholder={`پاسخ JSON را اینجا پیست کنید...\n{\n  "schemaVersion": "1.0",\n  "defaults": { ... },\n  "questions": [ ... ]\n}`} className="font-mono text-xs w-full p-3 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-[var(--surface)] dark:bg-neutral-900" />
          {validationResult && (
            <div className={cn("p-3 rounded-xl border text-xs flex items-center gap-2", validationResult.success ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200 border-emerald-300 dark:border-emerald-800" : "bg-rose-50 text-rose-800 dark:bg-rose-950 dark:text-rose-200 border-rose-300 dark:border-rose-800")}>
              {validationResult.success ? <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" /> : <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />}
              <span className="flex-1">{validationResult.message}</span>
            </div>
          )}
          {importSuccess && (
            <div className="p-3 bg-emerald-100 dark:bg-emerald-950 text-emerald-900 dark:text-emerald-100 rounded-xl text-xs font-bold flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /><span>سؤالات با موفقیت به بانک افزوده شدند! می‌توانید در آزمون‌ها از آن‌ها استفاده کنید.</span></div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <button type="button" onClick={handleValidateJson} className="button secondary text-xs py-2 px-4">اعتبارسنجی JSON</button>
            {validationResult?.success && (
              <button type="button" disabled={isImporting} onClick={handleImportValidated} className="button text-xs py-2 px-5 font-bold">{isImporting ? "در حال ذخیره در بانک…" : `ورود ${validationResult.questionCount} سؤال به بانک`}</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
