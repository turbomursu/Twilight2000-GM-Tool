const { getRuntimeCampaign, getPlayerCharacter } = require("./runtime-store.cjs");

function record(value, keys) {
  return value && typeof value === "object" && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function point(position) {
  return { lat: position.lat, lng: position.lng };
}

function boundedPoint(position, bounds) {
  if (!record(position, ["lat", "lng"]) || !Number.isFinite(position.lat) || !Number.isFinite(position.lng)
    || position.lat < bounds.south || position.lat > bounds.north
    || position.lng < bounds.west || position.lng > bounds.east) throw new Error("Map coordinates must be within campaign bounds.");
  return point(position);
}

function mapBounds(bounds) {
  return { south: bounds.south, west: bounds.west, north: bounds.north, east: bounds.east };
}

function validateMapDraft(draft, bounds, locations) {
  if (!record(draft, ["locationIds", "markings", "routeLocationIds", "playerPosition"])) throw new Error("Invalid map draft fields.");
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
  return { locationIds: [...draft.locationIds], markings, routeLocationIds: [...draft.routeLocationIds],
    playerPosition: draft.playerPosition === null ? null : boundedPoint(draft.playerPosition, bounds) };
}

function projectMap(map) {
  return {
    schemaVersion: 1, name: map.name, bounds: mapBounds(map.bounds),
    locations: map.locations.map((location) => ({ id: location.id, name: location.name, kind: location.kind, position: point(location.position) })),
    markings: map.markings.map((marking) => ({ id: marking.id, label: marking.label, position: point(marking.position) })),
    route: map.route.map((location) => ({ id: location.id, name: location.name, position: point(location.position) })),
    playerPosition: map.playerPosition ? point(map.playerPosition) : null
  };
}

function getGMMap(database, accountId, campaignId) {
  const campaign = getRuntimeCampaign(database, accountId, campaignId);
  if (!campaign) return null;
  const source = database.prepare("SELECT name, bounds_json FROM maps WHERE runtime_campaign_id = ?").get(campaignId);
  const locations = database.prepare(`SELECT id, name, kind, map_position_json, visibility_eligibility
    FROM locations WHERE runtime_campaign_id = ? ORDER BY name, id`).all(campaignId).map((location) => ({
    id: location.id, name: location.name, kind: location.kind,
    position: point(JSON.parse(location.map_position_json)), visibility: location.visibility_eligibility
  }));
  const row = database.prepare("SELECT * FROM map_publications WHERE campaign_id = ?").get(campaignId);
  return {
    campaignId, campaignRevision: campaign.revision, revision: row?.revision ?? 0,
    catalog: { name: source.name, bounds: mapBounds(JSON.parse(source.bounds_json)), locations },
    draft: row ? JSON.parse(row.draft_json) : { locationIds: [], markings: [], routeLocationIds: [], playerPosition: null },
    published: row?.published_json ? projectMap(JSON.parse(row.published_json)) : null,
    publishedAt: row?.published_at ?? null
  };
}

function buildMapPreview(map) {
  const draft = validateMapDraft(map.draft, map.catalog.bounds, map.catalog.locations);
  const locations = new Map(map.catalog.locations.map((location) => [location.id, location]));
  return projectMap({ name: map.catalog.name, bounds: map.catalog.bounds,
    locations: draft.locationIds.map((id) => locations.get(id)), markings: draft.markings,
    route: draft.routeLocationIds.map((id) => locations.get(id)), playerPosition: draft.playerPosition });
}

function updateGMMap(database, accountId, campaignId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some((key) => !["action", "expectedRevision", "draft"].includes(key))
    || !["draft", "preview", "publish", "withdraw"].includes(input.action)
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || (input.action !== "draft" && Object.hasOwn(input, "draft"))) throw new Error("Invalid map action or revision.");
  database.exec("BEGIN IMMEDIATE");
  try {
    const map = getGMMap(database, accountId, campaignId);
    if (!map) throw new Error("Runtime campaign not found.");
    if (map.revision !== input.expectedRevision) throw new Error("Map revision changed; reload before retrying.");
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
  return { map: row?.published_json ? projectMap(JSON.parse(row.published_json)) : null,
    publishedAt: row?.published_json ? row.published_at : null };
}

module.exports = { getGMMap, updateGMMap, getPlayerMap, validateMapDraft };