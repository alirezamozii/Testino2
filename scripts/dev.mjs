import http from "node:http";
import next from "next";

const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3000);
const app = next({ dev: true, hostname, port, webpack: true, turbopack: false });
const handler = app.getRequestHandler();

await app.prepare();
http.createServer((request, response) => {
  handler(request, response);
}).listen(port, hostname, () => console.log(`Testino: http://${hostname}:${port}`));
