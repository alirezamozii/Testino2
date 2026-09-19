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

// 0. Ensure Electron Windows binary exists
if (!fs.existsSync(path.join(electronDist, "electron.exe"))) {
  console.log("📥 در حال دریافت باینری‌های رسمی Electron برای ویندوز...");
  try {
    const versionFile = path.join(electronDist, "version");
    if (fs.existsSync(versionFile)) {
      fs.unlinkSync(versionFile);
    }
    execSync("node node_modules/electron/install.js", {
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_INSTALL_PLATFORM: "win32",
        ELECTRON_INSTALL_ARCH: "x64",
        force_no_cache: "true"
      }
    });
  } catch (err) {
    console.warn("تلاش برای دریافت باینری الکترون ویندوز:", err.message);
  }
}

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
  try {
    fs.rmSync(outputAppDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
  } catch {
    const entries = fs.readdirSync(outputAppDir);
    for (const entry of entries) {
      try {
        fs.rmSync(path.join(outputAppDir, entry), { recursive: true, force: true });
      } catch {
        // ignore locked files
      }
    }
  }
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

// Remove default_app.asar so Electron loads resources/app directly
const defaultAppAsar = path.join(outputAppDir, "resources", "default_app.asar");
if (fs.existsSync(defaultAppAsar)) {
  fs.unlinkSync(defaultAppAsar);
}

// Inject official icon and metadata into Testino.exe
const rceditExe = path.join(rootDir, "node_modules", "electron-winstaller", "vendor", "rcedit.exe");
const icoPath = path.join(rootDir, "public", "app-icon.ico");
if (fs.existsSync(rceditExe) && fs.existsSync(icoPath)) {
  console.log("🎨 تزریق آیکون رسمی و مشخصات برنامه به فایل Testino.exe...");
  try {
    execSync(`"${rceditExe}" "${targetExe}" --set-icon "${icoPath}" --set-version-string "FileDescription" "تستیونو" --set-version-string "ProductName" "تستیونو" --set-version-string "CompanyName" "Testino"`, { stdio: "ignore" });
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

console.log("4️⃣ ایجاد فایل فشرده پرتابل Testino-Windows-x64.zip...");
const zipOutput = path.join(distDir, "Testino-Windows-x64.zip");
if (fs.existsSync(zipOutput)) {
  fs.rmSync(zipOutput, { force: true });
}

let zipped = false;

// Strategy A: PowerShell (Default on Windows CI runners)
if (!zipped) {
  try {
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${outputAppDir}' -DestinationPath '${zipOutput}' -Force"`, { stdio: "ignore" });
    if (fs.existsSync(zipOutput) && fs.statSync(zipOutput).size > 1000000) {
      zipped = true;
      console.log(`📦 فایل زیپ پرتابل با PowerShell آماده شد: ${zipOutput}`);
    }
  } catch {
    // try next strategy
  }
}

// Strategy B: tar (Built-in on Windows 10/11 & Linux)
if (!zipped) {
  try {
    execSync(`tar -a -c -f "${zipOutput}" -C "${distDir}" "Testino-win-x64"`, { stdio: "ignore" });
    if (fs.existsSync(zipOutput) && fs.statSync(zipOutput).size > 1000000) {
      zipped = true;
      console.log(`📦 فایل زیپ پرتابل با tar آماده شد: ${zipOutput}`);
    }
  } catch {
    // try next strategy
  }
}

// Strategy C: PowerShell Core (pwsh)
if (!zipped) {
  try {
    execSync(`pwsh -NoProfile -Command "Compress-Archive -Path '${outputAppDir}' -DestinationPath '${zipOutput}' -Force"`, { stdio: "ignore" });
    if (fs.existsSync(zipOutput) && fs.statSync(zipOutput).size > 1000000) {
      zipped = true;
      console.log(`📦 فایل زیپ پرتابل با pwsh آماده شد: ${zipOutput}`);
    }
  } catch {
    // try next strategy
  }
}

if (!zipped) {
  console.warn("⚠️ ایجاد فایل فشرده با موفقیت انجام نشد، اما پوشه اجرایی Testino-win-x64 آماده است.");
}

console.log("5️⃣ ساخت فایل نصبی حرفه‌ای ویندوز (NSIS Installer)...");
try {
  execSync("npx electron-builder --win nsis --x64", { stdio: "inherit" });
  const setupExe = path.join(distDir, "Testino-Setup-x64.exe");
  if (fs.existsSync(setupExe)) {
    console.log(`📦 فایل نصبی Installer آماده شد: ${setupExe}`);
  }
} catch (e) {
  console.warn("⚠️ ساخت فایل نصبی با electron-builder انجام نشد (بسته پرتابل آماده است):", e.message);
}

console.log("\n🎉 بیلد نسخه ویندوز دسکتاپ با موفقیت کامل انجام شد!");
console.log(`📁 پوشه برنامه: ${outputAppDir}`);
console.log(`🚀 فایل اجرایی مستقیم: ${targetExe}\n`);

const desktopTarget = "C:\\Users\\Mozart\\Desktop\\Testino-win-x64";
try {
  if (fs.existsSync("C:\\Users\\Mozart\\Desktop")) {
    console.log(`📋 در حال همگام‌سازی با پوشه دسکتاپ کاربر: ${desktopTarget}...`);
    fs.cpSync(outputAppDir, desktopTarget, { recursive: true });
    console.log(`✅ نسخه اجرایی در دسکتاپ کاربر نیز به‌روزرسانی شد.`);
  }
} catch (err) {
  console.warn("⚠️ کپی به دسکتاپ ویندوز:", err.message);
}

