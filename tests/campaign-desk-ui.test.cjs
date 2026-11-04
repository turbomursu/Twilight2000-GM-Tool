const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");

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
