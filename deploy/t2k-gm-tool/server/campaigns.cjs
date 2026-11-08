const { getAuthenticatedAccount, parseCookies } = require("./auth.cjs");
const { createPlayerSeed, exportRuntimeSave, getRuntimeCampaign, getRuntimeDashboard, importRuntimeBackup, importSetupPackage, listCampaignPlayerSeeds, listCharacterChangeRequests, listRuntimeCampaigns, restoreRuntimeSave, reviewCharacterChangeRequest, updateRuntimeDashboard, listNPCArchetypes, createPersonnelFromArchetype, listLocationsForCampaign, createLocation, updateLocation, deleteLocation, listRouteStopsForCampaign, createRouteStop, updateRouteStop, deleteRouteStop, reorderRouteStops, getMapPublicationState, updateMapPublicationState, getPublicationHistory, getPartyPosition, updatePartyPosition } = require("./runtime-store.cjs");
const { createCombatHandler } = require("./combat-api.cjs");
const { BackupScheduleType, createBackupSchedule, getBackupSchedule, updateBackupSchedule, getBackupHistory, initializeBackupScheduler } = require("./backup-scheduler.cjs");
const depthService = require("./campaign-depth-service.cjs");

const MAX_SETUP_PACKAGE_BYTES = 50 * 1024 * 1024;
const MAX_RUNTIME_BACKUP_BYTES = 100 * 1024 * 1024;
const { getRuntimeFactionLayers, updateRuntimeFactionLayers, getPartyFaction } = require("./runtime-store.cjs");
const { getGMReport, updateGMReport } = require("./situation-reports.cjs");
const { getGMMap, updateGMMap } = require("./map-publications.cjs");
const { listComms, sendComms } = require("./comms.cjs");
const { getGMInventory, reviewInventoryProposal, manageGMInventory } = require("./inventory.cjs");
const { getGMConditions, updateGMConditions } = require("./conditions.cjs");
const { listAuditEvents } = require("./audit.cjs");
const { advanceRuntimeTime, rollRuntimeWeather } = require("./runtime-store.cjs");
const mapCoordinates = require("../map-coordinates.js");

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

function enforceSameOrigin(request) {
  const origin = request.headers.origin;
  if (!origin) return;
  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "http:" || parsed.host !== request.headers.host) throw new HttpError(403, "Cross-origin requests are not allowed.");
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, "Cross-origin requests are not allowed.");
  }
}

async function readSetupPackage(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) {
    throw new HttpError(415, "Content-Type must be application/json.");
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_SETUP_PACKAGE_BYTES) throw new HttpError(413, "Setup packages must be no larger than 50 MiB.");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function readJsonBody(request, maximumBytes = 32 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw new HttpError(415, "Content-Type must be application/json.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maximumBytes) throw new HttpError(413, "Request body is too large.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Request body must be a JSON object.");
  }
}

async function readRuntimeRestoreBody(request) {
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw new HttpError(415, "Content-Type must be application/json.");
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > MAX_RUNTIME_BACKUP_BYTES) throw new HttpError(413, "Runtime restore request must be no larger than 100 MiB.");
    chunks.push(chunk);
  }
  try {
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new HttpError(400, "Runtime restore body must be a JSON object.");
  }
}

function createCampaignHandler({ database, validateOfflineBasemap = null }) {
  return async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    const url = new URL(request.url, "http://fieldbook.invalid");
    if (request.method === "POST" || request.method === "PUT") {
      try {
        enforceSameOrigin(request);
      } catch (error) {
        return sendJson(response, error.status, { error: error.message });
      }
    }
    const account = getAuthenticatedAccount(database, parseCookies(request.headers.cookie)["fieldbook_session"]);
    if (!account) return sendJson(response, 401, { error: "Authentication required." });
    if (account.role !== "gm") return sendJson(response, 403, { error: "GM access required." });

    if (request.method === "GET" && url.pathname === "/api/campaigns") {
      return sendJson(response, 200, { campaigns: listRuntimeCampaigns(database, account.id) });
    }
    const advanceMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/advance-time$/);
    if (advanceMatch) {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(advanceMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        return sendJson(response, 200, { runtime: advanceRuntimeTime(database, account.id, campaignId, await readJsonBody(request)) });
      } catch (error) { return sendJson(response, error instanceof HttpError ? error.status : /not found/.test(error.message) ? 404 : /revision changed/.test(error.message) ? 409 : 422, { error: error.message }); }
    }
    const weatherRollMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/weather-roll$/);
    if (weatherRollMatch) {
      if (request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(weatherRollMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        return sendJson(response, 200, rollRuntimeWeather(database, account.id, campaignId, await readJsonBody(request)));
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found/.test(error.message) ? 404
            : /revision changed|already been rolled|must remain Cloudy/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const auditMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/audit$/);
    if (auditMatch) {
      if (request.method !== "GET") return sendJson(response, 405, { error: "Audit history is read-only." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(auditMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        if ([...url.searchParams.keys()].some((key) => !["limit", "before"].includes(key))
          || ["limit", "before"].some((key) => url.searchParams.getAll(key).length > 1
            || (url.searchParams.has(key) && !/^[1-9]\d*$/.test(url.searchParams.get(key))))) throw new HttpError(422, "Invalid audit pagination.");
        const audit = listAuditEvents(database, account.id, campaignId, {
          limit: url.searchParams.has("limit") ? Number(url.searchParams.get("limit")) : 50,
          before: url.searchParams.has("before") ? Number(url.searchParams.get("before")) : null
        });
        return audit ? sendJson(response, 200, audit) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) { return sendJson(response, error instanceof HttpError ? error.status : 422, { error: error.message }); }
    }
    const conditionMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/conditions$/);
    if (conditionMatch) {
      if (!["GET", "PUT"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(conditionMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET" ? { conditions: getGMConditions(database, account.id, campaignId) }
          : updateGMConditions(database, account.id, campaignId, await readJsonBody(request, 64 * 1024));
        return result.conditions ? sendJson(response, 200, result) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /not found/.test(error.message) ? 404
          : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const inventoryMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/inventory(?:\/proposals\/([^/]+)\/review)?$/);
    if (inventoryMatch) {
      if (!(request.method === "GET" && !inventoryMatch[2]) && request.method !== "POST") return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId; let proposalId;
        try { campaignId = decodeURIComponent(inventoryMatch[1]); proposalId = inventoryMatch[2] ? decodeURIComponent(inventoryMatch[2]) : null; }
        catch { throw new HttpError(400, "Invalid inventory ID."); }
        const result = request.method === "GET" ? { inventory: getGMInventory(database, account.id, campaignId) }
          : proposalId ? reviewInventoryProposal(database, account.id, campaignId, proposalId, await readJsonBody(request))
            : manageGMInventory(database, account.id, campaignId, await readJsonBody(request));
        return result.inventory ? sendJson(response, 200, result) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /not found/.test(error.message) ? 404
          : /revision changed|already reviewed|assignment changed|limit reached/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const commsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/comms$/);
    if (commsMatch) {
      if (!["GET", "POST"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(commsMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET" ? listComms(database, account.id, campaignId, "gm")
          : sendComms(database, account.id, campaignId, "gm", await readJsonBody(request));
        return result ? sendJson(response, request.method === "POST" ? 201 : 200, result)
          : sendJson(response, 404, { error: "Campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /Campaign not found/.test(error.message) ? 404
          : /archive is full/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const mapMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/map-publication$/);
    if (mapMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(mapMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET" ? { map: getGMMap(database, account.id, campaignId) }
          : updateGMMap(database, account.id, campaignId, await readJsonBody(request, 256 * 1024), validateOfflineBasemap);
        return result.map === null ? sendJson(response, 404, { error: "Runtime campaign not found." }) : sendJson(response, 200, result);
      } catch (error) {
        const status = error instanceof HttpError ? error.status : /Runtime campaign not found/.test(error.message) ? 404
          : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const reportMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/situation-report$/);
    if (reportMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(reportMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const result = request.method === "GET"
          ? { report: getGMReport(database, account.id, campaignId) }
          : updateGMReport(database, account.id, campaignId, await readJsonBody(request, 64 * 1024));
        return result.report === null ? sendJson(response, 404, { error: "Runtime campaign not found." })
          : sendJson(response, 200, result);
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found/.test(error.message) ? 404
            : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const layerMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/faction-layers$/);
    if (layerMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(layerMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const layers = request.method === "GET"
          ? getRuntimeFactionLayers(database, account.id, campaignId)
          : updateRuntimeFactionLayers(database, account.id, campaignId, await readJsonBody(request, 256 * 1024));
        return layers ? sendJson(response, 200, { layers }) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found/.test(error.message) ? 404
            : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    const partyMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/party$/);
    if (partyMatch && request.method === "GET") {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(partyMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const party = getPartyFaction(database, account.id, campaignId);
        return party ? sendJson(response, 200, { party }) : sendJson(response, 404, { error: "Runtime campaign not found." });
      } catch (error) {
        return sendJson(response, 404, { error: error.message });
      }
    }
    const backupMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/backup$/);
    if (backupMatch && request.method === "GET") {
      let campaignId;
      try {
        campaignId = decodeURIComponent(backupMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const backup = exportRuntimeSave(database, account.id, campaignId);
      return backup ? sendJson(response, 200, { backup }) : sendJson(response, 404, { error: "Campaign not found." });
    }
    const restoreMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/restore$/);
    if (restoreMatch && request.method === "POST") {
      let campaignId;
      try {
        campaignId = decodeURIComponent(restoreMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      try {
        const body = await readRuntimeRestoreBody(request);
        const result = restoreRuntimeSave(database, account.id, campaignId, body.backup, {
          confirmReplace: body.confirmReplace,
          confirmOlderBackup: body.confirmOlderBackup,
          expectedRevision: body.expectedRevision,
          validateOfflineBasemap
        });
        return sendJson(response, 200, { restore: result });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Runtime campaign not found|GM owner|does not preserve the current GM owner/.test(error.message) ? 404
            : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/campaigns/import-backup") {
      try {
        const body = await readRuntimeRestoreBody(request);
        const result = importRuntimeBackup(database, account.id, body.backup, body.playerAccountMap, { validateOfflineBasemap });
        const campaign = getRuntimeCampaign(database, account.id, result.campaignId);
        return sendJson(response, 201, { campaign, import: result });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Active GM account/.test(error.message) ? 403
            : /database is locked|SQLITE_BUSY|ERR_SQLITE/.test(error.message) ? 500 : 422;
        return sendJson(response, status, { error: status === 500 ? "The runtime backup could not be imported." : error.message });
      }
    }
    if (request.method === "POST" && url.pathname === "/api/campaigns/import-setup") {
      try {
        const sourceJson = await readSetupPackage(request);
        const result = importSetupPackage(database, sourceJson, {
          ownerAccountId: account.id,
          validateOfflineBasemap
        });
        const campaign = getRuntimeCampaign(database, account.id, result.runtimeCampaignId);
        return sendJson(response, 201, { campaign });
      } catch (error) {
        const status = error instanceof HttpError ? error.status : error.code?.startsWith("ERR_SQLITE") ? 500 : 422;
        return sendJson(response, status, { error: status === 500 ? "The campaign could not be stored." : error.message });
      }
    }

    const runtimeMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/runtime$/);
    if (request.method === "GET" && runtimeMatch) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(runtimeMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const runtime = getRuntimeDashboard(database, account.id, campaignId);
      return runtime
        ? sendJson(response, 200, { runtime })
        : sendJson(response, 404, { error: "Runtime campaign data not found." });
    }
    if (request.method === "PUT" && runtimeMatch) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(runtimeMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      try {
        const updates = await readJsonBody(request);
        const runtime = updateRuntimeDashboard(database, account.id, campaignId, updates);
        return sendJson(response, 200, { runtime });
      } catch (error) {
        const status = /Runtime campaign not found/.test(error.message) ? 404
          : /revision changed/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const combatMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/combat\/([a-z-]+)$/);
    if (combatMatch && ["POST"].includes(request.method)) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(combatMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      if (!getRuntimeCampaign(database, account.id, campaignId)) {
        return sendJson(response, 404, { error: "Campaign not found." });
      }
      return createCombatHandler({ database })(request, response, campaignId, combatMatch[2]);
    }

    const changeListMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/character-changes$/);
    if (request.method === "GET" && changeListMatch) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(changeListMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const requests = listCharacterChangeRequests(database, account.id, campaignId);
      return requests ? sendJson(response, 200, { requests }) : sendJson(response, 404, { error: "Campaign not found." });
    }

    const changeReviewMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/character-changes\/([^/]+)\/review$/);
    if (request.method === "POST" && changeReviewMatch) {
      let campaignId;
      let requestId;
      try {
        campaignId = decodeURIComponent(changeReviewMatch[1]);
        requestId = decodeURIComponent(changeReviewMatch[2]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign or request ID." });
      }
      try {
        const body = await readJsonBody(request);
        const result = reviewCharacterChangeRequest(database, account.id, campaignId, requestId, body.decision, body.reviewNote || "");
        return sendJson(response, 200, { request: result });
      } catch (error) {
        const status = /GM ownership|Pending character change request not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const seedMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/player-seeds$/);
    if (seedMatch && ["GET", "POST"].includes(request.method)) {
      let campaignId;
      try {
        campaignId = decodeURIComponent(seedMatch[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      if (request.method === "GET") {
        const seeds = listCampaignPlayerSeeds(database, account.id, campaignId);
        return seeds ? sendJson(response, 200, { seeds }) : sendJson(response, 404, { error: "Campaign not found." });
      }
      try {
        const body = await readJsonBody(request);
        const seed = createPlayerSeed(database, account.id, campaignId, body);
        return sendJson(response, 201, { seed });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : error.code?.startsWith("ERR_SQLITE_CONSTRAINT") || /constraint failed/i.test(error.message) || /already|no more than four|cannot also/.test(error.message) ? 409
            : /GM ownership|Campaign not found|Player seed template not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const locationsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/locations(?:\/([^/]+))?$/);
    if (locationsMatch) {
      if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        let locationId;
        try { 
          campaignId = decodeURIComponent(locationsMatch[1]); 
          locationId = locationsMatch[2] ? decodeURIComponent(locationsMatch[2]) : null;
        } catch { throw new HttpError(400, "Invalid campaign or location ID."); }

        if (request.method === "GET" && !locationId) {
          const locations = listLocationsForCampaign(database, account.id, campaignId);
          return sendJson(response, 200, { locations });
        }

        if (request.method === "POST" && !locationId) {
          const body = await readJsonBody(request);
          const location = createLocation(database, account.id, campaignId, body);
          return sendJson(response, 201, { location });
        }

        if (request.method === "PUT" && locationId) {
          const body = await readJsonBody(request);
          const location = updateLocation(database, account.id, campaignId, locationId, body);
          return sendJson(response, 200, { location });
        }

        if (request.method === "DELETE" && locationId) {
          const result = deleteLocation(database, account.id, campaignId, locationId);
          return sendJson(response, 200, result);
        }

        throw new HttpError(405, "Method not allowed for this endpoint.");
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|Location not found|access denied/.test(error.message) ? 404
            : /while it is used in the campaign route/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const routeMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/route(?:\/stops(?:\/(\d+))?)?$|^\/api\/campaigns\/([^/]+)\/route\/reorder$/);
    if (routeMatch) {
      if (!["GET", "POST", "PUT", "DELETE"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId = routeMatch[1] || routeMatch[3];
        const ordinalStr = routeMatch[2];
        const isReorder = /\/reorder$/.test(url.pathname);
        
        try { campaignId = decodeURIComponent(campaignId); } 
        catch { throw new HttpError(400, "Invalid campaign ID."); }

        // GET /api/campaigns/:id/route
        if (request.method === "GET" && !ordinalStr && !isReorder) {
          const result = listRouteStopsForCampaign(database, account.id, campaignId);
          return sendJson(response, 200, result);
        }

        // POST /api/campaigns/:id/route/stops
        if (request.method === "POST" && !ordinalStr && !isReorder) {
          const body = await readJsonBody(request);
          if (!body.locationId) throw new HttpError(400, "Location ID is required.");
          if (body.detail === undefined) throw new HttpError(400, "Stop detail is required.");
          if (body.kmFromPrevious === undefined) throw new HttpError(400, "Distance from previous is required.");
          if (body.ordinal === undefined) throw new HttpError(400, "Ordinal is required.");
          
          const stop = createRouteStop(database, account.id, campaignId, body.locationId, body.detail, body.kmFromPrevious, body.ordinal);
          return sendJson(response, 201, { stop });
        }

        // PUT /api/campaigns/:id/route/stops/:ordinal
        if (request.method === "PUT" && ordinalStr && !isReorder) {
          const ordinal = parseInt(ordinalStr, 10);
          if (!Number.isInteger(ordinal) || ordinal < 0) throw new HttpError(400, "Invalid ordinal.");
          
          const body = await readJsonBody(request);
          if (body.detail === undefined) throw new HttpError(400, "Stop detail is required.");
          if (body.kmFromPrevious === undefined) throw new HttpError(400, "Distance from previous is required.");
          
          const stop = updateRouteStop(database, account.id, campaignId, ordinal, body.detail, body.kmFromPrevious);
          return sendJson(response, 200, { stop });
        }

        // DELETE /api/campaigns/:id/route/stops/:ordinal
        if (request.method === "DELETE" && ordinalStr && !isReorder) {
          const ordinal = parseInt(ordinalStr, 10);
          if (!Number.isInteger(ordinal) || ordinal < 0) throw new HttpError(400, "Invalid ordinal.");
          
          const result = deleteRouteStop(database, account.id, campaignId, ordinal);
          return sendJson(response, 200, result);
        }

        // PUT /api/campaigns/:id/route/reorder
        if (request.method === "PUT" && isReorder) {
          const body = await readJsonBody(request);
          if (!Array.isArray(body.orderedLocationIds)) throw new HttpError(400, "Ordered location IDs array is required.");
          
          const result = reorderRouteStops(database, account.id, campaignId, body.orderedLocationIds);
          return sendJson(response, 200, result);
        }

        throw new HttpError(405, "Method not allowed for this endpoint.");
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|Route stop not found|Location not found|access denied/.test(error.message) ? 404
            : /already in the route|Reordering locations do not match/.test(error.message) ? 409 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const archetypesMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/npc-archetypes$/);
    if (archetypesMatch && request.method === "GET") {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(archetypesMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });
        const archetypes = listNPCArchetypes(database, campaignId);
        return sendJson(response, 200, { archetypes });
      } catch (error) {
        return sendJson(response, 404, { error: error.message });
      }
    }
    const personnelMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/personnel\/from-archetype$/);
    if (personnelMatch && request.method === "POST") {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(personnelMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const body = await readJsonBody(request);
        if (!body.archetypeId) throw new HttpError(400, "Archetype ID is required.");
        const personnel = createPersonnelFromArchetype(database, account.id, campaignId, body.archetypeId, body);
        return sendJson(response, 201, { personnel });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|access denied/.test(error.message) ? 404
            : /archetype not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    const match = url.pathname.match(/^\/api\/campaigns\/([^/]+)$/);
    if (request.method === "GET" && match) {
      let runtimeId;
      try {
        runtimeId = decodeURIComponent(match[1]);
      } catch {
        return sendJson(response, 400, { error: "Invalid campaign ID." });
      }
      const campaign = getRuntimeCampaign(database, account.id, runtimeId);
      return campaign
        ? sendJson(response, 200, { campaign })
        : sendJson(response, 404, { error: "Campaign not found." });
    }

    // Backup Schedule Routes
    const backupScheduleMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/backup-schedule$/);
    if (backupScheduleMatch) {
      if (!["GET", "POST", "PATCH"].includes(request.method)) return sendJson(response, 405, { error: "Method not allowed." });
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(backupScheduleMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          initializeBackupScheduler(database);
          const schedule = getBackupSchedule(database, campaignId);
          return sendJson(response, 200, { schedule: schedule || null });
        }

        if (request.method === "POST") {
          const body = await readJsonBody(request);
          if (!body.scheduleType) throw new HttpError(400, "Schedule type is required.");
          initializeBackupScheduler(database);
          createBackupSchedule(database, campaignId, body.scheduleType, body.options || {});
          const schedule = getBackupSchedule(database, campaignId);
          return sendJson(response, 201, { schedule });
        }

        if (request.method === "PATCH") {
          const body = await readJsonBody(request);
          if (!body.updates || typeof body.updates !== "object") throw new HttpError(400, "Updates object is required.");
          initializeBackupScheduler(database);
          updateBackupSchedule(database, campaignId, body.updates);
          const schedule = getBackupSchedule(database, campaignId);
          return sendJson(response, 200, { schedule });
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Backup History Routes
    const backupHistoryMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/backup-history$/);
    if (backupHistoryMatch && request.method === "GET") {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(backupHistoryMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit")) || 50, 1), 500);

        initializeBackupScheduler(database);
        const history = getBackupHistory(database, campaignId, limit);
        return sendJson(response, 200, { history, count: history.length });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found/.test(error.message) ? 404 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Map Publication State Routes
    const mapPublicationMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/map-publication$/);
    if (mapPublicationMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(mapPublicationMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          const state = getMapPublicationState(database, account.id, campaignId);
          return sendJson(response, 200, { state });
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          if (!body.state || typeof body.state !== "object") throw new HttpError(400, "Publication state object is required.");
          const updated = updateMapPublicationState(database, account.id, campaignId, body.state);
          return sendJson(response, 200, { state: updated });
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found/.test(error.message) ? 404
          : /access denied/.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Publication History Routes
    const publicationHistoryMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/map-publication\/history$/);
    if (publicationHistoryMatch && request.method === "GET") {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(publicationHistoryMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit")) || 50, 1), 500);
        const offset = Math.max(parseInt(url.searchParams.get("offset")) || 0, 0);
        const result = getPublicationHistory(database, account.id, campaignId, limit, offset);
        return sendJson(response, 200, { history: result.history, total: result.total, limit, offset });
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found/.test(error.message) ? 404
          : /access denied/.test(error.message) ? 403 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Party Position Routes
    const partyPositionMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/party-position$/);
    if (partyPositionMatch && ["GET", "PUT"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(partyPositionMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          const pos = getPartyPosition(database, account.id, campaignId);
          return sendJson(response, 200, { position: pos });
        }

        if (request.method === "PUT") {
          const body = await readJsonBody(request);
          const bounds = campaign.setupPackage?.map?.bounds;
          const position = mapCoordinates.isImage(bounds)
            ? (Object.keys(body).length === 2 && Object.hasOwn(body, "x") && Object.hasOwn(body, "y") ? { x: body.x, y: body.y } : null)
            : (Object.keys(body).length === 2 && Object.hasOwn(body, "lat") && Object.hasOwn(body, "lng") ? { lat: body.lat, lng: body.lng } : null);
          if (!position) throw new HttpError(400, mapCoordinates.isImage(bounds)
            ? "Position must contain x/y kilometre coordinates."
            : "Position must contain latitude/longitude coordinates.");
          const updated = updatePartyPosition(database, account.id, campaignId, position);
          return sendJson(response, 200, { position: updated });
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found/.test(error.message) ? 404
          : /access denied/.test(error.message) ? 403
          : /outside campaign bounds/.test(error.message) ? 422 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Milestone 7: Campaign Depth — Factions
    const factionsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/factions(?:\/([^/]+))?$/);
    if (factionsMatch && ["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
      try {
        let campaignId;
        try { campaignId = decodeURIComponent(factionsMatch[1]); } catch { throw new HttpError(400, "Invalid campaign ID."); }
        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        const factionId = factionsMatch[2] ? decodeURIComponent(factionsMatch[2]) : null;

        if (request.method === "GET") {
          if (factionId) {
            const faction = depthService.getFaction(database, campaignId, factionId);
            if (!faction) return sendJson(response, 404, { error: "Faction not found." });
            return sendJson(response, 200, { faction });
          }
          const factions = depthService.listFactions(database, campaignId);
          return sendJson(response, 200, { factions });
        }

        if (request.method === "POST") {
          const body = await readJsonBody(request);
          const created = depthService.createFaction(database, campaignId, body, {
            accountId: account.id,
            expectedRevision: body.expectedRevision
          });
          const { campaignRevision, ...faction } = created;
          return sendJson(response, 201, { faction, campaignRevision });
        }

        if (request.method === "PUT") {
          if (!factionId) throw new HttpError(400, "Faction ID required for update.");
          const body = await readJsonBody(request);
          const faction = depthService.updateFaction(database, campaignId, factionId, body);
          return sendJson(response, 200, { faction });
        }

        if (request.method === "DELETE") {
          if (!factionId) throw new HttpError(400, "Faction ID required for delete.");
          depthService.deleteFaction(database, campaignId, factionId);
          return sendJson(response, 204, {});
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|Faction not found/.test(error.message) ? 404
          : /Campaign revision changed|Faction name already exists/.test(error.message) ? 409
          : /required and must be/.test(error.message) ? 422 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Milestone 7: Faction Relationships
    const relationshipsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/factions\/([^/]+)\/relationships(?:\/([^/]+))?$/);
    if (relationshipsMatch && ["GET", "POST", "PUT"].includes(request.method)) {
      try {
        let campaignId = decodeURIComponent(relationshipsMatch[1]);
        const fromFactionId = decodeURIComponent(relationshipsMatch[2]);
        const toFactionId = relationshipsMatch[3] ? decodeURIComponent(relationshipsMatch[3]) : null;

        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          if (toFactionId) {
            const rel = depthService.getFactionRelationship(database, campaignId, fromFactionId, toFactionId);
            if (!rel) return sendJson(response, 404, { error: "Relationship not found." });
            return sendJson(response, 200, { relationship: rel });
          }
          const rels = depthService.getFactionRelationships(database, campaignId, fromFactionId);
          return sendJson(response, 200, { relationships: rels });
        }

        if (request.method === "POST" || request.method === "PUT") {
          if (!toFactionId) throw new HttpError(400, "To-faction ID required.");
          const body = await readJsonBody(request);
          const rel = depthService.setFactionRelationship(database, campaignId, fromFactionId, toFactionId, body.attitude, body.notes);
          return sendJson(response, 200, { relationship: rel });
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|not found/.test(error.message) ? 404
          : /must be one of/.test(error.message) ? 422 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Milestone 7: Settlement Resources
    const resourcesMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/settlements\/([^/]+)\/resources(?:\/([^/]+))?$/);
    if (resourcesMatch && ["GET", "POST", "PUT"].includes(request.method)) {
      try {
        let campaignId = decodeURIComponent(resourcesMatch[1]);
        const settlementId = decodeURIComponent(resourcesMatch[2]);
        const resourceType = resourcesMatch[3] ? decodeURIComponent(resourcesMatch[3]) : null;

        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          if (resourceType) {
            const res = depthService.getSettlementResource(database, campaignId, settlementId, resourceType);
            if (!res) return sendJson(response, 404, { error: "Resource not found." });
            return sendJson(response, 200, { resource: res });
          }
          const resources = depthService.getSettlementResources(database, campaignId, settlementId);
          return sendJson(response, 200, { resources });
        }

        if (request.method === "POST" || request.method === "PUT") {
          if (!resourceType) throw new HttpError(400, "Resource type required.");
          const body = await readJsonBody(request);
          const res = depthService.setSettlementResource(database, campaignId, settlementId, resourceType, body.status, body.notes);
          return sendJson(response, 200, { resource: res });
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|not found/.test(error.message) ? 404
          : /must be one of/.test(error.message) ? 422 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Milestone 7: Campaign Events
    const eventsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/events(?:\/([^/]+))?$/);
    if (eventsMatch && ["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
      try {
        let campaignId = decodeURIComponent(eventsMatch[1]);
        const eventId = eventsMatch[2] ? decodeURIComponent(eventsMatch[2]) : null;

        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          if (eventId) {
            const event = depthService.getEvent(database, campaignId, eventId);
            if (!event) return sendJson(response, 404, { error: "Event not found." });
            return sendJson(response, 200, { event });
          }
          const filters = {};
          if (url.searchParams.has("eventType")) filters.eventType = url.searchParams.get("eventType");
          if (url.searchParams.has("linkedFactionId")) filters.linkedFactionId = url.searchParams.get("linkedFactionId");
          if (url.searchParams.has("linkedSettlementId")) filters.linkedSettlementId = url.searchParams.get("linkedSettlementId");
          if (url.searchParams.has("isPublic")) filters.isPublic = url.searchParams.get("isPublic") === "true";
          const events = depthService.listEvents(database, campaignId, filters);
          return sendJson(response, 200, { events });
        }

        if (request.method === "POST") {
          const body = await readJsonBody(request);
          const event = depthService.createEvent(database, campaignId, body);
          return sendJson(response, 201, { event });
        }

        if (request.method === "PUT") {
          if (!eventId) throw new HttpError(400, "Event ID required for update.");
          const body = await readJsonBody(request);
          const event = depthService.updateEvent(database, campaignId, eventId, body);
          return sendJson(response, 200, { event });
        }

        if (request.method === "DELETE") {
          if (!eventId) throw new HttpError(400, "Event ID required for delete.");
          depthService.deleteEvent(database, campaignId, eventId);
          return sendJson(response, 204, {});
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|not found/.test(error.message) ? 404
          : /required and must be|must be one of/.test(error.message) ? 422 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    // Milestone 7: Threat Tracker
    const threatsMatch = url.pathname.match(/^\/api\/campaigns\/([^/]+)\/threats(?:\/([^/]+))?$/);
    if (threatsMatch && ["GET", "POST", "PUT", "DELETE"].includes(request.method)) {
      try {
        let campaignId = decodeURIComponent(threatsMatch[1]);
        const threatId = threatsMatch[2] ? decodeURIComponent(threatsMatch[2]) : null;

        const campaign = getRuntimeCampaign(database, account.id, campaignId);
        if (!campaign) return sendJson(response, 404, { error: "Campaign not found." });

        if (request.method === "GET") {
          if (threatId) {
            const threat = depthService.getThreat(database, campaignId, threatId);
            if (!threat) return sendJson(response, 404, { error: "Threat not found." });
            return sendJson(response, 200, { threat });
          }
          const filters = {};
          if (url.searchParams.has("status")) filters.status = url.searchParams.get("status");
          if (url.searchParams.has("threatLevel")) filters.threatLevel = url.searchParams.get("threatLevel");
          if (url.searchParams.has("antagonistType")) filters.antagonistType = url.searchParams.get("antagonistType");
          if (url.searchParams.has("linkedFactionId")) filters.linkedFactionId = url.searchParams.get("linkedFactionId");
          if (url.searchParams.has("linkedSettlementId")) filters.linkedSettlementId = url.searchParams.get("linkedSettlementId");
          const threats = depthService.listThreats(database, campaignId, filters);
          return sendJson(response, 200, { threats });
        }

        if (request.method === "POST") {
          const body = await readJsonBody(request);
          const threat = depthService.createThreat(database, campaignId, body);
          return sendJson(response, 201, { threat });
        }

        if (request.method === "PUT") {
          if (!threatId) throw new HttpError(400, "Threat ID required for update.");
          const body = await readJsonBody(request);
          const threat = depthService.updateThreat(database, campaignId, threatId, body);
          return sendJson(response, 200, { threat });
        }

        if (request.method === "DELETE") {
          if (!threatId) throw new HttpError(400, "Threat ID required for delete.");
          depthService.deleteThreat(database, campaignId, threatId);
          return sendJson(response, 204, {});
        }
      } catch (error) {
        const status = error instanceof HttpError ? error.status
          : /Campaign not found|not found/.test(error.message) ? 404
          : /required and must be|must be one of/.test(error.message) ? 422 : 422;
        return sendJson(response, status, { error: error.message });
      }
    }

    if (url.pathname.startsWith("/api/campaigns/")) return sendJson(response, 405, { error: "Method not allowed." });
    return sendJson(response, 404, { error: "Not found." });
  };
}

module.exports = { createCampaignHandler };