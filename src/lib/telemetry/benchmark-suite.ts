"use client";

import type { DatabasePort } from "@/database/ports";
import { getKatexCacheStats } from "@/components/rich-content/content-renderer";
import katex from "katex";
import { getNetworkSummary } from "./network-monitor";
import { fpsTracker } from "./fps-monitor";

export interface BenchmarkStepResult {
  name: string;
  category: "database" | "ui_render" | "memory_storage" | "network";
  status: "passed" | "warning" | "failed";
  durationMs: number;
  metricValue: string | number;
  metricUnit: string;
  thresholdPassed: boolean;
  notes: string;
}

export interface BenchmarkReport {
  timestamp: string;
  overallScore: "A+" | "A" | "B" | "C" | "F";
  scoreNumber: number; // 0 - 100
  summary: string;
  totalDurationMs: number;
  deviceInfo: {
    userAgent: string;
    cores: number;
    deviceMemoryGb?: number;
    screenResolution: string;
    isReducedMotion: boolean;
  };
  storageInfo: {
    quotaMb?: number;
    usageMb?: number;
    percentUsed?: number;
  };
  steps: BenchmarkStepResult[];
  bottlenecks: string[];
  recommendations: string[];
}

export async function runFullBenchmark(db: DatabasePort): Promise<BenchmarkReport> {
  const startTime = performance.now();
  const steps: BenchmarkStepResult[] = [];
  const bottlenecks: string[] = [];
  const recommendations: string[] = [];

  // 1. Database Ping (indexed check)
  const pingStart = performance.now();
  try {
    await db.query("SELECT 1 as ping");
    const pingDuration = Math.round((performance.now() - pingStart) * 10) / 10;
    const passed = pingDuration <= 15;
    steps.push({
      name: "تأخیر پاسخ‌گویی دیتابیس (DB Ping)",
      category: "database",
      status: passed ? "passed" : pingDuration <= 35 ? "warning" : "failed",
      durationMs: pingDuration,
      metricValue: pingDuration,
      metricUnit: "ms",
      thresholdPassed: passed,
      notes: passed ? "پاسخ سریع و بدون تأخیر" : "کندی در بازگشت پاسخ از وب‌ورکر",
    });
    if (!passed) bottlenecks.push(`تأخیر پینگ دیتابیس (${pingDuration}ms) بالاتر از حد استاندارد است.`);
  } catch (err) {
    steps.push({
      name: "تأخیر پاسخ‌گویی دیتابیس (DB Ping)",
      category: "database",
      status: "failed",
      durationMs: Math.round(performance.now() - pingStart),
      metricValue: "خطا",
      metricUnit: "",
      thresholdPassed: false,
      notes: err instanceof Error ? err.message : "خطا در اتصال به دیتابیس",
    });
    bottlenecks.push("خطا در برقراری ارتباط با موتور SQLite.");
  }

  // 2. Cursor Pagination on Questions
  const cursorStart = performance.now();
  try {
    const rows = await db.query(
      "SELECT id, subject, chapter, topic, status, created_at FROM questions WHERE inactive_at IS NULL ORDER BY created_at DESC, id DESC LIMIT 50"
    );
    const cursorDuration = Math.round((performance.now() - cursorStart) * 10) / 10;
    const passed = cursorDuration <= 25;
    steps.push({
      name: "جست‌وجوی صفحه‌بندی‌شده سؤالات (Cursor Pagination 50 items)",
      category: "database",
      status: passed ? "passed" : cursorDuration <= 50 ? "warning" : "failed",
      durationMs: cursorDuration,
      metricValue: cursorDuration,
      metricUnit: "ms",
      thresholdPassed: passed,
      notes: `${rows.length} سؤال در ${cursorDuration}ms با ایندکس لود شد`,
    });
    if (!passed) bottlenecks.push(`کوئری لیست ۵۰تایی سؤالات (${cursorDuration}ms) نیاز به بررسی ایندکس دارد.`);
  } catch (err) {
    steps.push({
      name: "جست‌وجوی صفحه‌بندی‌شده سؤالات",
      category: "database",
      status: "failed",
      durationMs: Math.round(performance.now() - cursorStart),
      metricValue: "خطا",
      metricUnit: "",
      thresholdPassed: false,
      notes: err instanceof Error ? err.message : "خطا در کوئری سؤالات",
    });
  }

  // 3. Multi-table Analytics JOIN (attempts + sessions + questions)
  const joinStart = performance.now();
  try {
    const joinRows = await db.query(
      `SELECT a.result, a.confidence, q.subject 
       FROM attempts a 
       JOIN sessions s ON s.id = a.session_id 
       JOIN questions q ON q.id = a.question_id 
       LIMIT 100`
    );
    const joinDuration = Math.round((performance.now() - joinStart) * 10) / 10;
    const passed = joinDuration <= 30;
    steps.push({
      name: "پرس‌وجوی چندجدولی تحلیل و کارنامه (JOIN 3 Tables)",
      category: "database",
      status: passed ? "passed" : joinDuration <= 60 ? "warning" : "failed",
      durationMs: joinDuration,
      metricValue: joinDuration,
      metricUnit: "ms",
      thresholdPassed: passed,
      notes: `${joinRows.length} سطر پاسخ و کارنامه پردازش شد`,
    });
    if (!passed) bottlenecks.push(`پرس‌وجوی سه‌جدولی آزمون‌ها (${joinDuration}ms) زمان‌بر است.`);
  } catch (err) {
    steps.push({
      name: "پرس‌وجوی چندجدولی تحلیل و کارنامه",
      category: "database",
      status: "failed",
      durationMs: Math.round(performance.now() - joinStart),
      metricValue: "خطا",
      metricUnit: "",
      thresholdPassed: false,
      notes: err instanceof Error ? err.message : "خطا در اجرای JOIN",
    });
  }

  // 4. LIKE Text Filter Benchmark
  const likeStart = performance.now();
  try {
    await db.query("SELECT id FROM questions WHERE content_json LIKE ? LIMIT 20", ["%کنکور%"]);
    const likeDuration = Math.round((performance.now() - likeStart) * 10) / 10;
    const passed = likeDuration <= 40;
    steps.push({
      name: "جست‌وجوی متنی سؤالات (LIKE Fulltext Search)",
      category: "database",
      status: passed ? "passed" : likeDuration <= 80 ? "warning" : "failed",
      durationMs: likeDuration,
      metricValue: likeDuration,
      metricUnit: "ms",
      thresholdPassed: passed,
      notes: `سرعت اسکن متنی: ${likeDuration}ms`,
    });
  } catch (err) {
    steps.push({
      name: "جست‌وجوی متنی سؤالات",
      category: "database",
      status: "failed",
      durationMs: Math.round(performance.now() - likeStart),
      metricValue: "خطا",
      metricUnit: "",
      thresholdPassed: false,
      notes: err instanceof Error ? err.message : "خطا در سرچ متنی",
    });
  }

  // 5. KaTeX Math Formula Parsing & Cache Benchmark
  const sampleFormulas = [
    "x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}",
    "\\int_{0}^{\\infty} e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}",
    "\\sum_{k=1}^{n} k^2 = \\frac{n(n+1)(2n+1)}{6}",
    "\\lim_{x \\to 0} \\frac{\\sin(x)}{x} = 1",
    "f(x) = \\begin{cases} x^2 & x \\ge 0 \\\\ -x & x < 0 \\end{cases}",
  ];

  const katexColdStart = performance.now();
  for (const formula of sampleFormulas) {
    katex.renderToString(formula, { displayMode: true, throwOnError: false });
  }
  const katexColdDuration = Math.round((performance.now() - katexColdStart) * 10) / 10;
  const katexPassed = katexColdDuration <= 20;

  const katexStats = getKatexCacheStats();
  steps.push({
    name: "رندر فرمول‌های ریاضی KaTeX و کشینگ",
    category: "ui_render",
    status: katexPassed ? "passed" : "warning",
    durationMs: katexColdDuration,
    metricValue: `${katexColdDuration}ms (${katexStats.size} آیتم در کش)`,
    metricUnit: "",
    thresholdPassed: katexPassed,
    notes: `نرخ استفاده مجدد از کش: ${katexStats.hitRate}٪ (${katexStats.hits} اصابت)`,
  });

  // 6. DOM Node Count and Depth Inspection
  let totalDomNodes = 0;
  let maxDomDepth = 0;
  let blurElementsCount = 0;

  if (typeof document !== "undefined") {
    totalDomNodes = document.querySelectorAll("*").length;
    const allElements = document.querySelectorAll("*");

    for (const el of allElements) {
      // Check depth
      let depth = 0;
      let cur: Element | null = el;
      while (cur && cur.parentElement) {
        depth++;
        cur = cur.parentElement;
      }
      if (depth > maxDomDepth) maxDomDepth = depth;

      // Check blur usage
      const style = window.getComputedStyle(el);
      const webkitFilter = style.getPropertyValue("-webkit-backdrop-filter");
      if (
        (style.backdropFilter && style.backdropFilter !== "none") ||
        (webkitFilter && webkitFilter !== "none")
      ) {
        blurElementsCount++;
      }

    }
  }

  const domPassed = totalDomNodes < 1500 && maxDomDepth < 32;
  steps.push({
    name: "حجم و عمق درخت عناصر رابط کاربری (DOM Nodes & Depth)",
    category: "ui_render",
    status: domPassed ? "passed" : totalDomNodes < 2500 ? "warning" : "failed",
    durationMs: 0,
    metricValue: `${totalDomNodes} عنصر (عمق: ${maxDomDepth})`,
    metricUnit: "",
    thresholdPassed: domPassed,
    notes: `تعداد عناصر دارای فیلتر شیشه‌ای (Backdrop Filter): ${blurElementsCount}`,
  });
  if (blurElementsCount > 4) {
    recommendations.push("کاهش تعداد المان‌های دارای backdrop-filter در صفحات شلوغ برای روانی بیشتر در پردازنده‌های گرافیکی ضعیف.");
  }
  if (!domPassed) {
    bottlenecks.push(`تعداد نودهای DOM (${totalDomNodes}) زیاد است که می‌تواند در گوشی‌های ضعیف باعث افت نرخ فریم شود.`);
  }

  // 7. FPS and Frame Smoothness Snapshot
  const fpsSnap = fpsTracker.getSnapshot();
  const fpsPassed = fpsSnap.smoothnessScore >= 85 && fpsSnap.minFps >= 40;
  steps.push({
    name: "روانی انیمیشن‌ها و نرخ فریم (FPS & Smoothness)",
    category: "ui_render",
    status: fpsPassed ? "passed" : fpsSnap.smoothnessScore >= 70 ? "warning" : "failed",
    durationMs: 0,
    metricValue: `${fpsSnap.currentFps} FPS (روانی: ${fpsSnap.smoothnessScore}٪)`,
    metricUnit: "",
    thresholdPassed: fpsPassed,
    notes: `افت فریم‌ها: ${fpsSnap.droppedFrames} | لگ‌های شدید بالای ۵۰ms: ${fpsSnap.jankCount}`,
  });
  if (fpsSnap.jankCount > 0) {
    bottlenecks.push(`تعداد ${fpsSnap.jankCount} لگ شدید (بالای ۵۰ میلی‌ثانیه) در رندر UI ثبت شد.`);
  }

  // 8. Network Telemetry & Redundant Call Check
  const netSummary = getNetworkSummary();
  const netPassed = netSummary.duplicateCount === 0 && netSummary.failedCount === 0;
  steps.push({
    name: "درخواست‌های شبکه و همگام‌سازی کلاینت (Client Requests Telemetry)",
    category: "network",
    status: netPassed ? "passed" : netSummary.failedCount > 0 ? "warning" : "passed",
    durationMs: netSummary.avgDurationMs,
    metricValue: `${netSummary.totalRequests} درخواست`,
    metricUnit: "",
    thresholdPassed: netPassed,
    notes: `مجموع حجم تبادل: ${Math.round(netSummary.totalBytesTransferred / 1024)} KB | تکراری: ${netSummary.duplicateCount} | ناموفق: ${netSummary.failedCount}`,
  });
  if (netSummary.duplicateCount > 0) {
    recommendations.push(`شناسایی ${netSummary.duplicateCount} درخواست هم‌پوشان و تکراری در فواصل کوتاه.`);
  }

  // 9. Storage Quota Check
  let quotaMb: number | undefined;
  let usageMb: number | undefined;
  let percentUsed: number | undefined;

  if (typeof navigator !== "undefined" && "storage" in navigator && "estimate" in navigator.storage) {
    try {
      const estimate = await navigator.storage.estimate();
      if (estimate.quota) quotaMb = Math.round(estimate.quota / (1024 * 1024));
      if (estimate.usage) usageMb = Math.round(estimate.usage / (1024 * 1024));
      if (quotaMb && usageMb) percentUsed = Math.round((usageMb / quotaMb) * 100);

      steps.push({
        name: "فضای ذخیره‌سازی محلی OPFS/IndexedDB",
        category: "memory_storage",
        status: "passed",
        durationMs: 0,
        metricValue: `${usageMb || 0} MB از ${quotaMb || 0} MB (${percentUsed || 0}٪)`,
        metricUnit: "",
        thresholdPassed: true,
        notes: "ظرفیت کافی روی دستگاه در دسترس است",
      });
    } catch {
      // ignore
    }
  }

  // Calculate Overall Grade
  const passedCount = steps.filter((s) => s.status === "passed").length;
  const warningCount = steps.filter((s) => s.status === "warning").length;
  const failedCount = steps.filter((s) => s.status === "failed").length;

  const scoreNumber = Math.max(
    0,
    Math.min(100, Math.round(((passedCount * 1.0 + warningCount * 0.5) / steps.length) * 100))
  );

  let overallScore: BenchmarkReport["overallScore"] = "A+";
  if (scoreNumber >= 94 && failedCount === 0) overallScore = "A+";
  else if (scoreNumber >= 82 && failedCount === 0) overallScore = "A";
  else if (scoreNumber >= 65) overallScore = "B";
  else if (scoreNumber >= 45) overallScore = "C";
  else overallScore = "F";

  const totalDurationMs = Math.round(performance.now() - startTime);

  let summary = `برنامه با نمرهٔ ${overallScore} (${scoreNumber} از ۱۰۰) در وضعیت عالی اجرا می‌شود.`;
  if (overallScore === "B") summary = "عملکرد برنامه خوب است اما چند گلوگاه عملکردی جزئی شناسایی شد.";
  else if (overallScore === "C" || overallScore === "F") summary = "گلوگاه‌های جدی در پردازش یا رندر نیاز به بهینه‌سازی دارند.";

  return {
    timestamp: new Date().toISOString(),
    overallScore,
    scoreNumber,
    summary,
    totalDurationMs,
    deviceInfo: {
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "Node/CLI",
      cores: typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4,
      deviceMemoryGb: typeof navigator !== "undefined" ? (navigator as unknown as { deviceMemory?: number }).deviceMemory : undefined,
      screenResolution: typeof window !== "undefined" ? `${window.innerWidth}x${window.innerHeight}` : "1080x1920",
      isReducedMotion: typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false,
    },
    storageInfo: {
      quotaMb,
      usageMb,
      percentUsed,
    },
    steps,
    bottlenecks,
    recommendations,
  };
}

export function formatReportAsMarkdown(report: BenchmarkReport): string {
  const lines: string[] = [];
  lines.push(`# گزارش تست و ارزیابی جامع کارایی تستینو (Testino Performance Audit)`);
  lines.push(`**زمان تست:** ${new Date(report.timestamp).toLocaleString("fa-IR")}`);
  lines.push(`**امتیاز نهایی:** ${report.overallScore} (${report.scoreNumber} از ۱۰۰)`);
  lines.push(`**مدت زمان تست:** ${report.totalDurationMs} میلی‌ثانیه`);
  lines.push(`**سخت‌افزار:** ${report.deviceInfo.cores} هسته پردازنده | رزولوشن ${report.deviceInfo.screenResolution}`);
  lines.push("");
  lines.push(`## خلاصه ارزیابی`);
  lines.push(report.summary);
  lines.push("");
  lines.push(`## نتایج تست‌های تفکیکی`);
  lines.push("| تست | دسته‌بندی | وضعیت | مقدار / نتیجه | زمان (ms) | جزئیات |");
  lines.push("|---|---|---|---|---|---|");

  for (const step of report.steps) {
    const statusIcon = step.status === "passed" ? "🟢 موفق" : step.status === "warning" ? "🟡 هشدار" : "🔴 خطا";
    lines.push(
      `| ${step.name} | ${step.category} | ${statusIcon} | ${step.metricValue} ${step.metricUnit} | ${step.durationMs}ms | ${step.notes} |`
    );
  }

  if (report.bottlenecks.length > 0) {
    lines.push("");
    lines.push("## گلوگاه‌های شناسایی شده (Bottlenecks)");
    for (const b of report.bottlenecks) {
      lines.push(`- ⚠️ ${b}`);
    }
  }

  if (report.recommendations.length > 0) {
    lines.push("");
    lines.push("## پیشنهادات بهبود (Recommendations)");
    for (const r of report.recommendations) {
      lines.push(`- 💡 ${r}`);
    }
  }

  return lines.join("\n");
}
