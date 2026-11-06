const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");
const vm = require("node:vm");
const test = require("node:test");
const coordinates = require("../map-coordinates.js");
const contract = require("../campaign-package-contract.js");

const html = readFileSync(join(__dirname, "..", "campaign-setup.html"), "utf8");
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function harness(savedDraft = null, upload = null, save = null) {
  const nodes = new Map();
  const storage = new Map(savedDraft ? [["fieldbook-campaign-setup-draft-v1", JSON.stringify(savedDraft)]] : []);
  const mapCalls = [];
  const layers = [];
  const exports = [];
  const savedPackages = new Map();
  let currentMap = null;
  class Element {
    constructor(selector = "") {
      this.selector = selector;
      this.value = "";
      this.textContent = "";
      this.files = [];
      this.children = [];
      this.dataset = {};
      this.hidden = true;
      this.disabled = false;
      this.listeners = new Map();
      this.attributes = new Map();
      this.classList = { add() {}, remove() {}, toggle() {} };
      this.style = {};
    }
    append(...children) { children.forEach((child) => { child.parentNode = this; }); this.children.push(...children); }
    replaceChildren(...children) { this.children = []; this.append(...children); }
    addEventListener(event, callback) { this.listeners.set(event, callback); }
    async emit(event, extra = {}) {
      await this.listeners.get(event)?.({ preventDefault() {}, currentTarget: this, target: this, ...extra });
    }
    querySelector(selector) { return node(selector.startsWith("#") ? selector : `${this.selector} ${selector}`); }
    querySelectorAll() { return []; }
    setAttribute(key, value) { this.attributes.set(key, value); }
    getAttribute(key) { return this.attributes.get(key); }
    removeAttribute(key) { this.attributes.delete(key); }
    focus() {}
    reset() {}
    click() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    get options() { return this.children; }
  }
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, new Element(selector));
    return nodes.get(selector);
  }
  const steps = ["brief", "map", "terrain", "locations", "settlements", "factions", "notes", "package"];
  const panels = steps.map((step) => {
    const panel = node(`[data-panel="${step}"]`);
    panel.dataset.panel = step;
    return panel;
  });
  const buttons = steps.map((step) => {
    const button = new Element();
    button.dataset.step = step;
    return button;
  });
  const goButtons = Array.from(html.matchAll(/id="([^"]+)" data-go-step="([^"]+)"/g), ([, id, step]) => {
    const button = node(`#${id}`);
    button.dataset.goStep = step;
    return button;
  });
  const statuses = [node("#terrain-map-status"), node("#location-map-status")];
  function layer(kind, points, options) {
    const item = { kind, points, options, on() { return this; }, addTo() { return this; }, clearLayers() {},
      setLatLng() {}, bindTooltip() { return this; }, bindPopup() { return this; } };
    layers.push(item);
    return item;
  }
  const L = {
    CRS: { Simple: { name: "image" }, EPSG3857: { name: "geographic" } },
    map(element, options) {
      const map = {
        options, zoom: 0, position: [0, 0], extent: [[0, 0], [50, 100]],
        setView(position, zoom) { this.position = position; this.zoom = zoom; return this; },
        fitBounds(extent) { this.extent = extent; return this; },
        getZoom() { return this.zoom; }, getCenter() { return { lat: this.position[0], lng: this.position[1] }; },
        getBounds() {
          const [[s, w], [n, e]] = this.extent;
          return { getSouthWest: () => ({ lat: s, lng: w }), getNorthWest: () => ({ lat: n, lng: w }),
            getNorthEast: () => ({ lat: n, lng: e }), getSouthEast: () => ({ lat: s, lng: e }),
            contains: ([y, x]) => y >= s && y <= n && x >= w && x <= e };
        },
        on() {}, invalidateSize() {}, remove() { this.removed = true; }, panTo() {}, removeLayer() {}
      };
      mapCalls.push(map);
      currentMap = map;
      return map;
    },
    control: { scale: () => ({ addTo() {} }) },
    layerGroup: () => layer("group"),
    polygon: (points, options) => layer("polygon", points, options),
    marker: (points, options) => layer("marker", points, options),
    rectangle: (points, options) => layer("rectangle", points, options),
    geoJSON: (data) => layer("geoJSON", data), divIcon: (options) => options
  };
  const context = vm.createContext({
    document: {
      querySelector: node,
      querySelectorAll(selector) {
        if (selector === "[data-panel]") return panels;
        if (selector === "[data-step]") return buttons;
        if (selector === "[data-go-step]") return goButtons;
        if (selector === "[data-map-status]") return statuses;
        return [];
      },
      createElement: (tag) => new Element(tag), createTextNode: (text) => ({ textContent: text })
    },
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    crypto: { randomUUID }, console, L,
    URL,
    Error, Blob, setTimeout, clearTimeout,
    requestAnimationFrame: (callback) => callback(),
    FieldbookMapCoordinates: coordinates, FieldbookCampaignPackageContract: contract,
    FieldbookBasemap: { assetUrl: (asset) => `/offline-basemaps/${asset.assetId}.image`, controller: () => ({ set() {}, clear() {} }) },
    FieldbookVectorAtlas: { validLicenseUrl: (value) => value.startsWith("https://") ? value : null },
    fetch: async (path, options) => {
      if (path === "/api/setup-packages") {
        const source = JSON.parse(options.body);
        exports.push(source);
        if (save) return save(path, options);
        const id = randomUUID();
        const savedPackage = json(source);
        savedPackage.map.offlineBasemap.assetId = randomUUID();
        savedPackages.set(`/api/setup-packages/${id}`, savedPackage);
        return { ok: true, json: async () => ({ saved: { id, packageUrl: `/api/setup-packages/${id}`,
          packagePath: `gmpack/campsetups/image-campaign-${id}-setup-v2.json`,
          imagePath: `data/maps/image-campaign/${savedPackage.map.offlineBasemap.assetId}.image` } }) };
      }
      if (savedPackages.has(path)) return { ok: true, text: async () => JSON.stringify(savedPackages.get(path)) };
      if (upload) return upload(path, options);
      return { ok: true, json: async () => ({ asset: {
        format: "static-image", assetId: "12345678-1234-4234-9234-123456789abc", width: 1000, height: 500, byteLength: 100
      } }) };
    }
  });
  context.window = context;
  vm.runInContext(script.replace("      state = loadDraft();", `      globalThis.setup = {
        getState: () => state, showStep, collectPackage, normalizeImportedPackage, validatePackage, handleMapClick,
        gridCoordinatesForPosition, localMetersToPosition, selectTerrainCell
      };
      state = loadDraft();`), context);
  return { node, context, storage, mapCalls, layers, exports, savedPackages, currentMap: () => currentMap };
}

async function uploadImage(state, width = "100") {
  state.node("#image-width-km").value = width;
  state.node("#offline-basemap-attribution").value = "GM map credit";
  state.node("#offline-basemap-file").files = [{ type: "image/png", size: 100 }];
  await state.node("#offline-basemap-file").emit("change");
  await state.node("#upload-offline-basemap").emit("click");
}

function json(value) { return JSON.parse(JSON.stringify(value)); }

function readyDraft() {
  return { schemaVersion: 2,
    campaign: { id: randomUUID(), name: "Image campaign", setting: "Test", premise: "Private premise", mapName: "Scanned map" },
    map: { baseMapSource: "static-image", center: { x: 50, y: 25 }, zoom: 0,
      bounds: { type: "image-km", widthPixels: 1000, heightPixels: 500, widthKm: 100 },
      offlineBasemap: { format: "static-image", assetId: randomUUID(), attribution: "GM image" },
      grid: { origin: { x: 0, y: 50 }, terrainCells: {} } },
    locations: [{ id: randomUUID(), name: "Start", position: { x: 50, y: 25 }, isStartingLocation: true }],
    factions: [], settlements: [], scenarioNotes: []
  };
}

test("server save failures stay explicit and incomplete confirmations never show success", async () => {
  for (const save of [
    async () => ({ ok: false, json: async () => ({ error: "Server storage is unavailable." }) }),
    async () => ({ ok: true, json: async () => ({ saved: { id: randomUUID() } }) }),
    async () => { throw new Error("Network disconnected"); }
  ]) {
    const state = harness(readyDraft(), null, save);
    await state.node("#export-package").emit("click");
    assert.match(state.node("#server-save-status").className, /error/);
    assert.match(state.node("#server-save-status").textContent, /not confirmed/);
    assert.equal(state.node("#saved-setup-actions").hidden, true);
    assert.equal(state.node("#export-package").disabled, false);
    assert.equal(state.context.setup.getState().savedSetup, null);
  }
});

test("server saving locks duplicate clicks and preserves the original submitted snapshot", async () => {
  let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const id = randomUUID();
  const state = harness(readyDraft(), null, async () => {
    await waiting;
    return { ok: true, json: async () => ({ saved: { id, packageUrl: `/api/setup-packages/${id}`,
      packagePath: `gmpack/campsetups/image-${id}-setup-v2.json`, imagePath: "data/maps/image/map.image" } }) };
  });
  const saving = state.node("#export-package").emit("click");
  assert.equal(state.node("#export-package").disabled, true);
  assert.equal(state.node("#export-package-top").disabled, true);
  await state.node("#export-package-top").emit("click");
  state.node("#campaign-name").value = "Later draft edit";
  assert.equal(state.exports.length, 1);
  assert.equal(state.exports[0].campaign.name, "Image campaign");
  finish();
  await saving;
  assert.match(state.node("#server-save-status").className, /success/);
  assert.equal(state.node("#export-package").disabled, false);
  assert.equal(state.context.setup.getState().campaign.name, "Later draft edit");
});

test("cancelled server-package reads cannot revive a replacement confirmation", async () => {
  const id = randomUUID();
  const draft = readyDraft();
  draft.savedSetup = { id, packageUrl: `/api/setup-packages/${id}`,
    packagePath: "gmpack/campsetups/saved.json", imagePath: "data/maps/campaign/map.image" };
  let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const state = harness(draft, async () => ({ ok: true, text: async () => { await waiting; return "{}"; } }));
  const opening = state.node("#open-saved-setup").emit("click");
  assert.equal(state.node("#import-package-dialog").open, true);
  await state.node("#cancel-import-package").emit("click");
  finish();
  await opening;
  assert.equal(state.node("#import-package-dialog").open, false);
  assert.equal(state.node("#apply-import-package").disabled, true);
  assert.equal(state.node("#open-saved-setup").disabled, false);
});

test("applying a saved package prevents an older image upload from replacing its map", async () => {
  const draft = readyDraft();
  const id = randomUUID();
  draft.savedSetup = { id, packageUrl: `/api/setup-packages/${id}`,
    packagePath: "gmpack/campsetups/saved.json", imagePath: "data/maps/campaign/map.image" };
  let finish;
  const waiting = new Promise((resolve) => { finish = resolve; });
  const uploadedId = randomUUID();
  const state = harness(draft, async () => {
    await waiting;
    return { ok: true, json: async () => ({ asset: { format: "static-image",
      assetId: uploadedId, width: 1000, height: 500, byteLength: 100 } }) };
  });
  const saved = json(state.context.setup.collectPackage());
  const savedId = randomUUID();
  saved.map.offlineBasemap.assetId = savedId;
  state.savedPackages.set(draft.savedSetup.packageUrl, saved);
  state.node("#offline-basemap-file").files = [{ type: "image/png", size: 100 }];
  await state.node("#offline-basemap-file").emit("change");
  const uploading = state.node("#upload-offline-basemap").emit("click");
  await state.node("#open-saved-setup").emit("click");
  assert.equal(state.node("#apply-import-package").disabled, false);
  await state.node("#apply-import-package").emit("click");
  finish();
  await uploading;
  assert.equal(state.context.setup.getState().map.offlineBasemap.assetId, savedId);
});

test("fresh static-image setup uploads, proceeds, places locations, assigns terrain and exports a valid image package", async () => {
  const state = harness();
  assert.equal(state.node("#offline-basemap-kind").value, "static-image");
  assert.equal(state.node("#map-extract-tools").hidden, true);
  assert.equal(state.node("#continue-to-terrain").disabled, true);
  for (const [id, value] of Object.entries({
    "campaign-name": "Image campaign", "campaign-setting": "GM setting", "campaign-premise": "Private premise", "map-name": "Paper map"
  })) state.node(`#${id}`).value = value;
  await uploadImage(state);
  assert.match(state.node("#offline-basemap-status").textContent, /Static image ready/);
  assert.equal(state.node("#continue-to-terrain").disabled, false);
  assert.equal(state.node("#static-image-preview").hidden, false);
  await state.node("#continue-to-terrain").emit("click");
  assert.equal(state.node('[data-panel="terrain"]').hidden, false);
  assert.equal(state.currentMap().options.crs.name, "image");
  assert.deepEqual(json(state.currentMap().extent), [[0, 0], [50, 100]]);
  assert.equal(state.node("#map-search-form").hidden, true);
  assert.ok(state.layers.some((entry) => entry.kind === "polygon"));
  state.context.setup.selectTerrainCell(1, -1);
  state.node("#terrain-type-select").value = "woods";
  await state.node("#terrain-type-select").emit("change");
  assert.equal(state.node("#save-terrain-type").disabled, false);
  await state.node("#save-terrain-type").emit("click");
  state.context.setup.showStep("locations");
  state.node("#location-name").value = "Starting camp";
  state.node("#location-kind").value = "Settlement";
  await state.node("#place-location").emit("click");
  state.context.setup.handleMapClick({ latlng: { lat: 25, lng: 50 }, originalEvent: { target: { closest: () => null } } });
  await state.node("#add-location").emit("click");
  assert.deepEqual(json(state.context.setup.getState().locations[0].position), { x: 50, y: 25 });
  state.context.setup.showStep("settlements");
  state.node("#settlement-location").value = state.context.setup.getState().locations[0].id;
  state.node("#settlement-scale").value = "Camp";
  await state.node("#settlement-form").emit("submit");
  state.context.setup.showStep("factions");
  state.node("#faction-name").value = "Local militia";
  await state.node("#faction-form").emit("submit");
  state.context.setup.showStep("notes");
  state.node("#note-form input").value = "Private briefing";
  state.node("#note-form textarea").value = "GM-only starting material";
  await state.node("#note-form").emit("submit");
  assert.equal(state.context.setup.validatePackage(false).length, 0);
  await state.node("#export-package").emit("click");
  assert.equal(state.exports.length, 1);
  const exported = state.exports[0];
  assert.equal(contract.assertCampaignSetupPackage(exported), true);
  assert.deepEqual(exported.map.bounds, { type: "image-km", widthPixels: 1000, heightPixels: 500, widthKm: 100 });
  assert.deepEqual(exported.map.grid.origin, { x: 0, y: 50 });
  assert.equal(exported.map.grid.terrainCells[0].terrainType, "woods");
  assert.equal(exported.map.fieldPapersAtlas, null);
  assert.equal(exported.settlements[0].locationId, exported.map.locations[0].id);
  assert.equal(exported.factions[0].name, "Local militia");
  assert.equal(exported.scenarioNotes[0].visibility, "gm-only");
  assert.ok(!("lat" in exported.map.locations[0].mapPosition));
  assert.match(state.node("#server-save-status").textContent, /Saved setup JSON: gmpack\/campsetups/);
  assert.equal(state.node("#saved-setup-actions").hidden, false);
  await state.node("#open-saved-setup").emit("click");
  assert.equal(state.node("#apply-import-package").disabled, false);
  await state.node("#apply-import-package").emit("click");
  const serverSaved = [...state.savedPackages.values()][0];
  assert.equal(state.context.setup.getState().map.offlineBasemap.assetId, serverSaved.map.offlineBasemap.assetId);
  assert.notEqual(serverSaved.map.offlineBasemap.assetId, exported.map.offlineBasemap.assetId);
  assert.deepEqual(json(state.context.setup.normalizeImportedPackage(exported).locations[0].position), { x: 50, y: 25 });
  const restored = harness(JSON.parse(state.storage.get("fieldbook-campaign-setup-draft-v1")));
  assert.equal(restored.node("#continue-to-terrain").disabled, false);
  assert.deepEqual(json(restored.context.setup.getState().locations[0].position), { x: 50, y: 25 });
});

test("source switching preserves independent image and extract drafts without fabricating geographic extents", async () => {
  const state = harness();
  await uploadImage(state);
  state.node("#offline-basemap-kind").value = "pmtiles";
  await state.node("#offline-basemap-kind").emit("change");
  assert.equal(state.node("#map-extract-tools").hidden, false);
  assert.equal(state.context.setup.getState().map.bounds, null);
  assert.equal(state.node("#continue-to-terrain").disabled, true);
  const extract = {
    type: "FeatureCollection", features: [{
      type: "Feature", properties: { type: "atlas", title: "Dalarna" },
      geometry: { type: "Polygon", coordinates: [[[13, 60], [15, 60], [15, 62], [13, 62], [13, 60]]] }
    }]
  };
  state.node("#fieldpapers-file").files = [{ name: "atlas.geojson", text: async () => JSON.stringify(extract) }];
  await state.node("#fieldpapers-file").emit("change");
  await state.node("#apply-fieldpapers-import").emit("click");
  assert.equal(state.node("#continue-to-terrain").disabled, false);
  state.context.setup.showStep("terrain");
  assert.equal(state.currentMap().options.crs.name, "geographic");
  assert.deepEqual(json(state.context.setup.getState().map.bounds), { south: 60, west: 13, north: 62, east: 15 });
  state.node("#offline-basemap-kind").value = "static-image";
  await state.node("#offline-basemap-kind").emit("change");
  assert.equal(state.node("#continue-to-terrain").disabled, false);
  assert.equal(state.context.setup.getState().map.bounds.type, "image-km");
  const restored = harness(JSON.parse(state.storage.get("fieldbook-campaign-setup-draft-v1")));
  assert.equal(restored.context.setup.getState().map.bounds.widthKm, 100);
  restored.node("#offline-basemap-kind").value = "pmtiles";
  await restored.node("#offline-basemap-kind").emit("change");
  assert.equal(restored.node("#continue-to-terrain").disabled, false);
  assert.equal(restored.context.setup.getState().map.atlas.title, "Dalarna");
});

test("image package contract rejects geographic positions, unknown coordinate types and unscaled origins", async () => {
  const state = harness();
  await uploadImage(state);
  const valid = json(state.context.setup.collectPackage());
  valid.map.locations = [{ id: randomUUID(), name: "Start", isStartingLocation: true, mapPosition: { x: 50, y: 25 } }];
  assert.equal(contract.assertCampaignSetupPackage(valid), true);
  for (const mutate of [
    (input) => { input.map.locations[0].mapPosition = { lat: 25, lng: 50 }; },
    (input) => { input.map.bounds.type = "unknown"; },
    (input) => { input.map.grid.origin = { lat: 0, lng: 0 }; },
    (input) => { input.map.offlineAnnotations = [{ type: "Feature" }]; },
    (input) => { input.map.offlineBasemap = null; }
  ]) {
    const invalid = json(valid);
    mutate(invalid);
    assert.throws(() => contract.assertCampaignSetupPackage(invalid));
  }
});

test("image upload requires an explicit finite positive scale and rejects invalid metadata and oversize images", async () => {
  for (const width of ["", "0", "-1", "Infinity", "10001"]) {
    let uploads = 0;
    const state = harness(null, async () => { uploads += 1; throw new Error("Must not upload"); });
    await uploadImage(state, width);
    assert.equal(uploads, 0);
    assert.equal(state.node("#continue-to-terrain").disabled, true);
  }
  const state = harness(null, async () => ({ ok: true, json: async () => ({ asset: {
    format: "static-image", assetId: randomUUID(), width: 0, height: 500
  } }) }));
  await uploadImage(state);
  assert.match(state.node("#offline-basemap-status").textContent, /invalid dimensions/);
  assert.equal(state.context.setup.getState().map.bounds, null);
  const large = harness();
  large.node("#image-width-km").value = "100";
  large.node("#offline-basemap-attribution").value = "GM";
  large.node("#offline-basemap-file").files = [{ type: "image/png", size: 50 * 1024 * 1024 + 1 }];
  await large.node("#upload-offline-basemap").emit("click");
  assert.match(large.node("#offline-basemap-status").textContent, /50 MiB/);
});

test("image coordinates enforce actual extent and preserve a measured 10 km axial spacing", () => {
  const bounds = { type: "image-km", widthPixels: 1000, heightPixels: 500, widthKm: 100 };
  assert.equal(coordinates.contains({ x: 100, y: 50 }, bounds), true);
  for (const position of [{ x: 101, y: 25 }, { x: 50, y: 51 }, { lat: 25, lng: 50 }, { x: NaN, y: 0 }]) {
    assert.equal(coordinates.contains(position, bounds), false);
  }
  const state = harness({ schemaVersion: 2, campaign: {}, map: { bounds,
    offlineBasemap: { format: "static-image", assetId: randomUUID(), attribution: "GM" },
    grid: { origin: { x: 0, y: 50 }, terrainCells: {} } } });
  const point = json(state.context.setup.localMetersToPosition(10000, 0));
  assert.deepEqual(point, { x: 10, y: 50 });
  assert.deepEqual(json(state.context.setup.gridCoordinatesForPosition(point)), { q: 1, r: 0, ref: "Q+01 R+00" });
});

test("manual bounds selection is absent and the helper loads before the package contract", () => {
  assert.doesNotMatch(html, /id="(?:map-bounds-form|map-bound-south|draw-area|clear-area)"/);
  assert.ok(html.indexOf('src="/map-coordinates.js"') < html.indexOf('src="campaign-package-contract.js"'));
  assert.match(html, /\.fieldpapers-tools\[hidden\].*\.field\[hidden\].*display: none/);
});
