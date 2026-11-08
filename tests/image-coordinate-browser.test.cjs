const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const test = require("node:test");
const vm = require("node:vm");
const coordinates = require("../map-coordinates.js");
const contract = require("../campaign-package-contract.js");
const read = (file) => readFileSync(`${__dirname}/../${file}`, "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));
const bounds = { type: "image-km", widthPixels: 1000, heightPixels: 500, widthKm: 100 };
const image = { format: "static-image", assetId: "gm-image", attribution: "GM", assetUrl: "/api/player/campaigns/assigned/map-basemap" };
const geographic = { south: 59, west: 13, north: 61, east: 15 };

function leaflet() {
  const layers = [], maps = [], events = [];
  const layer = (kind, points, options = {}) => ({
    kind, points, options, handlers: {},
    addTo(map) { this.map = map; layers.push(this); return this; },
    on(event, callback) { this.handlers[event] = callback; return this; },
    once(event, callback) { if (event === "load") queueMicrotask(callback); return this; },
    bindTooltip() { return this; }, bindPopup() { return this; },
    remove() { this.removed = true; }
  });
  const L = {
    CRS: { Simple: {}, EPSG3857: {} },
    map(container, options) {
      const map = {
        options, zoom: 0, handlers: {}, container,
        getBoundsZoom: () => options.crs === L.CRS.Simple ? -3 : 5,
        setMinZoom(value) { this.min = value; }, setMaxZoom(value) { this.max = value; },
        setView(point, zoom) { this.position = point; this.zoom = zoom; this.handlers.zoomend?.(); return this; },
        getZoom() { return this.zoom; },
        setZoom(value) { this.zoom = Math.min(this.max, Math.max(this.min, value)); this.handlers.zoomend?.(); },
        on(event, callback) { this.handlers[event] = callback; return this; },
        invalidateSize() {}, remove() { this.removed = true; }, removeLayer(value) { value.remove(); }
      };
      maps.push(map); return map;
    },
    latLngBounds: (value) => ({ getCenter: () => [(value[0][0] + value[1][0]) / 2, (value[0][1] + value[1][1]) / 2] }),
    imageOverlay: (url, points, options) => Object.assign(layer("image", points, options), { url }),
    tileLayer: (url, options) => Object.assign(layer("online", null, options), { url }),
    marker: (points, options) => layer("marker", points, options),
    circleMarker: (points, options) => layer("point", points, options),
    polyline: (points, options) => layer("line", points, options),
    polygon: (points, options) => layer("polygon", points, options),
    divIcon: (options) => options, icon: (options) => options
  };
  const context = vm.createContext({
    L, FieldbookMapCoordinates: coordinates, queueMicrotask,
    document: { createElement: () => ({ style: {} }), querySelector: () => null,
      dispatchEvent: (event) => events.push(event) },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    requestAnimationFrame: (callback) => callback(), form: null
  });
  vm.runInContext(read("map-basemap-client.js"), context);
  return { L, context, layers, maps, events };
}

test("published image map projects points, route and bounded geometry, with 200% zoom/reset", async () => {
  const h = leaflet();
  const source = read("map-publication-client.js");
  vm.runInContext(source.slice(source.indexOf("  function mapView("), source.indexOf('  const form =')), h.context);
  const output = {}, plus = {}, minus = {};
  const viewer = h.context.mapView({ replaceChildren() {} }, output, plus, minus);
  const snapshot = {
    bounds, offlineBasemap: image, playerPosition: { x: 12, y: 8 },
    locations: [{ name: "Camp", position: { x: 10, y: 20 } }],
    markings: [{ label: "Point", position: { x: 30, y: 25 } }],
    route: [{ position: { x: 10, y: 20 } }, { position: { x: 12, y: 8 } }],
    geometries: [
      { label: "Line", geometry: { type: "LineString", coordinates: [[10, 20], [30, 25]] } },
      { label: "Area", geometry: { type: "Polygon", coordinates: [[[0, 0], [10, 0], [10, 10], [0, 0]]] } }
    ]
  };
  assert.equal(await viewer.render(snapshot), true);
  const map = h.maps[0];
  assert.equal(map.options.crs, h.L.CRS.Simple);
  assert.equal(map.min, -5);
  assert.deepEqual(plain(map.position), [8, 12]);
  assert.equal(h.layers[0].url, image.assetUrl);
  assert.deepEqual(plain(h.layers[0].points), [[0, 0], [50, 100]]);
  assert.deepEqual(plain(h.layers.filter((entry) => entry.kind === "point").map((entry) => entry.points)), [[20, 10], [25, 30], [8, 12]]);
  assert.deepEqual(plain(h.layers.find((entry) => entry.kind === "line").points), [[20, 10], [25, 30]]);
  assert.deepEqual(plain(h.layers.find((entry) => entry.kind === "polygon").points), [[[0, 0], [0, 10], [10, 10], [0, 0]]]);
  for (let i = 0; i < 10; i++) viewer.zoom(.25);
  assert.equal(output.textContent, "200%");
  assert.equal(plus.disabled, true);
  for (let i = 0; i < 20; i++) viewer.zoom(-.25);
  assert.equal(minus.disabled, true);
  map.position = [40, 70]; viewer.reset();
  assert.deepEqual(plain(map.position), [8, 12]);
  assert.equal(output.textContent, "100%");
  assert.equal(map.zoom, -3);
  assert.equal(h.layers.some((entry) => entry.kind === "online"), false);
  await viewer.render({ ...snapshot, bounds: geographic, offlineBasemap: null, playerPosition: { lat: 60, lng: 14 }, locations: [], markings: [], route: [], geometries: [] });
  assert.equal(map.removed, true, "CRS changes rebuild rather than mutate a Leaflet instance");
  assert.equal(h.maps[1].options.crs, h.L.CRS.EPSG3857);
  assert.deepEqual(plain(h.maps[1].position), [60, 14]);
});

test("incompatible image backgrounds are rejected without replacing the current layer or requesting tiles", async () => {
  const h = leaflet();
  const errors = [];
  const controller = h.context.FieldbookBasemap.controller({}, (message) => errors.push(message));
  controller.set(image, bounds);
  for (const background of [null, { ...image, format: "raster-pmtiles" }, { ...image, format: "vector-pmtiles" }]) controller.set(background, bounds);
  assert.equal(h.layers.length, 1);
  assert.equal(h.layers[0].removed, undefined);
  assert.equal(errors.length, 3);
  assert.ok(errors.every((message) => /require geographic bounds/.test(message)));
});

test("GM visualization projects image locations and party drag events without fake lat/lng", () => {
  const h = leaflet();
  vm.runInContext(read("map-visualization-client.js") + "\nglobalThis.visualization = mapVisualization;", h.context);
  const visualization = h.context.visualization;
  visualization.initializeVisualization({}, bounds);
  const locations = { a: { mapPosition: { x: 10, y: 20 } }, b: { x: 12, y: 8 } };
  visualization.renderRoute([{ locationId: "a", ordinal: 0 }, { locationId: "b", ordinal: 1 }], locations, true);
  visualization.renderLocations(Object.values(locations), true);
  visualization.renderPartyPosition({ x: 12, y: 8 }, true);
  const marker = h.layers.at(-1);
  assert.equal(marker.options.draggable, true);
  assert.deepEqual(plain(marker.points), [8, 12]);
  marker.handlers.dragend({ target: { getLatLng: () => ({ lat: 25, lng: 30 }) } });
  assert.deepEqual(plain(h.events[0].detail), { x: 30, y: 25 });
  visualization.renderPartyPosition({ x: 12, y: 8 }, false);
  assert.equal(h.layers.at(-1).options.draggable, false);
  visualization.renderPartyPosition(null);
  assert.equal(h.layers.at(-1).removed, true);
  visualization.initializeVisualization({}, geographic);
  visualization.renderLocations([{ lat: 60, lng: 14 }]);
  assert.deepEqual(plain(h.layers.at(-1).points), [60, 14]);
});

const dashboard = read("index.html");
test("GM runtime drag handler sends flat coordinates accepted by the party-position API", async () => {
  let handler;
  const requests = [];
  const source = dashboard.slice(dashboard.indexOf("      // Setup party position drag handler"),
    dashboard.indexOf("      // Publication history state"));
  vm.runInNewContext(source, {
    document: { addEventListener: (_name, callback) => { handler = callback; } },
    runtimeDataLoaded: true, state: { runtimeCampaignId: "owned" },
    fetch: async (path, options) => {
      requests.push({ path, options });
      return { ok: true, json: async () => ({ position: JSON.parse(options.body) }) };
    },
    showToast: () => assert.fail("Position should save successfully"),
    console: { log() {}, error() {} }
  });
  for (const position of [{ x: 10, y: 20 }, { lat: 60, lng: 14 }]) {
    await handler({ detail: position });
    assert.equal(requests.at(-1).path, "/api/campaigns/owned/party-position");
    assert.deepEqual(JSON.parse(requests.at(-1).options.body), position);
  }
});

function runtimeAdapter() {
  const adapter = dashboard.match(/ {6}function isRecord\(value\) \{[\s\S]*?(?= {6}function liveInfluenceForCampaign)/)[0];
  return vm.runInNewContext(`${adapter}\nnormalizeSetupPackageForInfluence`, {
    FieldbookCampaignPackageContract: contract, FieldbookMapCoordinates: coordinates
  });
}
function setupPackage() {
  return { packageType: "fieldbook.campaign-setup", schemaVersion: 2,
    campaign: { id: "image", name: "Image campaign", setting: "GM map" },
    map: { name: "Local image", bounds, center: { x: 50, y: 25 }, zoom: -3,
      offlineBasemap: { format: "static-image", assetId: "11111111-1111-4111-8111-111111111111", attribution: "GM" },
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, origin: { x: 0, y: 50 }, terrainCells: [] },
      locations: [{ id: "camp", name: "Camp", kind: "Settlement", mapPosition: { x: 10, y: 20 }, isStartingLocation: true }],
      offlineAnnotations: [] }, factions: [], settlements: [], scenarioNotes: [] };
}

test("GM runtime import adapter retains explicit image extent, positions, centre and negative zoom", () => {
  const normalize = runtimeAdapter();
  const input = setupPackage();
  const result = normalize(input);
  assert.deepEqual(plain(result.map.bounds), bounds);
  assert.deepEqual(plain(result.map.center), input.map.center);
  assert.deepEqual(plain(result.map.grid.origin), { x: 0, y: 50 });
  assert.deepEqual(plain(result.map.locations[0].position), { x: 10, y: 20 });
  assert.equal(result.map.zoom, -3);
  for (const invalid of [
    { ...input, map: { ...input.map, bounds: { ...bounds, widthKm: 0 } } },
    { ...input, map: { ...input.map, locations: [{ ...input.map.locations[0], mapPosition: { lat: 10, lng: 20 } }] } }
  ]) assert.throws(() => normalize(invalid));
});

test("runtime influence hex math uses kilometres and northwest image origin", () => {
  const source = dashboard.slice(dashboard.indexOf("      function liveAxialForPosition("), dashboard.indexOf("      function initializeInfluenceMap("));
  const context = vm.createContext({ state: { setupPackage: { map: { bounds } } }, FieldbookMapCoordinates: coordinates });
  vm.runInContext(source, context);
  const origin = { x: 0, y: 50 };
  assert.deepEqual(plain(context.livePositionForMeters(10000, -10000, origin)), { x: 10, y: 40 });
  assert.deepEqual(plain(context.liveAxialForPosition({ x: 10, y: 50 }, origin)), { q: 1, r: 0 });
  assert.deepEqual(plain(context.liveAxialForPosition(origin, origin)), { q: 0, r: 0 });
  context.state.setupPackage.map.bounds = geographic;
  const geoOrigin = { lat: 60, lng: 13 };
  assert.deepEqual(plain(context.liveAxialForPosition({ lat: 60, lng: 13 + 10000 / (111320 * Math.cos(Math.PI / 3)) }, geoOrigin)), { q: 1, r: 0 });
});

test("GM route overview uses image CRS, preserves panning on redraw and rebuilds when coordinates change", () => {
  const h = leaflet();
  const elements = new Map();
  const node = (id) => {
    if (!elements.has(id)) elements.set(id, { hidden: false, clientWidth: 600 });
    return elements.get(id);
  };
  h.L.featureGroup = () => ({ addTo() { return this; }, clearLayers() {} });
  const createMap = h.L.map;
  h.L.map = (...args) => {
    const map = createMap(...args);
    map.fitBounds = (points) => { map.fitted = points; map.fits = (map.fits || 0) + 1; };
    return map;
  };
  Object.assign(h.context, {
    document: { getElementById: node }, window: {}, state: { setupPackage: { map: { bounds, offlineBasemap: image } }, runtimeCampaignId: "image", activeStop: 0 },
    route: [{ name: "Camp", mapPosition: { x: 10, y: 20 } }, { name: "Depot", mapPosition: { x: 30, y: 25 } }],
    runtimeRouteMap: null, runtimeRouteLayer: null, runtimeBasemap: null, runtimeBasemapSignature: null, runtimeRouteSignature: null,
    escapeHtml: (value) => value
  });
  const source = dashboard.slice(dashboard.indexOf("      function renderRuntimeRouteMap("), dashboard.indexOf("      function routeLocations("));
  vm.runInContext(source, h.context);
  h.context.renderRuntimeRouteMap();
  const imageMap = h.maps[0];
  assert.equal(imageMap.options.crs, h.L.CRS.Simple);
  assert.ok(imageMap.options.minZoom < 0);
  assert.deepEqual(plain(imageMap.fitted), [[0, 0], [50, 100]]);
  assert.deepEqual(plain(h.layers.find((entry) => entry.kind === "line").points), [[20, 10], [25, 30]]);
  imageMap.position = [35, 75]; imageMap.zoom = 2;
  h.context.renderRuntimeRouteMap();
  assert.equal(h.maps.length, 1);
  assert.equal(imageMap.fits, 1);
  assert.deepEqual(imageMap.position, [35, 75]);
  assert.equal(imageMap.zoom, 2);
  h.context.state.setupPackage.map = { bounds: geographic, offlineBasemap: null };
  h.context.route = [{ name: "Camp", mapPosition: { lat: 60, lng: 14 } }];
  h.context.renderRuntimeRouteMap();
  assert.equal(imageMap.removed, true);
  assert.equal(h.maps[1].options.crs, h.L.CRS.EPSG3857);
  assert.deepEqual(plain(h.maps[1].fitted), [[59, 13], [61, 15]]);
  h.context.state.runtimeCampaignId = "another-geographic-campaign";
  h.context.route = [];
  h.context.renderRuntimeRouteMap();
  assert.equal(h.maps[1].fits, 2);
  assert.equal(node("runtime-route-map").hidden, false);
  h.context.state.setupPackage.map = { bounds: geographic, offlineBasemap: { format: "maptiler-style", styleId: "01a1b6c9-9a4c-7ab4-bf09-6d75353e5420" } };
  h.context.renderRuntimeRouteMap();
  assert.equal(node("runtime-maptiler-key-field").hidden, false);
  assert.match(node("runtime-route-map-notice").textContent, /MapTiler API key/);
  h.context.renderRuntimeRouteMap();
  assert.equal(node("runtime-route-map-notice").hidden, false, "redraw retains the missing-key error");
  h.context.state.setupPackage.map.bounds = null;
  h.context.renderRuntimeRouteMap();
  assert.equal(node("runtime-route-map").hidden, true);
  assert.match(node("runtime-route-map-notice").textContent, /no valid map extent/);
});

test("GM location modal displays image labels and saves x/y to the GM endpoint", async () => {
  const nodes = new Map(), requests = [];
  const node = (id) => {
    if (!nodes.has(id)) nodes.set(id, { value: "", dataset: {}, style: {}, showModal() {}, close() {}, addEventListener() {} });
    return nodes.get(id);
  };
  const context = vm.createContext({ window: {}, FieldbookMapCoordinates: coordinates,
    document: { getElementById: node, querySelector: node, addEventListener() {} },
    campaignApiRequest: async (path, options) => {
      requests.push({ path, options });
      if (options.method === "GET") return { locations: [{ id: "camp", name: "Camp", kind: "Settlement", mapPosition: { x: 10, y: 20 } }] };
      return { location: { id: "camp", name: "Camp", kind: "Settlement", ...JSON.parse(options.body) } };
    }, showToast() {}, setTimeout() {}, console
  });
  vm.runInContext(read("location-client.js"), context);
  const client = context.window.locationClient;
  await client.loadLocationsForCampaign("owned", bounds);
  client.openLocationEditorModal("camp");
  assert.equal(node("location-lat").value, 20);
  assert.equal(node("location-lng").value, 10);
  assert.match(node('label[for="location-lat"]').textContent, /kilometres north/);
  assert.equal(node("location-lat").max, 50);
  node("location-lat").value = "25"; node("location-lng").value = "30";
  await context.handleLocationSave();
  assert.equal(requests.at(-1).path, "/api/campaigns/owned/locations/camp");
  assert.deepEqual(JSON.parse(requests.at(-1).options.body).mapPosition, { x: 30, y: 25 });
  assert.match(node("location-list").innerHTML, /x 30.00, y 25.00/);
});

test("GM and player pages load coordinates before every coordinate-aware map client", () => {
  for (const file of ["index.html", "player-interface.html"]) {
    const html = read(file);
    const helper = html.indexOf('src="/map-coordinates.js"');
    for (const client of ["campaign-package-contract.js", "map-basemap-client.js", "map-publication-client.js", "map-visualization-client.js", "location-client.js"]) {
      const position = html.search(new RegExp(`src="(?:\\./|/)?${client.replaceAll(".", "\\.")}"`));
      if (position !== -1) assert.ok(helper > 0 && helper < position, `${file}: ${client}`);
    }
    for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) new vm.Script(script, { filename: file });
  }
});

test("GM publication controls choose image hexes for markings and player position without manual coordinates", async () => {
  for (const imageMode of [true, false]) {
  const campaignBounds = imageMode ? bounds : geographic;
  const campaignBasemap = imageMode ? image : null;
  const campaignGrid = imageMode
    ? { coordinateSystem: "axial-q-r", cellKm: 10, origin: { x: 50, y: 25 } }
    : { coordinateSystem: "axial-q-r", cellKm: 10, origin: { lat: 60, lng: 14 } };
  const nodes = new Map(), requests = [], pickerMaps = [];
  class Node {
    constructor() { this.value = ""; this.dataset = {}; this.handlers = {}; this.children = []; this.options = this.children; this.open = false; this.disabled = false; }
    set value(value) { this._value = String(value); }
    get value() { return this._value; }
    addEventListener(event, callback) { this.handlers[event] = callback; }
    replaceChildren(...children) { this.children = children; }
    append(...children) { this.children.push(...children); }
    add(child) { this.append(child); }
    setAttribute() {}
    reset() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.handlers.close?.(); }
    querySelector(selector) {
      const attribute = selector.match(/^\[data-([a-z-]+)\]$/);
      if (attribute) {
        const key = attribute[1].replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        return this.children.find((child) => Object.hasOwn(child.dataset, key));
      }
      return node(selector);
    }
    querySelectorAll(selector) {
      if (selector === "[data-map-location]:checked") return [];
      if (selector === "[data-marking-id]") return node("#map-marking-entries").children;
      if (selector === "[data-geometry-id]") return node("#map-geometry-entries").children;
      return [];
    }
  }
  const node = (selector) => {
    if (!nodes.has(selector)) nodes.set(selector, new Node());
    return nodes.get(selector);
  };
  const map = {
    revision: 1, catalog: { bounds: campaignBounds, offlineBasemap: campaignBasemap, grid: campaignGrid, locations: [] },
    draft: { locationIds: [], routeLocationIds: [], markings: [], geometries: [],
      playerPosition: imageMode ? { x: 12, y: 8 } : { lat: 60, lng: 14 } }
  };
  node("#map-player-latitude").readOnly = true;
  node("#map-player-longitude").readOnly = true;
  const makeLayer = (kind, points, options = {}) => ({
    kind, points, options, handlers: {},
    addTo(target) { if (target.layers) target.layers.push(this); return this; },
    on(event, handler) { this.handlers[event] = handler; return this; },
    bindTooltip() { return this; }
  });
  const L = {
    CRS: { Simple: {}, EPSG3857: {} },
    map(_container, options) {
      const current = {
        options, handlers: {}, groups: [], getBounds() { return imageMode
          ? { getSouthWest: () => ({ lat: 0, lng: 0 }), getNorthWest: () => ({ lat: 50, lng: 0 }),
            getNorthEast: () => ({ lat: 50, lng: 100 }), getSouthEast: () => ({ lat: 0, lng: 100 }), contains: () => true }
          : { getSouthWest: () => ({ lat: campaignBounds.south, lng: campaignBounds.west }), getNorthWest: () => ({ lat: campaignBounds.north, lng: campaignBounds.west }),
            getNorthEast: () => ({ lat: campaignBounds.north, lng: campaignBounds.east }), getSouthEast: () => ({ lat: campaignBounds.south, lng: campaignBounds.east }), contains: () => true }; },
        fitBounds() {}, on(event, callback) { this.handlers[event] = callback; return this; },
        invalidateSize() {}, remove() {}, setView() { return this; }
      };
      pickerMaps.push(current); return current;
    },
    layerGroup() { return { layers: [], addTo(target) { target.groups.push(this); return this; }, clearLayers() { this.layers = []; } }; },
    polygon: (points, options) => makeLayer("polygon", points, options),
    marker: (points, options) => makeLayer("marker", points, options),
    circleMarker: (points, options) => makeLayer("circle", points, options),
    polyline: (points, options) => makeLayer("line", points, options),
    divIcon: (options) => options
  };
  node("#runtime-campaign-select").value = "owned";
  const context = vm.createContext({
    L, requestAnimationFrame: (callback) => callback(),
    FieldbookMapCoordinates: coordinates,
    FieldbookBasemap: { controller: () => ({ set() {}, destroy() {} }) },
    FieldbookVectorAtlas: { validLicenseUrl: () => null },
    document: { querySelectorAll: () => [], querySelector: (selector) => selector === "#player-map-tab" ? null : node(selector),
      getElementById: (id) => node(`#${id}`), createElement: () => new Node(),
      addEventListener() {}, dispatchEvent() {} },
    Option: class extends Node { constructor(text, value) { super(); this.textContent = text; this.value = value; } },
    crypto: { randomUUID: () => "geometry" }, CustomEvent: class {},
    fetch: async (path, options) => {
      requests.push({ path, options });
      if (options.method === "PUT") { map.revision++; map.draft = JSON.parse(options.body).draft; }
      return { ok: true, json: async () => ({ map }) };
    }, structuredClone, console
  });
  vm.runInContext(read("map-publication-client.js"), context);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(node("#map-player-latitude").value, imageMode ? "8" : "60");
  assert.equal(node("#map-player-longitude").value, imageMode ? "12" : "14");
  assert.match(node('label[for="map-player-longitude"]').textContent, imageMode ? /x \(km east\)/ : /longitude/);
  assert.equal(node("#map-player-latitude").readOnly, true);
  assert.equal(node("#map-player-longitude").readOnly, true);
  assert.equal(node("#gm-maptiler-key-field").hidden, true, "the background key is hidden unless the campaign uses MapTiler");
  assert.match(node('label[for="map-geometry-coordinates"]').textContent, imageMode ? /x,y kilometres/ : /longitude,latitude/);
  if (imageMode) {
    assert.match(node("#gm-map-background-current").textContent, /100 × 50 km/);
    node("#gm-map-background-kind").value = "online";
    await node("#save-gm-map-background").handlers.click();
    assert.equal(requests.length, 1);
    assert.match(node("#gm-map-publication-status").textContent, /requires? geographic bounds/);
  } else {
    assert.match(node("#gm-map-background-current").textContent, /Bounds: 59, 13 to 61, 15/);
  }
  node("#map-geometry-type").value = "Polygon";
  node("#map-geometry-label").value = "Area";
  node("#map-geometry-coordinates").value = "0,0\n10,0\n10,10";
  node("#add-map-geometry").handlers.click();
  const clickHex = (q, r) => {
    const contextGroup = pickerMaps.at(-1);
    assert.ok(contextGroup);
    const expected = coordinates.hexGeometry(q, r, map.catalog.grid, campaignBounds);
    const group = contextGroup.handlers;
    assert.ok(group);
    const polygonGroup = contextGroup.groups[1];
    assert.ok(polygonGroup);
    const wanted = expected.vertices.map((point) => coordinates.toLatLng(point, campaignBounds));
    const polygon = polygonGroup.layers.find((layer) => JSON.stringify(plain(layer.points)) === JSON.stringify(plain(wanted)));
    assert.ok(polygon, `visible hex ${q},${r} should be drawn`);
    polygon.handlers.click({ latlng: { lat: -1, lng: -1 } });
    assert.equal(node("#use-map-hex").disabled, true, "out-of-bounds clicks cannot select a hex");
    const latlng = coordinates.toLatLng(expected.position, campaignBounds);
    polygon.handlers.click({ latlng: { lat: latlng[0], lng: latlng[1] } });
    assert.equal(node("#use-map-hex").disabled, false);
    return expected.position;
  };
  const selectHex = (q, r) => {
    const position = clickHex(q, r);
    node("#use-map-hex").handlers.click();
    assert.equal(node("#map-hex-picker-dialog").open, false);
    return position;
  };
  node("#add-map-marking").handlers.click();
  assert.equal(node("#map-hex-picker-key-field").hidden, true, "the picker key is hidden unless the campaign uses MapTiler");
  assert.equal(node("#map-marking-entries").children.length, 0, "opening picker alone does not add a marking");
  clickHex(2, -1);
  node("#cancel-map-hex-picker").handlers.click();
  assert.equal(node("#map-hex-picker-dialog").open, false);
  assert.equal(node("#map-marking-entries").children.length, 0, "cancel leaves the draft unchanged");
  node("#add-map-marking").handlers.click();
  const markingPosition = selectHex(2, -1);
  assert.equal(node("#map-marking-entries").children.length, 1);
  const moveMarking = node("#map-marking-entries").children[0].children.find((child) => child.textContent === "Choose hex");
  moveMarking.handlers.click();
  const movedMarkingPosition = selectHex(3, -1);
  node("#choose-player-position-hex").handlers.click();
  const playerPosition = selectHex(4, -2);
  await node("#gm-map-publication-form").handlers.submit({ preventDefault() {} });
  const submitted = JSON.parse(requests.at(-1).options.body).draft;
  assert.deepEqual(submitted.playerPosition, playerPosition);
  assert.deepEqual(submitted.geometries[0].geometry.coordinates, [[[0, 0], [10, 0], [10, 10], [0, 0]]]);
  assert.deepEqual(submitted.markings[0].position, movedMarkingPosition);
  assert.notDeepEqual(markingPosition, movedMarkingPosition);
  assert.equal(requests.at(-1).path, "/api/campaigns/owned/map-publication");
  }
});
