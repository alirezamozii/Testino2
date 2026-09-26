import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const rootDir = path.resolve(".");

function run(command, args = [], options = {}) {
  console.log(`\n==========================================`);
  console.log(`▶ اجرای دستور: ${command} ${args.join(" ")}`);
  console.log(`==========================================\n`);
  const res = spawnSync(command, args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: process.platform === "win32",
    ...options,
  });
  if (res.status !== 0 && !options.ignoreError) {
    console.error(`\n❌ خطا در مرحله: ${command} ${args.join(" ")}`);
    process.exit(res.status ?? 1);
  }
  return res;
}

// 1. Parse arguments (commit message, flags)
const rawArgs = process.argv.slice(2);
const customMessage = rawArgs.find((a) => !a.startsWith("--")) || "";
const isMinor = rawArgs.includes("--minor");
const isNoBump = rawArgs.includes("--no-bump");

console.log("\n🚀 شروع خط لولهٔ خودکار و یکپارچه ساخت، ارتقای نسخه و انتشار تستینو (Testino Ship)");

// 2. Increment Version & Build (automatically updates version.json, package.json, version.ts, build.gradle)
const bumpArgs = ["scripts/bump-version.mjs"];
if (isMinor) bumpArgs.push("--minor");
if (isNoBump) bumpArgs.push("--no-bump");
if (customMessage) bumpArgs.push(customMessage);

run(process.execPath, bumpArgs);

// Read updated version info
const versionPath = path.join(rootDir, "public", "version.json");
const versionInfo = JSON.parse(fs.readFileSync(versionPath, "utf8"));
console.log(`\n📌 نسخه جدید هدف: v${versionInfo.version} (Build ${versionInfo.build})`);

// 3. Build Web Bundle
run("npm", ["run", "build:web"]);

// 4. Sync Android Capacitor
run("npx", ["cap", "sync", "android"]);

// 5. Build Android APK
run(process.execPath, ["scripts/build-android.mjs"]);

// 6. Build Windows Desktop (strictly inside dist/)
run(process.execPath, ["scripts/package-desktop.mjs"]);

// 7. Stage, Commit & Push to GitHub
console.log("\n📦 ثبت تغییرات و ارسال خودکار به گیت‌هاب...");
run("git", ["add", "."]);

const statusRes = spawnSync("git", ["status", "--porcelain"], { cwd: rootDir, encoding: "utf8" });
const hasChanges = statusRes.stdout && statusRes.stdout.trim().length > 0;

if (hasChanges) {
  const commitMsg = customMessage
    ? `release: v${versionInfo.version} (Build ${versionInfo.build}) - ${customMessage}`
    : `release: v${versionInfo.version} (Build ${versionInfo.build})`;

  // Safe commit using temporary file to avoid shell argument escaping issues with Persian text and special characters
  const commitMsgPath = path.join(rootDir, ".git", "SHIP_COMMIT_MSG");
  fs.writeFileSync(commitMsgPath, commitMsg, "utf8");
  try {
    run("git", ["commit", "-F", commitMsgPath]);
  } finally {
    try {
      if (fs.existsSync(commitMsgPath)) fs.unlinkSync(commitMsgPath);
    } catch {}
  }
} else {
  console.log("تغییرات جدیدی برای کامیت وجود نداشت.");
}

// Push to GitHub repository
run("git", ["push", "testino2", "main"]);

console.log(`\n🎉 عملیات با موفقیت ۱۰۰٪ به پایان رسید!`);
console.log(`=======================================================`);
console.log(`✅ نسخه منتشرشده: v${versionInfo.version} (Build ${versionInfo.build})`);
console.log(`📱 فایل APK اندروید: android/app/build/outputs/apk/debug/app-debug.apk`);
console.log(`💻 فایل نصبی دسکتاپ: dist/Testino-Setup-x64.exe`);
console.log(`📦 فایل فشرده پرتابل: dist/Testino-Windows-x64.zip`);
console.log(`🌐 شاخه گیت‌هاب: testino2/main به‌روزرسانی شد`);
console.log(`📲 اکنون گوشی‌های همراه شما به محض باز شدن پاپ‌آپ نسخه جدید را دریافت خواهند کرد.`);
console.log(`=======================================================\n`);
