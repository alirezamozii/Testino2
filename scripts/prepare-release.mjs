import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const rootDir = path.resolve(".");
const releaseDir = path.join(rootDir, "release");
const stagingDir = path.join(rootDir, ".release-staging");

function run(command, args) {
  const result = spawnSync(command, args, { cwd: rootDir, stdio: "inherit", shell: process.platform === "win32" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function requireFile(filePath, label) {
  if (!existsSync(filePath)) {
    throw new Error(`${label} ساخته نشد: ${filePath}`);
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

console.log("\n==========================================");
console.log("   آماده سازی یکپارچه Release تستینو");
console.log("==========================================\n");

// This is deliberately the only build invocation: it increments the version and build number once.
// SKIP_WEB_BUILD is used only to resume a locally interrupted packaging run.
if (process.env.SKIP_WEB_BUILD !== "true") {
  run("npm", ["run", "build:web"]);
}
run("npx", ["cap", "sync", "android"]);
run(process.execPath, ["scripts/build-android.mjs"]);
run(process.execPath, ["scripts/package-desktop.mjs"]);

const versionPath = path.join(rootDir, "public", "version.json");
const versionInfo = JSON.parse(readFileSync(versionPath, "utf8"));
const apkPath = path.join(rootDir, "android", "app", "build", "outputs", "apk", "debug", "app-debug.apk");
const windowsPath = path.join(rootDir, "dist", "Testino-Windows-x64.zip");
const webPath = path.join(rootDir, "out");
requireFile(apkPath, "APK اندروید");
requireFile(windowsPath, "بسته ویندوز");
requireFile(webPath, "خروجی وب");

const apkMetadata = JSON.parse(readFileSync(path.join(path.dirname(apkPath), "output-metadata.json"), "utf8"));
const apkVersion = apkMetadata.elements?.[0];
if (apkVersion?.versionCode !== versionInfo.build || apkVersion?.versionName !== versionInfo.version) {
  throw new Error("نسخه APK با version.json یکسان نیست؛ Release ساخته نشد.");
}

rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(stagingDir, { recursive: true });
cpSync(apkPath, path.join(stagingDir, "app-debug.apk"));
cpSync(windowsPath, path.join(stagingDir, "Testino-Windows-x64.zip"));
cpSync(versionPath, path.join(stagingDir, "version.json"));
cpSync(webPath, path.join(stagingDir, "web"), { recursive: true });

const releaseFiles = ["app-debug.apk", "Testino-Windows-x64.zip", "version.json"];
const checksums = releaseFiles
  .map((file) => `${sha256(path.join(stagingDir, file))}  ${file}`)
  .join("\n");
writeFileSync(path.join(stagingDir, "SHA256SUMS.txt"), `${checksums}\n`, "utf8");

// Replace only the dedicated generated release directory, and only after every artifact validates.
rmSync(releaseDir, { recursive: true, force: true });
renameSync(stagingDir, releaseDir);

console.log(`\n🎉 Release آماده است: v${versionInfo.version} (Build ${versionInfo.build})`);
console.log(`📁 ${releaseDir}`);
console.log("📦 فایل های آماده انتشار: app-debug.apk، Testino-Windows-x64.zip، version.json");
