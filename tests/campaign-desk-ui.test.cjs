const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { Script, runInNewContext } = require("node:vm");

const dashboard = readFileSync(join(__dirname, "..", "index.html"), "utf8");

function dayLoopHarness({ values = new Map(), storageFails = false } = {}) {
  class Element {
    constructor() { this.children = []; this.dataset = {}; this.attributes = {}; this.textContent = ""; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this[name] = callback; }
  }
  const elements = new Map();
  const document = {
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, new Element());
      return elements.get(id);
    },
    querySelector: () => ({ focus() {} }),
    createElement: () => new Element()
  };
  const localStorage = {
    getItem: (key) => { if (storageFails) throw new Error("storage blocked"); return values.get(key) ?? null; },
    setItem: (key, value) => { if (storageFails) throw new Error("storage blocked"); values.set(key, value); }
  };
  const state = { runtimeCampaignId: "campaign-a", date: "2000-05-11", time: "00:00", day: 1 };
  const views = [];
  const source = dashboard.match(/const DAY_LOOP_STORAGE_KEY = [\s\S]*?(?= {6}function render\(\))/);
  assert.ok(source);
  const api = runInNewContext(`${source[0]}\n({ currentDayLoop, renderDayLoop })`, {
    document, localStorage, state, dateLabel: (date) => date, setView: (view) => views.push(view)
  });
  const nav = document.getElementById("day-loop-nav");
  return {
    ...api, state, elements, values, views,
    click: (loop, index) => nav.click({ target: { closest: () => ({ dataset: { loop, index } }) } }),
    buttons: () => elements.get("dayloop-actions").children
  };
}

test("top day loop navigates phases and offers a single six-hour clock advance", () => {
  const h = dayLoopHarness();
  h.renderDayLoop();
  assert.match(dashboard, /<header class="page-header">[\s\S]*?id="day-loop-nav"[\s\S]*?<\/header>\s*<div class="content">\s*<section class="view active" id="view-situation"/);
  assert.match(h.elements.get("dayloop-progress").textContent, /PHASE 1 OF 9/);
  assert.equal(h.elements.get("day-loop-list").children[0].children[0].attributes["aria-current"], "step");
  for (let phase = 0; phase < 8; phase += 1) h.click("next");
  assert.deepEqual(h.views, ["situation", "movement", "roster", "movement", "conflicts", "roster", "movement", "inventory", "movement"]);
  assert.equal(h.state.time, "00:00");
  assert.ok(h.buttons().some((button) => button.dataset.action === "advance-time" && button.dataset.loopAdvance === "true"));
  assert.ok(!h.buttons().some((button) => button.dataset.loop === "stretch"));
  h.click("back");
  assert.equal(h.currentDayLoop().step, 7);
  h.click("select", "2");
  assert.equal(h.currentDayLoop().step, 2);
  assert.equal(h.views.at(-1), "roster");
  assert.match(h.elements.get("dayloop-phase-text").textContent, /GM handles one-hour stretches/);
  h.state.time = "06:00";
  assert.equal(h.currentDayLoop().step, 0);
});

test("day loop advance uses the revision-checked clock and switches views only on success", async () => {
  const source = dashboard.match(/if \(action === "advance-time"\) \{[\s\S]*?(?= {8}if \(action === "use-rations")/);
  assert.ok(source);
  const calls = [];
  const control = { disabled: false };
  const state = { runtimeCampaignId: "campaign-a", runtimeRevision: 7 };
  const context = {
    action: "advance-time", button: { dataset: { loopAdvance: "true" } },
    document: { querySelectorAll: () => [control] },
    runtimeCampaignSelect: { value: "campaign-a" }, runtimeDataLoaded: true, state,
    campaignApiRequest: async (url, options) => {
      calls.push({ url, options });
      return { runtime: { time: "06:00" } };
    },
    applyRuntimeSnapshot: (runtime) => { state.time = runtime.time; },
    currentDayLoop: () => ({ step: 0 }), DAY_LOOP_PHASES: [{ view: "situation" }],
    setView: (view) => calls.push(view), showToast: (message) => calls.push(message)
  };
  const run = runInNewContext(`(async () => { ${source[0]} })`, context);
  await run();
  assert.equal(state.time, "06:00");
  assert.equal(calls[0].url, "/api/campaigns/campaign-a/advance-time");
  assert.equal(JSON.parse(calls[0].options.body).expectedRevision, 7);
  assert.equal(calls[1], "situation");
  assert.equal(control.disabled, false);
  calls.length = 0;
  context.campaignApiRequest = async () => { throw new Error("revision conflict"); };
  await run();
  assert.match(calls[0], /Time not advanced: revision conflict/);
  assert.equal(calls.length, 1);
  assert.equal(control.disabled, false);
});

test("day loop exposes existing tools at the relevant phases", () => {
  const h = dayLoopHarness();
  h.renderDayLoop();
  const buttons = (phase) => { h.click("select", String(phase)); return h.buttons(); };
  assert.ok(buttons(0).some((button) => button.dataset.view === "comms"));
  assert.ok(buttons(1).some((button) => button.dataset.view === "movement" && button.dataset.viewTarget === "weather-title"));
  assert.ok(buttons(3).some((button) => button.dataset.action === "dayloop-open-route"));
  assert.ok(buttons(4).some((button) => button.dataset.action === "dayloop-open-combat"));
  assert.ok(buttons(4).some((button) => button.dataset.action === "open-roll-tables" && button.dataset.rollContext === "conflicts"));
  assert.ok(buttons(5).some((button) => button.dataset.action === "open-roll-tables" && button.dataset.rollContext === "personnel"));
  for (const view of ["movement", "publication", "situation", "inventory", "conditions", "comms"]) {
    assert.ok(buttons(6).some((button) => button.dataset.view === view), view);
  }
  assert.ok(buttons(6).some((button) => button.dataset.viewTarget === "gm-report-title"));
  assert.ok(buttons(7).some((button) => button.dataset.viewTarget === "supply-title"));
});

test("targeted workflow links switch views before scrolling to the existing tool", () => {
  const source = dashboard.match(/if \(button\.dataset\.view\) \{[\s\S]*?\n {8}\}/);
  assert.ok(source);
  const calls = [];
  const activate = runInNewContext(`(button) => { ${source[0]} }`, {
    setView: (view) => calls.push(view),
    document: { getElementById: (id) => ({ scrollIntoView: () => calls.push(id) }) }
  });
  activate({ dataset: { view: "movement", viewTarget: "weather-title" } });
  assert.deepEqual(calls, ["movement", "weather-title"]);
});

test("day loop combat shortcut uses the existing campaign resolver and returns focus", () => {
  const source = dashboard.match(/const combatResolverDialog = document\.getElementById\("combat-resolver-dialog"\);[\s\S]*?(?= {6}\/\/ Escape)/);
  assert.ok(source);
  const callbacks = {};
  const dialog = {
    open: false, addEventListener(name, callback) { callbacks[name] = callback; },
    showModal() { this.open = true; }, close() { this.open = false; }
  };
  const frame = { removeAttribute(name) { delete this[name]; } };
  let fallbackFocused = false;
  const nodes = {
    "combat-resolver-dialog": dialog, "combat-resolver-frame": frame,
    "conflict-battle-link": { addEventListener() {} }, "close-combat-resolver": { addEventListener() {} },
    "cancel-combat-resolver": { addEventListener() {} }, "combat-resolver-campaign": {},
    "dayloop-title": { focus() { fallbackFocused = true; } }
  };
  const messages = [];
  const state = { runtimeCampaignId: "campaign 1" };
  const context = {
    document: { getElementById: (id) => nodes[id], querySelector: () => ({ focus() {} }) },
    runtimeDataLoaded: false, state, runtimeCampaignSelect: { selectedOptions: [{ textContent: "Campaign" }] },
    showToast: (message) => messages.push(message)
  };
  const open = runInNewContext(`${source[0]}\nopenCombatResolver`, context);
  const trigger = { isConnected: true, focused: false, focus() { this.focused = true; } };
  open(trigger);
  assert.match(messages[0], /Select a runtime campaign/);
  assert.equal(dialog.open, false);
  context.runtimeDataLoaded = true;
  open(trigger);
  assert.equal(dialog.open, true);
  assert.equal(frame.src, "combat.html?campaign=campaign%201&embedded=1");
  callbacks.close();
  assert.equal(frame.src, undefined);
  assert.equal(trigger.focused, true);
  trigger.isConnected = false;
  open(trigger);
  callbacks.close();
  assert.equal(fallbackFocused, true);
});

test("day loop route shortcut opens the existing editor only for a loaded campaign", () => {
  const source = dashboard.match(/if \(action === "dayloop-open-route"\) \{[\s\S]*?\n {8}\}/);
  assert.ok(source);
  let opened = 0;
  const messages = [];
  const dialog = { open: false };
  const context = {
    action: "dayloop-open-route", runtimeDataLoaded: false, routeLocations: () => [{}],
    document: { getElementById: () => dialog }, openRouteEditor: () => { opened += 1; },
    showToast: (message) => messages.push(message)
  };
  runInNewContext(source[0], context);
  assert.match(messages[0], /Select a runtime campaign/);
  context.runtimeDataLoaded = true;
  runInNewContext(source[0], context);
  assert.equal(opened, 1);
  dialog.open = true;
  runInNewContext(source[0], context);
  assert.equal(opened, 1);
});

test("day loop preserves per-campaign progress and reports unavailable storage", () => {
  const h = dayLoopHarness();
  h.click("next");
  h.state.runtimeCampaignId = "campaign-b";
  assert.equal(h.currentDayLoop().step, 0);
  h.click("next");
  h.click("next");
  const reloaded = dayLoopHarness({ values: h.values });
  assert.equal(reloaded.currentDayLoop().step, 1);
  reloaded.renderDayLoop();
  assert.equal(reloaded.views.at(-1), "movement");
  reloaded.state.runtimeCampaignId = "campaign-b";
  assert.equal(reloaded.currentDayLoop().step, 2);
  reloaded.renderDayLoop();
  assert.equal(reloaded.views.at(-1), "roster");

  const blocked = dayLoopHarness({ storageFails: true });
  blocked.click("next");
  assert.equal(blocked.currentDayLoop().step, 1);
  assert.match(blocked.elements.get("dayloop-storage-status").textContent, /only last in this page/);
  const invalid = new Map([["fieldbook.dayLoop.v2", "invalid"]]);
  const corrupted = dayLoopHarness({ values: invalid });
  corrupted.click("next");
  assert.equal(invalid.get("fieldbook.dayLoop.v2"), "invalid");
  assert.match(corrupted.elements.get("dayloop-storage-status").textContent, /invalid/);
});

test("day loop carries older checklist progress forward without skipping new travel review", () => {
  const values = new Map([["fieldbook.dayLoop.v1", JSON.stringify({
    owner: "campaign-a", shift: "2000-05-11T00:00", step: 3
  })]]);
  const h = dayLoopHarness({ values });
  assert.equal(h.currentDayLoop().step, 3);
  const previous = dayLoopHarness({ values: new Map([["fieldbook.dayLoop.v2", JSON.stringify([
    { owner: "campaign-a", shift: "2000-05-11T00:00", step: 5, stretch: 4 }
  ])]]) });
  assert.equal(previous.currentDayLoop().step, 5);
  previous.click("next");
  assert.equal(previous.currentDayLoop().step, 6);
});

test("weather die reports unavailable browser randomness and otherwise fills the die", () => {
  const handler = dashboard.match(/document\.getElementById\("roll-weather-d6"\)\.addEventListener\("click", \(\) => \{([\s\S]*?)\n {6}\}\);/);
  assert.ok(handler);
  const run = (crypto) => {
    const weatherRollStatus = {};
    const weatherD6Result = { value: "" };
    let updated = false;
    runInNewContext(`(() => {${handler[1]}\n})()`, {
      crypto, weatherRollStatus, weatherD6Result,
      updateWeatherRollAvailability: () => { updated = true; }
    });
    return { weatherRollStatus, weatherD6Result, updated };
  };
  const unavailable = run(undefined);
  assert.match(unavailable.weatherRollStatus.textContent, /unavailable.*physical d6/);
  assert.equal(unavailable.weatherD6Result.value, "");
  const available = run({ getRandomValues: (buffer) => { buffer[0] = 5; } });
  assert.equal(available.weatherD6Result.value, "6");
  assert.equal(available.updated, true);
});

test("campaign desk navigation items are in numerical order", () => {
  const nav = dashboard.match(/<nav class="nav-list" aria-label="Views">([\s\S]*?)<\/nav>/);
  assert.ok(nav, "campaign desk navigation should exist");
  const numbers = [...nav[1].matchAll(/class="nav-icon" aria-hidden="true">(\d+)<\/span>/g)]
    .map(([, number]) => number);
  assert.deepEqual(numbers, ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11"]);
});

test("active campaign detail small text uses a readable 12px size", () => {
  assert.match(dashboard, /\.campaign-chip small\s*\{[^}]*font:\s*12px\s+var\(--mono\);/);
});

test("route ledger stays in a closed dialog until dedicated route management opens it", () => {
  const closedStyle = dashboard.match(/#route-editor-modal\s*\{([^}]*)\}/)[1];
  assert.doesNotMatch(closedStyle, /display\s*:/);
  assert.match(dashboard, /#route-editor-modal\[open\]\s*\{[^}]*display:\s*flex/);
  assert.match(dashboard, /<dialog id="route-editor-modal" aria-labelledby="route-editor-title">/);
  const client = readFileSync(join(__dirname, "..", "route-client.js"), "utf8");
  assert.match(client, /if \(!modal.open\) modal.showModal\(\)/);
  assert.match(client, /modal.close\(\)/);
  assert.doesNotMatch(client, /modal.style.display/);
  assert.match(client, /data-action="open-route-editor"/);
});

test("runtime route editor estimates marching shifts from traversed known terrain only", () => {
  assert.match(dashboard, /function routeHexPathForStop\(index\)/);
  assert.match(dashboard, /function routeMarchingEstimate\(index\)/);
  assert.match(dashboard, /Math\.ceil\(roadOpenHexes \/ 2 \+ otherTerrainHexes\)/);
  assert.match(dashboard, /unassigned for traversed hex/);
  assert.match(dashboard, /unrecognized terrain in traversed hex/);
  assert.match(dashboard, /Driving remains GM-managed/);
  assert.match(dashboard, /Mixed terrain is a planning estimate/);
});

test("authoring tools remain reachable outside the numbered live desk views", () => {
  const nav = dashboard.match(/<nav class="nav-list" aria-label="Views">([\s\S]*?)<\/nav>/)[1];
  assert.doesNotMatch(nav, /campaign-setup\.html|player-seeds\.html/);
  assert.match(dashboard, /Separate authoring tools/);
  assert.match(dashboard, /<a class="nav-link" href="campaign-setup.html">Campaign setup<\/a>/);
  assert.match(dashboard, /<a class="nav-link" href="player-seeds.html">Player seeds<\/a>/);
  assert.match(dashboard, /data-action="open-setup-import">Import setup package/);
  const setup = readFileSync(join(__dirname, "..", "campaign-setup.html"), "utf8");
  assert.match(setup, /href="index.html">GM runtime/);
  assert.match(setup, /Initial state only \/ schema v2/);
  assert.match(setup, /they do not update this draft/);
});

test("runtime delegates package handoff while retaining live map normalization", () => {
  assert.match(dashboard, /src="campaign-setup-import-client.js"/);
  assert.match(dashboard, /window\.FieldbookSetupImport\.initialize\(\{/);
  assert.match(dashboard, /normalizePackage: normalizeSetupPackageForInfluence/);
  assert.match(dashboard, /normalizeSetupPackageForInfluence\(campaign.setupPackage\)/);
  assert.doesNotMatch(dashboard, /pendingSetupSourceJson|setupPackageFile.addEventListener/);
  assert.match(dashboard, /await refreshRuntimeCampaigns\(campaign.id\)/);
  assert.match(dashboard, /!runtimeDataLoaded \|\| state.runtimeCampaignId !== campaign.id/);
});

test("faction influence lets the GM add campaign-scoped factions and manage their live layers", () => {
  assert.match(dashboard, /id="view-influence"[\s\S]*id="runtime-faction-form"/);
  assert.match(dashboard, /id="runtime-faction-name" maxlength="120" required/);
  assert.match(dashboard, /id="runtime-faction-color" type="color"/);
  assert.match(dashboard, /runtime-faction-form"\)\.addEventListener\("submit", createRuntimeFaction\)/);
  assert.match(dashboard, /expectedRevision: runtimeFactionLayers\.revision/);
  assert.match(dashboard, /state\.setupPackage\.factions\.push/);
  assert.match(dashboard, /Faction was not added:/);
});

test("conflicts launches the existing battle resolver for the selected campaign without resolving automatically", () => {
  const conflicts = dashboard.match(/<section class="view" id="view-conflicts"[\s\S]*?<section class="view" id="view-movement"/)[0];
  assert.match(conflicts, /id="conflict-battle-link" type="button" aria-haspopup="dialog" aria-controls="combat-resolver-dialog" hidden/);
  assert.match(dashboard, /<dialog id="combat-resolver-dialog" aria-labelledby="combat-resolver-title">/);
  assert.match(dashboard, /<iframe id="combat-resolver-frame" title="Combat attack inputs and results">/);
  assert.match(dashboard, /combatResolverDialog\.showModal\(\)/);
  assert.match(dashboard, /combatResolverFrame\.removeAttribute\("src"\)/);
  assert.match(dashboard, /event\.source === combatResolverFrame\.contentWindow/);
  assert.match(conflicts, /results are not added to this ledger or campaign record/);
  assert.match(dashboard, /combat\.html\?campaign=\$\{encodeURIComponent\(campaignId\)\}/);
  assert.match(dashboard, /runtimeDataLoaded \? state\.runtimeCampaignId : null/);
  assert.doesNotMatch(dashboard, /combatClient\.resolve|\/combat\/(?:ranged-attack|close-combat|grenade|heavy-weapon|vehicle-combat)/);
});

test("separated surfaces retain valid inline JavaScript and synchronized deployment assets", () => {
  for (const filename of ["index.html", "campaign-setup.html", "combat.html"]) {
    const html = readFileSync(join(__dirname, "..", filename), "utf8");
    for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new Script(script, { filename });
    }
  }
  assert.match(dashboard, /window\.FieldbookMapTooltips\.bindVerticalTooltip/);
  assert.match(dashboard, /<script src="\/map-tooltip-client\.js"><\/script>/);
  assert.match(dashboard, /map-feature-tooltip/);
  assert.match(dashboard, /closest\?\.\("\.live-influence-hex, \.live-influence-location"\)/);
  for (const filename of ["index.html", "campaign-setup.html", "campaign-setup-import-client.js", "maptiler-reference-client.js", "campaign-package-contract.js",
    "map-coordinates.js", "map-basemap-client.js", "map-publication-client.js", "map-visualization-client.js", "location-client.js", "route-client.js",
    "map-tooltip-client.js", "roll-tables.json", "roll-tables-client.js", "player-interface.html", "server/app.cjs", "server/setup-packages.cjs", "server/runtime-store.cjs",
    "server/map-publications.cjs", "server/campaigns.cjs", "server/campaign-depth-service.cjs", "server/audit.cjs", "server/sample-data.cjs",
    "metadata/FEATURES.md", "metadata/ROADMAP.md", "metadata/DATA_MODEL.md", "metadata/ROLL_TABLES.md",
    "project-features.html", "project-status.html", "combat.html", "combat-client.js"]) {
    assert.equal(
      readFileSync(join(__dirname, "..", "deploy", "t2k-gm-tool", filename), "utf8"),
      readFileSync(join(__dirname, "..", filename), "utf8"),
      `${filename} deployment copy must match the application`
    );
  }
});
