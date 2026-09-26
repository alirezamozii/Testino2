import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const rootDir = path.resolve(".");
const pkgPath = path.join(rootDir, "package.json");
const publicVersionPath = path.join(rootDir, "public", "version.json");
const configVersionPath = path.join(rootDir, "src", "config", "version.ts");
const gradlePath = path.join(rootDir, "android", "app", "build.gradle");

// Read package.json
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
let [major, minor, patch] = pkg.version.split(".").map(Number);

const isPatchBump = !process.argv.includes("--no-patch");
const isMinorBump = process.argv.includes("--minor");
const isNoBump = process.argv.includes("--no-bump") || process.env.NO_BUMP === "true";

if (!isNoBump && isMinorBump) {
  minor += 1;
  patch = 0;
} else if (!isNoBump && isPatchBump) {
  patch += 1;
}

const newVersion = `${major}.${minor}.${patch}`;
pkg.version = newVersion;

// Read existing build number from public/version.json if present
let currentBuild = 1;
if (fs.existsSync(publicVersionPath)) {
  try {
    const existing = JSON.parse(fs.readFileSync(publicVersionPath, "utf8"));
    if (typeof existing.build === "number") {
      currentBuild = isNoBump ? existing.build : existing.build + 1;
    }
  } catch {}
}

const today = new Date().toISOString().split("T")[0];

function getChangelog() {
  const customMessage = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
  if (customMessage && customMessage.trim().length > 0) {
    return [customMessage.trim()];
  }
  try {
    const rawCommits = execSync('git log -n 6 --pretty=format:"%s"', { encoding: "utf8", cwd: rootDir });
    const lines = rawCommits
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s && !s.startsWith("release:") && !s.startsWith("Merge ") && !s.startsWith("chore("));
    if (lines.length > 0) {
      return Array.from(new Set(lines)).slice(0, 4);
    }
  } catch {}
  return [
    "رفع تداخل لایه‌بندی و انتقال پنجره گزارش عیب‌یابی به ریشه صفحه با کپی آسان",
    "بهینه‌سازی بسته‌های همگام‌سازی ابری به ۷۰۰KB و کاهش ۸۵٪ درخواست‌های پس‌زمینه",
    "رفع خطای سروری InvalidMutationBatch و تثبیت حذف قطعی سوابق آزمون",
    "اصلاح آمار عملکرد دروس بر اساس آخرین وضعیت تسلط و بهبود چیدمان موبایل"
  ];
}

const versionData = {
  version: newVersion,
  build: currentBuild,
  releaseDate: today,
  changelog: getChangelog(),
  downloadUrls: {
    windows: "https://github.com/alirezamozii/Testino2/releases/latest/download/Testino-Setup-x64.exe",
    android: "https://github.com/alirezamozii/Testino2/releases/latest/download/Testino-Android.apk",
    web: "https://github.com/alirezamozii/Testino2"
  }
};

// 1. Write public/version.json
fs.writeFileSync(publicVersionPath, JSON.stringify(versionData, null, 2), "utf8");

// 2. Update package.json
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

// 3. Update src/config/version.ts
const versionTsContent = `export interface AppVersionInfo {
  version: string;
  build: number;
  releaseDate: string;
  changelog?: string[];
  downloadUrls?: {
    windows?: string;
    android?: string;
    web?: string;
  };
}

export const APP_VERSION = "${newVersion}";
export const APP_BUILD = ${currentBuild};
export const APP_RELEASE_DATE = "${today}";

/**
 * Returns:
 *  1 if v1 > v2
 * -1 if v1 < v2
 *  0 if v1 == v2
 */
export function compareVersions(v1: string, v2: string): number {
  const clean1 = v1.replace(/^v/, "").trim();
  const clean2 = v2.replace(/^v/, "").trim();

  const parts1 = clean1.split(".").map((n) => parseInt(n, 10) || 0);
  const parts2 = clean2.split(".").map((n) => parseInt(n, 10) || 0);

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = parts1[i] ?? 0;
    const num2 = parts2[i] ?? 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }

  return 0;
}
`;
fs.writeFileSync(configVersionPath, versionTsContent, "utf8");

// 4. Update android/app/build.gradle if present
if (fs.existsSync(gradlePath)) {
  let gradleContent = fs.readFileSync(gradlePath, "utf8");
  gradleContent = gradleContent.replace(/versionCode\s+\d+/, `versionCode ${currentBuild}`);
  gradleContent = gradleContent.replace(/versionName\s+"[^"]+"/, `versionName "${newVersion}"`);
  fs.writeFileSync(gradlePath, gradleContent, "utf8");
}

console.log(`🚀 نسخه برنامه با موفقیت همگام شد: v${newVersion} (Build ${currentBuild})`);
