const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = readFileSync(join(__dirname, "..", "map-basemap-client.js"), "utf8");
const bounds = { south: 59, west: 13, north: 61, east: 15 };
const image = { format: "static-image", assetId: "local-image", attribution: "<Map owner>" };

function harness() {
  const layers = [];
  const errors = [];
  const credits = new Set();
  const map = {
    removeLayer(layer) { layer.removed = true; layer.events.remove?.(); },
    attributionControl: { addAttribution(credit) { credits.add(credit); }, removeAttribution(credit) { credits.delete(credit); } }
  };
  function layer(kind, url, coordinates, options) {
    const result = { kind, url, coordinates, options, events: {},
      on(event, handler) { this.events[event] = handler; return this; },
      addTo() { layers.push(this); return this; } };
    return result;
  }
  const context = vm.createContext({
    L: {
      imageOverlay: (url, coordinates, options) => layer("image", url, coordinates, options),
      tileLayer: (url, options) => layer("online", url, null, options)
    },
    pmtiles: {
      PMTiles: class { constructor(url) { this.url = url; } },
      leafletRasterLayer: (archive, options) => layer("raster", archive.url, null, options)
    },
    FieldbookVectorAtlas: { validLicenseUrl: (url) => url?.startsWith("https://") ? url : null }
  });
  vm.runInContext(source, context);
  return { api: context.FieldbookBasemap, context, map, layers, errors, credits,
    controller: context.FieldbookBasemap.controller(map, (message) => errors.push(message)) };
}

test("static images use campaign bounds and local assets without tile requests", () => {
  const { controller, layers, errors } = harness();
  controller.set(image, bounds);
  assert.equal(layers.length, 1);
  assert.equal(layers[0].kind, "image");
  assert.equal(layers[0].url, "/offline-basemaps/local-image.image");
  assert.deepEqual(JSON.parse(JSON.stringify(layers[0].coordinates)), [[59, 13], [61, 15]]);
  assert.equal(layers[0].options.interactive, false);
  assert.equal(layers[0].options.attribution, "&lt;Map owner&gt;");
  assert.deepEqual(errors, []);
});

test("player images use the authorized publication URL and escaped license credit", () => {
  const { controller, layers } = harness();
  controller.set({ ...image, assetUrl: "/api/player/campaigns/assigned/map-basemap",
    licenseUrl: 'https://maps.example.test/?a=1&b="2"' }, bounds);
  assert.equal(layers[0].url, "/api/player/campaigns/assigned/map-basemap");
  assert.match(layers[0].options.attribution, /&amp;b=&quot;2&quot;/);
});

test("invalid image bounds and load failures are explicit, without online fallback", () => {
  const { controller, layers, errors } = harness();
  controller.set(image, { ...bounds, north: 58 });
  assert.equal(layers.length, 0);
  assert.match(errors[0], /valid campaign bounds/);
  controller.set(image, bounds);
  layers[0].events.error();
  assert.match(errors[1], /unavailable or cannot be decoded/);
  assert.equal(layers.length, 1);
});

test("background switching removes image layers and preserves PMTiles and online choices", () => {
  const { controller, layers } = harness();
  controller.set(image, bounds);
  controller.set({ ...image, format: "raster-pmtiles" }, bounds);
  assert.equal(layers[0].removed, true);
  assert.equal(layers[1].kind, "raster");
  assert.match(layers[1].url, /\.pmtiles$/);
  controller.set(null, bounds);
  assert.equal(layers[1].removed, true);
  assert.equal(layers[2].kind, "online");
  controller.clear();
  assert.equal(layers[2].removed, true);
});

test("late vector layers are removed when the GM switches to an image", async () => {
  const { controller, context, layers, credits } = harness();
  let resolveVector;
  const vector = { events: {}, on(event, callback) { this.events[event] = callback; } };
  context.FieldbookVectorAtlas.createLayer = () => new Promise((resolve) => { resolveVector = resolve; });
  controller.set({ ...image, format: "vector-pmtiles" }, bounds);
  controller.set(image, bounds);
  resolveVector(vector);
  await Promise.resolve();
  assert.equal(vector.removed, true);
  assert.equal(layers[0].kind, "image");
  assert.equal(credits.size, 0);
});

test("all three surfaces load the shared image renderer before map clients", () => {
  for (const file of ["campaign-setup.html", "index.html", "player-interface.html"]) {
    const html = readFileSync(join(__dirname, "..", file), "utf8");
    const helper = html.indexOf('src="/map-basemap-client.js"');
    assert.ok(helper > 0, `${file} must load the image renderer`);
    const publication = html.indexOf('src="/map-publication-client.js"');
    if (publication !== -1) assert.ok(helper < publication, `${file} must load the helper before publication`);
  }
});

test("GM background controls are wired on startup, before any map draft action", () => {
  const nodes = new Map();
  function node(selector) {
    if (!nodes.has(selector)) nodes.set(selector, {
      value: "", events: new Map(), replaceChildren() {}, reset() {},
      querySelector: (child) => node(`${selector} ${child}`),
      addEventListener(event, callback) {
        if (!this.events.has(event)) this.events.set(event, []);
        this.events.get(event).push(callback);
      }
    });
    return nodes.get(selector);
  }
  const context = vm.createContext({
    document: {
      querySelector: (selector) => selector === "#player-map-tab" ? null : node(selector),
      getElementById: (id) => node(`#${id}`),
      addEventListener() {}
    }
  });
  vm.runInContext(readFileSync(join(__dirname, "..", "map-publication-client.js"), "utf8"), context);
  const selector = node("#gm-map-background-kind");
  assert.equal(selector.events.get("change")?.length, 1);
  assert.equal(node("#save-gm-map-background").events.get("click")?.length, 1);
  selector.value = "static-image";
  selector.events.get("change")[0]();
  assert.equal(node("#gm-map-image-fields").hidden, false);
  assert.equal(node("#save-gm-map-background").disabled, true, "no campaign is loaded yet");
});
