import http from "node:http";
import next from "next";

const hostname = "127.0.0.1";
const port = Number(process.env.PORT || 3100);
const app = next({ dev: true, hostname, port });
const handler = app.getRequestHandler();

await app.prepare();
http.createServer((request, response) => {
  response.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  response.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  handler(request, response);
}).listen(port, hostname, () => console.log(`Testino: http://${hostname}:${port}`));
