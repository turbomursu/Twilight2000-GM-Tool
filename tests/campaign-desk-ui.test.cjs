const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { Script } = require("node:vm");

const dashboard = readFileSync(join(__dirname, "..", "index.html"), "utf8");

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
    "map-tooltip-client.js", "roll-tables.json", "player-interface.html", "server/app.cjs", "server/setup-packages.cjs", "server/runtime-store.cjs",
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
