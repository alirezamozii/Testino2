import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

const root = path.resolve("out");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf",
};

process.on("uncaughtException", (err) => {
  console.error("Uncaught exception:", err.message);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err);
});

const server = http.createServer(async (req, res) => {
  req.on("error", () => {});
  res.on("error", () => {});

  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    let file = path.resolve(root, "." + pathname);
    if (!file.startsWith(root + path.sep) && file !== root) {
      if (!res.headersSent) {
        res.writeHead(403);
        res.end("Forbidden");
      }
      return;
    }

    try {
      const s = await stat(file);
      if (s.isDirectory()) {
        file = path.join(file, "index.html");
      }
    } catch {
      // If path doesn't exist directly, try adding .html (clean URLs)
      if (!path.extname(file)) {
        try {
          const withHtml = file + ".html";
          await stat(withHtml);
          file = withHtml;
        } catch {
          // not found
        }
      } else if (file.includes("__next.") && file.endsWith(".txt")) {
        // Next.js RSC payload fallback: try checking nested folder or index.txt
        try {
          const dir = path.dirname(file);
          const name = path.basename(file);
          const converted = path.join(dir, name.replace(/__next\.([^.]+)\.([^.]+)\.__PAGE__\.txt/, "__next.$1/$2/__PAGE__.txt"));
          await stat(converted);
          file = converted;
        } catch {
          try {
            const indexTxt = path.join(path.dirname(file), "index.txt");
            await stat(indexTxt);
            file = indexTxt;
          } catch {
            // ignore
          }
        }
      }
    }

    const body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    const isImmutable = pathname.startsWith("/_next/static/") || ext === ".wasm" || ext === ".woff2";
    const headers = {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": isImmutable
        ? "public, max-age=31536000, immutable"
        : ext === ".html"
        ? "no-cache"
        : "public, max-age=86400",
    };
    if (ext === ".pdf") {
      headers["Content-Disposition"] = "inline";
    }

    let responseBody = body;
    const acceptEncoding = req.headers["accept-encoding"] || "";
    const isCompressible = [".html", ".js", ".css", ".json", ".wasm", ".svg"].includes(ext);
    if (isCompressible && acceptEncoding.includes("gzip") && body.length > 512) {
      headers["Content-Encoding"] = "gzip";
      responseBody = gzipSync(body);
    }

    if (!res.headersSent) {
      res.writeHead(200, headers);
      res.end(responseBody);
    }
  } catch {
    if (!res.headersSent) {
      res.writeHead(404);
      res.end("Not found");
    }
  }
});

server.on("error", (err) => {
  console.error("Server error:", err.message);
});

const port = Number(process.env.PORT || 3000);
server.listen(port, "0.0.0.0", () => {
  console.log(`Testino: http://0.0.0.0:${port}`);
});
