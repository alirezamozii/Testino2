import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

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
      }
    }

    const body = await readFile(file);
    const ext = path.extname(file).toLowerCase();
    const headers = {
      "Content-Type": types[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    };
    if (ext === ".pdf") {
      headers["Content-Disposition"] = "inline";
    }

    if (!res.headersSent) {
      res.writeHead(200, headers);
      res.end(body);
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
