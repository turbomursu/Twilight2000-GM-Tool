const assert = require("node:assert/strict");
const test = require("node:test");
const { createStyle, validLicenseUrl } = require("../vector-atlas-client.js");

test("creates local vector styles for every PMTiles source layer and geometry type", () => {
  const style = createStyle("/api/player/campaigns/campaign-1/map-basemap", {
    vector_layers: JSON.stringify([{ id: "land" }, { id: "roads" }])
  });
  assert.equal(style.version, 8);
  assert.equal(style.sources.atlas.type, "vector");
  assert.equal(style.sources.atlas.url, "pmtiles:///api/player/campaigns/campaign-1/map-basemap");
  assert.deepEqual(style.layers.map(({ type }) => type), ["background", "fill", "line", "circle", "fill", "line", "circle"]);
  assert.deepEqual(style.layers.slice(1).map(({ "source-layer": sourceLayer }) => sourceLayer),
    ["land", "land", "land", "roads", "roads", "roads"]);
});

test("rejects archives without vector layer metadata and non-local tile URLs", () => {
  assert.throws(() => createStyle("/offline-basemaps/id.pmtiles", {}), /no usable vector-layer metadata/);
  assert.throws(() => createStyle("https://tiles.example.test/archive.pmtiles", { vector_layers: [{ id: "land" }] }),
    /served from this Fieldbook server/);
  assert.throws(() => createStyle("//tiles.example.test/archive.pmtiles", { vector_layers: [{ id: "land" }] }),
    /served from this Fieldbook server/);
});

test("accepts only HTTPS license URLs without embedded credentials", () => {
  assert.equal(validLicenseUrl("https://maps.example.test/license"), "https://maps.example.test/license");
  assert.equal(validLicenseUrl("http://maps.example.test/license"), null);
  assert.equal(validLicenseUrl("******maps.example.test/license"), null);
  assert.equal(validLicenseUrl("javascript:alert(1)"), null);
});
