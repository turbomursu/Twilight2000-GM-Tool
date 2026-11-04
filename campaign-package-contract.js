(function (root) {
  "use strict";

  function isRecord(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }

  function assertCampaignSetupPackage(input) {
    const fail = (message) => { throw new Error(message); };
    if (!isRecord(input) || input.packageType !== "fieldbook.campaign-setup" || input.schemaVersion !== 2) {
      fail("Choose a Fieldbook campaign setup package using schema version 2.");
    }
    if (!isRecord(input.campaign) || !isRecord(input.map) || !isRecord(input.map.grid)) {
      fail("The setup package is missing its campaign or map data.");
    }

    const { south, west, north, east } = input.map.bounds || {};
    if (![south, west, north, east].every(Number.isFinite)
      || south < -90 || north > 90 || west < -180 || east > 180 || south >= north || west >= east) {
      fail("The setup package needs valid campaign-area bounds.");
    }
    const basemap = input.map.offlineBasemap;
    if (basemap !== undefined && basemap !== null) {
      const hasLegacyFields = isRecord(basemap) && Object.keys(basemap).length === 3 && !Object.hasOwn(basemap, "licenseUrl");
      const hasLicenseFields = isRecord(basemap) && Object.keys(basemap).length === 4 && Object.hasOwn(basemap, "licenseUrl");
      const licenseUrl = hasLicenseFields ? basemap.licenseUrl : null;
      let validLicenseUrl = licenseUrl === null;
      if (typeof licenseUrl === "string") {
        try {
          const parsed = new URL(licenseUrl);
          validLicenseUrl = parsed.protocol === "https:" && !parsed.username && !parsed.password && licenseUrl.length <= 2048;
        } catch { validLicenseUrl = false; }
      }
      if (!isRecord(basemap) || (!hasLegacyFields && !hasLicenseFields)
        || !Object.hasOwn(basemap, "assetId") || !Object.hasOwn(basemap, "attribution") || !Object.hasOwn(basemap, "format")
        || !["raster-pmtiles", "vector-pmtiles"].includes(basemap.format)
        || (basemap.format === "vector-pmtiles" && !hasLicenseFields)
        || (hasLicenseFields && (!validLicenseUrl || typeof licenseUrl !== "string" || !licenseUrl.trim()))
        || typeof basemap.assetId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(basemap.assetId)
        || typeof basemap.attribution !== "string" || !basemap.attribution.trim() || basemap.attribution.length > 300) {
        fail("The offline basemap must reference a supported PMTiles asset, include attribution, and provide an HTTPS license URL for vector tiles.");
      }
    }
    const grid = input.map.grid;
    if (grid.coordinateSystem !== "axial-q-r" || grid.cellKm !== 10 || !Array.isArray(grid.terrainCells) || grid.terrainCells.length > 10000) {
      fail("The setup package contains an unsupported travel grid.");
    }
    const collectionLimits = [
      [input.map.locations, "location", 1, 500],
      [input.settlements, "settlement", 0, 500],
      [input.factions, "faction", 0, 200],
      [input.scenarioNotes, "scenario-note", 0, 500],
      [input.map.offlineAnnotations, "map-annotation", 0, 300]
    ];
    collectionLimits.forEach(([records, label, minimum, maximum]) => {
      if (!Array.isArray(records) || records.length < minimum || records.length > maximum) {
        fail(`The setup package has an invalid ${label} list.`);
      }
    });

    const ids = new Set();
    const addId = (record, label) => {
      if (!isRecord(record) || typeof record.id !== "string" || !record.id.trim()) fail(`The setup package contains an invalid ${label} ID.`);
      if (ids.has(record.id)) fail(`The setup package contains a duplicate ID: ${record.id}.`);
      ids.add(record.id);
    };
    addId(input.campaign, "campaign");

    const locations = new Map();
    let startingLocations = 0;
    input.map.locations.forEach((location) => {
      addId(location, "location");
      if (typeof location.name !== "string" || !isRecord(location.mapPosition)
        || ![location.mapPosition.lat, location.mapPosition.lng].every(Number.isFinite)
        || location.mapPosition.lat < south || location.mapPosition.lat > north
        || location.mapPosition.lng < west || location.mapPosition.lng > east
        || typeof location.isStartingLocation !== "boolean") {
        fail("Every setup location needs a name, an in-area map position, and an explicit starting-location value.");
      }
      if (location.isStartingLocation) startingLocations += 1;
      locations.set(location.id, location);
    });
    if (startingLocations !== 1) fail("The setup package must have exactly one starting location.");

    const factions = new Map();
    input.factions.forEach((faction) => {
      addId(faction, "faction");
      factions.set(faction.id, faction);
    });
    const linkedLocations = new Set();
    input.settlements.forEach((settlement) => {
      addId(settlement, "settlement");
      if (settlement.locationId !== null && settlement.locationId !== undefined) {
        const location = locations.get(settlement.locationId);
        if (!location || location.kind !== "Settlement" || linkedLocations.has(location.id)) {
          fail(`Settlement ${settlement.name || settlement.id} has an invalid or duplicate source location.`);
        }
        linkedLocations.add(location.id);
      }
      const prominentFactionIds = settlement.prominentFactionIds ?? [];
      if (!Array.isArray(prominentFactionIds) || prominentFactionIds.some((id) => !factions.has(id))
        || new Set(prominentFactionIds).size !== prominentFactionIds.length) {
        fail(`Settlement ${settlement.name || settlement.id} has an invalid faction prominence order.`);
      }
    });
    input.scenarioNotes.forEach((note) => {
      addId(note, "scenario note");
      if (note.visibility !== "gm-only") fail("Imported scenario notes must be marked GM-only.");
    });
    return true;
  }

  const contract = Object.freeze({ assertCampaignSetupPackage });
  root.FieldbookCampaignPackageContract = contract;
  if (typeof module !== "undefined" && module.exports) module.exports = contract;
})(globalThis);