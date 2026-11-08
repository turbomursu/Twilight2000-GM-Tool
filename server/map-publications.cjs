const { getRuntimeCampaign, getPlayerCharacter } = require("./runtime-store.cjs");
const { appendAuditEvent } = require("./audit.cjs");
const { assertOfflineBasemap } = require("../campaign-package-contract.js");
const mapCoordinates = require("../map-coordinates.js");

function record(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function point(position) {
  return Object.hasOwn(position, "x") ? { x: position.x, y: position.y } : { lat: position.lat, lng: position.lng };
}

function boundedPoint(position, bounds) {
  if (!mapCoordinates.contains(position, bounds)) throw new Error("Map coordinates must be within campaign bounds.");
  return mapCoordinates.isImage(bounds) ? { x: position.x, y: position.y } : { lat: position.lat, lng: position.lng };
}

function mapBounds(bounds) {
  return mapCoordinates.normalizeBounds(bounds);
}

function boundedGeoCoordinate(coordinate, bounds) {
  if (!Array.isArray(coordinate) || coordinate.length !== 2
    || !coordinate.every(Number.isFinite)) throw new Error("Map geometry coordinates must be longitude/latitude pairs.");
  if (mapCoordinates.isImage(bounds)) {
    const [x, y] = coordinate;
    boundedPoint({ x, y }, bounds);
    return [x, y];
  }
  const [lng, lat] = coordinate;
  boundedPoint({ lat, lng }, bounds);
  return [lng, lat];
}

function validateGeometry(geometry, bounds) {
  if (!record(geometry, ["type", "coordinates"])) throw new Error("Invalid map geometry.");
  if (geometry.type === "LineString") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length < 2 || geometry.coordinates.length > 500) {
      throw new Error("A map line needs 2 to 500 vertices.");
    }
    return { type: "LineString", coordinates: geometry.coordinates.map((coordinate) => boundedGeoCoordinate(coordinate, bounds)) };
  }
  if (geometry.type === "Polygon") {
    if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length !== 1
      || !Array.isArray(geometry.coordinates[0]) || geometry.coordinates[0].length < 4 || geometry.coordinates[0].length > 500) {
      throw new Error("A map area needs one closed ring with 4 to 500 vertices.");
    }
    const ring = geometry.coordinates[0].map((coordinate) => boundedGeoCoordinate(coordinate, bounds));
    if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
      throw new Error("A map area ring must end where it starts.");
    }
    return { type: "Polygon", coordinates: [ring] };
  }
  throw new Error("Map geometry must be a LineString or Polygon.");
}

function validateMapDraft(draft, bounds, locations) {
  const legacyDraft = record(draft, ["locationIds", "markings", "routeLocationIds", "playerPosition"]);
  const hasGeometryDraft = record(draft, ["locationIds", "markings", "routeLocationIds", "playerPosition", "geometries"]);
  if (!legacyDraft && !hasGeometryDraft) throw new Error("Invalid map draft fields.");
  const ids = new Set(locations.map((location) => location.id));
  if (!Array.isArray(draft.locationIds) || draft.locationIds.length > 500
    || new Set(draft.locationIds).size !== draft.locationIds.length
    || draft.locationIds.some((id) => typeof id !== "string" || !ids.has(id))) throw new Error("Select unique locations from this campaign.");
  const selected = new Set(draft.locationIds);
  locations.filter((location) => selected.has(location.id)).forEach((location) => boundedPoint(location.position, bounds));
  if (!Array.isArray(draft.routeLocationIds) || draft.routeLocationIds.length > 200
    || draft.routeLocationIds.some((id) => !selected.has(id))) throw new Error("Every route waypoint must be a selected location.");
  if (!Array.isArray(draft.markings) || draft.markings.length > 300) throw new Error("Too many map markings.");
  const markingIds = new Set();
  const markings = draft.markings.map((marking) => {
    if (!record(marking, ["id", "label", "position"]) || typeof marking.id !== "string"
      || !/^[A-Za-z0-9_-]{1,120}$/.test(marking.id) || markingIds.has(marking.id)
      || typeof marking.label !== "string" || !marking.label.trim() || marking.label.length > 160) throw new Error("Invalid or duplicate map marking.");
    markingIds.add(marking.id);
    return { id: marking.id, label: marking.label, position: boundedPoint(marking.position, bounds) };
  });
  const rawGeometries = draft.geometries ?? [];
  if (!Array.isArray(rawGeometries) || rawGeometries.length > 100) throw new Error("Too many map geometries.");
  let totalVertices = 0;
  const geometries = rawGeometries.map((entry) => {
    if (!record(entry, ["id", "label", "geometry"]) || typeof entry.id !== "string"
      || !/^[A-Za-z0-9_-]{1,120}$/.test(entry.id) || markingIds.has(entry.id)
      || typeof entry.label !== "string" || !entry.label.trim() || entry.label.length > 160) {
      throw new Error("Invalid or duplicate map geometry.");
    }
    markingIds.add(entry.id);
    const geometry = validateGeometry(entry.geometry, bounds);
    totalVertices += geometry.type === "LineString" ? geometry.coordinates.length : geometry.coordinates[0].length;
    if (totalVertices > 10000) throw new Error("Map geometry contains too many vertices.");
    return { id: entry.id, label: entry.label.trim(), geometry };
  });
  return { locationIds: [...draft.locationIds], markings, geometries, routeLocationIds: [...draft.routeLocationIds],
    playerPosition: draft.playerPosition === null ? null : boundedPoint(draft.playerPosition, bounds) };
}

function projectMap(map, offlineBasemapUrl = null) {
  const basemap = map.offlineBasemap?.format === "maptiler-style"
    ? { format: "maptiler-style", styleId: map.offlineBasemap.styleId }
    : map.offlineBasemap ? (() => {
      const basemapExtension = map.offlineBasemap.format === "static-image" ? "image" : "pmtiles";
      return { format: map.offlineBasemap.format || "raster-pmtiles", assetId: map.offlineBasemap.assetId,
        attribution: map.offlineBasemap.attribution, ...(map.offlineBasemap.licenseUrl ? { licenseUrl: map.offlineBasemap.licenseUrl } : {}),
        assetUrl: offlineBasemapUrl || `/offline-basemaps/${map.offlineBasemap.assetId}.${basemapExtension}` };
    })() : null;
  return {
    schemaVersion: 2, name: map.name, bounds: mapBounds(map.bounds),
    offlineBasemap: basemap,
    locations: map.locations.map((location) => ({ id: location.id, name: location.name, kind: location.kind, position: point(location.position) })),
    markings: map.markings.map((marking) => ({ id: marking.id, label: marking.label, position: point(marking.position) })),
    geometries: (map.geometries || []).map((entry) => ({ id: entry.id, label: entry.label, geometry: entry.geometry })),
    route: map.route.map((location) => ({ id: location.id, name: location.name, position: point(location.position) })),
    playerPosition: map.playerPosition ? point(map.playerPosition) : null
  };
}

function getGMMap(database, accountId, campaignId) {
  const campaign = getRuntimeCampaign(database, accountId, campaignId);
  if (!campaign) return null;
  const source = database.prepare("SELECT name, bounds_json, offlineBasemap_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId);
  const bounds = mapBounds(JSON.parse(source.bounds_json));
  const offlineBasemap = source.offlineBasemap_json ? JSON.parse(source.offlineBasemap_json) : null;
  const setupImport = database.prepare("SELECT source_json FROM setup_imports WHERE runtime_campaign_id = ?").get(campaignId);
  let grid = null;
  if (setupImport) {
    const sourceGrid = JSON.parse(setupImport.source_json).map.grid;
    const origin = sourceGrid.origin || (mapCoordinates.isImage(bounds)
      ? { x: 0, y: mapCoordinates.heightKm(bounds) } : { lat: bounds.north, lng: bounds.west });
    if (sourceGrid.coordinateSystem === "axial-q-r" && sourceGrid.cellKm === 10
      && mapCoordinates.validPoint(origin, bounds)) {
      grid = { coordinateSystem: sourceGrid.coordinateSystem, cellKm: sourceGrid.cellKm,
        origin: mapCoordinates.isImage(bounds) ? { x: origin.x, y: origin.y } : { lat: origin.lat, lng: origin.lng } };
    }
  }
  const locations = database.prepare(`SELECT id, name, kind, map_position_json, visibility_eligibility
    FROM locations WHERE runtime_campaign_id = ? ORDER BY name, id`).all(campaignId).map((location) => ({
    id: location.id, name: location.name, kind: location.kind,
    position: point(JSON.parse(location.map_position_json)), visibility: location.visibility_eligibility
  }));
  const row = database.prepare("SELECT * FROM map_publications WHERE campaign_id = ?").get(campaignId);
  return {
    campaignId, campaignRevision: campaign.revision, revision: row?.revision ?? 0,
    catalog: { name: source.name, bounds, grid, locations, offlineBasemap },
    draft: row ? JSON.parse(row.draft_json) : { locationIds: [], markings: [], geometries: [], routeLocationIds: [], playerPosition: null },
    published: row?.published_json ? projectMap(JSON.parse(row.published_json)) : null,
    publishedAt: row?.published_at ?? null
  };
}

function buildMapPreview(map) {
  const draft = validateMapDraft(map.draft, map.catalog.bounds, map.catalog.locations);
  const locations = new Map(map.catalog.locations.map((location) => [location.id, location]));
  return projectMap({ name: map.catalog.name, bounds: map.catalog.bounds,
    offlineBasemap: map.catalog.offlineBasemap,
    locations: draft.locationIds.map((id) => locations.get(id)), markings: draft.markings, geometries: draft.geometries,
    route: draft.routeLocationIds.map((id) => locations.get(id)), playerPosition: draft.playerPosition });
}

function updateGMMap(database, accountId, campaignId, input, validateOfflineBasemap = null) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["action", "expectedRevision", "draft", "basemap"].includes(key))
    || !["draft", "preview", "publish", "withdraw", "basemap"].includes(input.action)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || (input.action !== "draft" && Object.hasOwn(input, "draft"))
    || (input.action !== "basemap" && Object.hasOwn(input, "basemap"))
    || (input.action === "basemap" && !Object.hasOwn(input, "basemap"))) throw new Error("Invalid map action or revision.");
  if (input.action === "basemap" && input.basemap !== null) assertOfflineBasemap(input.basemap);
  database.exec("BEGIN IMMEDIATE");
  try {
    const map = getGMMap(database, accountId, campaignId);
    if (!map) throw new Error("Runtime campaign not found.");
    if (map.revision !== input.expectedRevision) throw new Error("Map revision changed; reload before retrying.");
    if (input.action === "basemap" && mapCoordinates.isImage(map.catalog.bounds)
      && (input.basemap === null || input.basemap.format !== "static-image")) {
      throw new Error("Image-coordinate campaigns must retain a static image basemap; geographic basemaps require geographic bounds.");
    }
    if (input.action === "basemap" && input.basemap !== null) {
      if (input.basemap.format !== "maptiler-style") {
        if (typeof validateOfflineBasemap !== "function") throw new Error("The offline basemap asset could not be verified.");
        validateOfflineBasemap(accountId, input.basemap, map.catalog.bounds);
      }
      database.prepare("UPDATE maps SET offlineBasemap_json = ?, attribution = ? WHERE runtime_campaign_id = ?")
        .run(JSON.stringify(input.basemap), input.basemap.attribution || "", campaignId);
    } else if (input.action === "basemap") {
      database.prepare("UPDATE maps SET offlineBasemap_json = NULL, attribution = '' WHERE runtime_campaign_id = ?").run(campaignId);
    }
    if (input.action === "draft") map.draft = validateMapDraft(input.draft, map.catalog.bounds, map.catalog.locations);
    if (input.action === "preview") {
      const preview = buildMapPreview(map);
      database.exec("COMMIT");
      return { preview, revision: map.revision };
    }
    if (input.action === "publish") {
      if (!map.draft.playerPosition) throw new Error("Set the player position before publishing.");
      map.published = buildMapPreview(map);
      map.publishedAt = new Date().toISOString();
    }
    if (input.action === "withdraw") { map.published = null; map.publishedAt = null; }
    database.prepare(`INSERT INTO map_publications (campaign_id, revision, draft_json, published_json, published_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(campaign_id) DO UPDATE SET
      revision = excluded.revision, draft_json = excluded.draft_json,
      published_json = excluded.published_json, published_at = excluded.published_at`).run(
      campaignId, map.revision + 1, JSON.stringify(map.draft), map.published ? JSON.stringify(map.published) : null, map.publishedAt);
    database.prepare("UPDATE campaigns SET revision = revision + 1, updated_at = ? WHERE runtime_id = ?").run(new Date().toISOString(), campaignId);
    appendAuditEvent(database, accountId, campaignId, { action: `map.${input.action}`, targetType: "map_publication",
      targetId: campaignId, beforeRevision: map.revision, afterRevision: map.revision + 1 });
    const result = getGMMap(database, accountId, campaignId);
    database.exec("COMMIT");
    return { map: result };
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function getPlayerMap(database, accountId, campaignId) {
  if (!getPlayerCharacter(database, accountId, campaignId)) return null;
  const row = database.prepare("SELECT published_json, published_at FROM map_publications WHERE campaign_id = ?").get(campaignId);
  return { map: row?.published_json ? projectMap(JSON.parse(row.published_json), `/api/player/campaigns/${encodeURIComponent(campaignId)}/map-basemap`) : null,
    publishedAt: row?.published_json ? row.published_at : null };
}

module.exports = { getGMMap, updateGMMap, getPlayerMap, validateMapDraft };