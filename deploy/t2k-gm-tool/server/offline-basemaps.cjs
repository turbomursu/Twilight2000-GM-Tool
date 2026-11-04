const { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_BASEMAP_BYTES = 50 * 1024 * 1024;
const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getArchiveFormat(data) {
  const tileType = data[99];
  if (tileType === 1) return "vector-pmtiles";
  if ([2, 3, 4, 5].includes(tileType)) return "raster-pmtiles";
  throw new Error("Choose a PMTiles v3 archive containing MVT vector tiles or PNG, JPEG, WebP, or AVIF raster tiles.");
}

async function uploadOfflineBasemap(request, directory, ownerAccountId) {
  const contentType = request.headers["content-type"] || "";
  if (!/^application\/(?:vnd\.pmtiles|octet-stream)(?:\s*;|$)/i.test(contentType)) {
    throw new Error("Upload a PMTiles archive as application/vnd.pmtiles or application/octet-stream.");
  }
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_BASEMAP_BYTES) throw new Error("Offline basemaps must be no larger than 50 MiB.");
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  if (data.length < 127 || data.subarray(0, 7).toString("ascii") !== "PMTiles" || data[7] !== 3) {
    throw new Error("Choose a valid PMTiles v3 archive.");
  }
  const format = getArchiveFormat(data);
  mkdirSync(directory, { recursive: true });
  const assetId = randomUUID();
  writeFileSync(join(directory, `${assetId}.pmtiles`), data, { flag: "wx" });
  writeFileSync(join(directory, `${assetId}.json`), JSON.stringify({ assetId, ownerAccountId, byteLength: data.length, format }), { flag: "wx" });
  return { assetId, byteLength: data.length, format };
}

function getOfflineBasemapMetadata(directory, assetId) {
  if (!ASSET_ID_PATTERN.test(assetId)) return null;
  try {
    const metadata = JSON.parse(readFileSync(join(directory, `${assetId}.json`), "utf8"));
    return metadata?.assetId === assetId && typeof metadata.ownerAccountId === "string" ? metadata : null;
  } catch {
    return null;
  }
}

function sendOfflineBasemap(request, response, directory, assetId) {
  if (!ASSET_ID_PATTERN.test(assetId)) return false;
  const filePath = join(directory, `${assetId}.pmtiles`);
  let file;
  try { file = statSync(filePath); } catch { return false; }
  if (!file.isFile()) return false;

  const range = request.headers.range;
  let start = 0;
  let end = file.size - 1;
  let status = 200;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2]) || file.size === 0) {
      response.writeHead(416, { "Content-Range": `bytes */${file.size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
        response.writeHead(416, { "Content-Range": `bytes */${file.size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
        response.end();
        return true;
      }
      start = Math.max(0, file.size - suffixLength);
    } else {
      start = Number(match[1]);
      end = match[2] ? Number(match[2]) : file.size - 1;
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= file.size || end < start) {
      response.writeHead(416, { "Content-Range": `bytes */${file.size}`, "Accept-Ranges": "bytes", "Cache-Control": "no-store" });
      response.end();
      return true;
    }
    end = Math.min(end, file.size - 1);
    status = 206;
  }

  const headers = {
    "Content-Type": "application/vnd.pmtiles",
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600, immutable",
    "X-Content-Type-Options": "nosniff"
  };
  if (status === 206) headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
  response.writeHead(status, headers);
  if (request.method === "HEAD") {
    response.end();
    return true;
  }
  createReadStream(filePath, { start, end }).pipe(response);
  return true;
}

module.exports = { MAX_BASEMAP_BYTES, ASSET_ID_PATTERN, getArchiveFormat, uploadOfflineBasemap, getOfflineBasemapMetadata, sendOfflineBasemap };
