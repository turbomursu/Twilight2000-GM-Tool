const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");
const { getAccountHomePath, getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createCampaignHandler } = require("./campaigns.cjs");
const { createPlayerHandler } = require("./player.cjs");
const { createUserHandler } = require("./users.cjs");
const { uploadOfflineBasemap, getOfflineBasemapMetadata, sendOfflineBasemap, ASSET_ID_PATTERN } = require("./offline-basemaps.cjs");
const { getPlayerMap } = require("./map-publications.cjs");

const ROOT = join(__dirname, "..");
const PUBLIC_FILES = new Map([
  ["/login.html", ["login.html", "text/html; charset=utf-8"]],
  ["/login.css", ["login.css", "text/css; charset=utf-8"]],
  ["/login.js", ["login.js", "text/javascript; charset=utf-8"]]
]);
const PROTECTED_FILES = new Map([
  ["/index.html", ["index.html", "text/html; charset=utf-8"]],
  ["/campaign-setup.html", ["campaign-setup.html", "text/html; charset=utf-8"]],
  ["/combat.html", ["combat.html", "text/html; charset=utf-8"]],
  ["/player-seeds.html", ["player-seeds.html", "text/html; charset=utf-8"]],
  ["/player-interface.html", ["player-interface.html", "text/html; charset=utf-8"]],
  ["/player-interface-concepts.html", ["player-interface-concepts.html", "text/html; charset=utf-8"]],
  ["/vendor/leaflet.js", ["node_modules/leaflet/dist/leaflet.js", "text/javascript; charset=utf-8"]],
  ["/vendor/leaflet.css", ["node_modules/leaflet/dist/leaflet.css", "text/css; charset=utf-8"]],
  ["/vendor/maplibre-gl.mjs", ["node_modules/maplibre-gl/dist/maplibre-gl.mjs", "text/javascript; charset=utf-8"]],
  ["/vendor/maplibre-gl-shared.mjs", ["node_modules/maplibre-gl/dist/maplibre-gl-shared.mjs", "text/javascript; charset=utf-8"]],
  ["/vendor/maplibre-gl-worker.mjs", ["node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", "text/javascript; charset=utf-8"]],
  ["/vendor/maplibre-gl.css", ["node_modules/maplibre-gl/dist/maplibre-gl.css", "text/css; charset=utf-8"]],
  ["/vendor/leaflet-maplibre-gl.js", ["node_modules/@maplibre/maplibre-gl-leaflet/leaflet-maplibre-gl.js", "text/javascript; charset=utf-8"]],
  ["/vendor/pmtiles.js", ["node_modules/pmtiles/dist/pmtiles.js", "text/javascript; charset=utf-8"]],
  ["/campaign-package-contract.js", ["campaign-package-contract.js", "text/javascript; charset=utf-8"]],
  ["/vector-atlas-client.js", ["vector-atlas-client.js", "text/javascript; charset=utf-8"]],
  ["/auth-client.js", ["auth-client.js", "text/javascript; charset=utf-8"]],
  ["/player-seed-client.js", ["player-seed-client.js", "text/javascript; charset=utf-8"]],
  ["/situation-report-client.js", ["situation-report-client.js", "text/javascript; charset=utf-8"]],
  ["/map-publication-client.js", ["map-publication-client.js", "text/javascript; charset=utf-8"]],
  ["/map-basemap-client.js", ["map-basemap-client.js", "text/javascript; charset=utf-8"]],
  ["/comms-client.js", ["comms-client.js", "text/javascript; charset=utf-8"]],
  ["/inventory-client.js", ["inventory-client.js", "text/javascript; charset=utf-8"]],
  ["/conditions-client.js", ["conditions-client.js", "text/javascript; charset=utf-8"]],
  ["/audit-client.js", ["audit-client.js", "text/javascript; charset=utf-8"]],
  ["/campaign-clock.js", ["campaign-clock.js", "text/javascript; charset=utf-8"]],
  ["/combat-client.js", ["combat-client.js", "text/javascript; charset=utf-8"]],
  ["/weather-rules.js", ["weather-rules.js", "text/javascript; charset=utf-8"]],
  ["/player-seeds.js", ["player-seeds.js", "text/javascript; charset=utf-8"]]
]);
const AUTH_PATHS = new Set([
  "/api/auth/status",
  "/api/auth/bootstrap",
  "/api/auth/login",
  "/api/auth/change-password",
  "/api/auth/session",
  "/api/auth/logout"
]);
const CAMPAIGN_PATH = /^\/api\/campaigns(?:\/|$)/;
const PLAYER_API_PATH = /^\/api\/player(?:\/|$)/;
const USER_API_PATH = /^\/api\/(?:users|player-seeds)(?:\/|$)/;

function sendText(response, status, contentType, body, headOnly = false) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' https://nominatim.openstreetmap.org; font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
  });
  response.end(headOnly ? undefined : body);
}

function createAppHandler({ database, authHandler, campaignHandler, playerHandler = createPlayerHandler({ database }), userHandler = createUserHandler({ database }), root = ROOT, offlineBasemapDir = join(root, "data", "maps", "atlas"), legacyOfflineBasemapDir = join(root, "data", "offline-basemaps"), surfaceRole, otherPort }) {
  const offlineBasemapDirectories = [...new Set([offlineBasemapDir, legacyOfflineBasemapDir])];
  function findOfflineBasemapDirectory(assetId, ownerAccountId = null) {
    return offlineBasemapDirectories.find((directory) => {
      const metadata = getOfflineBasemapMetadata(directory, assetId);
      return metadata && (!ownerAccountId || metadata.ownerAccountId === ownerAccountId);
    }) || null;
  }
  const validateOfflineBasemap = (ownerAccountId, reference) => {
    const directory = findOfflineBasemapDirectory(reference.assetId, ownerAccountId);
    const metadata = directory && getOfflineBasemapMetadata(directory, reference.assetId);
    const file = directory && join(directory, metadata?.format === "static-image" ? `${reference.assetId}.image` : `${reference.assetId}.pmtiles`);
    if (!metadata || metadata.format !== reference.format || !existsSync(file)
      || (reference.format === "static-image" && !/^image\/(?:png|jpeg|webp)$/.test(metadata.contentType || ""))) {
      throw new Error("The offline basemap asset is not owned by this GM or its stored format does not match.");
    }
    return true;
  };
  const effectiveCampaignHandler = campaignHandler || createCampaignHandler({ database, validateOfflineBasemap });
  return async (request, response) => {
    const url = new URL(request.url, "http://fieldbook.invalid");
    if (AUTH_PATHS.has(url.pathname)) return authHandler(request, response);
    const cookieToken = parseCookies(request.headers.cookie)["fieldbook_session"];
    const account = getAuthenticatedAccount(database, cookieToken);
    if (account?.mustChangePassword) {
      if (url.pathname.startsWith("/api/")) {
        return sendText(response, 428, "application/json; charset=utf-8", JSON.stringify({ error: "Change your password before continuing.", mustChangePassword: true }));
      }
      if (request.method === "GET" || request.method === "HEAD") {
        response.writeHead(302, { Location: "/login.html?passwordChange=1", "Cache-Control": "no-store" });
        return response.end();
      }
    }
    if (account && surfaceRole && account.role !== surfaceRole) {
      if (url.pathname.startsWith("/api/")) {
        return sendText(response, 403, "application/json; charset=utf-8", JSON.stringify({ error: `Use the ${account.role === "player" ? "player" : "GM"} server port.` }));
      }
      let destination;
      try {
        const requestOrigin = new URL(`http://${request.headers.host}`);
        const targetPort = typeof otherPort === "function" ? otherPort() : otherPort;
        if (!targetPort) throw new Error();
        destination = new URL(`${url.pathname}${url.search}`, requestOrigin);
        destination.port = String(targetPort);
      } catch {
        return sendText(response, 421, "text/plain; charset=utf-8", "Use the server port assigned to your account.", request.method === "HEAD");
      }
      response.writeHead(302, { Location: destination.href, "Cache-Control": "no-store" });
      return response.end();
    }
    if (CAMPAIGN_PATH.test(url.pathname)) return effectiveCampaignHandler(request, response);
    const playerBasemapMatch = url.pathname.match(/^\/api\/player\/campaigns\/([^/]+)\/map-basemap$/);
    if (playerBasemapMatch) {
      if (!new Set(["GET", "HEAD"]).has(request.method)) return sendText(response, 405, "application/json; charset=utf-8", JSON.stringify({ error: "Method not allowed." }));
      const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
      if (!account) return sendText(response, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Authentication required." }));
      if (account.role !== "player") return sendText(response, 403, "application/json; charset=utf-8", JSON.stringify({ error: "Player account required." }));
      let campaignId;
      try { campaignId = decodeURIComponent(playerBasemapMatch[1]); } catch { return sendText(response, 400, "application/json; charset=utf-8", JSON.stringify({ error: "Invalid campaign ID." })); }
      const publication = getPlayerMap(database, account.id, campaignId);
      const basemap = publication?.map?.offlineBasemap;
      const assetId = basemap?.assetId;
      if (!assetId) return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", request.method === "HEAD");
      const directory = findOfflineBasemapDirectory(assetId);
      const metadata = directory && getOfflineBasemapMetadata(directory, assetId);
      if (metadata && (metadata.format === basemap.format || (!metadata.format && basemap.format !== "static-image"))
        && (basemap.format !== "static-image" || /^image\/(?:png|jpeg|webp)$/.test(metadata.contentType || ""))
        && sendOfflineBasemap(request, response, directory, assetId, { noStore: true })) return;
      return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", request.method === "HEAD");
    }
    if (PLAYER_API_PATH.test(url.pathname)) return playerHandler(request, response);
    if (USER_API_PATH.test(url.pathname)) return userHandler(request, response);

    if (url.pathname === "/api/offline-basemaps") {
      if (request.method !== "POST") return sendText(response, 405, "application/json; charset=utf-8", JSON.stringify({ error: "Method not allowed." }));
      const origin = request.headers.origin;
      if (origin) {
        try {
          const parsed = new URL(origin);
          if (parsed.protocol !== "http:" || parsed.host !== request.headers.host) throw new Error();
        } catch {
          return sendText(response, 403, "application/json; charset=utf-8", JSON.stringify({ error: "Cross-origin requests are not allowed." }));
        }
      }
      const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
      if (!account) return sendText(response, 401, "application/json; charset=utf-8", JSON.stringify({ error: "Authentication required." }));
      if (account.role !== "gm") return sendText(response, 403, "application/json; charset=utf-8", JSON.stringify({ error: "GM account required." }));
      try {
        const asset = await uploadOfflineBasemap(request, offlineBasemapDir, account.id);
        return sendText(response, 201, "application/json; charset=utf-8", JSON.stringify({ asset }));
      } catch (error) {
        const status = /larger than/.test(error.message) ? 413 : /Content-Type/.test(error.message) ? 415 : 422;
        return sendText(response, status, "application/json; charset=utf-8", JSON.stringify({ error: error.message }));
      }
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendText(response, 405, "application/json; charset=utf-8", JSON.stringify({ error: "Method not allowed." }));
    }
    const headOnly = request.method === "HEAD";
    const homePath = account ? getAccountHomePath(database, account.id) : "/index.html";

    const basemapMatch = url.pathname.match(/^\/offline-basemaps\/([0-9a-f-]{36})\.pmtiles$/i);
    const imageBasemapMatch = url.pathname.match(/^\/offline-basemaps\/([0-9a-f-]{36})\.image$/i);
    if (basemapMatch || imageBasemapMatch) {
      if (!account) return sendText(response, 401, "text/plain; charset=utf-8", "Authentication required.", headOnly);
      const assetId = (basemapMatch || imageBasemapMatch)[1];
      if (!ASSET_ID_PATTERN.test(assetId)) return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
      const directory = findOfflineBasemapDirectory(assetId, account.id);
      if (!directory) return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
      const metadata = getOfflineBasemapMetadata(directory, assetId);
      if (imageBasemapMatch && (metadata?.format !== "static-image" || !/^image\/(?:png|jpeg|webp)$/.test(metadata.contentType || ""))) {
        return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
      }
      if (basemapMatch && metadata?.format === "static-image") return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
      if (sendOfflineBasemap(request, response, directory, assetId)) return;
      return sendText(response, 404, "text/plain; charset=utf-8", "Not found.", headOnly);
    }

    if (url.pathname === "/" || url.pathname === "/login") {
      const location = account?.mustChangePassword ? "/login.html?passwordChange=1" : account ? homePath : "/login.html";
      response.writeHead(302, { Location: location, "Cache-Control": "no-store" });
      return response.end();
    }
    if (url.pathname === "/login.html" && account && !account.mustChangePassword) {
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
      if (["/index.html", "/campaign-setup.html", "/player-seeds.html"].includes(url.pathname) && account.role !== "gm") {
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