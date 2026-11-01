const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
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
  for (const path of ["/index.html", "/server/main.cjs", "/package.json"]) {
    assert.equal((await fetch(`${origin}${path}`)).status, 404);
  }
  assert.equal((await fetch(`${origin}/project-status.html`, { method: "POST" })).status, 405);
});
