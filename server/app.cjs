const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { getAccountHomePath, getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createCampaignHandler } = require("./campaigns.cjs");
const { createPlayerHandler } = require("./player.cjs");
const { createUserHandler } = require("./users.cjs");

const ROOT = join(__dirname, "..");
const PUBLIC_FILES = new Map([
  ["/login.html", ["login.html", "text/html; charset=utf-8"]],
  ["/login.css", ["login.css", "text/css; charset=utf-8"]],
  ["/login.js", ["login.js", "text/javascript; charset=utf-8"]]
]);
const PROTECTED_FILES = new Map([
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/campaign-setup.html", ["campaign-setup.html", "text/html; charset=utf-8"]],
  ["/project-status.html", ["project-status.html", "text/html; charset=utf-8"]],
  ["/project-features.html", ["project-features.html", "text/html; charset=utf-8"]],
  ["/player-interface.html", ["player-interface.html", "text/html; charset=utf-8"]],
  ["/player-interface-concepts.html", ["player-interface-concepts.html", "text/html; charset=utf-8"]],
  ["/ROADMAP.md", ["ROADMAP.md", "text/markdown; charset=utf-8"]],
  ["/FEATURES.md", ["FEATURES.md", "text/markdown; charset=utf-8"]],
  ["/campaign-package-contract.js", ["campaign-package-contract.js", "text/javascript; charset=utf-8"]],
  ["/auth-client.js", ["auth-client.js", "text/javascript; charset=utf-8"]],
  ["/player-seed-client.js", ["player-seed-client.js", "text/javascript; charset=utf-8"]],
  ["/situation-report-client.js", ["situation-report-client.js", "text/javascript; charset=utf-8"]],
  ["/map-publication-client.js", ["map-publication-client.js", "text/javascript; charset=utf-8"]]
]);
const AUTH_PATHS = new Set([
  "/api/auth/status",
  "/api/auth/activate",
  "/api/auth/bootstrap",
  "/api/auth/login",
  "/api/auth/session",
  "/api/auth/logout"
]);
const CAMPAIGN_PATH = /^\/api\/campaigns(?:\/|$)/;
const PLAYER_API_PATH = /^\/api\/player(?:\/|$)/;
const USER_API_PATH = /^\/api\/users(?:\/|$)/;

function sendText(response, status, contentType, body, headOnly = false) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self' https://unpkg.com; script-src 'self' 'unsafe-inline' https://unpkg.com; style-src 'self' 'unsafe-inline' https://unpkg.com; img-src 'self' data: blob: https:; connect-src 'self' https://unpkg.com https://nominatim.openstreetmap.org; font-src 'self' data: https://unpkg.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  response.end(headOnly ? undefined : body);
}

function createAppHandler({ database, authHandler, campaignHandler = createCampaignHandler({ database }), playerHandler = createPlayerHandler({ database }), userHandler = createUserHandler({ database }), root = ROOT }) {
  return async (request, response) => {
    const url = new URL(request.url, "http://fieldbook.invalid");
    if (AUTH_PATHS.has(url.pathname)) return authHandler(request, response);
    if (CAMPAIGN_PATH.test(url.pathname)) return campaignHandler(request, response);
    if (PLAYER_API_PATH.test(url.pathname)) return playerHandler(request, response);
    if (USER_API_PATH.test(url.pathname)) return userHandler(request, response);

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendText(response, 405, "application/json; charset=utf-8", JSON.stringify({ error: "Method not allowed." }));
    }
    const headOnly = request.method === "HEAD";
    const cookieToken = parseCookies(request.headers.cookie)["fieldbook_session"];
    const account = getAuthenticatedAccount(database, cookieToken);
    const homePath = account ? getAccountHomePath(database, account.id) : "/index.html";

    if (url.pathname === "/" || url.pathname === "/login") {
      const location = account ? homePath : "/login.html";
      response.writeHead(302, { Location: location, "Cache-Control": "no-store" });
      return response.end();
    }
    if (url.pathname === "/login.html" && account) {
      response.writeHead(302, { Location: homePath, "Cache-Control": "no-store" });
      return response.end();
    }

    const publicFile = PUBLIC_FILES.get(url.pathname);
    if (publicFile) {
      try {
        return sendText(response, 200, publicFile[1], readFileSync(join(root, publicFile[0])), headOnly);
      } catch {
        return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
      }
    }

    const protectedFile = PROTECTED_FILES.get(url.pathname);
    if (!protectedFile) return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
    if (!account) {
      const next = encodeURIComponent(url.pathname);
      response.writeHead(302, { Location: `/login.html?next=${next}`, "Cache-Control": "no-store" });
      return response.end();
    }
      if (url.pathname === "/player-interface.html" && account.role !== "player") {
      response.writeHead(302, { Location: "/index.html", "Cache-Control": "no-store" });
      return response.end();
    }
      if (["/index.html", "/campaign-setup.html"].includes(url.pathname) && account.role !== "gm") {
      response.writeHead(302, { Location: "/player-interface.html", "Cache-Control": "no-store" });
      return response.end();
    }
    try {
      return sendText(response, 200, protectedFile[1], readFileSync(join(root, protectedFile[0])), headOnly);
    } catch {
      return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
    }
  };
}

module.exports = { createAppHandler };