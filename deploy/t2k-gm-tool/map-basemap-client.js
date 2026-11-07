(function (root) {
  "use strict";

  const controllers = new Set();
  let sharedMapTilerKey = "";

  function assetUrl(basemap) {
    return basemap.assetUrl || `/offline-basemaps/${encodeURIComponent(basemap.assetId)}.${basemap.format === "static-image" ? "image" : "pmtiles"}`;
  }

  function attribution(basemap) {
    const escape = (text) => String(text).replace(/[&<>"']/g, (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
    const licenseUrl = root.FieldbookVectorAtlas?.validLicenseUrl(basemap.licenseUrl);
    return escape(basemap.attribution) + (licenseUrl
      ? ` / <a href="${escape(licenseUrl)}" target="_blank" rel="noopener noreferrer">License terms</a>` : "");
  }

  function imageLayer(map, basemap, bounds, onError) {
    if (!root.FieldbookMapCoordinates.normalizeBounds(bounds)) {
      throw new Error("Set valid campaign bounds before using a static map image.");
    }
    return root.L.imageOverlay(assetUrl(basemap),
      root.FieldbookMapCoordinates.leafletBounds(bounds),
      { attribution: attribution(basemap), interactive: false })
      .on("error", () => onError("Static map image is unavailable or cannot be decoded. Restore the image and its JSON sidecar on this server."))
      .addTo(map);
  }

  function controller(map, onError) {
    let layer = null;
    let generation = 0;
    let activeBasemap = null;
    let activeBounds = null;
    let mapTilerKey = sharedMapTilerKey;
    function setMapTilerKey(value) {
      mapTilerKey = typeof value === "string" ? value.trim() : "";
      if (activeBasemap?.format === "maptiler-style") set(activeBasemap, activeBounds);
    }
    function clear() {
      generation += 1;
      if (layer) map.removeLayer(layer);
      layer = null;
    }
    function set(basemap, bounds) {
      activeBasemap = basemap || null;
      activeBounds = bounds || null;
      if (root.FieldbookMapCoordinates.isImage(bounds) && basemap?.format !== "static-image") {
        onError("Image kilometre extents require a static map image. Online OSM and PMTiles require geographic bounds.");
        return;
      }
      clear();
      const token = generation;
      const report = (message) => { if (token === generation) onError(message); };
      try {
        if (basemap?.format === "static-image") {
          layer = imageLayer(map, basemap, bounds, report);
        } else if (basemap?.format === "maptiler-style") {
          if (!mapTilerKey || !root.FieldbookMapTilerReference || !root.FieldbookVectorAtlas?.createMapTilerLayer) {
            report("Enter a MapTiler API key in this browser to display the online campaign map.");
            return;
          }
          const styleUrl = root.FieldbookMapTilerReference.buildStyleUrl(mapTilerKey, basemap.styleId);
          root.FieldbookVectorAtlas.createMapTilerLayer(map, styleUrl, report, () => {
            if (token === generation) map.fire("fieldbook:maptiler-ready");
          }).then((next) => {
            if (token !== generation) { map.removeLayer(next); return; }
            layer = next;
          }).catch((error) => report(`MapTiler map unavailable: ${error.message}`));
        } else if (basemap?.format === "vector-pmtiles") {
          if (!root.pmtiles?.PMTiles || !root.FieldbookVectorAtlas) throw new Error("Local vector atlas renderer is unavailable.");
          root.FieldbookVectorAtlas.createLayer(map, { ...basemap, assetUrl: assetUrl(basemap) }, report).then((next) => {
            if (token !== generation) { map.removeLayer(next); return; }
            layer = next;
            const credit = attribution(basemap);
            map.attributionControl.addAttribution(credit);
            layer.on("remove", () => map.attributionControl.removeAttribution(credit));
          }).catch((error) => report(`Vector atlas unavailable: ${error.message}`));
        } else if (basemap) {
          if (!root.pmtiles?.PMTiles || !root.pmtiles?.leafletRasterLayer) throw new Error("Local PMTiles renderer is unavailable.");
          layer = root.pmtiles.leafletRasterLayer(new root.pmtiles.PMTiles(assetUrl(basemap)),
            { attribution: attribution(basemap) }).addTo(map);
          layer.on("tileerror", () => report("Offline PMTiles archive is unavailable on this server."));
        } else {
          layer = root.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
            maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          }).addTo(map);
          layer.on("tileerror", () => report("Online map tiles are unavailable. Choose a local map image or PMTiles archive for offline use."));
        }
      } catch (error) {
        report(error.message);
      }
    }
    const instance = { set, clear, setMapTilerKey, destroy() { clear(); controllers.delete(instance); } };
    controllers.add(instance);
    return instance;
  }

  function setMapTilerKey(value) {
    sharedMapTilerKey = typeof value === "string" ? value.trim() : "";
    controllers.forEach((instance) => instance.setMapTilerKey(sharedMapTilerKey));
  }

  const api = Object.freeze({ assetUrl, imageLayer, controller, setMapTilerKey });
  root.FieldbookBasemap = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
