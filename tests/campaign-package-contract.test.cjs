const assert = require("node:assert/strict");
const test = require("node:test");
const { assertCampaignSetupPackage } = require("../campaign-package-contract.js");

function validPackage() {
  return {
    packageType: "fieldbook.campaign-setup",
    schemaVersion: 2,
    campaign: { id: "campaign-1" },
    map: {
      bounds: { south: 0, west: 0, north: 10, east: 10 },
      grid: { coordinateSystem: "axial-q-r", cellKm: 10, terrainCells: [] },
      locations: [{
        id: "location-1",
        name: "Start",
        kind: "Settlement",
        mapPosition: { lat: 5, lng: 5 },
        isStartingLocation: true
      }],
      offlineAnnotations: []
    },
    factions: [{ id: "faction-1" }],
    settlements: [{ id: "settlement-1", name: "Start", locationId: "location-1", prominentFactionIds: ["faction-1"] }],
    scenarioNotes: [{ id: "note-1", visibility: "gm-only" }]
  };
}

test("accepts a valid schema-v2 setup package", () => {
  assert.equal(assertCampaignSetupPackage(validPackage()), true);
});

test("rejects unsupported package versions", () => {
  const input = validPackage();
  input.schemaVersion = 1;
  assert.throws(() => assertCampaignSetupPackage(input), /schema version 2/);
});

test("requires exactly one starting location", () => {
  const input = validPackage();
  input.map.locations[0].isStartingLocation = false;
  assert.throws(() => assertCampaignSetupPackage(input), /exactly one starting location/);
});

test("rejects duplicate IDs across package records", () => {
  const input = validPackage();
  input.settlements[0].id = input.map.locations[0].id;
  assert.throws(() => assertCampaignSetupPackage(input), /duplicate ID/);
});

test("rejects settlement links to locations outside the package", () => {
  const input = validPackage();
  input.settlements[0].locationId = "missing-location";
  assert.throws(() => assertCampaignSetupPackage(input), /source location/);
});

test("rejects prominence references to factions outside the package", () => {
  const input = validPackage();
  input.settlements[0].prominentFactionIds = ["missing-faction"];
  assert.throws(() => assertCampaignSetupPackage(input), /prominence order/);
});

test("requires imported scenario notes to remain GM-only", () => {
  const input = validPackage();
  input.scenarioNotes[0].visibility = "players";
  assert.throws(() => assertCampaignSetupPackage(input), /GM-only/);
});