const { createPlayerSeed, createAssignedUser, getRuntimeCampaign, importSetupPackage, listCampaignPlayerSeeds } = require("./runtime-store.cjs");

const SAMPLE_SETUP_ID = "fieldbook-sample-long-road-setup-v1";
const SAMPLE_PLAYER_USERNAME = "sample-player";

function sampleSetupPackage() {
  return {
    packageType: "fieldbook.campaign-setup",
    schemaVersion: 2,
    campaign: {
      id: SAMPLE_SETUP_ID,
      name: "The Long Road",
      setting: "Dalarna, Sweden",
      premise: "A small column travels north through an uncertain region.",
      mapName: "Dalarna / Route 26",
      era: "11 May 2000"
    },
    map: {
      id: "sample-long-road-map-v1",
      name: "Dalarna / Route 26",
      bounds: { south: 60.25, west: 12.85, north: 61.35, east: 14.9 },
      center: { lat: 60.8, lng: 13.9 },
      zoom: 8,
      fieldPapersAtlas: { id: "sample-atlas", title: "Long Road development fixture" },
      attribution: "Development fixture / no basemap data bundled",
      offlineAnnotations: [],
      grid: {
        cellKm: 10,
        coordinateSystem: "axial-q-r",
        origin: { lat: 61.35, lng: 12.85 },
        terrainCells: []
      },
      locations: [
        { id: "sample-location-salen", name: "Sälen coast road", kind: "Departure", description: "Column departure point.", gridRef: "0,0", coordinates: { system: "fieldbook.axial-q-r", q: 0, r: 0, cellKm: 10 }, mapPosition: { lat: 60.79, lng: 13.15 }, visibility: "gm-only", isStartingLocation: true },
        { id: "sample-location-vansbro", name: "Vansbro", kind: "Settlement", description: "Current column position.", gridRef: "1,-1", coordinates: { system: "fieldbook.axial-q-r", q: 1, r: -1, cellKm: 10 }, mapPosition: { lat: 60.51, lng: 14.22 }, visibility: "gm-only", isStartingLocation: false },
        { id: "sample-location-mora", name: "Mora", kind: "Settlement", description: "Next planned waypoint.", gridRef: "2,-2", coordinates: { system: "fieldbook.axial-q-r", q: 2, r: -2, cellKm: 10 }, mapPosition: { lat: 61.01, lng: 14.54 }, visibility: "gm-only", isStartingLocation: false },
        { id: "sample-location-orsa", name: "Orsa", kind: "Settlement", description: "Northbound route waypoint.", gridRef: "3,-3", coordinates: { system: "fieldbook.axial-q-r", q: 3, r: -3, cellKm: 10 }, mapPosition: { lat: 61.12, lng: 14.62 }, visibility: "gm-only", isStartingLocation: false }
      ]
    },
    factions: [],
    settlements: [],
    scenarioNotes: []
  };
}

function seedRuntimeDashboardRows(database, campaignId, timestamp) {
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare(`INSERT OR IGNORE INTO runtime_dashboard_state
      (campaign_id, game_date, day_number, distance_km, rations_days, fuel_units, weather, weather_note, active_stop_index, updated_at)
      VALUES (?, '2000-05-11', 14, 86, 6, 3, 'Cold rain', ?, 1, ?)`)
      .run(campaignId, "Low cloud and steady rain. The gravel roads are softening; visibility is short in the tree line.", timestamp);

    const insertStop = database.prepare(`INSERT OR IGNORE INTO route_stops
      (campaign_id, ordinal, location_id, detail, km_from_previous) VALUES (?, ?, ?, ?, ?)`);
    [
      ["sample-location-salen", "Departure point", 0],
      ["sample-location-vansbro", "Current position", 86],
      ["sample-location-mora", "Next waypoint", 48],
      ["sample-location-orsa", "Northbound", 28]
    ].forEach(([locationId, detail, distance], ordinal) => insertStop.run(campaignId, ordinal, locationId, detail, distance));

    const insertPerson = database.prepare(`INSERT OR IGNORE INTO personnel
      (campaign_id, id, name, role, condition, readiness, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    [
      ["person-anja-lind", "Anja Lind", "Medic", "Stable", "Ready"],
      ["person-erik-dahl", "Erik Dahl", "Driver", "Bruised", "Worn"],
      ["person-lena-fors", "Lena Fors", "Scout", "Stable", "Ready"],
      ["person-tomas-varga", "Tomas Varga", "Mechanic", "Exhausted", "Watch"]
    ].forEach(([id, name, role, condition, readiness], sortOrder) => insertPerson.run(campaignId, id, name, role, condition, readiness, sortOrder));

    const insertJournal = database.prepare(`INSERT OR IGNORE INTO journal_entries
      (campaign_id, id, title, body, entry_date, kind, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    [
      ["journal-ridge-light", "A light on the ridge", "A single light moved above the treeline after dusk. No sound carried down to the road. Keep the column off the skyline tomorrow.", "2000-05-11", "Observation", "2000-05-11T08:40:00.000Z"],
      ["journal-fuel-tally", "Fuel tally", "The truck is running rough. Tomas wants to check the filter before the next long stretch.", "2000-05-10", "Logistics", "2000-05-10T18:20:00.000Z"],
      ["journal-vansbro-crossing", "Vansbro crossing", "The southern bridge held under the truck. The north approach is still unconfirmed.", "2000-05-09", "Route", "2000-05-09T15:00:00.000Z"]
    ].forEach(([id, title, body, date, kind, createdAt]) => insertJournal.run(campaignId, id, title, body, date, kind, createdAt));

    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function seedSampleRuntime(database, gmAccountId, options = {}) {
  const timestamp = new Date((options.now || (() => Date.now()))()).toISOString();
  const gm = database.prepare("SELECT global_role, disabled FROM accounts WHERE id = ?").get(gmAccountId);
  if (!gm || gm.global_role !== "gm" || gm.disabled) throw new Error("An active GM account is required to seed development data.");

  let campaign = database.prepare(`SELECT runtime_id FROM campaigns WHERE setup_campaign_id = ?`).get(SAMPLE_SETUP_ID);
  let createdCampaign = false;
  if (campaign) {
    const owned = database.prepare(`SELECT 1 AS present FROM campaign_memberships
      WHERE campaign_id = ? AND account_id = ? AND role = 'gm'`).get(campaign.runtime_id, gmAccountId);
    if (!owned) throw new Error("The sample runtime campaign already exists under a different GM account.");
  } else {
    const result = importSetupPackage(database, JSON.stringify(sampleSetupPackage()), {
      ownerAccountId: gmAccountId,
      now: () => timestamp
    });
    campaign = { runtime_id: result.runtimeCampaignId };
    createdCampaign = true;
  }

  const username = options.playerUsername || SAMPLE_PLAYER_USERNAME;
  let user = database.prepare(`SELECT id, global_role, created_by_account_id, disabled
    FROM accounts WHERE login_identifier = ?`).get(username);
  if (!user) {
    user = createAssignedUser(database, gmAccountId, username, { now: () => new Date(timestamp).getTime() });
  } else if (user.global_role !== "player" || user.created_by_account_id !== gmAccountId) {
    throw new Error(`The sample username '${username}' is not a player user created by this GM.`);
  }

  const existingSeed = listCampaignPlayerSeeds(database, gmAccountId, campaign.runtime_id)
    .find((seed) => seed.username.toLowerCase() === username.toLowerCase());
  let seed = existingSeed || null;
  if (!seed) {
    seed = createPlayerSeed(database, gmAccountId, campaign.runtime_id, {
      username,
      displayLabel: "Lena Fors",
      fields: [
        { key: "characterName", label: "Character name", value: "Lena Fors", required: true },
        { key: "nationality", label: "Nationality", value: "", required: true },
        { key: "branch", label: "Branch", value: "Swedish Army", required: false },
        { key: "militaryRank", label: "Military rank", value: "", required: false },
        { key: "appearance", label: "Appearance", value: "", required: false },
        { key: "moralCode", label: "Moral code", value: "", required: false },
        { key: "bigDream", label: "Big dream", value: "", required: false },
        { key: "buddy", label: "Buddy", value: "", required: false },
        { key: "howMetGroup", label: "How you met the group", value: "", required: false }
      ]
    }, { now: () => new Date(timestamp).getTime() });
    seed = { ...seed, fields: listCampaignPlayerSeeds(database, gmAccountId, campaign.runtime_id).find((row) => row.username.toLowerCase() === username.toLowerCase()).fields };
  }

  seedRuntimeDashboardRows(database, campaign.runtime_id, timestamp);
  return {
    campaignId: campaign.runtime_id,
    campaignName: "The Long Road",
    setupCampaignId: SAMPLE_SETUP_ID,
    createdCampaign,
    username: username.toLowerCase(),
    characterId: seed.characterId,
    seedStatus: seed.status
  };
}

module.exports = { SAMPLE_SETUP_ID, SAMPLE_PLAYER_USERNAME, sampleSetupPackage, seedSampleRuntime };