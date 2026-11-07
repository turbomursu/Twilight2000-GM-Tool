(function (root) {
  "use strict";

  function vectorLayers(metadata) {
    let layers = metadata?.vector_layers;
    if (typeof layers === "string") {
      try { layers = JSON.parse(layers); } catch { layers = null; }
    }
    return Array.isArray(layers) ? layers.filter((layer) => layer && typeof layer.id === "string"
      && layer.id.trim() && layer.id.length <= 128).slice(0, 256) : [];
  }

  function createStyle(archiveUrl, metadata) {
    if (typeof archiveUrl !== "string" || !archiveUrl.startsWith("/") || archiveUrl.startsWith("//")) {
      throw new Error("Vector PMTiles must be served from this Fieldbook server.");
    }
    const layers = vectorLayers(metadata);
    if (!layers.length) throw new Error("The vector PMTiles archive has no usable vector-layer metadata.");
    const styleLayers = [{ id: "atlas-background", type: "background", paint: { "background-color": "#dce5d2" } }];
    layers.forEach((sourceLayer, index) => {
      styleLayers.push(
        { id: `atlas-fill-${index}`, type: "fill", source: "atlas", "source-layer": sourceLayer.id,
          filter: ["==", ["geometry-type"], "Polygon"], paint: { "fill-color": "#a7b99b", "fill-opacity": 0.62 } },
        { id: `atlas-line-${index}`, type: "line", source: "atlas", "source-layer": sourceLayer.id,
          filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": "#586c58", "line-width": 1.2 } },
        { id: `atlas-point-${index}`, type: "circle", source: "atlas", "source-layer": sourceLayer.id,
          filter: ["==", ["geometry-type"], "Point"], paint: { "circle-color": "#647c62", "circle-radius": 2.5 } }
      );
    });
    return { version: 8, sources: { atlas: { type: "vector", url: `pmtiles://${archiveUrl}` } }, layers: styleLayers };
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  }

  function validLicenseUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
    } catch { return null; }
  }

  function addAttribution(map, basemap) {
    map.attributionControl.addAttribution(escapeHtml(basemap.attribution));
    const licenseUrl = validLicenseUrl(basemap.licenseUrl);
    if (licenseUrl) map.attributionControl.addAttribution(`<a href="${escapeHtml(licenseUrl)}" target="_blank" rel="noopener noreferrer">License terms</a>`);
  }

  let rendererPromise = null;
  async function getRenderer() {
    if (!rendererPromise) {
      rendererPromise = import("/vendor/maplibre-gl.mjs").then((maplibregl) => {
        root.maplibregl = maplibregl;
        if (root.pmtiles?.Protocol) {
          const protocol = new root.pmtiles.Protocol();
          maplibregl.addProtocol("pmtiles", protocol.tile);
        }
        return new Promise((resolve, reject) => {
          if (root.MaplibreGLLeaflet?.maplibreGL) return resolve(root.MaplibreGLLeaflet.maplibreGL);
          const script = document.createElement("script");
          script.src = "/vendor/leaflet-maplibre-gl.js";
          script.onload = () => root.MaplibreGLLeaflet?.maplibreGL
            ? resolve(root.MaplibreGLLeaflet.maplibreGL) : reject(new Error("MapLibre Leaflet adapter is unavailable."));
          script.onerror = () => reject(new Error("MapLibre Leaflet adapter could not be loaded."));
          document.head.append(script);
        });
      }).catch((error) => { rendererPromise = null; throw error; });
    }
    return rendererPromise;
  }

  async function createLayer(map, basemap, statusHandler) {
    if (basemap.format !== "vector-pmtiles") throw new Error("This is not a vector PMTiles atlas.");
    if (!root.pmtiles?.PMTiles || !root.pmtiles?.Protocol) throw new Error("The local PMTiles vector protocol is unavailable.");
    const archiveUrl = basemap.assetUrl || `/offline-basemaps/${encodeURIComponent(basemap.assetId)}.pmtiles`;
    const archive = new root.pmtiles.PMTiles(archiveUrl);
    const metadata = await archive.getMetadata();
    const maplibreGL = await getRenderer();
    const layer = maplibreGL({ style: createStyle(archiveUrl, metadata), attributionControl: false }).addTo(map);
    if (statusHandler) layer.getMaplibreMap().on("error", (event) => {
      if (event?.error) statusHandler(`Vector atlas tile error: ${event.error.message || "tiles unavailable"}`);
    });
    return layer;
  }

  async function createMapTilerLayer(map, styleUrl, statusHandler, readyHandler) {
    const maplibreGL = await getRenderer();
    const layer = maplibreGL({ style: styleUrl }).addTo(map);
    const maplibreMap = layer.getMaplibreMap();
    maplibreMap.once("load", () => readyHandler?.());
    if (statusHandler) maplibreMap.on("error", (event) => {
      if (event?.error) statusHandler(`MapTiler map error: ${event.error.message || "map unavailable"}`);
    });
    return layer;
  }

  const api = Object.freeze({ createStyle, addAttribution, createLayer, createMapTilerLayer, validLicenseUrl });
  root.FieldbookVectorAtlas = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
