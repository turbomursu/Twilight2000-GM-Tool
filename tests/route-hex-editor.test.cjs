const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const coordinates = require("../map-coordinates.js");
const source = readFileSync(`${__dirname}/../index.html`, "utf8");

function harness(image) {
  const bounds = image ? { type: "image-km", widthPixels: 600, heightPixels: 300, widthKm: 60 }
    : { south: 59, west: 13, north: 61, east: 15 };
  const grid = { coordinateSystem: "axial-q-r", cellKm: 10,
    origin: image ? { x: 0, y: 30 } : { lat: 61, lng: 13 } };
  const nodes = { "route-editor-dialog": { open: true }, "save-route-editor": { disabled: false }, "route-waypoint-map-status": {} };
  const context = vm.createContext({
    FieldbookMapCoordinates: coordinates, state: { runtimeCampaignId: "campaign", runtimeLocations: [], setupPackage: { map: { bounds, grid } } },
    routeDraft: [], routeHexLocations: [], routeEditorCampaignId: "campaign",
    routeEditorMap: null, routeEditorBasemap: null,
    routeEditorVisibleHexes: new Set(),
    document: { getElementById: (id) => nodes[id], querySelectorAll: () => context.routeDraft.map((stop) => ({
      querySelector: (selector) => ({ value: selector === "[data-route-location]" ? stop.locationId
        : selector === "[data-route-detail]" ? stop.detail : String(stop.kmFromPrevious) })
    })) }
  });
  const start = source.indexOf("      function routeLocations()");
  vm.runInContext(source.slice(start, source.indexOf("      function renderMapLocationEditor()", start)), context);
  vm.runInContext("renderRouteEditorRows = () => {};", context);
  return { context, nodes, bounds, grid };
}

test("map clicks stage ordered canonical hex waypoints without persisting or moving the party", () => {
  for (const image of [false, true]) {
    const h = harness(image), c = h.context;
    const first = coordinates.hexGeometry(2, -1, h.grid, h.bounds);
    const second = coordinates.hexGeometry(3, -2, h.grid, h.bounds);
    assert.equal(c.handleRouteHexClick(first.position), true);
    assert.equal(c.handleRouteHexClick(first.position), false, "duplicate center is not appended");
    assert.equal(c.handleRouteHexClick(second.position), true);
    assert.deepEqual(JSON.parse(JSON.stringify(c.routeEditorValues())), [
      { hex: { q: 2, r: -1 }, detail: "Waypoint", kmFromPrevious: 0 },
      { hex: { q: 3, r: -2 }, detail: "Waypoint", kmFromPrevious: 0 }
    ]);
    assert.equal(c.state.runtimeLocations.length, 0, "locations remain staged");
    assert.equal(c.state.partyMapPosition, undefined);
    c.routeDraft.reverse();
    assert.equal(c.routeEditorValues()[0].hex.q, 3);
    c.routeDraft.pop();
    assert.equal(c.routeEditorValues().length, 1);
    h.nodes["route-editor-dialog"].open = false;
    assert.equal(c.handleRouteHexClick(first.position), false);
    c.clearRouteEditorMap();
    assert.equal(c.routeDraft.length, 0);
    assert.equal(c.routeHexLocations.length, 0);
  }
});

test("hex selection rejects invalid/outside clicks, changed campaigns and saving mode, while reusing existing centers", () => {
  for (const image of [false, true]) {
    const h = harness(image), c = h.context;
    assert.equal(c.handleRouteHexClick(image ? { x: -1, y: 2 } : { lat: 0, lng: 0 }), false);
    assert.equal(c.handleRouteHexClick({ q: 2, r: -1 }), false);
    const hex = coordinates.hexGeometry(2, -1, h.grid, h.bounds);
    c.routeEditorMap = {};
    assert.equal(c.handleRouteHexClick(hex.position), false, "no additions when overlay is not visible");
    c.routeEditorMap = null;
    c.state.runtimeLocations.push({ id: "existing", name: "Existing center", mapPosition: hex.position });
    h.nodes["save-route-editor"].disabled = true;
    assert.equal(c.handleRouteHexClick(hex.position), false);
    h.nodes["save-route-editor"].disabled = false;
    c.state.runtimeCampaignId = "changed";
    assert.equal(c.handleRouteHexClick(hex.position), false);
    c.state.runtimeCampaignId = "campaign";
    assert.equal(c.handleRouteHexClick(hex.position), true);
    assert.equal(c.routeHexLocations.length, 0);
    assert.equal(c.routeEditorValues()[0].locationId, "existing");
  }
});

test("route grid geometry round trips both coordinate spaces and rejects unsupported grids or out-of-bounds centers", () => {
  for (const image of [false, true]) {
    const h = harness(image);
    const hex = coordinates.hexGeometry(2, -1, h.grid, h.bounds);
    assert.equal(hex.vertices.length, 6);
    assert.deepEqual(coordinates.axialForPosition(hex.position, h.grid.origin, h.bounds), { q: 2, r: -1 });
    assert.equal(coordinates.hexGeometry(9999, 9999, h.grid, h.bounds), null);
    assert.equal(coordinates.hexGeometry(2.5, -1, h.grid, h.bounds), null);
    assert.equal(coordinates.hexGeometry(2, -1, { ...h.grid, cellKm: 5 }, h.bounds), null);
  }
  assert.match(source, /<div id="route-waypoint-map"[^>]*>/);
  assert.match(source, /routeEditorDialog.addEventListener\("close", clearRouteEditorMap\)/);
  assert.match(source, /routeEditorBasemap\?\.destroy\(\)/);
  assert.match(source, /data-maptiler-key/);
  assert.match(source, /document.addEventListener\("fieldbook:edit-runtime-route", openRouteEditor\)/);
});
