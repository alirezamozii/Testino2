import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("out");
const assets = [];

async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name === "bank_pdfs") continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      await walk(absolute);
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if ([".map", ".pdf", ".csv", ".txt"].includes(ext) || entry.name === "sw.js") {
        continue;
      }
      assets.push("/" + path.relative(root, absolute).replaceAll(path.sep, "/"));
    }
  }
}

await walk(root);
assets.sort();
const template = await readFile("scripts/sw-template.js", "utf8");
await writeFile(path.join(root, "sw.js"), template.replace("__PRECACHE__", JSON.stringify(assets)));
