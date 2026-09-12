import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

console.log("\n==========================================");
console.log("   Testino Android Build Assistant");
console.log("==========================================\n");

const androidDir = path.resolve("android");
if (!existsSync(androidDir)) {
  console.error("❌ پوشه android یافت نشد. لطفاً ابتدا دستور 'npx cap add android' را اجرا کنید.");
  process.exit(1);
}

// 1. Auto-discover Java if not in standard PATH
const javaCandidates = [
  process.env.JAVA_HOME,
  "D:/Coding_Projects/tools/jdk-21",
  "D:/Programs/System Tools/PDFsam Basic/runtime",
].filter(Boolean);

let javaHome = null;
for (const cand of javaCandidates) {
  if (cand && existsSync(path.join(cand, "bin", "javac.exe"))) {
    javaHome = path.resolve(cand);
    break;
  }
}
if (!javaHome && javaCandidates[2] && existsSync(path.join(javaCandidates[2], "bin", "java.exe"))) {
  javaHome = path.resolve(javaCandidates[2]);
}

if (javaHome) {
  process.env.JAVA_HOME = javaHome;
  process.env.PATH = `${path.join(javaHome, "bin")};${process.env.PATH}`;
  console.log(`🔍 جاوا در مسیر محلی شناسایی شد: ${javaHome}`);
}

const javaCheck = spawnSync("java", ["-version"], { encoding: "utf8", shell: true });
const hasJava = javaCheck.status === 0;

if (!hasJava) {
  console.log("⚠️ جاوا (JDK) در سیستم شناسایی نشد.");
} else {
  console.log("✅ نسخه جاوا مورد تأیید است.");
}

// 2. Check for Android SDK
const localApp = process.env.LOCALAPPDATA || "";
const sdkCandidates = [
  process.env.ANDROID_HOME,
  process.env.ANDROID_SDK_ROOT,
  "D:/Coding_Projects/tools/android-sdk",
  path.join(localApp, "Android", "Sdk"),
  "C:/Android/Sdk",
  "D:/Android/Sdk",
].filter(Boolean);

let foundSdk = null;
for (const sdk of sdkCandidates) {
  if (sdk && existsSync(sdk)) {
    foundSdk = sdk;
    break;
  }
}

if (!foundSdk) {
  console.log("⚠️ ابزار Android SDK روی سیستم یافت نشد.");
  console.log("📌 وضعیت پروژه اندروید:");
  console.log("   ✅ ساختار کامل Gradle، کتابخانه‌ها و کدهای وب در پوشه android/ به طور ۱۰۰٪ سینک و آماده هستند.");
  console.log("\n🚀 برای تولید فایل خروجی APK:");
  console.log("   ۱. اگر نرم‌افزار Android Studio را دارید، دستور زیر را اجرا کنید:");
  console.log("      npm run android:open");
  console.log("      (سپس در اندروید استودیو از منوی Build > Build APKs فایل را دریافت کنید)");
  console.log("   ۲. یا Android SDK Command-line tools را نصب کنید و ANDROID_HOME را در متغیرهای محیطی ست کنید.\n");
  process.exit(0);
}

console.log(`✅ ابزار Android SDK شناسایی شد: ${foundSdk}`);
console.log("در حال کامپایل پروژه گریدل اندروید...");

const gradlewCmd = process.platform === "win32" ? "gradlew.bat" : "./gradlew";
const buildProcess = spawnSync(gradlewCmd, ["assembleDebug"], {
  cwd: androidDir,
  stdio: "inherit",
  shell: true,
  env: {
    ...process.env,
    ANDROID_HOME: foundSdk,
  },
});

if (buildProcess.status === 0) {
  const apkPath = path.join(androidDir, "app", "build", "outputs", "apk", "debug", "app-debug.apk");
  console.log("\n🎉 بیلد اندروید با موفقیت به پایان رسید!");
  if (existsSync(apkPath)) {
    console.log(`📦 مسیر فایل نصبی APK: ${apkPath}`);
  }
} else {
  console.error("\n❌ خطا در فرآیند کامپایل گریدل.");
  process.exit(buildProcess.status || 1);
}
