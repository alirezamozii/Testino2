import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const BASE_URL = "http://localhost:3000";

const PAGES = [
  { name: "Home / Dashboard", path: "/" },
  { name: "Settings", path: "/settings/" },
  { name: "Session Builder", path: "/sessions/new/" },
  { name: "Question Bank", path: "/bank/" },
  { name: "Review Center", path: "/review/" },
  { name: "Analytics", path: "/analytics/" },
  { name: "Onboarding", path: "/onboarding/" },
];

const reportsDir = path.resolve(".lighthouse-reports");
if (!fs.existsSync(reportsDir)) {
  fs.mkdirSync(reportsDir, { recursive: true });
}

console.log("======================================================");
console.log("   🌟 TESTINO COMPREHENSIVE LIGHTHOUSE AUDIT SUITE    ");
console.log("======================================================\n");

const results = [];

for (const p of PAGES) {
  for (const preset of ["desktop", "mobile"]) {
    const slug = `${p.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}_${preset}`;
    const reportPath = path.join(reportsDir, `${slug}.json`);
    const targetUrl = `${BASE_URL}${p.path}`;

    process.stdout.write(`Auditing [${preset.toUpperCase().padEnd(7)}] ${p.name.padEnd(20)} ... `);

    try {
      const cmd = `npx --yes lighthouse "${targetUrl}" --output=json --output-path="${reportPath}" --chrome-flags="--headless=new --no-sandbox" ${preset === "desktop" ? "--preset=desktop" : "--form-factor=mobile --screenEmulation.mobile"} --quiet`;
      execSync(cmd, {
        env: { ...process.env, CHROME_PATH },
        stdio: "pipe",
        timeout: 90000,
      });

      const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));
      const perf = Math.round((report.categories.performance?.score ?? 0) * 100);
      const a11y = Math.round((report.categories.accessibility?.score ?? 0) * 100);
      const bp = Math.round((report.categories["best-practices"]?.score ?? 0) * 100);
      const seo = Math.round((report.categories.seo?.score ?? 0) * 100);

      results.push({
        page: p.name,
        path: p.path,
        preset,
        perf,
        a11y,
        bp,
        seo,
      });

      console.log(`Perf: ${perf} | A11y: ${a11y} | BestPractice: ${bp} | SEO: ${seo}`);
    } catch (err) {
      console.log(`FAILED: ${err.message?.slice(0, 100)}`);
      results.push({
        page: p.name,
        path: p.path,
        preset,
        error: err.message,
      });
    }
  }
}

console.log("\n======================================================");
console.log("                SUMMARY SCORE MATRIX                  ");
console.log("======================================================");
console.table(
  results.map((r) => ({
    Page: r.page,
    Device: r.preset,
    "Perf %": r.perf ?? "N/A",
    "A11y %": r.a11y ?? "N/A",
    "BestPractice %": r.bp ?? "N/A",
    "SEO %": r.seo ?? "N/A",
  }))
);

const allPassedBP = results.every((r) => (r.bp ?? 0) >= 90);
const allPassedA11y = results.every((r) => (r.a11y ?? 0) >= 90);
const allPassedSEO = results.every((r) => (r.seo ?? 0) >= 90);

console.log(`\n✔ Best Practices Quality: ${allPassedBP ? "100% MET" : "ATTENTION"}`);
console.log(`✔ Accessibility Quality:   ${allPassedA11y ? "100% MET" : "ATTENTION"}`);
console.log(`✔ SEO Standards:           ${allPassedSEO ? "100% MET" : "ATTENTION"}`);
