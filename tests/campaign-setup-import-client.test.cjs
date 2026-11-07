const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const test = require("node:test");
const contract = require("../campaign-package-contract.js");

const root = join(__dirname, "..");
const dashboard = readFileSync(join(root, "index.html"), "utf8");
const adapter = dashboard.match(/ {6}function isRecord\(value\) \{[\s\S]*?(?= {6}function liveInfluenceForCampaign)/)[0];
const normalizePackage = runInNewContext(`${adapter}\nnormalizeSetupPackageForInfluence`, {
  FieldbookCampaignPackageContract: contract, FieldbookMapCoordinates: require("../map-coordinates.js"), Error
});

class Element {
  constructor() {
    this.listeners = new Map();
    this.disabled = false;
    this.hidden = false;
    this.open = false;
    this.clicks = 0;
    this.children = [];
    const classes = new Set();
    this.classList = {
      add: (value) => classes.add(value),
      remove: (value) => classes.delete(value),
      contains: (value) => classes.has(value)
    };
  }
  addEventListener(type, listener) { this.listeners.set(type, listener); }
  async emit(type, event = { preventDefault() {} }) { await this.listeners.get(type)?.(event); }
  click() { this.clicks += 1; }
  showModal() { this.open = true; }
  close() { this.open = false; this.listeners.get("close")?.(); }
  get options() { return this.children; }
  replaceChildren(...children) {
    this.children = children;
    this.value = children[0]?.value || "";
  }
  append(child) {
    const first = this.children.length === 0;
    this.children.push(child);
    if (first) this.value = child.value || "";
  }
}

function sourcePackage() {
  return {
    packageType: "fieldbook.campaign-setup", schemaVersion: 2,
    campaign: { id: "source-campaign", name: "Northbound", setting: "Dalarna", premise: "Private starting premise" },
    map: {
      name: "Area map", bounds: { south: 60, west: 13, north: 62, east: 15 },
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, origin: null, terrainCells: [{ q: 0, r: 0, terrainType: "forest" }] },
      locations: [{ id: "start", name: "Starting camp", kind: "Settlement", isStartingLocation: true, mapPosition: { lat: 61, lng: 14 } }],
      offlineAnnotations: []
    },
    factions: [{ id: "faction", name: "Locals", influenceCells: ["0,0"] }],
    settlements: [{ id: "settlement", name: "Starting camp", locationId: "start", prominentFactionIds: ["faction"] }],
    scenarioNotes: [{ id: "secret-note", title: "GM briefing", visibility: "gm-only", body: "Private scenario notes" }]
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((accept, fail) => { resolve = accept; reject = fail; });
  return { promise, resolve, reject };
}

function runtimeHarness({ request, packages = [], setupListError } = {}) {
  const elements = new Map();
  const node = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const select = node("runtime-campaign-select");
  const placeholder = new Element();
  placeholder.value = "";
  placeholder.textContent = "Loading campaigns";
  select.append(placeholder);
  const requests = [];
  const activations = [];
  const snapshots = [];
  const load = dashboard.match(/ {6}async function loadRuntimeCampaign[\s\S]*?(?= {6}async function refreshRuntimeCampaigns)/)[0];
  const refresh = dashboard.match(/ {6}async function refreshRuntimeCampaigns[\s\S]*?(?= {6}runtimeCampaignSelect.addEventListener)/)[0];
  const change = dashboard.match(/ {6}runtimeCampaignSelect\.addEventListener\("change", async \(\) => \{[\s\S]*?\n {6}\}\);/)[0];
  const context = {
    state: { runtimeCampaignId: "previous-campaign" },
    runtimeDataLoaded: true,
    runtimeCampaignLoadGeneration: 0,
    runtimeCampaignSelect: select,
    location: { protocol: "http:" },
    weatherD6Result: new Element(),
    weatherRollOutcome: new Element(),
    openPlayerSeedDialogButton: new Element(),
    openCharacterChangesButton: new Element(),
    exportRuntimeBackupButton: new Element(),
    openRuntimeRestoreButton: new Element(),
    document: {
      createElement: () => new Element(),
      getElementById: (id) => node(id)
    },
    updateWeatherRollAvailability() {},
    campaignApiRequest: async (path) => {
      requests.push(path);
      if (path === "/api/setup-packages") {
        if (setupListError) throw new Error(setupListError);
        return { packages };
      }
      return request(path);
    },
    activateRuntimeCampaign: (campaign) => {
      activations.push(campaign.id);
      context.state.runtimeCampaignId = campaign.id;
    },
    applyRuntimeSnapshot: (runtime) => {
      snapshots.push(runtime);
      context.runtimeDataLoaded = true;
      context.state.runtimeCampaignId = runtime.campaign.id;
    },
    showToast() {},
    Error
  };
  runInNewContext(`${load}\n${refresh}\n${change}\nthis.runtimeLoad = loadRuntimeCampaign; this.runtimeRefresh = refreshRuntimeCampaigns;`, context);
  return { context, node, requests, activations, snapshots, select };
}

function harness({ request, onImported, picker } = {}) {
  const elements = new Map();
  const node = (id) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id);
  };
  const requests = [];
  const imported = [];
  const window = { showOpenFilePicker: picker };
  runInNewContext(readFileSync(join(root, "campaign-setup-import-client.js"), "utf8"), {
    document: { getElementById: node, querySelector: () => node("open") }, window, Error
  });
  window.FieldbookSetupImport.initialize({
    normalizePackage,
    request: async (path, options) => {
      requests.push({ path, ...options });
      return request ? request(path, options) : { campaign: { id: "runtime-campaign", name: "Northbound" } };
    },
    onImported: async (campaign) => { imported.push(campaign); await onImported?.(campaign); }
  });
  const select = async (source = JSON.stringify(sourcePackage(), null, 2), options = {}) => {
    node("setup-package-file").files = [{
      name: "setup.json", size: source.length, text: async () => source, ...options
    }];
    await node("setup-package-file").emit("change");
  };
  return { node, select, requests, imported };
}

test("preview and confirmation submit original setup JSON, including private initial data", async () => {
  const state = harness();
  const source = JSON.stringify(sourcePackage(), null, 2);
  await state.node("open").emit("click");
  assert.equal(state.node("setup-package-file").clicks, 1);
  await state.select(source);
  assert.equal(state.requests.length, 0);
  assert.equal(state.node("setup-import-dialog").open, true);
  assert.match(state.node("setup-import-summary").textContent, /Terrain cells: 1\nInitial influence layers: 1/);
  assert.equal(state.node("apply-setup-import").disabled, false);
  await state.node("apply-setup-import").emit("click");
  assert.equal(state.requests[0].path, "/api/campaigns/import-setup");
  assert.equal(state.requests[0].method, "POST");
  assert.equal(state.requests[0].headers["Content-Type"], "application/json");
  assert.equal(state.requests[0].body, source);
  assert.equal(state.imported[0].id, "runtime-campaign");
  assert.equal(state.node("setup-import-dialog").open, false);
  await state.node("apply-setup-import").emit("click");
  assert.equal(state.requests.length, 1);
});

test("supported picker requests Downloads and previews JSON without the input fallback", async () => {
  let options;
  const state = harness({ picker: async (input) => {
    options = input;
    return [{ getFile: async () => ({ name: "downloads.json", size: 100, text: async () => JSON.stringify(sourcePackage()) }) }];
  } });
  await state.node("open").emit("click");
  assert.equal(options.startIn, "downloads");
  assert.equal(options.types[0].accept["application/json"][0], ".json");
  assert.equal(state.node("setup-package-file").clicks, 0);
  assert.equal(state.node("apply-setup-import").disabled, false);
});

test("unsupported picker falls back to the file input and cancellation does not", async () => {
  for (const name of ["SecurityError", "NotSupportedError", "AbortError"]) {
    const state = harness({ picker: async () => { const error = new Error("Picker unavailable"); error.name = name; throw error; } });
    await state.node("open").emit("click");
    assert.equal(state.node("setup-package-file").clicks, name === "AbortError" ? 0 : 1);
  }
});

test("invalid packages and oversize files cannot submit, including after an earlier valid preview", async () => {
  const invalid = sourcePackage();
  invalid.schemaVersion = 1;
  const outOfBounds = sourcePackage();
  outOfBounds.map.locations[0].mapPosition.lat = 90;
  for (const source of ["{", JSON.stringify(invalid), JSON.stringify(outOfBounds)]) {
    const state = harness();
    await state.select();
    await state.select(source);
    assert.equal(state.node("apply-setup-import").disabled, true);
    assert.equal(state.node("setup-import-summary").hidden, true);
    assert.match(state.node("setup-import-status").className, /error/);
    await state.node("apply-setup-import").emit("click");
    assert.equal(state.requests.length, 0);
  }
  const state = harness();
  await state.select("", { size: 25 * 1024 * 1024 + 1, text: () => { throw new Error("Must not read"); } });
  assert.match(state.node("setup-import-status").textContent, /25 MB/);
  assert.equal(state.node("apply-setup-import").disabled, true);
});

test("exactly 25 MiB remains accepted for compatibility with the existing size boundary", async () => {
  const state = harness();
  await state.select(undefined, { size: 25 * 1024 * 1024 });
  assert.equal(state.node("apply-setup-import").disabled, false);
});

test("cancel, close, and Escape invalidate in-flight reads and cannot revive a pending import", async () => {
  for (const trigger of ["cancel-setup-import", "close-setup-import", "escape", "close"]) {
    const state = harness();
    const read = deferred();
    const selecting = state.select("", { text: () => read.promise });
    if (trigger === "escape") await state.node("setup-import-dialog").emit("cancel");
    else if (trigger === "close") state.node("setup-import-dialog").close();
    else await state.node(trigger).emit("click");
    read.resolve(JSON.stringify(sourcePackage()));
    await selecting;
    assert.equal(state.node("apply-setup-import").disabled, true);
    assert.equal(state.node("setup-import-dialog").open, false);
    await state.node("apply-setup-import").emit("click");
    assert.equal(state.requests.length, 0);
  }
});

test("a newer file selection wins over a delayed successful or failed read", async () => {
  for (const failed of [false, true]) {
    const state = harness();
    const read = deferred();
    const selecting = state.select("", { text: () => read.promise });
    const newer = sourcePackage();
    newer.campaign.name = "New campaign";
    const source = JSON.stringify(newer);
    await state.select(source);
    if (failed) read.reject(new Error("Old read failed"));
    else read.resolve(JSON.stringify(sourcePackage()));
    await selecting;
    assert.match(state.node("setup-import-summary").textContent, /New campaign/);
    assert.equal(state.node("apply-setup-import").disabled, false);
    await state.node("apply-setup-import").emit("click");
    assert.equal(state.requests[0].body, source);
  }
});

test("failed import stays visible and allows retry of the same validated source", async () => {
  let fail = true;
  const state = harness({ request: async () => {
    if (fail) throw new Error("Import rejected");
    return { campaign: { id: "runtime-campaign", name: "Northbound" } };
  } });
  await state.select();
  await state.node("apply-setup-import").emit("click");
  assert.match(state.node("setup-import-status").textContent, /Import rejected/);
  assert.equal(state.node("setup-import-dialog").open, true);
  assert.equal(state.node("apply-setup-import").disabled, false);
  fail = false;
  await state.node("apply-setup-import").emit("click");
  assert.equal(state.requests.length, 2);
  assert.equal(state.imported.length, 1);
});

test("submission and runtime loading lock cancellation and duplicate confirmation", async () => {
  const response = deferred();
  const loading = deferred();
  const state = harness({ request: () => response.promise, onImported: () => loading.promise });
  await state.select();
  const applying = state.node("apply-setup-import").emit("click");
  await state.node("apply-setup-import").emit("click");
  await state.node("cancel-setup-import").emit("click");
  await state.node("setup-import-dialog").emit("cancel");
  assert.equal(state.node("setup-import-dialog").open, true);
  assert.equal(state.node("open").disabled, true);
  response.resolve({ campaign: { id: "runtime-campaign", name: "Northbound" } });
  await new Promise((resolve) => setImmediate(resolve));
  await state.node("open").emit("click");
  await state.node("apply-setup-import").emit("click");
  assert.equal(state.node("setup-package-file").clicks, 0);
  assert.equal(state.requests.length, 1);
  loading.resolve();
  await applying;
  assert.equal(state.node("open").disabled, false);
  assert.equal(state.node("setup-import-dialog").open, false);
});

test("load failure after creation is not reported as a failed import and cannot create another copy", async () => {
  const state = harness({ onImported: () => { throw new Error("Load failed"); } });
  await state.select();
  await state.node("apply-setup-import").emit("click");
  assert.match(state.node("setup-import-status").textContent, /created: Northbound.*do not import it again.*Load failed/);
  assert.equal(state.node("apply-setup-import").disabled, true);
  await state.node("apply-setup-import").emit("click");
  assert.equal(state.requests.length, 1);
});

test("incomplete success response requires a campaign-list reload rather than repeat confirmation", async () => {
  const state = harness({ request: async () => ({}) });
  await state.select();
  await state.node("apply-setup-import").emit("click");
  assert.match(state.node("setup-import-status").textContent, /incomplete import result/);
  assert.equal(state.node("apply-setup-import").disabled, true);
  assert.equal(state.imported.length, 0);
});

test("the runtime handoff automatically selects and loads the new campaign rather than the prior selection", async () => {
  const load = dashboard.match(/ {6}async function loadRuntimeCampaign[\s\S]*?(?= {6}async function refreshRuntimeCampaigns)/)[0];
  const refresh = dashboard.match(/ {6}async function refreshRuntimeCampaigns[\s\S]*?(?= {6}runtimeCampaignSelect.addEventListener)/)[0];
  const callback = dashboard.match(/onImported: (async \(campaign\) => \{[\s\S]*?\s{8}\})\s+\}\);/)[1];
  const selected = new Element();
  selected.children = [
    { value: "", textContent: "Choose a runtime campaign" },
    { value: "previous-campaign", textContent: "Prior / Elsewhere" },
    { value: "runtime-campaign", textContent: "Northbound / Dalarna" }
  ];
  selected.value = "previous-campaign";
  selected.replaceChildren = () => {};
  selected.append = () => {};
  const snapshots = [];
  const requests = [];
  const views = [];
  const context = {
    state: { runtimeCampaignId: "previous-campaign" }, runtimeDataLoaded: true,
    runtimeCampaignLoadGeneration: 0,
    runtimeCampaignSelect: selected,
    document: { createElement: () => new Element(), getElementById: () => new Element() },
    location: { protocol: "http:" },
    weatherD6Result: new Element(), weatherRollOutcome: new Element(),
    openPlayerSeedDialogButton: new Element(), openCharacterChangesButton: new Element(),
    exportRuntimeBackupButton: new Element(), openRuntimeRestoreButton: new Element(),
    updateWeatherRollAvailability() {},
    campaignApiRequest: async (path) => {
      requests.push(path);
      if (path === "/api/setup-packages") return { packages: [] };
      if (path === "/api/campaigns") return { campaigns: [
        { id: "previous-campaign", name: "Prior", setting: "Elsewhere" },
        { id: "runtime-campaign", name: "Northbound", setting: "Dalarna" }
      ] };
      if (path.endsWith("/faction-layers")) return { layers: {} };
      if (path.endsWith("/runtime")) return { runtime: { campaign: { id: "runtime-campaign" }, dashboard: { dayNumber: 0 } } };
      return { campaign: { id: "runtime-campaign" } };
    },
    setView: (view) => views.push(view), showToast() {}, Error
  };
  context.activateRuntimeCampaign = (campaign) => { context.state.runtimeCampaignId = campaign.id; };
  context.applyRuntimeSnapshot = (runtime) => { context.runtimeDataLoaded = true; snapshots.push(runtime); };
  const onImported = runInNewContext(`${load}\n${refresh}\n(${callback})`, context);
  const state = harness({ onImported });
  await state.select();
  await state.node("apply-setup-import").emit("click");
  assert.equal(selected.value, "runtime-campaign");
  assert.deepEqual(requests, [
    "/api/campaigns", "/api/setup-packages", "/api/campaigns/runtime-campaign",
    "/api/campaigns/runtime-campaign/faction-layers", "/api/campaigns/runtime-campaign/runtime"
  ]);
  assert.equal(snapshots[0].campaign.id, "runtime-campaign");
  assert.deepEqual(views, ["influence"]);
  assert.equal(state.node("setup-import-dialog").open, false);
});

test("a successful campaign listing remains selectable when selected campaign details fail", async () => {
  for (const failedPath of ["/api/campaigns/selected-campaign", "/api/campaigns/selected-campaign/runtime"]) {
    const runtime = runtimeHarness({ request: async (path) => {
      if (path === "/api/campaigns") return { campaigns: [
        { id: "previous-campaign", name: "Prior", setting: "Elsewhere" },
        { id: "selected-campaign", name: "Northbound", setting: "Dalarna" }
      ] };
      if (path.endsWith("/faction-layers")) return { layers: {} };
      if (path === failedPath) throw new Error("Campaign record unavailable");
      if (path.endsWith("/runtime")) return { runtime: { campaign: { id: "selected-campaign" } } };
      return { campaign: { id: "selected-campaign", name: "Northbound" } };
    } });
    const result = await runtime.context.runtimeRefresh("selected-campaign");
    assert.equal(result.ok, false);
    assert.equal(result.failure, "loading");
    assert.deepEqual(runtime.select.options.map((option) => option.value), ["", "previous-campaign", "selected-campaign"]);
    assert.equal(runtime.select.disabled, false);
    assert.equal(runtime.select.value, "previous-campaign");
    assert.equal(runtime.context.runtimeDataLoaded, true);
    assert.equal(runtime.context.state.runtimeCampaignId, "previous-campaign");
    assert.deepEqual(runtime.activations, []);
    assert.match(runtime.node("influence-map-status").textContent, /Could not load selected campaign selected-campaign/);
    assert.match(runtime.node("influence-map-status").textContent, /previous campaign remains active/);
    assert.equal(runtime.node("influence-map-status").classList.contains("error"), true);
  }
});

test("a failed campaign detail load can be retried by reselecting the retained option", async () => {
  let detailFails = true;
  const runtime = runtimeHarness({ request: async (path) => {
    if (path === "/api/campaigns") return { campaigns: [{ id: "selected-campaign", name: "Northbound", setting: "Dalarna" }] };
    if (path.endsWith("/faction-layers")) return { layers: {} };
    if (path.endsWith("/runtime")) return { runtime: { campaign: { id: "selected-campaign" } } };
    if (detailFails) throw new Error("Temporary detail failure");
    return { campaign: { id: "selected-campaign", name: "Northbound" } };
  } });
  const failed = await runtime.context.refreshRuntimeCampaigns("selected-campaign");
  assert.equal(failed.failure, "loading");
  assert.equal(runtime.select.options.some((option) => option.value === "selected-campaign"), true);
  detailFails = false;
  runtime.select.value = "selected-campaign";
  await runtime.select.emit("change");
  assert.equal(runtime.context.runtimeDataLoaded, true);
  assert.equal(runtime.context.state.runtimeCampaignId, "selected-campaign");
  assert.deepEqual(runtime.activations, ["selected-campaign"]);
  assert.equal(runtime.snapshots.length, 1);
  assert.equal(runtime.node("influence-map-status").classList.contains("error"), false);
});

test("an actual campaign-list failure is reported separately from selected-campaign loading", async () => {
  const runtime = runtimeHarness({ request: async () => { throw new Error("Campaign database unavailable"); } });
  const result = await runtime.context.refreshRuntimeCampaigns();
  assert.equal(result.ok, false);
  assert.equal(result.failure, "listing");
  assert.match(result.message, /Campaign list unavailable: Campaign database unavailable/);
  assert.equal(runtime.select.disabled, true);
  assert.deepEqual(runtime.select.options.map((option) => option.textContent), ["Campaign list unavailable"]);
  assert.equal(runtime.requests.length, 1);
  assert.deepEqual(runtime.activations, []);
  assert.match(runtime.node("influence-map-status").textContent, /Campaign list unavailable/);
});

test("saved setups are discovered without import and selection retries reuse the saved campaign", async () => {
  let imported = false;
  let failLoad = true;
  const runtime = runtimeHarness({ packages: [{ id: "saved-one", name: "Creator campaign", setting: "Region" }], request: async (path) => {
    if (path === "/api/campaigns") return { campaigns: imported ? [{ id: "live-one", name: "Creator campaign", setting: "Region" }] : [] };
    if (path.endsWith("/import")) { imported = true; return { campaign: { id: "live-one", name: "Creator campaign" } }; }
    if (path.endsWith("/faction-layers")) return { layers: {} };
    if (path.endsWith("/runtime")) {
      if (failLoad) throw new Error("Temporary loading failure");
      return { runtime: { campaign: { id: "live-one" } } };
    }
    return { campaign: { id: "live-one" } };
  } });
  await runtime.context.runtimeRefresh();
  assert.equal(runtime.select.disabled, false);
  assert.equal(imported, false);
  assert.match(runtime.select.options[1].textContent, /Saved setup/);
  runtime.select.value = "setup:saved-one";
  await runtime.select.emit("change");
  assert.equal(runtime.select.disabled, false);
  assert.match(runtime.node("influence-map-status").textContent, /existing import will be reused/);
  failLoad = false;
  runtime.select.value = "setup:saved-one";
  await runtime.select.emit("change");
  assert.equal(runtime.context.state.runtimeCampaignId, "live-one");
  assert.equal(runtime.context.runtimeDataLoaded, true);
});

test("saved setup listing errors do not discard usable live campaign options", async () => {
  const runtime = runtimeHarness({ setupListError: "Storage unavailable", request: async (path) => {
    if (path === "/api/campaigns") return { campaigns: [{ id: "live-one", name: "Live", setting: "Region" }] };
    if (path.endsWith("/faction-layers")) return { layers: {} };
    if (path.endsWith("/runtime")) return { runtime: { campaign: { id: "live-one" } } };
    return { campaign: { id: "live-one" } };
  } });
  await runtime.context.runtimeRefresh();
  assert.equal(runtime.context.runtimeDataLoaded, true);
  assert.equal(runtime.select.disabled, false);
  assert.match(runtime.node("influence-map-status").textContent, /Saved Creator setups unavailable: Storage unavailable/);
});

test("saved setup selection locks duplicate imports until the request completes", async () => {
  const pending = deferred();
  let imports = 0;
  const runtime = runtimeHarness({ packages: [{ id: "saved-one", name: "Creator", setting: "Region" }], request: async (path) => {
    if (path === "/api/campaigns") return { campaigns: [] };
    if (path.endsWith("/import")) { imports += 1; return pending.promise; }
    throw new Error("Unexpected request");
  } });
  await runtime.context.runtimeRefresh();
  runtime.select.value = "setup:saved-one";
  const first = runtime.select.emit("change");
  runtime.select.value = "setup:saved-one";
  await runtime.select.emit("change");
  assert.equal(imports, 1);
  assert.equal(runtime.select.disabled, true);
  pending.reject(new Error("Connection interrupted"));
  await first;
  assert.equal(runtime.select.disabled, false);
  assert.equal(runtime.select.value, "");
});
