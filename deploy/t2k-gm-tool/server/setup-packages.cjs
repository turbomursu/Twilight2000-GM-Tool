const { lstatSync, mkdirSync, readdirSync, readFileSync, writeFileSync, unlinkSync, openSync, closeSync, fsyncSync, linkSync } = require("node:fs");
const { resolve, relative, join, sep, parse } = require("node:path");
const { randomUUID } = require("node:crypto");
const { assertCampaignSetupPackage } = require("../campaign-package-contract.js");
const { openRuntimeDatabase, importSetupPackage } = require("./runtime-store.cjs");
const { ASSET_ID_PATTERN, MAX_BASEMAP_BYTES, inspectStaticImage, getOfflineBasemapMetadata } = require("./offline-basemaps.cjs");

const MAX_SETUP_BYTES = 25 * 1024 * 1024;

class SetupHttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

// Check every existing component, including ancestors of the configured root.
// lstat rejects Windows junctions as well as symbolic links.
function assertSafePath(path, { directory = false, create = false } = {}) {
  const absolute = resolve(path);
  const base = parse(absolute).root;
  let current = base;
  const parts = relative(base, absolute).split(sep).filter(Boolean);
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    const needsDirectory = index < parts.length - 1 || directory;
    let stat;
    try { stat = lstatSync(current); } catch (error) {
      if (error.code !== "ENOENT") throw error;
      if (!create || !needsDirectory) throw error;
      try { mkdirSync(current); } catch (mkdirError) {
        if (mkdirError.code !== "EEXIST") throw mkdirError;
      }
      stat = lstatSync(current);
    }
    if (stat.isSymbolicLink() || (needsDirectory ? !stat.isDirectory() : !stat.isFile())) {
      throw new Error("Unsafe setup storage path.");
    }
  }
  return absolute;
}

function containedPath(root, ...parts) {
  const path = resolve(root, ...parts);
  const subpath = relative(resolve(root), path);
  if (!subpath || subpath === ".." || subpath.startsWith(`..${sep}`) || resolve(root) === path) {
    throw new Error("Unsafe setup storage path.");
  }
  return path;
}

function campaignSlug(name) {
  let slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60).replace(/-+$/g, "") || "campaign";
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(slug)) slug = `campaign-${slug}`;
  return slug;
}

function campaignImageDirectories(root) {
  const maps = containedPath(root, "data", "maps");
  try {
    assertSafePath(maps, { directory: true });
    return readdirSync(maps, { withFileTypes: true })
      .filter((entry) => entry.name !== "atlas" && entry.isDirectory() && !entry.isSymbolicLink())
      .map((entry) => join(maps, entry.name))
      .filter((directory) => {
        try { assertSafePath(directory, { directory: true }); return true; } catch { return false; }
      });
  } catch { return []; }
}

function safeAssetDirectory(directory, assetId) {
  if (!ASSET_ID_PATTERN.test(assetId)) return false;
  try {
    assertSafePath(directory, { directory: true });
    assertSafePath(join(directory, `${assetId}.json`));
    const metadata = getOfflineBasemapMetadata(directory, assetId);
    if (!metadata) return false;
    assertSafePath(join(directory, `${assetId}.${metadata.format === "static-image" ? "image" : "pmtiles"}`));
    return true;
  } catch { return false; }
}

function readValidatedImage(directory, assetId, bounds) {
  if (!safeAssetDirectory(directory, assetId)) throw new Error("The static image asset is missing or unsafe.");
  const metadata = getOfflineBasemapMetadata(directory, assetId);
  const file = join(directory, `${assetId}.image`);
  const stat = lstatSync(file);
  if (stat.size > MAX_BASEMAP_BYTES || stat.size !== metadata.byteLength) throw new Error("The static image asset byte length does not match its metadata.");
  const data = readFileSync(file);
  const image = inspectStaticImage(data, metadata.contentType);
  if (data.length !== metadata.byteLength || image.dimensions.width !== metadata.width || image.dimensions.height !== metadata.height
    || (bounds?.type === "image-km" && (metadata.width !== bounds.widthPixels || metadata.height !== bounds.heightPixels))) {
    throw new Error("The image asset dimensions must match its metadata and declared image-coordinate map dimensions.");
  }
  return { data, metadata };
}

function saveSetupPackage(root, ownerAccountId, input, validateOfflineBasemap, findOfflineBasemapDirectory) {
  let image = null;
  try {
    assertCampaignSetupPackage(input);
    if (typeof input.campaign.name !== "string" || !input.campaign.name.trim() || input.campaign.name.trim().length > 80) {
      throw new Error("Campaign name must be nonempty and no longer than 80 characters.");
    }
    const reference = input.map.offlineBasemap;
    if (reference && reference.format !== "maptiler-style") {
      validateOfflineBasemap(ownerAccountId, reference, input.map.bounds);
      if (reference.format === "static-image") {
        image = readValidatedImage(findOfflineBasemapDirectory(reference.assetId, ownerAccountId), reference.assetId, input.map.bounds);
      }
    }
    // Exercise the same authoritative schema/data validator as runtime import,
    // in a disposable database: saving authoring data must not create live state.
    const validationDatabase = openRuntimeDatabase();
    try {
      importSetupPackage(validationDatabase, JSON.stringify(input), {
        validateOfflineBasemap: (_owner, reference, bounds) => validateOfflineBasemap(ownerAccountId, reference, bounds)
      });
    } finally { validationDatabase.close(); }
  } catch (error) {
    if (error.syscall || error.path) throw error;
    throw new SetupHttpError(422, error.message);
  }
  const id = randomUUID();
  const slug = campaignSlug(input.campaign.name.trim());
  const stem = `${slug}-${id}-setup-v2`;
  const packagePath = `gmpack/campsetups/${stem}.json`;
  const output = structuredClone(input);
  const written = [];
  let imagePath = null;
  function createFile(path, data, sync = false) {
    // No overwrites; only record files after successful exclusive creation.
    const descriptor = openSync(path, "wx");
    written.push(path);
    try {
      writeFileSync(descriptor, data);
      if (sync) fsyncSync(descriptor);
    } finally { closeSync(descriptor); }
  }
  try {
    const packages = containedPath(root, "gmpack", "campsetups");
    assertSafePath(packages, { directory: true, create: true });
    if (image) {
      const assetId = randomUUID();
      const images = containedPath(root, "data", "maps", slug);
      assertSafePath(images, { directory: true, create: true });
      imagePath = `data/maps/${slug}/${assetId}.image`;
      createFile(join(images, `${assetId}.image`), image.data);
      createFile(join(images, `${assetId}.json`), JSON.stringify({ ...image.metadata, assetId, ownerAccountId }));
      output.map.offlineBasemap.assetId = assetId;
    }
    createFile(join(packages, `${stem}.owner.json`), JSON.stringify({ id, ownerAccountId }));
    // A complete, flushed temp file becomes the commit marker atomically.
    // Hard linking is exclusive: unlike rename it cannot replace a final file.
    const temporary = join(packages, `${stem}.${randomUUID()}.tmp`);
    const final = join(packages, `${stem}.json`);
    createFile(temporary, JSON.stringify(output, null, 2), true);
    linkSync(temporary, final);
    written.push(final);
    unlinkSync(temporary);
    written.splice(written.indexOf(temporary), 1);
    return { id, packageUrl: `/api/setup-packages/${id}`, packagePath, imagePath };
  } catch (error) {
    const cleanupErrors = [];
    for (const path of written.reverse()) {
      try { assertSafePath(path); unlinkSync(path); } catch (cleanupError) {
        // Do not follow or remove a path that has become unsafe; report every
        // cleanup failure to the handler's logger along with the original error.
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length) throw new AggregateError([error, ...cleanupErrors], "Setup package storage failed and rollback cleanup was incomplete.", { cause: error });
    throw error;
  }
}

function getSetupPackage(root, ownerAccountId, id) {
  if (!ASSET_ID_PATTERN.test(id)) return null;
  const directory = containedPath(root, "gmpack", "campsetups");
  try { assertSafePath(directory, { directory: true }); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  const suffix = `-${id}-setup-v2.owner.json`;
  const matches = readdirSync(directory).filter((name) => /^[a-z0-9-]+$/.test(name.slice(0, -suffix.length)) && name.endsWith(suffix));
  if (matches.length !== 1) return null;
  const ownerFile = join(directory, matches[0]);
  assertSafePath(ownerFile);
  const owner = JSON.parse(readFileSync(ownerFile, "utf8"));
  if (owner.id !== id || owner.ownerAccountId !== ownerAccountId) return null;
  const packageFile = ownerFile.replace(/\.owner\.json$/, ".json");
  try { assertSafePath(packageFile); } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  return JSON.parse(readFileSync(packageFile, "utf8"));
}

function createSetupPackageHandler({ root, validateOfflineBasemap, findOfflineBasemapDirectory, logger = console }) {
  return async (request, response, account, pathname) => {
    function send(status, body) {
      response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
      response.end(JSON.stringify(body));
    }
    try {
      if (request.headers.origin) {
        let origin;
        try { origin = new URL(request.headers.origin); } catch { throw new SetupHttpError(403, "Cross-origin requests are not allowed."); }
        if (origin.protocol !== "http:" || origin.host !== request.headers.host) throw new SetupHttpError(403, "Cross-origin requests are not allowed.");
      }
      if (!account) throw new SetupHttpError(401, "Authentication required.");
      if (account.role !== "gm") throw new SetupHttpError(403, "GM account required.");
      if (pathname === "/api/setup-packages" && request.method === "POST") {
        if (!/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")) throw new SetupHttpError(415, "Content-Type must be application/json.");
        const chunks = [];
        let bytes = 0;
        for await (const chunk of request) {
          bytes += chunk.length;
          if (bytes > MAX_SETUP_BYTES) throw new SetupHttpError(413, "Setup packages must be no larger than 25 MiB.");
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new SetupHttpError(422, "The setup package is not valid JSON."); }
        return send(201, { saved: saveSetupPackage(root, account.id, input, validateOfflineBasemap, findOfflineBasemapDirectory) });
      }
      const match = /^\/api\/setup-packages\/([^/]+)$/.exec(pathname);
      if (match && request.method === "GET") {
        const saved = getSetupPackage(root, account.id, match[1]);
        return saved ? send(200, saved) : send(404, { error: "Setup package not found." });
      }
      return send(405, { error: "Method not allowed." });
    } catch (error) {
      if (error instanceof SetupHttpError) return send(error.status, { error: error.message });
      logger.error("Setup package storage failed.", error);
      return send(500, { error: "The setup package could not be saved or loaded. Check server storage." });
    }
  };
}

module.exports = { createSetupPackageHandler, campaignImageDirectories, safeAssetDirectory };
