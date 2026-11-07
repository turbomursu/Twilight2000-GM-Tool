"use strict";

(function exposeMapTilerReference(root, factory) {
  const api = factory(root.URL);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.FieldbookMapTilerReference = api;
})(globalThis, (URLConstructor) => {
  const MAP_ID = "01a1b6c9-9a4c-7ab4-bf09-6d75353e5420";
  const EMBED_ORIGIN = "https://api.maptiler.com";

  function buildStyleUrl(apiKey, styleId = MAP_ID) {
    if (typeof apiKey !== "string" || !apiKey.trim()) {
      throw new Error("Enter a MapTiler API key to load the online map.");
    }
    if (styleId !== MAP_ID) throw new Error("The requested MapTiler style is not supported.");
    const url = new URLConstructor(`/maps/${encodeURIComponent(styleId)}/style.json`, EMBED_ORIGIN);
    url.searchParams.set("key", apiKey.trim());
    return url.href;
  }

  return Object.freeze({ mapId: MAP_ID, initialCenter: { lat: 61.81331, lng: 27.97982 }, initialZoom: 8.7, buildStyleUrl });
});
