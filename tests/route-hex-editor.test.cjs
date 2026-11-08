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
    origin: image ? { x: 0, y: 30 } : { lat: 61, lng: 13 }, terrainCells: {} };
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
      { hex: { q: 3, r: -2 }, detail: "Waypoint", kmFromPrevious: 10 }
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

test("route leg distances use valid hex centers in geographic and image maps with manual legacy fallback", () => {
  for (const image of [false, true]) {
    const h = harness(image), c = h.context;
    const first = coordinates.hexGeometry(2, -1, h.grid, h.bounds);
    const third = coordinates.hexGeometry(4, -2, h.grid, h.bounds);
    const firstPosition = image
      ? { x: first.position.x + 0.1, y: first.position.y - 0.1 }
      : { lat: first.position.lat - 0.0001, lng: first.position.lng + 0.0001 };
    c.state.runtimeLocations.push(
      { id: "legacy-first", mapPosition: firstPosition },
      { id: "legacy-third", mapPosition: third.position }
    );
    c.routeDraft.push(
      { locationId: "legacy-first", detail: "Legacy stop", kmFromPrevious: 91 },
      { locationId: "legacy-third", detail: "Later stop", kmFromPrevious: 92 }
    );
    assert.equal(c.routeDistanceForStop(0), 0);
    assert.equal(c.routeDistanceForStop(1), 20);
    assert.equal(c.routeEditorValues()[1].kmFromPrevious, 20);

    c.state.runtimeLocations[1].mapPosition = image ? { x: -1, y: 1 } : { lat: 0, lng: 0 };
    assert.equal(c.routeDistanceForStop(1), null);
    assert.equal(c.routeEditorValues()[1].kmFromPrevious, 92);
  }
});

test("marching estimates trace traversed terrain in both coordinate modes and keep driving GM-managed", () => {
  for (const image of [false, true]) {
    const h = harness(image), c = h.context;
    const start = coordinates.hexGeometry(0, 0, h.grid, h.bounds);
    const finish = coordinates.hexGeometry(4, 0, h.grid, h.bounds);
    c.state.runtimeLocations.push(
      { id: "start", mapPosition: start.position },
      { id: "finish", mapPosition: finish.position }
    );
    c.routeDraft.push(
      { locationId: "start", detail: "Start", kmFromPrevious: 0 },
      { locationId: "finish", detail: "Finish", kmFromPrevious: 40 }
    );
    c.state.setupPackage.map.grid.terrainCells = {
      "1,0": "road", "2,0": "open", "3,0": "woods", "4,0": "swamp"
    };
    const mixed = c.routeMarchingEstimate(1);
    assert.equal(mixed.status, "estimate");
    assert.equal(mixed.shifts, 3);
    assert.equal(mixed.roadOpenHexes, 2);
    assert.equal(mixed.otherTerrainHexes, 2);
    assert.equal(mixed.mixed, true);
    assert.match(mixed.message, /Planning estimate: 3 shifts/);
    assert.equal(c.routeDistanceForStop(1), 40);

    c.state.setupPackage.map.grid.terrainCells = {
      "1,0": "road", "2,0": "open", "3,0": "road", "4,0": "open"
    };
    assert.equal(c.routeMarchingEstimate(1).shifts, 2);
    assert.equal(c.routeMarchingEstimate(1).mixed, false);

    c.state.setupPackage.map.grid.terrainCells = {
      "1,0": "woods", "2,0": "hills", "3,0": "mountains", "4,0": "ruins"
    };
    assert.equal(c.routeMarchingEstimate(1).shifts, 4);

    delete c.state.setupPackage.map.grid.terrainCells["2,0"];
    const missing = c.routeMarchingEstimate(1);
    assert.equal(missing.status, "unavailable");
    assert.match(missing.message, /terrain is unassigned for traversed hex 2,0/);

    c.state.setupPackage.map.grid.terrainCells["2,0"] = "unverified";
    assert.match(c.routeMarchingEstimate(1).message, /unrecognized terrain in traversed hex 2,0/);

    c.state.setupPackage.map.grid.terrainCells["2,0"] = "woods";
    c.state.runtimeLocations[1].mapPosition = image ? { x: -1, y: 1 } : { lat: 0, lng: 0 };
    assert.equal(c.routeMarchingEstimate(1).status, "unavailable");
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
