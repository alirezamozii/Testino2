/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");

exports.default = async function (context) {
  // 1. Purge LICENSES.chromium.html (20.5 MB)
  const licensePath = path.join(context.appOutDir, "LICENSES.chromium.html");
  if (fs.existsSync(licensePath)) {
    try {
      fs.unlinkSync(licensePath);
      console.log("🗑️ فایل غیرضروری LICENSES.chromium.html (۲۰.۵ مگابایت) از پکیج نصبی حذف شد.");
    } catch {}
  }

  // 2. Purge unused locales (saving ~46 MB) - keep only fa.pak, en-US.pak, and en-GB.pak
  const localesDir = path.join(context.appOutDir, "locales");
  if (fs.existsSync(localesDir)) {
    const kept = new Set(["fa.pak", "en-US.pak", "en-GB.pak"]);
    const files = fs.readdirSync(localesDir);
    let pruned = 0;
    for (const f of files) {
      if (!kept.has(f) && f.endsWith(".pak")) {
        try {
          fs.unlinkSync(path.join(localesDir, f));
          pruned++;
        } catch {}
      }
    }
    if (pruned > 0) {
      console.log(`🌍 پاکسازی ${pruned} زبان غیرضروری از پکیج نصبی (صرفه‌جویی ۴۶ مگابایت).`);
    }
  }
};
