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

test("separated surfaces retain valid inline JavaScript and synchronized deployment assets", () => {
  for (const filename of ["index.html", "campaign-setup.html"]) {
    const html = readFileSync(join(__dirname, "..", filename), "utf8");
    for (const [, script] of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      new Script(script, { filename });
    }
  }
  for (const filename of ["index.html", "campaign-setup.html", "campaign-setup-import-client.js", "server/app.cjs", "server/runtime-store.cjs", "server/sample-data.cjs"]) {
    assert.equal(
      readFileSync(join(__dirname, "..", "deploy", "t2k-gm-tool", filename), "utf8"),
      readFileSync(join(__dirname, "..", filename), "utf8"),
      `${filename} deployment copy must match the application`
    );
  }
});
