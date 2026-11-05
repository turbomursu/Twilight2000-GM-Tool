const { createReadStream, mkdirSync, readFileSync, statSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { randomUUID } = require("node:crypto");

const MAX_BASEMAP_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_DIMENSION = 32768;
const MAX_IMAGE_PIXELS = 100_000_000;
const ASSET_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function getArchiveFormat(data) {
  const tileType = data[99];
  if (tileType === 1) return "vector-pmtiles";
  if ([2, 3, 4, 5].includes(tileType)) return "raster-pmtiles";
  throw new Error("Choose a PMTiles v3 archive containing MVT vector tiles or PNG, JPEG, WebP, or AVIF raster tiles.");
}

function validateImageDimensions(width, height) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1
    || width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION || width * height > MAX_IMAGE_PIXELS) {
    throw new Error("The static map image has invalid or excessive dimensions.");
  }
  return { width, height };
}

function inspectPng(data) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (data.length < 45 || !data.subarray(0, 8).equals(signature)) throw new Error("The uploaded file is not a complete PNG image.");
  let offset = 8;
  let dimensions = null;
  let hasImageData = false;
  let foundEnd = false;
  while (offset + 12 <= data.length) {
    const length = data.readUInt32BE(offset);
    if (length > data.length - offset - 12) throw new Error("The uploaded PNG image is truncated.");
    const type = data.toString("ascii", offset + 4, offset + 8);
    if (!dimensions) {
      if (type !== "IHDR" || length !== 13) throw new Error("The uploaded PNG image has an invalid header.");
      dimensions = validateImageDimensions(data.readUInt32BE(offset + 8), data.readUInt32BE(offset + 12));
    }
    if (type === "IDAT" && length > 0) hasImageData = true;
    offset += length + 12;
    if (type === "IEND") {
      if (length !== 0) throw new Error("The uploaded PNG image has an invalid end marker.");
      foundEnd = true;
      break;
    }
  }
  if (!dimensions || !hasImageData || !foundEnd) throw new Error("The uploaded PNG image is truncated.");
  return dimensions;
}

function inspectJpeg(data) {
  if (data.length < 14 || data[0] !== 0xff || data[1] !== 0xd8 || data[data.length - 2] !== 0xff || data[data.length - 1] !== 0xd9) {
    throw new Error("The uploaded file is not a complete JPEG image.");
  }
  const frameMarkers = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  let dimensions = null;
  let hasScanData = false;
  while (offset < data.length - 2) {
    if (data[offset] !== 0xff) throw new Error("The uploaded JPEG image has an invalid marker.");
    while (offset < data.length && data[offset] === 0xff) offset += 1;
    if (offset >= data.length) break;
    const marker = data[offset++];
    if (marker === 0xd9) break;
    if (marker === 0xda) {
      if (offset + 2 > data.length) break;
      const length = data.readUInt16BE(offset);
      if (length < 2 || offset + length >= data.length - 2) throw new Error("The uploaded JPEG image is truncated.");
      hasScanData = true;
      break;
    }
    if ([0x01, 0xd8, 0xd0, 0xd1, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7].includes(marker)) continue;
    if (offset + 2 > data.length) break;
    const length = data.readUInt16BE(offset);
    if (length < 2 || offset + length > data.length - 2) throw new Error("The uploaded JPEG image is truncated.");
    if (frameMarkers.has(marker)) {
      if (length < 8) throw new Error("The uploaded JPEG image has an invalid frame.");
      dimensions = validateImageDimensions(data.readUInt16BE(offset + 5), data.readUInt16BE(offset + 3));
    }
    offset += length;
  }
  if (!dimensions || !hasScanData) throw new Error("The uploaded JPEG image is truncated or has no image dimensions.");
  return dimensions;
}

function inspectWebp(data) {
  if (data.length < 26 || data.toString("ascii", 0, 4) !== "RIFF" || data.toString("ascii", 8, 12) !== "WEBP"
    || data.readUInt32LE(4) + 8 !== data.length) throw new Error("The uploaded file is not a complete WebP image.");
  let offset = 12;
  let dimensions = null;
  let hasImageData = false;
  while (offset + 8 <= data.length) {
    const type = data.toString("ascii", offset, offset + 4);
    const length = data.readUInt32LE(offset + 4);
    const payload = offset + 8;
    if (length > data.length - payload) throw new Error("The uploaded WebP image is truncated.");
    if (type === "VP8X" && length >= 10) {
      dimensions = validateImageDimensions(1 + data.readUIntLE(payload + 4, 3), 1 + data.readUIntLE(payload + 7, 3));
    } else if (type === "VP8 " && length >= 10 && data[payload + 3] === 0x9d && data[payload + 4] === 0x01 && data[payload + 5] === 0x2a) {
      dimensions = validateImageDimensions(data.readUInt16LE(payload + 6) & 0x3fff, data.readUInt16LE(payload + 8) & 0x3fff);
      hasImageData = true;
    } else if (type === "VP8L" && length >= 5 && data[payload] === 0x2f) {
      const bits = data.readUInt32LE(payload + 1);
      dimensions = validateImageDimensions((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1);
      hasImageData = true;
    }
    offset = payload + length + (length & 1);
  }
  if (offset !== data.length || !dimensions || !hasImageData) throw new Error("The uploaded WebP image is truncated or has no image dimensions.");
  return dimensions;
}

function inspectStaticImage(data, contentType) {
  let dimensions;
  if (contentType === "image/png") dimensions = inspectPng(data);
  else if (contentType === "image/jpeg") dimensions = inspectJpeg(data);
  else if (contentType === "image/webp") dimensions = inspectWebp(data);
  else throw new Error("Content-Type must be image/png, image/jpeg, or image/webp.");
  return { contentType, dimensions };
}

async function uploadOfflineBasemap(request, directory, ownerAccountId) {
  const contentType = request.headers["content-type"] || "";
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  const isImage = IMAGE_TYPES.has(mediaType);
  const isPmtiles = /^application\/(?:vnd\.pmtiles|octet-stream)$/i.test(mediaType);
  if (!isImage && !isPmtiles) {
    throw new Error("Content-Type must be application/vnd.pmtiles, application/octet-stream, image/png, image/jpeg, or image/webp.");
  }
  const chunks = [];
  let byteLength = 0;
  for await (const chunk of request) {
    byteLength += chunk.length;
    if (byteLength > MAX_BASEMAP_BYTES) throw new Error("Offline basemaps must be no larger than 50 MiB.");
    chunks.push(chunk);
  }
  const data = Buffer.concat(chunks);
  const image = isImage ? inspectStaticImage(data, mediaType) : null;
  if (!isImage && (data.length < 127 || data.subarray(0, 7).toString("ascii") !== "PMTiles" || data[7] !== 3)) {
    throw new Error("Choose a valid PMTiles v3 archive.");
  }
  const format = isImage ? "static-image" : getArchiveFormat(data);
  mkdirSync(directory, { recursive: true });
  const assetId = randomUUID();
  const metadata = { assetId, ownerAccountId, byteLength: data.length, format,
    ...(isImage ? { contentType: image.contentType, width: image.dimensions.width, height: image.dimensions.height } : {}) };
  writeFileSync(join(directory, isImage ? `${assetId}.image` : `${assetId}.pmtiles`), data, { flag: "wx" });
  writeFileSync(join(directory, `${assetId}.json`), JSON.stringify(metadata), { flag: "wx" });
  return { assetId, byteLength: data.length, format, ...(isImage ? { contentType: image.contentType, width: image.dimensions.width, height: image.dimensions.height } : {}) };
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

function sendOfflineBasemap(request, response, directory, assetId, options = {}) {
  if (!ASSET_ID_PATTERN.test(assetId)) return false;
  const metadata = getOfflineBasemapMetadata(directory, assetId);
  const isImage = metadata?.format === "static-image";
  const filePath = join(directory, isImage ? `${assetId}.image` : `${assetId}.pmtiles`);
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
    "Content-Type": isImage && IMAGE_TYPES.has(metadata.contentType) ? metadata.contentType : "application/vnd.pmtiles",
    "Content-Length": String(end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": options.noStore ? "no-store" : "private, max-age=3600, immutable",
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

module.exports = { MAX_BASEMAP_BYTES, MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, ASSET_ID_PATTERN, getArchiveFormat, inspectStaticImage, uploadOfflineBasemap, getOfflineBasemapMetadata, sendOfflineBasemap };
