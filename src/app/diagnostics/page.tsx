"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart2,
  CheckCircle2,
  Clock,
  Copy,
  Cpu,
  Download,
  Flame,
  HardDrive,
  Layers,
  Play,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Wifi,
  XCircle,
} from "lucide-react";
import { useDatabase } from "@/providers/database-provider";
import {
  runFullBenchmark,
  formatReportAsMarkdown,
  type BenchmarkReport,
} from "@/lib/telemetry/benchmark-suite";
import { fpsTracker, type FpsSnapshot } from "@/lib/telemetry/fps-monitor";
import {
  getNetworkLogs,
  getNetworkSummary,
  clearNetworkLogs,
  type NetworkLogEntry,
  type NetworkSummary,
} from "@/lib/telemetry/network-monitor";
import { getKatexCacheStats, clearKatexCache } from "@/components/rich-content/content-renderer";
import { cn } from "@/lib/utils";

export default function DiagnosticsPage() {
  const { db, status: dbStatus } = useDatabase();
  const [isRunning, setIsRunning] = useState(false);
  const [report, setReport] = useState<BenchmarkReport | null>(null);
  const [copied, setCopied] = useState(false);

  // Live telemetry state
  const [fps, setFps] = useState<FpsSnapshot>({
    currentFps: 60,
    avgFps: 60,
    minFps: 60,
    droppedFrames: 0,
    jankCount: 0,
    smoothnessScore: 100,
    sampleDurationSec: 0,
  });

  const [networkSummary, setNetworkSummary] = useState<NetworkSummary>(getNetworkSummary());
  const [networkLogs, setNetworkLogs] = useState<NetworkLogEntry[]>([]);
  const [katexStats, setKatexStats] = useState(getKatexCacheStats());

  // Low-end stress test state
  const [stressActive, setStressActive] = useState(false);
  const [stressResult, setStressResult] = useState<string | null>(null);

  // Poll live monitors every 1 second
  useEffect(() => {
    fpsTracker.start();
    const timer = setInterval(() => {
      setFps(fpsTracker.getSnapshot());
      setNetworkSummary(getNetworkSummary());
      setNetworkLogs(getNetworkLogs().slice(0, 15));
      setKatexStats(getKatexCacheStats());
    }, 1000);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const handleStartBenchmark = async () => {
    if (isRunning || dbStatus !== "ready") return;
    setIsRunning(true);
    try {
      // Yield to let React show running state
      await new Promise((r) => setTimeout(r, 100));
      const res = await runFullBenchmark(db.getClient());
      setReport(res);

    } catch (err) {
      console.error("Benchmark error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleCopyReport = () => {
    if (!report) return;
    const md = formatReportAsMarkdown(report);
    void navigator.clipboard.writeText(md).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    });
  };

  const handleDownloadJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `testino-benchmark-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleStressTest = async () => {
    setStressActive(true);
    setStressResult(null);

    const start = performance.now();
    const container = document.createElement("div");
    container.style.position = "fixed";
    container.style.opacity = "0.01";
    container.style.pointerEvents = "none";
    document.body.appendChild(container);

    // Create 400 complex DOM nodes with borders and text
    for (let i = 0; i < 400; i++) {
      const card = document.createElement("div");
      card.className = "card-neo p-2 rounded-xl border";
      card.textContent = `Stress Item ${i} - ${Math.random()}`;
      container.appendChild(card);
    }

    // Force layout reflow
    void container.offsetHeight;

    // Small delay to measure frame delta
    await new Promise((r) => requestAnimationFrame(r));
    const duration = Math.round(performance.now() - start);

    document.body.removeChild(container);
    setStressActive(false);

    if (duration < 35) {
      setStressResult(`بسیار عالی! رندر ۴۰۰ عنصر با موفقیت در ${duration}ms انجام شد (کاملاً روان برای گوشی‌های ضعیف).`);
    } else if (duration < 75) {
      setStressResult(`خوب: رندر ۴۰۰ عنصر در ${duration}ms به اتمام رسید (روانی متوسط).`);
    } else {
      setStressResult(`هشدار: رندر عناصر ${duration}ms طول کشید؛ دستگاه یا مرورگر در بار سنگین افت فریم خواهد داشت.`);
    }
  };

  return (
    <div className="page max-w-5xl mx-auto space-y-6 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          href="/settings/"
          className="w-11 h-11 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] flex items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-2)] transition-colors shadow-[2px_2px_0px_var(--neo-shadow)]"
        >
          <ArrowRight size={20} />
        </Link>
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl font-black text-[var(--ink)] tracking-tight">
            مرکز پایش، عیب‌یابی و بنچمارک سرعت
          </h1>
          <p className="text-xs font-bold text-[var(--muted)] mt-0.5">
            آزمون میلی‌ثانیه‌ای دیتابیس، نرخ فریم (FPS)، شبکه و لگ گوشی‌های ضعیف
          </p>
        </div>
        <div className="w-11" />
      </div>

      {/* Hero CTA Card */}
      <div className="card-neo p-6 rounded-3xl bg-[var(--surface)] border-3 border-[var(--line-strong)] space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Activity className="text-[var(--brand-orange)]" size={24} />
              <h2 className="text-base sm:text-lg font-black text-[var(--ink)]">
                آزمون جامع عملکرد و سلامت فنی برنامه
              </h2>
            </div>
            <p className="text-xs font-bold text-[var(--muted)] leading-relaxed max-w-2xl">
              این تست تمام بخش‌ها شامل سرعت پرس‌وجوهای SQLite، کش KaTeX، عمق درخت DOM، درخواست‌های همگام‌سازی ابری و تأخیر فریم‌ها را آزمایش کرده و یک گزارش دقیق میلی‌ثانیه‌ای ارائه می‌دهد.
            </p>
          </div>

          <button
            type="button"
            onClick={handleStartBenchmark}
            disabled={isRunning || dbStatus !== "ready"}
            className="btn-neo-orange px-6 py-3.5 text-xs sm:text-sm font-black shadow-[4px_4px_0px_var(--neo-shadow)] flex items-center justify-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
          >
            {isRunning ? (
              <>
                <RefreshCw size={18} className="animate-spin" />
                <span>در حال اجرای آزمون…</span>
              </>
            ) : (
              <>
                <Play size={18} />
                <span>استارت تست کامل سیستم</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live Monitoring Dashboard (Realtime HUD) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {/* Metric 1: FPS */}
        <div className="card-neo p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-2">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="text-[11px] font-black">نرخ فریم زنده</span>
            <Flame size={16} className={fps.currentFps >= 50 ? "text-emerald-500" : "text-amber-500"} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-[var(--ink)]">{fps.currentFps}</span>
            <span className="text-xs font-bold text-[var(--muted)]">FPS</span>
          </div>
          <div className="text-[10px] font-bold text-[var(--muted)] flex justify-between">
            <span>حداقل: {fps.minFps} FPS</span>
            <span>روانی: {fps.smoothnessScore}٪</span>
          </div>
        </div>

        {/* Metric 2: KaTeX Cache */}
        <div className="card-neo p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-2">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="text-[11px] font-black">کش فرمول‌های KaTeX</span>
            <Cpu size={16} className="text-sky-500" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-[var(--ink)]">{katexStats.size}</span>
            <span className="text-xs font-bold text-[var(--muted)]">فرمول</span>
          </div>
          <div className="text-[10px] font-bold text-[var(--muted)] flex justify-between">
            <span>اصابت: {katexStats.hitRate}٪</span>
            <span>استفاده: {katexStats.hits} بار</span>
          </div>
        </div>

        {/* Metric 3: Network Calls */}
        <div className="card-neo p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-2">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="text-[11px] font-black">درخواست‌های کلاینت</span>
            <Wifi size={16} className={networkSummary.failedCount > 0 ? "text-red-500" : "text-emerald-500"} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-[var(--ink)]">{networkSummary.totalRequests}</span>
            <span className="text-xs font-bold text-[var(--muted)]">ریکوئست</span>
          </div>
          <div className="text-[10px] font-bold text-[var(--muted)] flex justify-between">
            <span>تکراری: {networkSummary.duplicateCount}</span>
            <span>تبادل: {Math.round(networkSummary.totalBytesTransferred / 1024)} KB</span>
          </div>
        </div>

        {/* Metric 4: Dropped Frames */}
        <div className="card-neo p-4 rounded-2xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-2">
          <div className="flex items-center justify-between text-[var(--muted)]">
            <span className="text-[11px] font-black">لگ و فریم‌های افتاده</span>
            <AlertTriangle size={16} className={fps.jankCount > 0 ? "text-amber-500" : "text-emerald-500"} />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-3xl font-black text-[var(--ink)]">{fps.droppedFrames}</span>
            <span className="text-xs font-bold text-[var(--muted)]">فریم</span>
          </div>
          <div className="text-[10px] font-bold text-[var(--muted)] flex justify-between">
            <span>لگ شدید &gt;50ms:</span>
            <span className={fps.jankCount > 0 ? "text-amber-600 font-black" : ""}>{fps.jankCount}</span>
          </div>
        </div>
      </div>

      {/* Weak Device Stress Test */}
      <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[var(--pastel-yellow)] border-2 border-[var(--line-strong)] text-[var(--ink)] flex items-center justify-center shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0">
              <Smartphone size={20} />
            </div>
            <div>
              <strong className="text-xs sm:text-sm font-black text-[var(--ink)] block">
                تست شبیه‌سازی فشار در گوشی‌های ضعیف (Low-End Stress Test)
              </strong>
              <span className="text-[11px] font-bold text-[var(--muted)]">
                رندر لحظه‌ای ۴۰۰ عنصر رابط کاربری برای بررسی نرخ تازه‌سازی و توان پردازندهٔ گرافیکی
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleStressTest}
            disabled={stressActive}
            className="btn-neo-blue py-2 px-4 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] shrink-0"
          >
            {stressActive ? "در حال اجرای استرس…" : "اجرای آزمون استرس رندر"}
          </button>
        </div>

        {stressResult && (
          <div className="p-3 rounded-xl bg-sky-50 dark:bg-sky-950/40 border border-sky-300 dark:border-sky-800 text-xs font-bold text-sky-800 dark:text-sky-300 animate-in fade-in">
            {stressResult}
          </div>
        )}
      </div>

      {/* Benchmark Report Display */}
      {report && (
        <div className="card-neo p-6 rounded-3xl bg-[var(--surface)] border-3 border-[var(--line-strong)] space-y-6 shadow-[4px_4px_0px_var(--neo-shadow)] animate-in fade-in">
          {/* Score Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-[var(--line-strong)]/20 pb-5">
            <div className="flex items-center gap-4">
              <div
                className={cn(
                  "w-16 h-16 rounded-2xl border-3 border-[var(--line-strong)] flex flex-col items-center justify-center font-black text-2xl shadow-[3px_3px_0px_var(--neo-shadow)]",
                  report.overallScore === "A+" || report.overallScore === "A"
                    ? "bg-emerald-400 text-emerald-950"
                    : report.overallScore === "B"
                    ? "bg-amber-300 text-amber-950"
                    : "bg-red-400 text-red-950"
                )}
              >
                <span>{report.overallScore}</span>
                <span className="text-[9px] font-bold mt-[-4px]">{report.scoreNumber}٪</span>
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-[var(--ink)]">
                  نتیجه ارزیابی عملکرد سیستم
                </h3>
                <p className="text-xs font-bold text-[var(--muted)] mt-0.5">{report.summary}</p>
                <div className="text-[10px] font-bold text-[var(--muted)] mt-1 flex gap-3">
                  <span>زمان تست: {report.totalDurationMs} میلی‌ثانیه</span>
                  <span>•</span>
                  <span>تعداد هسته: {report.deviceInfo.cores}</span>
                  <span>•</span>
                  <span>رزولوشن: {report.deviceInfo.screenResolution}</span>
                </div>
              </div>
            </div>

            {/* Export Actions */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyReport}
                className="btn-neo-yellow py-2 px-3 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1.5"
              >
                <Copy size={14} />
                <span>{copied ? "کپی شد ✓" : "کپی گزارش"}</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="btn-neo-blue py-2 px-3 text-xs font-black shadow-[2px_2px_0px_var(--neo-shadow)] flex items-center gap-1.5"
              >
                <Download size={14} />
                <span>دانلود لاگ JSON</span>
              </button>
            </div>
          </div>

          {/* Detailed Metric Table */}
          <div className="space-y-3">
            <h4 className="text-xs sm:text-sm font-black text-[var(--ink)] flex items-center gap-2">
              <BarChart2 size={16} className="text-[var(--brand-orange)]" />
              <span>ریز نتایج تست‌های تفکیکی (تأخیر به میلی‌ثانیه)</span>
            </h4>

            <div className="overflow-x-auto rounded-2xl border-2 border-[var(--line-strong)]">
              <table className="w-full text-right text-xs">
                <thead className="bg-[var(--surface-2)] border-b-2 border-[var(--line-strong)] font-black text-[var(--ink)]">
                  <tr>
                    <th className="p-3">آزمون</th>
                    <th className="p-3">دسته‌بندی</th>
                    <th className="p-3">وضعیت</th>
                    <th className="p-3">مقدار / زمان</th>
                    <th className="p-3">توضیحات و گزارش وضعیت</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--line-strong)]/20 font-bold text-[var(--ink)]">
                  {report.steps.map((step, idx) => (
                    <tr key={idx} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                      <td className="p-3 font-black">{step.name}</td>
                      <td className="p-3 text-[var(--muted)] text-[11px]">{step.category}</td>
                      <td className="p-3">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded-lg text-[10px] font-black border",
                            step.status === "passed"
                              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                              : step.status === "warning"
                              ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-300"
                              : "bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-300"
                          )}
                        >
                          {step.status === "passed" ? "عالی" : step.status === "warning" ? "هشدار" : "خطا"}
                        </span>
                      </td>
                      <td className="p-3 font-mono font-black" dir="ltr">
                        {step.metricValue} {step.metricUnit}
                      </td>
                      <td className="p-3 text-[11px] text-[var(--muted)]">{step.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Bottlenecks and Recommendations */}
          {(report.bottlenecks.length > 0 || report.recommendations.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
              {report.bottlenecks.length > 0 && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border-2 border-amber-400 space-y-2">
                  <strong className="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                    <AlertTriangle size={15} />
                    <span>گلوگاه‌های شناسایی شده</span>
                  </strong>
                  <ul className="text-xs font-bold text-amber-700 dark:text-amber-300 space-y-1 list-disc list-inside">
                    {report.bottlenecks.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                </div>
              )}

              {report.recommendations.length > 0 && (
                <div className="p-4 rounded-2xl bg-sky-50 dark:bg-sky-950/30 border-2 border-sky-400 space-y-2">
                  <strong className="text-xs font-black text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
                    <ShieldCheck size={15} />
                    <span>پیشنهادات بهبود عملکرد</span>
                  </strong>
                  <ul className="text-xs font-bold text-sky-700 dark:text-sky-300 space-y-1 list-disc list-inside">
                    {report.recommendations.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Network Activity Log Table */}
      <div className="card-neo p-5 rounded-3xl bg-[var(--surface)] border-2 border-[var(--line-strong)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi size={18} className="text-sky-500" />
            <h3 className="text-sm font-black text-[var(--ink)]">
              پایش زنده درخواست‌های شبکه و کلاینت ({networkLogs.length} ثبت شده)
            </h3>
          </div>
          <button
            type="button"
            onClick={clearNetworkLogs}
            className="text-[11px] font-bold text-[var(--muted)] hover:text-[var(--ink)] transition-colors"
          >
            پاک کردن لاگ شبکه
          </button>
        </div>

        {networkLogs.length === 0 ? (
          <p className="text-xs font-bold text-[var(--muted)] text-center py-6">
            هنوز درخواست شبکه‌ای در این نشست ارسال نشده است (برنامه به صورت کاملاً آفلاین کار می‌کند).
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[var(--line-strong)]">
            <table className="w-full text-right text-xs">
              <thead className="bg-[var(--surface-2)] text-[var(--muted)] font-black">
                <tr>
                  <th className="p-2.5">سرویس / اندپوینت</th>
                  <th className="p-2.5">متد</th>
                  <th className="p-2.5">وضعیت</th>
                  <th className="p-2.5">زمان (ms)</th>
                  <th className="p-2.5">حجم</th>
                  <th className="p-2.5">تکراری؟</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line-strong)]/20 font-bold text-[var(--ink)]">
                {networkLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-[var(--surface-2)]/40 transition-colors">
                    <td className="p-2.5 font-black truncate max-w-[200px]" title={log.url}>
                      {log.endpoint}
                    </td>
                    <td className="p-2.5 font-mono text-[11px]">{log.method}</td>
                    <td className="p-2.5">
                      <span
                        className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-black",
                          log.status === 200 || log.status === 201 || log.status === 304
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300"
                        )}
                      >
                        {log.status}
                      </span>
                    </td>
                    <td className="p-2.5 font-mono" dir="ltr">
                      {log.durationMs}ms
                    </td>
                    <td className="p-2.5 font-mono text-[11px]" dir="ltr">
                      {log.resBytes ? `${Math.round(log.resBytes / 1024)} KB` : "—"}
                    </td>
                    <td className="p-2.5">
                      {log.isDuplicate ? (
                        <span className="text-[10px] text-amber-600 font-black">بله (هم‌پوشان)</span>
                      ) : (
                        <span className="text-[10px] text-[var(--muted)]">خیر</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
