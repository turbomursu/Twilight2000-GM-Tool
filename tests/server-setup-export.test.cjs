const assert = require("node:assert/strict");
const http = require("node:http");
const { once } = require("node:events");
const { mkdtempSync, rmSync, readFileSync, writeFileSync, readdirSync, mkdirSync, symlinkSync, unlinkSync, existsSync } = require("node:fs");
const { tmpdir } = require("node:os");
const { join, resolve } = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const { createAppHandler } = require("../server/app.cjs");
const { createAuthHandler } = require("../server/auth.cjs");
const { openRuntimeDatabase, createPlayerSeed } = require("../server/runtime-store.cjs");

const bootstrapToken = "setup-export-test-bootstrap-token-12345678";
const password = "A-correct-horse-battery-41";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5V8AAAAASUVORK5CYII=", "base64");

function setupPackage(assetId, geographic = false) {
  return {
    packageType: "fieldbook.campaign-setup", schemaVersion: 2,
    campaign: { id: randomUUID(), name: "Test Campaign", setting: "Test", premise: "GM private premise", era: "2000" },
    map: {
      id: randomUUID(), name: "Test map",
      bounds: geographic ? { south: 0, west: 0, north: 1, east: 1 } : { type: "image-km", widthPixels: 1, heightPixels: 1, widthKm: 12 },
      center: geographic ? { lat: 0.5, lng: 0.5 } : { x: 6, y: 6 }, zoom: 1,
      fieldPapersAtlas: null, attribution: "GM credit", offlineAnnotations: [],
      offlineBasemap: assetId ? { assetId, format: "static-image", attribution: "GM private map" } : null,
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, origin: geographic ? { lat: 1, lng: 0 } : { x: 0, y: 12 }, terrainCells: [] },
      locations: [{
        id: randomUUID(), name: "Start", kind: "Settlement", description: "", gridRef: "0,0",
        coordinates: { q: 0, r: 0 }, mapPosition: geographic ? { lat: 0.5, lng: 0.5 } : { x: 6, y: 6 },
        visibility: "gm-only", isStartingLocation: true
      }]
    },
    factions: [], settlements: [], scenarioNotes: []
  };
}

async function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "fieldbook-setup-export-"));
  const database = openRuntimeDatabase();
  const errors = [];
  let server;
  async function start() {
    server = http.createServer(createAppHandler({
      database, root, authHandler: createAuthHandler({ database, bootstrapToken }),
      logger: { error: (...args) => errors.push(args) }
    }));
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    return `http://127.0.0.1:${server.address().port}`;
  }
  let origin = await start();
  const boot = await fetch(`${origin}/api/auth/bootstrap`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bootstrapToken, username: "owner", password })
  });
  assert.equal(boot.status, 201);
  const ownerCookie = boot.headers.get("set-cookie").split(";")[0];
  const owner = database.prepare("SELECT * FROM accounts WHERE login_identifier = 'owner'").get();
  const cookies = { owner: ownerCookie };
  for (const [name, role] of [["other", "gm"], ["player", "player"]]) {
    database.prepare(`INSERT INTO accounts
      (id, login_identifier, password_hash, global_role, created_by_account_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).run(name, name, owner.password_hash, role, owner.id, owner.created_at, owner.updated_at);
    const login = await fetch(`${origin}/api/auth/login`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username: name, password })
    });
    assert.equal(login.status, 200);
    cookies[name] = login.headers.get("set-cookie").split(";")[0];
  }
  t.after(async () => {
    await new Promise((done) => server.close(done));
    database.close();
    rmSync(root, { recursive: true, force: true });
  });
  async function call(path, { user = "owner", method = "GET", body, raw, headers = {} } = {}) {
    const response = await fetch(`${origin}${path}`, {
      method, headers: { ...(user ? { Cookie: cookies[user] } : {}), ...(body !== undefined || raw !== undefined ? { "Content-Type": "application/json" } : {}), ...headers },
      ...(body !== undefined || raw !== undefined ? { body: raw ?? JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  }
  async function upload(user = "owner", data = png, contentType = "image/png") {
    const response = await fetch(`${origin}/api/offline-basemaps`, {
      method: "POST", headers: { Cookie: cookies[user], "Content-Type": contentType }, body: data
    });
    assert.equal(response.status, 201);
    return (await response.json()).asset.assetId;
  }
  return {
    root, database, errors, owner, cookies, call, upload,
    get origin() { return origin; },
    async restart() {
      await new Promise((done) => server.close(done));
      origin = await start();
    }
  };
}

function savedFiles(root) {
  const directory = join(root, "gmpack", "campsetups");
  return existsSync(directory) ? readdirSync(directory).sort() : [];
}

test("setup saves create exact versioned files, reopen original JSON and resolve copied assets after restart/import/publication", async (t) => {
  const f = await fixture(t);
  const sourceId = await f.upload();
  const input = setupPackage(sourceId);
  const first = await f.call("/api/setup-packages", { method: "POST", body: input });
  assert.equal(first.status, 201, first.body.error);
  const saved = first.body.saved;
  assert.deepEqual(Object.keys(saved).sort(), ["id", "imagePath", "packagePath", "packageUrl"]);
  assert.match(saved.id, /^[0-9a-f-]{36}$/);
  assert.equal(saved.packageUrl, `/api/setup-packages/${saved.id}`);
  assert.equal(saved.packagePath, `gmpack/campsetups/test-campaign-${saved.id}-setup-v2.json`);
  const exported = JSON.parse(readFileSync(join(f.root, saved.packagePath), "utf8"));
  const copiedId = exported.map.offlineBasemap.assetId;
  assert.notEqual(copiedId, sourceId);
  assert.equal(saved.imagePath, `data/maps/test-campaign/${copiedId}.image`);
  assert.deepEqual(exported, { ...input, map: { ...input.map, offlineBasemap: { ...input.map.offlineBasemap, assetId: copiedId } } });
  assert.deepEqual(readFileSync(join(f.root, saved.imagePath)), png);
  assert.deepEqual(readFileSync(join(f.root, "data/maps/atlas", `${sourceId}.image`)), png);
  const metadata = JSON.parse(readFileSync(join(f.root, "data/maps/test-campaign", `${copiedId}.json`), "utf8"));
  assert.deepEqual(metadata, { assetId: copiedId, ownerAccountId: f.owner.id, byteLength: png.length, format: "static-image", contentType: "image/png", width: 1, height: 1 });
  const ownerPath = saved.packagePath.replace(/\.json$/, ".owner.json");
  assert.deepEqual(JSON.parse(readFileSync(join(f.root, ownerPath), "utf8")), { id: saved.id, ownerAccountId: f.owner.id });
  assert.deepEqual(savedFiles(f.root), [saved.packagePath.split("/").at(-1), ownerPath.split("/").at(-1)].sort());
  assert.equal(f.database.prepare("SELECT count(*) AS n FROM campaigns").get().n, 0, "save does not create live campaign");
  const second = await f.call("/api/setup-packages", { method: "POST", body: input });
  assert.equal(second.status, 201);
  assert.notEqual(second.body.saved.id, saved.id);
  assert.notEqual(second.body.saved.imagePath, saved.imagePath);
  assert.equal(savedFiles(f.root).length, 4);
  await f.restart();
  assert.deepEqual((await f.call(saved.packageUrl)).body, exported);
  const imported = await f.call("/api/campaigns/import-setup", { method: "POST", body: exported });
  assert.equal(imported.status, 201, imported.body.error);
  const campaignId = imported.body.campaign.id;
  const image = await fetch(`${f.origin}/offline-basemaps/${copiedId}.image`, { headers: { Cookie: f.cookies.owner } });
  assert.equal(image.status, 200);
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), png);
  assert.equal((await fetch(`${f.origin}/offline-basemaps/${copiedId}.image`, { headers: { Cookie: f.cookies.other } })).status, 404);
  createPlayerSeed(f.database, f.owner.id, campaignId, {
    username: "player", displayLabel: "Player", fields: [{ key: "name", label: "Name", value: "Player", required: true }]
  });
  const path = `/api/campaigns/${campaignId}/map-publication`;
  const map = (await f.call(path)).body.map;
  const draft = await f.call(path, { method: "PUT", body: {
    action: "draft", expectedRevision: map.revision,
    draft: { locationIds: [], markings: [], geometries: [], routeLocationIds: [], playerPosition: { x: 6, y: 6 } }
  } });
  assert.equal(draft.status, 200, draft.body.error);
  assert.equal((await f.call(path, { method: "PUT", body: { action: "publish", expectedRevision: draft.body.map.revision } })).status, 200);
  await f.restart();
  const published = await fetch(`${f.origin}/api/player/campaigns/${campaignId}/map-basemap`, { headers: { Cookie: f.cookies.player } });
  assert.equal(published.status, 200);
  assert.deepEqual(Buffer.from(await published.arrayBuffer()), png);
  assert.deepEqual((await f.call(saved.packageUrl)).body, exported, "runtime/publication do not rewrite authoring package");
});

test("GM-only ownership, same origin, media type, malformed JSON and size boundaries", async (t) => {
  const f = await fixture(t);
  const input = setupPackage(null, true);
  for (const [options, status] of [
    [{ user: null }, 401], [{ user: "player" }, 403],
    [{ headers: { Origin: "http://foreign.invalid" } }, 403],
    [{ headers: { "Content-Type": "text/plain" } }, 415],
    [{ raw: "{" }, 422], [{ raw: "null" }, 422],
    [{ raw: " ".repeat(25 * 1024 * 1024 + 1) }, 413]
  ]) {
    const result = await f.call("/api/setup-packages", { method: "POST", body: input, ...options });
    assert.equal(result.status, status, JSON.stringify(options).slice(0, 100));
    assert.deepEqual(savedFiles(f.root), []);
  }
  const result = await f.call("/api/setup-packages", { method: "POST", body: input });
  assert.equal(result.status, 201, result.body.error);
  assert.equal(result.body.saved.imagePath, null);
  for (const [user, status] of [[null, 401], ["player", 403], ["other", 404]]) {
    assert.equal((await f.call(result.body.saved.packageUrl, { user })).status, status);
  }
  assert.equal((await f.call(result.body.saved.packageUrl, { headers: { Origin: "http://foreign.invalid" } })).status, 403);
  assert.equal((await f.call("/api/setup-packages/not-a-uuid")).status, 404);
  assert.equal((await f.call("/api/setup-packages", { method: "PUT", body: input })).status, 405);
});

test("MapTiler setup saves and runtime imports carry only fixed style metadata and no static image", async (t) => {
  const f = await fixture(t);
  const input = setupPackage(null, true);
  input.map.offlineBasemap = { format: "maptiler-style", styleId: "01a1b6c9-9a4c-7ab4-bf09-6d75353e5420" };
  input.map.attribution = "";
  const saved = await f.call("/api/setup-packages", { method: "POST", body: input });
  assert.equal(saved.status, 201, saved.body.error);
  assert.equal(saved.body.saved.imagePath, null);
  const exported = await f.call(saved.body.saved.packageUrl);
  assert.deepEqual(exported.body, input);
  assert.doesNotMatch(JSON.stringify(exported.body), /apiKey|YOUR_MAPTILER_API_KEY/);

  const imported = await f.call("/api/campaigns/import-setup", { method: "POST", body: exported.body });
  assert.equal(imported.status, 201, imported.body.error);
  const publication = await f.call(`/api/campaigns/${imported.body.campaign.id}/map-publication`);
  assert.deepEqual(publication.body.map.catalog.offlineBasemap, input.map.offlineBasemap);
  assert.equal(publication.body.map.catalog.bounds.south, 0);
});

test("invalid schema/data/name and unowned, missing, mismatched or corrupt image create no export files", async (t) => {
  const f = await fixture(t);
  const sourceId = await f.upload();
  const otherId = await f.upload("other");
  const variants = [
    (p) => { p.schemaVersion = 1; }, (p) => { p.campaign.name = " "; },
    (p) => { p.campaign.name = "x".repeat(81); }, (p) => { p.campaign.id = ""; },
    (p) => { p.campaign.setting = ""; }, (p) => { p.campaign.premise = ""; },
    (p) => { p.map.name = ""; }, (p) => { p.campaign.id = "x".repeat(121); },
    (p) => { p.map.grid.terrainCells = [{ q: "invalid", r: 0, terrainType: "forest" }]; },
    (p) => { p.map.grid.terrainCells = [{ q: 0, r: 0, terrainType: "forest" }, { q: 0, r: 0, terrainType: "open" }]; },
    (p) => { p.map.offlineBasemap.assetId = otherId; },
    (p) => { p.map.offlineBasemap.assetId = randomUUID(); },
    (p) => { p.map.bounds.widthPixels = 2; },
    (p) => { p.map.offlineBasemap.format = "raster-pmtiles"; }
  ];
  for (const mutate of variants) {
    const input = setupPackage(sourceId);
    mutate(input);
    assert.equal((await f.call("/api/setup-packages", { method: "POST", body: input })).status, 422);
    assert.deepEqual(savedFiles(f.root), []);
    assert.deepEqual(readdirSync(join(f.root, "data/maps")), ["atlas"]);
  }
  const metadataPath = join(f.root, "data/maps/atlas", `${sourceId}.json`);
  const metadata = JSON.parse(readFileSync(metadataPath, "utf8"));
  for (const changed of [{ ...metadata, byteLength: png.length + 1 }, { ...metadata, width: 9 }]) {
    writeFileSync(metadataPath, JSON.stringify(changed));
    assert.equal((await f.call("/api/setup-packages", { method: "POST", body: setupPackage(sourceId) })).status, 422);
  }
  writeFileSync(metadataPath, JSON.stringify(metadata));
  writeFileSync(join(f.root, "data/maps/atlas", `${sourceId}.image`), Buffer.alloc(png.length));
  assert.equal((await f.call("/api/setup-packages", { method: "POST", body: setupPackage(sourceId) })).status, 422);
  assert.deepEqual(savedFiles(f.root), []);
});

test("failed image sidecar/JSON commit removes own writes without altering earlier saves or source upload", async (t) => {
  const f = await fixture(t);
  const sourceId = await f.upload();
  const input = setupPackage(sourceId);
  assert.equal((await f.call("/api/setup-packages", { method: "POST", body: input })).status, 201);
  const packagesBefore = savedFiles(f.root);
  const imagesBefore = readdirSync(join(f.root, "data/maps/test-campaign")).sort();
  // Isolate filesystem failure injection in a child process; no global hooks
  // affect concurrently running server tests.
  const script = `
    const fs = require("node:fs");
    const original = fs.writeFileSync;
    const stage = process.env.FAIL_STAGE;
    const root = process.env.TEST_ROOT;
    let writes = 0;
    fs.writeFileSync = (...args) => {
      writes += 1;
      if (writes === Number(stage)) {
        const error = new Error("Injected write failure");
        error.code = "EIO";
        throw error;
      }
      return original(...args);
    };
    const { createSetupPackageHandler } = require("./server/setup-packages.cjs");
    const { Readable } = require("node:stream");
    const input = JSON.parse(process.env.TEST_INPUT);
    const request = Readable.from([Buffer.from(JSON.stringify(input))]);
    request.method = "POST";
    request.headers = { "content-type": "application/json", host: "localhost" };
    const response = {
      writeHead(status) { this.status = status; },
      end(body) { process.stdout.write(JSON.stringify({ status: this.status, body: JSON.parse(body) })); }
    };
    createSetupPackageHandler({
      root,
      validateOfflineBasemap: () => true,
      findOfflineBasemapDirectory: () => require("node:path").join(root, "data/maps/atlas"),
      logger: { error() {} }
    })(request, response, { id: process.env.TEST_OWNER, role: "gm" }, "/api/setup-packages");
  `;
  // Image, image sidecar, export owner sidecar, then commit JSON.
  for (const stage of [2, 3, 4]) {
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: join(__dirname, ".."), encoding: "utf8",
      env: { ...process.env, TEST_ROOT: f.root, TEST_INPUT: JSON.stringify(input), TEST_OWNER: f.owner.id, FAIL_STAGE: String(stage) }
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, 500);
    assert.deepEqual(savedFiles(f.root), packagesBefore);
    assert.deepEqual(readdirSync(join(f.root, "data/maps/test-campaign")).sort(), imagesBefore);
    assert.deepEqual(readFileSync(join(f.root, "data/maps/atlas", `${sourceId}.image`)), png);
  }
});

test("JSON commit is atomic and exclusive; rollback cleanup failures are logged without removing unsafe paths", async (t) => {
  const f = await fixture(t);
  const input = setupPackage(null, true);
  const script = `
    const assert = require("node:assert/strict");
    const fs = require("node:fs");
    const path = require("node:path");
    const { Readable } = require("node:stream");
    const originalWrite = fs.writeFileSync;
    const originalOpen = fs.openSync;
    const originalLink = fs.linkSync;
    const originalUnlink = fs.unlinkSync;
    const root = process.env.TEST_ROOT;
    const mode = process.env.TEST_MODE;
    const input = JSON.parse(process.env.TEST_INPUT);
    const files = new Map();
    let temporary;
    let final;
    let ownerFile;
    let checkedPartial = false;
    let checkedComplete = false;
    let logged;
    let handler;
    const owner = { id: process.env.TEST_OWNER, role: "gm" };
    fs.openSync = (file, ...args) => {
      const fd = originalOpen(file, ...args);
      files.set(fd, file);
      if (file.endsWith(".owner.json")) ownerFile = file;
      return fd;
    };
    fs.writeFileSync = (fd, data, ...args) => {
      const file = files.get(fd);
      if (!file?.endsWith(".tmp")) return originalWrite(fd, data, ...args);
      temporary = file;
      final = file.replace(/\\.[0-9a-f-]{36}\\.tmp$/, ".json");
      const text = String(data);
      const midpoint = Math.floor(text.length / 2);
      originalWrite(fd, text.slice(0, midpoint));
      assert.equal(fs.existsSync(final), false, "partial write is not published");
      assert.equal(fs.readFileSync(file, "utf8"), text.slice(0, midpoint));
      const id = path.basename(final).match(/-([0-9a-f-]{36})-setup-v2\\.json$/)[1];
      handler({ method: "GET", headers: {} }, {
        writeHead(status) { assert.equal(status, 404, "reopen cannot see partial JSON"); },
        end() {}
      }, owner, "/api/setup-packages/" + id);
      originalWrite(fd, text.slice(midpoint));
      checkedPartial = true;
    };
    fs.linkSync = (source, target) => {
      assert.equal(source, temporary);
      assert.equal(target, final);
      assert.equal(fs.existsSync(target), false);
      assert.deepEqual(JSON.parse(fs.readFileSync(source, "utf8")), input);
      checkedComplete = true;
      if (mode === "collision") {
        originalWrite(target, "preexisting-final", { flag: "wx" });
      }
      if (mode === "cleanup" || mode === "unsafe") {
        if (mode === "unsafe") {
          originalUnlink(ownerFile);
          fs.mkdirSync(ownerFile);
        }
        const error = new Error("Injected link failure");
        error.code = "EIO";
        throw error;
      }
      return originalLink(source, target);
    };
    fs.unlinkSync = (file) => {
      if (mode === "cleanup" && file === ownerFile) {
        const error = new Error("Injected cleanup failure");
        error.code = "EACCES";
        throw error;
      }
      if (mode === "unsafe" && file === ownerFile) throw new Error("Unsafe path must never reach unlink");
      return originalUnlink(file);
    };
    const { createSetupPackageHandler } = require("./server/setup-packages.cjs");
    handler = createSetupPackageHandler({
      root, validateOfflineBasemap: () => true, findOfflineBasemapDirectory: () => null,
      logger: { error(message, error) {
        logged = {
          message,
          aggregate: error instanceof AggregateError,
          errors: error.errors?.map((entry) => entry.message),
          cause: error.cause?.message
        };
      } }
    });
    const request = Readable.from([Buffer.from(JSON.stringify(input))]);
    request.method = "POST";
    request.headers = { "content-type": "application/json" };
    handler(request, {
      writeHead(status) { this.status = status; },
      end(body) {
        process.stdout.write(JSON.stringify({
          status: this.status, body: JSON.parse(body), checkedPartial, checkedComplete, logged,
          temporaryExists: fs.existsSync(temporary),
          finalContent: fs.existsSync(final) ? fs.readFileSync(final, "utf8") : null,
          ownerExists: fs.existsSync(ownerFile),
          ownerIsDirectory: fs.existsSync(ownerFile) && fs.lstatSync(ownerFile).isDirectory(),
          entries: fs.readdirSync(path.dirname(final))
        }));
      }
    }, owner, "/api/setup-packages");
  `;
  for (const mode of ["success", "collision", "cleanup", "unsafe"]) {
    const root = join(f.root, mode);
    mkdirSync(root);
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: join(__dirname, ".."), encoding: "utf8",
      env: { ...process.env, TEST_ROOT: root, TEST_INPUT: JSON.stringify(input), TEST_OWNER: f.owner.id, TEST_MODE: mode }
    });
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.checkedPartial, true);
    assert.equal(output.checkedComplete, true);
    assert.equal(output.temporaryExists, false, "temporary files are removed");
    if (mode === "success") {
      assert.equal(output.status, 201);
      assert.deepEqual(JSON.parse(output.finalContent), input);
      assert.equal(output.entries.length, 2);
      assert.equal(output.logged, undefined);
    } else {
      assert.equal(output.status, 500);
      assert.ok(output.logged);
      if (mode === "collision") {
        assert.equal(output.finalContent, "preexisting-final", "exclusive link never replaces or rolls back someone else's file");
        assert.equal(output.ownerExists, false);
        assert.equal(output.entries.length, 1);
      } else {
        assert.equal(output.finalContent, null);
        assert.equal(output.logged.aggregate, true);
        assert.equal(output.logged.cause, "Injected link failure");
        assert.equal(output.logged.errors.length, 2);
        assert.equal(output.logged.errors[1], mode === "cleanup" ? "Injected cleanup failure" : "Unsafe setup storage path.");
        assert.equal(output.ownerExists, true);
        assert.equal(output.ownerIsDirectory, mode === "unsafe");
        assert.equal(output.entries.length, 1);
      }
    }
  }
});

test("campaign names cannot select paths and Windows reserved/non-ASCII names have safe slugs", async (t) => {
  const f = await fixture(t);
  for (const [name, slug] of [["../../Outside\\Nested", "outside-nested"], [" CON ", "campaign-con"], ["COM1", "campaign-com1"], ["☃☃", "campaign"], ["A".repeat(80), "a".repeat(60)]]) {
    const input = setupPackage(null, true);
    input.campaign.name = name;
    input.packagePath = "../../never-use-input.json";
    const result = await f.call("/api/setup-packages", { method: "POST", body: input });
    assert.equal(result.status, 201, result.body.error);
    assert.equal(result.body.saved.packagePath, `gmpack/campsetups/${slug}-${result.body.saved.id}-setup-v2.json`);
    assert.ok(resolve(f.root, result.body.saved.packagePath).startsWith(resolve(f.root, "gmpack/campsetups")));
    assert.deepEqual((await f.call(result.body.saved.packageUrl)).body, input, "original JSON retained; supplied paths ignored");
  }
});

test("geographic static images copy too; PMTiles retain atlas assets and no image copies", async (t) => {
  const f = await fixture(t);
  const sourceId = await f.upload();
  const input = setupPackage(sourceId, true);
  const result = await f.call("/api/setup-packages", { method: "POST", body: input });
  assert.equal(result.status, 201, result.body.error);
  const reopened = (await f.call(result.body.saved.packageUrl)).body;
  assert.deepEqual(reopened.map.bounds, input.map.bounds);
  assert.notEqual(reopened.map.offlineBasemap.assetId, sourceId);
  assert.equal((await f.call("/api/campaigns/import-setup", { method: "POST", body: reopened })).status, 201);
  const archive = Buffer.alloc(128);
  archive.write("PMTiles", 0); archive[7] = 3; archive[99] = 2;
  const archiveId = await f.upload("owner", archive, "application/vnd.pmtiles");
  const pmPackage = setupPackage(null, true);
  pmPackage.map.offlineBasemap = { format: "raster-pmtiles", assetId: archiveId, attribution: "Licensed map", licenseUrl: "https://example.test/license" };
  const pmResult = await f.call("/api/setup-packages", { method: "POST", body: pmPackage });
  assert.equal(pmResult.status, 201, pmResult.body.error);
  assert.equal(pmResult.body.saved.imagePath, null);
  assert.deepEqual((await f.call(pmResult.body.saved.packageUrl)).body, pmPackage);
  assert.equal(readdirSync(join(f.root, "data/maps/test-campaign")).length, 2, "only static image and its sidecar copied");
});

test("concurrent saves are exclusive versions and IO failure rolls back only newly created files", async (t) => {
  const f = await fixture(t);
  const sourceId = await f.upload();
  const results = await Promise.all(Array.from({ length: 3 }, () => f.call("/api/setup-packages", { method: "POST", body: setupPackage(sourceId) })));
  assert.ok(results.every((r) => r.status === 201));
  assert.equal(new Set(results.map((r) => r.body.saved.id)).size, 3);
  const before = savedFiles(f.root);
  const imagesBefore = readdirSync(join(f.root, "data/maps/test-campaign")).sort();
  // A file where a campaign directory must be is an explicit storage error.
  writeFileSync(join(f.root, "data/maps/blocked"), "do not alter");
  const input = setupPackage(sourceId);
  input.campaign.name = "Blocked";
  const failure = await f.call("/api/setup-packages", { method: "POST", body: input });
  assert.equal(failure.status, 500);
  assert.doesNotMatch(failure.body.error, new RegExp(f.root.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.equal(f.errors.length, 1);
  assert.deepEqual(savedFiles(f.root), before);
  assert.deepEqual(readdirSync(join(f.root, "data/maps/test-campaign")).sort(), imagesBefore);
  assert.equal(readFileSync(join(f.root, "data/maps/blocked"), "utf8"), "do not alter");
});

test("symlink/junction output directories and source image/metadata symlinks are rejected where supported", async (t) => {
  const f = await fixture(t);
  const sourceId = await f.upload();
  const outside = mkdtempSync(join(tmpdir(), "fieldbook-setup-outside-"));
  t.after(() => rmSync(outside, { recursive: true, force: true }));
  const link = join(f.root, "gmpack");
  try { symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir"); } catch (error) {
    if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.skip("Host does not permit directory symlinks."); return; }
    throw error;
  }
  assert.equal((await f.call("/api/setup-packages", { method: "POST", body: setupPackage(sourceId) })).status, 500);
  assert.deepEqual(readdirSync(outside), []);
  unlinkSync(link);
  const campaignLink = join(f.root, "data/maps/test-campaign");
  symlinkSync(outside, campaignLink, process.platform === "win32" ? "junction" : "dir");
  assert.equal((await f.call("/api/setup-packages", { method: "POST", body: setupPackage(sourceId) })).status, 500);
  assert.deepEqual(readdirSync(outside), []);
  unlinkSync(campaignLink);
  for (const extension of ["image", "json"]) {
    const path = join(f.root, "data/maps/atlas", `${sourceId}.${extension}`);
    const original = readFileSync(path);
    const target = join(outside, `source.${extension}`);
    writeFileSync(target, original);
    unlinkSync(path);
    try { symlinkSync(target, path, "file"); } catch (error) {
      writeFileSync(path, original);
      if (["EPERM", "EACCES", "ENOTSUP"].includes(error.code)) { t.diagnostic("Host does not permit file symlinks; directory checks passed."); break; }
      throw error;
    }
    assert.equal((await f.call("/api/setup-packages", { method: "POST", body: setupPackage(sourceId) })).status, 422);
    assert.equal((await fetch(`${f.origin}/offline-basemaps/${sourceId}.image`, { headers: { Cookie: f.cookies.owner } })).status, 404);
    unlinkSync(path);
    writeFileSync(path, original);
  }
  assert.deepEqual(savedFiles(f.root), []);
  // Existing campaign directories are discovered only one level deep.
  mkdirSync(join(f.root, "data/maps/deep/nested"), { recursive: true });
  writeFileSync(join(f.root, "data/maps/deep/nested", `${sourceId}.image`), png);
});
