(() => {
  let mapTilerKey = "";
  document.querySelectorAll("[data-maptiler-key]").forEach((input) => {
    input.addEventListener("input", () => {
      mapTilerKey = input.value.trim();
      document.querySelectorAll("[data-maptiler-key]").forEach((other) => { if (other !== input) other.value = mapTilerKey; });
      globalThis.FieldbookBasemap?.setMapTilerKey(mapTilerKey);
      document.dispatchEvent(new CustomEvent("fieldbook:maptiler-key-changed"));
    });
  });

  async function request(path, options = {}) {
    const response = await fetch(path, { credentials: "same-origin", cache: "no-store", ...options });
    const result = await response.json();
    if (response.status === 401) location.replace(`/login.html?next=${encodeURIComponent(location.pathname)}`);
    if (!response.ok) { const error = new Error(result.error || "Map service unavailable."); error.status = response.status; throw error; }
    return result;
  }

  function mapView(container, output, plus, minus) {
    let map = null;
    let baseZoom = 0;
    let current = null;
    let basemapController = null;
    const coordinates = globalThis.FieldbookMapCoordinates;
    const center = (position) => coordinates.toLatLng(position, current.bounds);
    const minimumZoom = () => coordinates.isImage(current.bounds) ? baseZoom - 2 : Math.max(0, baseZoom - 2);
    function clear() { basemapController?.destroy(); basemapController = null; if (map) map.remove(); map = null; current = null; container.replaceChildren(); }
    function updateZoom() {
      if (output) output.textContent = `${Math.round(100 * 2 ** (map.getZoom() - baseZoom))}%`;
      if (plus) plus.disabled = map.getZoom() >= baseZoom + 1;
      if (minus) minus.disabled = map.getZoom() <= minimumZoom();
    }
    function label(text) {
      const element = document.createElement("span"); element.textContent = text;
      element.style.cssText = "display:block;max-width:240px;white-space:normal;overflow-wrap:anywhere";
      return element;
    }
    async function render(snapshot) {
      if (!globalThis.L) throw new Error("Map library unavailable. Reload when connected.");
      if (coordinates.isImage(snapshot.bounds) && snapshot.offlineBasemap?.format !== "static-image") {
        throw new Error("Image kilometre extents require a static map image; online OSM and PMTiles require geographic bounds.");
      }
      clear(); current = snapshot;
      const image = coordinates.isImage(snapshot.bounds);
      map = L.map(container, { crs: image ? L.CRS.Simple : L.CRS.EPSG3857, minZoom: image ? -10 : 0, zoomControl: false, zoomSnap: .25, zoomDelta: .25 });
      const bounds = coordinates.leafletBounds(snapshot.bounds);
      baseZoom = Math.min(18, Math.max(image ? -10 : 0, map.getBoundsZoom(bounds)));
      map.setMinZoom(minimumZoom()); map.setMaxZoom(baseZoom + 1);
      map.setView(snapshot.playerPosition ? center(snapshot.playerPosition) : L.latLngBounds(bounds).getCenter(), baseZoom);
      if (snapshot.offlineBasemap?.format === "static-image") {
        const currentMap = map;
        const layer = globalThis.FieldbookBasemap.imageLayer(map, snapshot.offlineBasemap, snapshot.bounds, (message) => {
          const status = document.querySelector(form ? "#gm-map-publication-status" : "#player-map-status");
          if (status) status.textContent = message;
        });
        await new Promise((resolve, reject) => {
          layer.once("load", resolve);
          layer.once("remove", resolve);
          layer.once("error", () => reject(new Error("Static map image is unavailable or cannot be decoded.")));
        });
        if (map !== currentMap) return false;
      } else if (snapshot.offlineBasemap?.format === "maptiler-style") {
        if (!globalThis.FieldbookBasemap || !mapTilerKey) throw new Error("Enter a MapTiler API key in this browser to display the online campaign map.");
        basemapController = globalThis.FieldbookBasemap.controller(map, (message) => {
          const status = document.querySelector(form ? "#gm-map-publication-status" : "#player-map-status");
          if (status) status.textContent = message;
        });
        basemapController.setMapTilerKey(mapTilerKey);
        basemapController.set(snapshot.offlineBasemap, snapshot.bounds);
      } else if (snapshot.offlineBasemap) {
        if (!globalThis.pmtiles?.PMTiles || !globalThis.pmtiles?.leafletRasterLayer) throw new Error("Local PMTiles renderer is unavailable.");
        const archiveUrl = snapshot.offlineBasemap.assetUrl || `/offline-basemaps/${encodeURIComponent(snapshot.offlineBasemap.assetId)}.pmtiles`;
        if (snapshot.offlineBasemap.format === "vector-pmtiles") {
          if (!globalThis.FieldbookVectorAtlas) throw new Error("Vector atlas renderer is unavailable.");
          const currentMap = map;
          const basemapLayer = await globalThis.FieldbookVectorAtlas.createLayer(map, { ...snapshot.offlineBasemap, assetUrl: archiveUrl }, (message) => {
            const status = document.querySelector("#player-map-status");
            if (status) status.textContent = message;
          });
          if (map !== currentMap) { currentMap.removeLayer(basemapLayer); return false; }
        } else {
          const archive = new globalThis.pmtiles.PMTiles(archiveUrl);
          const basemapLayer = globalThis.pmtiles.leafletRasterLayer(archive, {}).addTo(map);
          basemapLayer.on("tileerror", () => {
            const status = document.querySelector("#player-map-status");
            if (status) status.textContent = "Offline PMTiles archive is unavailable on this server.";
          });
        }
        globalThis.FieldbookVectorAtlas?.addAttribution(map, snapshot.offlineBasemap);
      } else {
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19,
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
      }
      snapshot.locations.forEach((location) => L.circleMarker(center(location.position), { radius: 6, color: "#315a48", fillColor: "#edf3eb", fillOpacity: 1 })
        .bindTooltip(label(location.name)).addTo(map));
      snapshot.markings.forEach((marking) => L.circleMarker(center(marking.position), { radius: 7, color: "#a16822", fillColor: "#f0d6a0", fillOpacity: 1 })
        .bindTooltip(label(marking.label)).addTo(map));
      (snapshot.geometries || []).forEach((entry) => {
        const coordinates = entry.geometry.type === "LineString"
          ? entry.geometry.coordinates.map(([lng, lat]) => [lat, lng])
          : entry.geometry.coordinates.map((ring) => ring.map(([lng, lat]) => [lat, lng]));
        const options = { color: entry.geometry.type === "Polygon" ? "#a16822" : "#315a48", weight: 3,
          fillColor: "#d8ae68", fillOpacity: entry.geometry.type === "Polygon" ? .16 : 0 };
        const layer = entry.geometry.type === "Polygon" ? L.polygon(coordinates, options) : L.polyline(coordinates, options);
        layer.bindTooltip(label(entry.label)).addTo(map);
      });
      if (snapshot.route.length > 1) L.polyline(snapshot.route.map((location) => center(location.position)), { color: "#a13e35", weight: 3, dashArray: "8 5" }).addTo(map);
      if (snapshot.playerPosition) L.circleMarker(center(snapshot.playerPosition), { radius: 10, color: "#922e29", fillColor: "#db5c45", fillOpacity: .8 })
        .bindTooltip(label("Player position"), { permanent: true }).addTo(map);
      map.on("zoomend", updateZoom); updateZoom();
      requestAnimationFrame(() => map?.invalidateSize());
      return true;
    }
    return { render, clear, zoom: (delta) => { if (map) map.setZoom(map.getZoom() + delta); },
      reset: () => { if (map && current?.playerPosition) map.setView(center(current.playerPosition), baseZoom); } };
  }

  const form = document.querySelector("#gm-map-publication-form");
  if (form) {
    const select = document.querySelector("#runtime-campaign-select");
    const fields = form.querySelector("fieldset");
    const status = document.querySelector("#gm-map-publication-status");
    const reload = document.querySelector("#reload-map-publication");
    const previewButton = document.querySelector("#preview-map-publication");
    const publish = document.querySelector("#publish-map-publication");
    const withdraw = document.querySelector("#withdraw-map-publication");
    const previewPanel = document.querySelector("#gm-map-preview");
    const viewer = mapView(document.querySelector("#gm-map-preview-canvas"));
    const latitude = document.querySelector("#map-player-latitude");
    const longitude = document.querySelector("#map-player-longitude");
    const routeChoice = document.querySelector("#map-route-location");
    const positionChoice = document.querySelector("#map-position-location");
    const geometryType = document.querySelector("#map-geometry-type");
    const geometryLabel = document.querySelector("#map-geometry-label");
    const geometryCoordinates = document.querySelector("#map-geometry-coordinates");
    const geometryEntries = document.querySelector("#map-geometry-entries");
    const addGeometryButton = document.querySelector("#add-map-geometry");
    const backgroundKind = document.querySelector("#gm-map-background-kind");
    const imageFields = document.querySelector("#gm-map-image-fields");
    const imageFile = document.querySelector("#gm-map-image-file");
    const imageAttribution = document.querySelector("#gm-map-image-attribution");
    const imageLicense = document.querySelector("#gm-map-image-license");
    const applyBackground = document.querySelector("#save-gm-map-background");
    let publication = null;
    let draft = null;
    let id = "";
    let generation = 0;
    let busy = false;
    let previewRevision = null;
    let markingCounter = 0;
    const coordinates = globalThis.FieldbookMapCoordinates;
    const imageExtent = () => coordinates.isImage(publication?.catalog.bounds);
    const position = (first, second) => imageExtent() ? { x: second, y: first } : { lat: first, lng: second };
    const firstValue = (point) => imageExtent() ? point?.y : point?.lat;
    const secondValue = (point) => imageExtent() ? point?.x : point?.lng;
    const vertexLabel = () => imageExtent() ? "x,y kilometres per line" : "longitude,latitude per line";

    function controls() {
      fields.disabled = busy || !publication; reload.disabled = busy || !id;
      publish.disabled = !publication || previewRevision !== publication.revision;
      withdraw.disabled = !publication?.published;
      applyBackground.disabled = busy || !publication || backgroundKind.value === "current";
    }
    function backgroundControls() {
      imageFields.hidden = backgroundKind.value !== "static-image";
      const basemap = publication?.catalog.offlineBasemap;
      const bounds = publication?.catalog.bounds;
      document.querySelector("#gm-map-background-current").textContent = publication
        ? `Current: ${basemap ? basemap.format === "static-image" ? `Static map image / ${basemap.attribution}`
          : basemap.format === "maptiler-style" ? "MapTiler online map / attribution is supplied by the style"
            : `Offline PMTiles / ${basemap.attribution}` : "Online OSM map"}. ${imageExtent() ? `Image extent: ${bounds.widthKm} × ${coordinates.heightKm(bounds)} km / origin bottom-left.` : `Bounds: ${bounds.south}, ${bounds.west} to ${bounds.north}, ${bounds.east}.`}`
        : "";
      document.querySelector("#gm-maptiler-key-field").hidden = basemap?.format !== "maptiler-style";
      controls();
    }
    function invalidate() { previewRevision = null; previewPanel.hidden = true; viewer.clear(); controls(); }
    function icon(text, title, action) {
      const button = document.createElement("button"); button.type = "button"; button.className = "button button-icon";
      button.textContent = text; button.title = title; button.setAttribute("aria-label", title); button.addEventListener("click", action); return button;
    }
    function number(input) { return input.value.trim() ? Number(input.value) : null; }
    function readDraft() {
      return { locationIds: [...form.querySelectorAll("[data-map-location]:checked")].map((input) => input.value),
        markings: [...form.querySelectorAll("[data-marking-id]")].map((row) => ({ id: row.dataset.markingId, label: row.querySelector("[data-mark-label]").value,
          position: position(number(row.querySelector("[data-mark-lat]")), number(row.querySelector("[data-mark-lng]"))) })),
        geometries: [...form.querySelectorAll("[data-geometry-id]")].map((row) => {
          const type = row.querySelector("[data-geometry-type]").value;
          const vertices = row.querySelector("[data-geometry-coordinates]").value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
            .map((line) => line.split(",").map((value) => Number(value.trim())));
          const coordinates = type === "Polygon" ? [vertices] : vertices;
          if (type === "Polygon" && vertices.length && (vertices[0][0] !== vertices[vertices.length - 1][0]
            || vertices[0][1] !== vertices[vertices.length - 1][1])) vertices.push([...vertices[0]]);
          return { id: row.dataset.geometryId, label: row.querySelector("[data-geometry-label]").value,
            geometry: { type, coordinates: type === "Polygon" ? [vertices] : vertices } };
        }),
        routeLocationIds: [...draft.routeLocationIds],
        playerPosition: !latitude.value && !longitude.value ? null : position(number(latitude), number(longitude)) };
    }
    function choices() {
      const selected = new Set(readDraft().locationIds);
      [routeChoice, positionChoice].forEach((input) => { input.replaceChildren(new Option("Choose selected location", ""));
        publication.catalog.locations.filter((location) => selected.has(location.id)).forEach((location) => input.add(new Option(location.name, location.id))); });
    }
    function routes() {
      const container = document.querySelector("#map-route-entries"); container.replaceChildren();
      draft.routeLocationIds.forEach((locationId, index) => {
        const row = document.createElement("div"); row.className = "map-route-row";
        const text = document.createElement("span"); text.textContent = `${index + 1}. ${publication.catalog.locations.find((location) => location.id === locationId)?.name || locationId}`;
        function move(offset) {
          const target = index + offset; if (target < 0 || target >= draft.routeLocationIds.length) return;
          [draft.routeLocationIds[index], draft.routeLocationIds[target]] = [draft.routeLocationIds[target], draft.routeLocationIds[index]]; routes(); invalidate();
        }
        const up = icon("\u2191", "Move waypoint up", () => move(-1)); up.disabled = index === 0;
        const down = icon("\u2193", "Move waypoint down", () => move(1)); down.disabled = index === draft.routeLocationIds.length - 1;
        row.append(text, up, down, icon("\u00d7", "Remove waypoint", () => { draft.routeLocationIds.splice(index, 1); routes(); invalidate(); })); container.append(row);
      });
    }
    function markings() {
      const container = document.querySelector("#map-marking-entries"); container.replaceChildren();
      draft.markings.forEach((marking, index) => {
        const row = document.createElement("div"); row.className = "map-marking-row"; row.dataset.markingId = marking.id;
        [["markLabel", "Marking label", marking.label], ["markLat", imageExtent() ? "Marking y / km north" : "Marking latitude", firstValue(marking.position)], ["markLng", imageExtent() ? "Marking x / km east" : "Marking longitude", secondValue(marking.position)]].forEach(([key, label, value]) => {
          const input = document.createElement("input"); input.dataset[key] = ""; input.setAttribute("aria-label", label);
          input.type = key === "markLabel" ? "text" : "number"; input.step = "any"; input.maxLength = 160; input.value = value ?? ""; row.append(input);
        });
        row.append(icon("\u00d7", "Remove marking", () => { draft = readDraft(); draft.markings.splice(index, 1); markings(); invalidate(); })); container.append(row);
      });
    }
    function renderGeometries() {
      geometryEntries.replaceChildren();
      (draft.geometries || []).forEach((geometry, index) => {
        const row = document.createElement("div");
        row.className = "map-geometry-row";
        row.dataset.geometryId = geometry.id;
        const labelInput = document.createElement("input");
        labelInput.dataset.geometryLabel = "";
        labelInput.setAttribute("aria-label", "Geometry label");
        labelInput.maxLength = 160;
        labelInput.value = geometry.label;
        const typeSelect = document.createElement("select");
        typeSelect.dataset.geometryType = "";
        typeSelect.setAttribute("aria-label", "Geometry type");
        ["LineString", "Polygon"].forEach((type) => typeSelect.add(new Option(type === "LineString" ? "Line" : "Area", type)));
        typeSelect.value = geometry.geometry.type;
        const coordinateInput = document.createElement("textarea");
        coordinateInput.dataset.geometryCoordinates = "";
        coordinateInput.setAttribute("aria-label", `Geometry vertices / ${vertexLabel()}`);
        const vertices = geometry.geometry.type === "Polygon" ? geometry.geometry.coordinates[0] : geometry.geometry.coordinates;
        coordinateInput.value = vertices.map(([lng, lat]) => `${lng},${lat}`).join("\n");
        const remove = icon("×", "Remove geometry", () => {
          draft = readDraft();
          draft.geometries.splice(index, 1);
          renderGeometries();
          invalidate();
        });
        row.append(labelInput, typeSelect, coordinateInput, remove);
        geometryEntries.append(row);
      });
    }
    function renderDraft() {
      draft = structuredClone(publication.draft);
      draft.geometries ||= [];
      const locations = document.querySelector("#map-allowed-locations"); locations.replaceChildren();
      publication.catalog.locations.forEach((location) => {
        const label = document.createElement("label"); const input = document.createElement("input"); input.type = "checkbox";
        input.dataset.mapLocation = ""; input.value = location.id; input.checked = draft.locationIds.includes(location.id);
        const text = document.createElement("span"); text.textContent = `${location.name} / ${location.kind}${location.visibility === "gm-only" ? " / GM-only source" : ""}`;
        label.append(input, text); locations.append(label);
        input.addEventListener("change", () => { const selected = new Set(readDraft().locationIds);
          draft.routeLocationIds = draft.routeLocationIds.filter((locationId) => selected.has(locationId)); routes(); choices(); invalidate(); });
      });
      latitude.value = firstValue(draft.playerPosition) ?? ""; longitude.value = secondValue(draft.playerPosition) ?? "";
      document.querySelector('label[for="map-player-latitude"]').textContent = imageExtent() ? "Player position / y (km north)" : "Player position / latitude";
      document.querySelector('label[for="map-player-longitude"]').textContent = imageExtent() ? "Player position / x (km east)" : "Player position / longitude";
      document.querySelector('label[for="map-geometry-coordinates"]').textContent = `Vertices / ${vertexLabel()}`;
      geometryCoordinates.placeholder = imageExtent() ? "0,0\n10,10\n20,10" : "14.0,60.0\n14.2,60.1\n14.4,60.2";
      routes(); markings(); renderGeometries(); choices(); controls();
      backgroundControls();
    }
    async function load(campaignId) {
      const token = ++generation; id = campaignId; publication = null; draft = null; invalidate(); form.reset();
      ["map-allowed-locations", "map-route-entries", "map-marking-entries", "map-geometry-entries"].forEach((key) => document.getElementById(key).replaceChildren());
      status.textContent = id ? "Loading map draft..." : "Select a runtime campaign.";
      backgroundControls();
      if (!id) return;
      try { const result = await request(`/api/campaigns/${encodeURIComponent(id)}/map-publication`);
        if (token !== generation) return; publication = result.map; renderDraft();
        status.textContent = publication.published ? `Published / ${publication.publishedAt}` : "Map not published.";
      } catch (error) { if (token === generation) status.textContent = error.message; }
    }
    async function send(action, extra, campaignId, token) {
      const result = await request(`/api/campaigns/${encodeURIComponent(campaignId)}/map-publication`, { method: "PUT",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, expectedRevision: publication.revision, ...extra }) });
      if (token !== generation) return null;
      if (result.map) { publication = result.map; draft = structuredClone(publication.draft); invalidate();
        document.dispatchEvent(new CustomEvent("fieldbook:map-saved", { detail: publication })); }
      return result;
    }
    async function act(action) {
      if (busy || !publication) return;
      if (action === "withdraw" && !confirm("Withdraw the map from all assigned players?")) return;
      if (action === "publish" && !confirm("Publish selected locations, including any GM-only source locations, markings, route, and player position?")) return;
      const campaignId = id; const token = generation; busy = true; controls();
      try {
        if (action === "draft" || (action === "preview" && JSON.stringify(readDraft()) !== JSON.stringify(publication.draft))) {
          if (!await send("draft", { draft: readDraft() }, campaignId, token)) return;
        }
        if (action === "preview") {
          const result = await send("preview", {}, campaignId, token); if (!result) return;
          previewPanel.hidden = false; if (!await viewer.render(result.preview) || token !== generation) return; previewRevision = result.revision;
          document.querySelector("#gm-map-preview-label").textContent = "Draft preview / unpublished";
        } else if (action !== "draft") {
          const result = await send(action, {}, campaignId, token); if (!result) return;
          if (action === "publish") { previewPanel.hidden = false; if (!await viewer.render(publication.published) || token !== generation) return;
            document.querySelector("#gm-map-preview-label").textContent = `Published / ${publication.publishedAt}`; }
        }
        if (token === generation) status.textContent = ({ draft: "Map draft saved / player map unchanged.", preview: "Saved map preview ready / not published.", publish: "Map published to assigned players.", withdraw: "Map withdrawn / draft retained." })[action];
      } catch (error) { if (token === generation) { status.textContent = `Not saved: ${error.message}`;
        if (error.status === 409) { publication = null; invalidate(); } } }
      finally { busy = false; controls(); }
    }
    backgroundKind.addEventListener("change", backgroundControls);
    applyBackground.addEventListener("click", async () => {
      if (busy || !publication || backgroundKind.value === "current") return;
      const imageMode = backgroundKind.value === "static-image";
      if (imageExtent() && !imageMode && backgroundKind.value !== "current") {
        status.textContent = "Image kilometre extents require a static map image. Online basemaps require geographic bounds.";
        return;
      }
      const file = imageFile.files[0];
      const attribution = imageAttribution.value.trim();
      const licenseUrl = globalThis.FieldbookVectorAtlas.validLicenseUrl(imageLicense.value.trim());
      if (imageMode && (!file || !attribution || (imageLicense.value.trim() && !licenseUrl))) {
        status.textContent = "Choose a PNG, JPEG, or WebP image and enter its attribution. Any license URL must use HTTPS.";
        return;
      }
      if (imageMode && file.size > 50 * 1024 * 1024) { status.textContent = "Static images must be no larger than 50 MiB."; return; }
      const campaignId = id; const token = generation; const pendingDraft = readDraft();
      busy = true; controls(); status.textContent = "Applying campaign background...";
      try {
        let basemap = backgroundKind.value === "maptiler-style"
          ? { format: "maptiler-style", styleId: "01a1b6c9-9a4c-7ab4-bf09-6d75353e5420" } : null;
        if (imageMode) {
          const result = await request("/api/offline-basemaps", { method: "POST",
            headers: { "Content-Type": file.type || "application/octet-stream" }, body: file });
          if (token !== generation) return;
          if (result.asset.format !== "static-image") throw new Error("Choose a PNG, JPEG, or WebP image, not a PMTiles archive.");
          basemap = { format: "static-image", assetId: result.asset.assetId, attribution, ...(licenseUrl ? { licenseUrl } : {}) };
        }
        if (!await send("basemap", { basemap }, campaignId, token)) return;
        draft = pendingDraft;
        backgroundKind.value = "current"; imageFile.value = ""; backgroundControls();
        status.textContent = "Campaign background saved / player map unchanged. Preview and publish to share it.";
      } catch (error) {
        if (token === generation) {
          status.textContent = `Background not saved: ${error.message}`;
          if (error.status === 409) { publication = null; invalidate(); }
        }
      } finally { busy = false; controls(); }
    });
    form.addEventListener("submit", (event) => { event.preventDefault(); act("draft"); }); form.addEventListener("input", invalidate);
    previewButton.addEventListener("click", () => act("preview")); publish.addEventListener("click", () => act("publish")); withdraw.addEventListener("click", () => act("withdraw"));
    reload.addEventListener("click", () => { if (!publication || JSON.stringify(readDraft()) === JSON.stringify(publication.draft)
      || confirm("Discard unsaved map edits and reload?")) load(select.value); });
    document.querySelector("#add-map-waypoint").addEventListener("click", () => { if (routeChoice.value) { draft.routeLocationIds.push(routeChoice.value); routes(); invalidate(); } });
    document.querySelector("#add-map-marking").addEventListener("click", () => {
      draft = readDraft(); const bounds = publication.catalog.bounds;
      draft.markings.push({ id: `mark-${Date.now()}-${markingCounter++}`, label: "Marking",
        position: draft.playerPosition || coordinates.center(bounds) }); markings(); invalidate();
    });
    addGeometryButton.addEventListener("click", () => {
      const vertices = geometryCoordinates.value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
        .map((line) => line.split(",").map((value) => Number(value.trim())));
      if (!geometryLabel.value.trim() || vertices.some((coordinate) => coordinate.length !== 2 || !coordinate.every(Number.isFinite))) {
        status.textContent = `Add a geometry label and valid ${vertexLabel()}.`;
        return;
      }
      if (geometryType.value === "Polygon" && vertices.length && (vertices[0][0] !== vertices[vertices.length - 1][0]
        || vertices[0][1] !== vertices[vertices.length - 1][1])) vertices.push([...vertices[0]]);
      draft = readDraft();
      draft.geometries.push({ id: `geometry-${crypto.randomUUID()}`, label: geometryLabel.value.trim(),
        geometry: { type: geometryType.value, coordinates: geometryType.value === "Polygon" ? [vertices] : vertices } });
      renderGeometries();
      geometryLabel.value = "";
      geometryCoordinates.value = "";
      invalidate();
    });
    positionChoice.addEventListener("change", () => { const location = publication.catalog.locations.find((item) => item.id === positionChoice.value);
      if (location) { latitude.value = firstValue(location.position); longitude.value = secondValue(location.position); invalidate(); } });
    select.addEventListener("change", () => load(select.value)); document.addEventListener("fieldbook:campaign-selected", (event) => load(event.detail.campaignId)); load(select.value);
  }

  const mapTab = document.querySelector("#player-map-tab");
  if (mapTab) {
    const select = document.querySelector("#player-campaign-select"); const panel = document.querySelector('[data-panel="map"]');
    const content = document.querySelector("#player-map-content"); const status = document.querySelector("#player-map-status");
    const mapTilerKeyField = document.querySelector("#player-maptiler-key-field");
    const plus = document.querySelector("#player-map-plus"); const minus = document.querySelector("#player-map-minus");
    const viewer = mapView(document.querySelector("#published-player-map"), document.querySelector("#player-map-percent"), plus, minus);
    let generation = 0; let previous = "";
    function clear() { viewer.clear(); previous = ""; content.hidden = true; document.querySelector("#player-map-name").textContent = "Player map";
      ["published-player-position", "player-map-published-at"].forEach((key) => { document.getElementById(key).textContent = ""; }); }
    async function load() {
      const token = ++generation; const id = select.value;
      if (!id) { clear(); mapTilerKeyField.hidden = true; status.textContent = "Select an assigned campaign."; return; }
      try { const result = await request(`/api/player/campaigns/${encodeURIComponent(id)}/map`);
        if (token !== generation || select.value !== id) return;
        if (!result.map) { clear(); mapTilerKeyField.hidden = true; status.textContent = "No map published."; return; }
        mapTilerKeyField.hidden = result.map.offlineBasemap?.format !== "maptiler-style";
        const serialized = JSON.stringify(result); content.hidden = false;
        if (serialized !== previous) { if (!await viewer.render(result.map) || token !== generation) return; previous = serialized; }
        document.querySelector("#player-map-name").textContent = result.map.name;
        const position = result.map.playerPosition;
        document.querySelector("#published-player-position").textContent = !position ? "Position / not published"
          : globalThis.FieldbookMapCoordinates.isImage(result.map.bounds)
            ? `Position / x ${position.x.toFixed(2)}, y ${position.y.toFixed(2)} km (bottom-left origin)`
            : `Position / ${position.lat.toFixed(4)}, ${position.lng.toFixed(4)}`;
        document.querySelector("#player-map-published-at").textContent = `Published / ${result.publishedAt}`; status.textContent = "";
      } catch (error) { if (token === generation) { clear(); status.textContent = `Map unavailable: ${error.message}`; } }
    }
    mapTab.addEventListener("click", () => { document.dispatchEvent(new CustomEvent("fieldbook:player-view", { detail: { view: "map" } })); clear(); status.textContent = "Refreshing map..."; load(); });
    plus.addEventListener("click", () => viewer.zoom(.25)); minus.addEventListener("click", () => viewer.zoom(-.25)); document.querySelector("#player-map-reset").addEventListener("click", viewer.reset);
    select.addEventListener("change", () => { generation += 1; clear(); if (!panel.hidden) load(); });
    document.querySelector("#refresh-player-character").addEventListener("click", () => { if (!panel.hidden) { clear(); load(); } });
    document.addEventListener("fieldbook:maptiler-key-changed", () => { if (!panel.hidden) { clear(); load(); } });
    document.addEventListener("visibilitychange", () => { if (!document.hidden && !panel.hidden) { clear(); load(); } });
    setInterval(() => { if (!document.hidden && !panel.hidden) load(); }, 15000);
  }
})();