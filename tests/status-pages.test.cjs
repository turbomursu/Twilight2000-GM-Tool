const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { readFileSync, readdirSync } = require("node:fs");
const { join } = require("node:path");
const test = require("node:test");
const { createStatusHandler } = require("../server/status-pages.cjs");

async function startStatusServer(t) {
  const server = http.createServer(createStatusHandler());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return `http://127.0.0.1:${server.address().port}`;
}

test("serves concise status pages and roadmap docs independently of GM authentication", async (t) => {
  const origin = await startStatusServer(t);
  const root = await fetch(origin, { redirect: "manual" });
  assert.equal(root.status, 302);
  assert.equal(root.headers.get("location"), "/project-status.html");

  const status = await fetch(`${origin}/project-status.html`);
  assert.equal(status.status, 200);
  assert.match(status.headers.get("content-type"), /text\/html/);
  assert.match(await status.text(), /Roadmap status/);

  const features = await fetch(`${origin}/project-features.html`);
  assert.equal(features.status, 200);
  assert.match(await features.text(), /Feature status/);

  const roadmap = await fetch(`${origin}/ROADMAP.md`);
  assert.equal(roadmap.status, 200);
  assert.match(roadmap.headers.get("content-type"), /text\/markdown/);

  const source = await fetch(`${origin}/FEATURES.md`);
  assert.equal(source.status, 200);
  assert.match(await source.text(), /Feature Overview/);
});

test("serves only the allowlisted status site files", async (t) => {
  const origin = await startStatusServer(t);
  for (const path of ["/index.html", "/server/main.cjs", "/package.json", "/gmpack/GAME_LOOP.md"]) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
  assert.equal((await fetch(`${origin}/project-status.html`, { method: "POST" })).status, 405);
});

test("serves Plan B with working status navigation and HEAD support", async (t) => {
  const origin = await startStatusServer(t);
  const response = await fetch(`${origin}/gmpack/plan-b.html`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.match(html, /Plan B: Session management first/);
  assert.match(html, /Alternative proposal, not an adopted roadmap/);
  assert.equal((html.match(/<th scope="row">/g) || []).length, 8);
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
    assert.equal((await fetch(new URL(href, response.url))).status, 200);
  }
  const head = await fetch(response.url, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(response.url, { method: "POST" })).status, 405);
});

test("only status pages link to Plan B outside its own navigation", () => {
  const root = join(__dirname, "..");
  const linkingPages = readdirSync(root, { recursive: true })
    .filter((path) => path.endsWith(".html") && !path.split(/[\\/]/).some((part) => ["node_modules", "deploy"].includes(part)))
    .filter((path) => path !== join("gmpack", "plan-b.html"))
    .filter((path) => /href=["'][^"']*plan-b\.html["']/.test(readFileSync(join(root, path), "utf8")))
    .sort();
  assert.deepEqual(linkingPages, ["project-features.html", "project-status.html"]);
});
