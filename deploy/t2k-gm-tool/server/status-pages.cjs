const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const http = require("node:http");

const ROOT = join(__dirname, "..");
const FILES = new Map([
  ["/project-status.html", ["project-status.html", "text/html; charset=utf-8"]],
  ["/project-features.html", ["project-features.html", "text/html; charset=utf-8"]],
  ["/gmpack/plan-b.html", ["gmpack/plan-b.html", "text/html; charset=utf-8"]],
  ["/ROADMAP.md", ["metadata/ROADMAP.md", "text/markdown; charset=utf-8"]],
  ["/FEATURES.md", ["metadata/FEATURES.md", "text/markdown; charset=utf-8"]]
]);

function send(response, status, contentType, body, headOnly = false) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; frame-ancestors 'none'"
  });
  response.end(headOnly ? undefined : body);
}

function createStatusHandler({ root = ROOT } = {}) {
  return (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return send(response, 405, "text/plain; charset=utf-8", "Method not allowed.");
    }
    let pathname;
    try {
      pathname = new URL(request.url, "http://127.0.0.1").pathname;
    } catch {
      return send(response, 400, "text/plain; charset=utf-8", "Invalid request URL.", request.method === "HEAD");
    }
    if (pathname === "/") {
      response.writeHead(302, { Location: "/project-status.html", "Cache-Control": "no-store" });
      return response.end();
    }
    const file = FILES.get(pathname);
    if (!file) return send(response, 404, "text/plain; charset=utf-8", "Not found.", request.method === "HEAD");
    try {
      return send(response, 200, file[1], readFileSync(join(root, file[0])), request.method === "HEAD");
    } catch {
      return send(response, 404, "text/plain; charset=utf-8", "Not found.", request.method === "HEAD");
    }
  };
}

function startStatusServer(port = Number(process.env.FIELDBOOK_STATUS_PORT || 8091)) {
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error("FIELDBOOK_STATUS_PORT must be an integer between 0 and 65535.");
  const server = http.createServer(createStatusHandler());
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write(`Fieldbook status pages at http://127.0.0.1:${server.address().port}/project-status.html\n`);
  });
  return server;
}

if (require.main === module) {
  try {
    startStatusServer();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { createStatusHandler, startStatusServer };
