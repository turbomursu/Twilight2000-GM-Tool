const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const MapTilerReference = require("../maptiler-reference-client.js");

const setupHtml = readFileSync(join(__dirname, "..", "campaign-setup.html"), "utf8");
const appSource = readFileSync(join(__dirname, "..", "server", "app.cjs"), "utf8");

test("MapTiler style URL uses the configured style and URL-encodes a transient API key", () => {
  const apiKey = " test key&query=?#/%+ ";
  const result = new URL(MapTilerReference.buildStyleUrl(apiKey));

  assert.equal(result.origin, "https://api.maptiler.com");
  assert.equal(result.pathname, "/maps/01a1b6c9-9a4c-7ab4-bf09-6d75353e5420/style.json");
  assert.equal(result.searchParams.get("key"), apiKey.trim());
  assert.deepEqual(MapTilerReference.initialCenter, { lat: 61.81331, lng: 27.97982 });
  assert.equal(MapTilerReference.initialZoom, 8.7);
  assert.throws(() => MapTilerReference.buildStyleUrl(" \t "), /Enter a MapTiler API key/);
  assert.throws(() => MapTilerReference.buildStyleUrl("synthetic-key", "unapproved-style"), /not supported/);
});

test("Campaign Setup uses MapTiler by default, selects a geographic area by corners, and omits Atlas GeoJSON authoring", () => {
  assert.match(setupHtml, /<option value="maptiler-style">Online MapTiler map<\/option>/);
  assert.match(setupHtml, /Campaign map base[\s\S]*?MapTiler is the default campaign base/);
  assert.match(setupHtml, /id="select-map-area-corners"[^>]*>Select two corners on map/);
  assert.match(setupHtml, /id="reset-map-area-corners"[^>]*>Reset \/ reselect campaign area/);
  assert.doesNotMatch(setupHtml, /current view as campaign area|capture-map-area/);
  assert.match(setupHtml, /type="password"[^>]*autocomplete="off"/);
  assert.match(setupHtml, /MapTiler online map selected\. Its style attribution is displayed on the map/);
  assert.doesNotMatch(setupHtml, /Atlas GeoJSON|fieldpapers-file|map-extract-tools|maptiler-reference-frame|<iframe[^>]+maptiler/i);
  assert.match(setupHtml, /format: "maptiler-style", styleId: "01a1b6c9-9a4c-7ab4-bf09-6d75353e5420"/);
  assert.match(setupHtml, /window\.FieldbookBasemap\.setMapTilerKey\(mapTilerKeyInput\.value\)/);
  assert.match(appSource, /connect-src 'self' https:\/\/nominatim\.openstreetmap\.org https:\/\/api\.maptiler\.com/);
  assert.match(appSource, /worker-src 'self' blob:/);
  assert.match(appSource, /"\/maptiler-reference-client\.js", \["maptiler-reference-client\.js", "text\/javascript; charset=utf-8"\]/);
});
