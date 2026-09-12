import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

console.log("==========================================");
console.log("   ساخت بسته ویندوز دسکتاپ تستیونو");
console.log("==========================================\n");

const rootDir = path.resolve(".");
const distDir = path.join(rootDir, "dist");
const outputAppDir = path.join(distDir, "Testino-win-x64");
const electronDist = path.join(rootDir, "node_modules", "electron", "dist");

if (!fs.existsSync(path.join(electronDist, "electron.exe"))) {
  console.error("❌ باینری Electron در node_modules/electron/dist یافت نشد.");
  process.exit(1);
}

if (!fs.existsSync(path.join(rootDir, "out", "index.html"))) {
  console.log("📦 در حال اجرای بیلد استاتیک Next.js...");
  execSync("npm run build", { stdio: "inherit" });
}

console.log("1️⃣ آماده‌سازی پوشه خروجی...");
if (fs.existsSync(outputAppDir)) {
  fs.rmSync(outputAppDir, { recursive: true, force: true });
}
fs.mkdirSync(outputAppDir, { recursive: true });

console.log("2️⃣ کپی هسته اجرایی کرومیوم و الکترون...");
// Copy electron runtime files
fs.cpSync(electronDist, outputAppDir, { recursive: true });

// Rename electron.exe to Testino.exe
const defaultExe = path.join(outputAppDir, "electron.exe");
const targetExe = path.join(outputAppDir, "Testino.exe");
if (fs.existsSync(defaultExe)) {
  fs.renameSync(defaultExe, targetExe);
}

// Inject official icon and metadata into Testino.exe
const rceditExe = path.join(rootDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
const icoPath = path.join(rootDir, "public", "app-icon.ico");
if (fs.existsSync(rceditExe) && fs.existsSync(icoPath)) {
  console.log("🎨 تزریق آیکون رسمی و مشخصات برنامه به فایل Testino.exe...");
  try {
    execSync(`"${rceditExe}" "${targetExe}" --set-icon "${icoPath}" --set-version-string "FileDescription" "تستینو" --set-version-string "ProductName" "تستینو" --set-version-string "CompanyName" "Testino"`, { stdio: "ignore" });
    console.log("✅ آیکون و برندینگ فایل اجرایی Testino.exe با موفقیت تنظیم شد.");
  } catch (err) {
    console.warn("⚠️ خطا در تزریق آیکون به Testino.exe:", err.message);
  }
}

console.log("3️⃣ کپی کدهای برنامه و استیک‌ها در resources/app...");
const appDir = path.join(outputAppDir, "resources", "app");
fs.mkdirSync(appDir, { recursive: true });

// Copy package.json
fs.copyFileSync(path.join(rootDir, "package.json"), path.join(appDir, "package.json"));

// Copy electron scripts
fs.cpSync(path.join(rootDir, "electron"), path.join(appDir, "electron"), { recursive: true });

// Copy static export (out)
fs.cpSync(path.join(rootDir, "out"), path.join(appDir, "out"), { recursive: true });

// Copy public assets
fs.cpSync(path.join(rootDir, "public"), path.join(appDir, "public"), { recursive: true });

console.log("4️⃣ ایجاد فایل فشرده پرتابل Testino-Windows.zip...");
const zipOutput = path.join(distDir, "Testino-Windows-x64.zip");
if (fs.existsSync(zipOutput)) {
  fs.rmSync(zipOutput, { force: true });
}

try {
  // Use pwsh Compress-Archive for reliable zip creation
  execSync(`pwsh -NoProfile -Command "Compress-Archive -Path '${outputAppDir}' -DestinationPath '${zipOutput}' -Force"`, { stdio: "inherit" });
  if (fs.existsSync(zipOutput)) {
    console.log(`📦 فایل زیپ پرتابل آماده شد: ${zipOutput}`);
  }
} catch (e) {
  console.warn("ایجاد فایل فشرده با خطا مواجه شد، اما پوشه اجرایی آماده است:", e.message);
}

console.log("\n🎉 بیلد نسخه ویندوز دسکتاپ با موفقیت کامل انجام شد!");
console.log(`📁 پوشه برنامه: ${outputAppDir}`);
console.log(`🚀 فایل اجرایی مستقیم: ${targetExe}\n`);
