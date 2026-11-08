const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");
const test = require("node:test");
const CombatClient = require("../combat-client.js");
const html = readFileSync(join(__dirname, "..", "combat.html"), "utf8");
const script = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)[1];
const catalog = require("../gmpack/npc-archetypes.json");

test("known weapon options derive from NPC equipment without loadout quantities or invented stats", () => {
  const names = CombatClient.knownWeaponNames(catalog.archetypes);
  for (const name of ["AK-74", "M16A1", "M4A1", "M9 pistol", "PM pistol", "Uzi",
    ".38 Special pistol", "SA80", "P-88 pistol", "Knife", "Club", "Bayonet",
    "Hunting rifle", "hunting bow", "Frag grenades"]) {
    assert.ok(names.includes(name), name);
  }
  assert.equal(names.filter(name => name === "AK-74").length, 1);
  assert.ok(names.every(name => !/\bwith\b/.test(name)));
  assert.ok(!names.includes("Steel helmet"));
  assert.deepEqual(CombatClient.knownWeaponNames([
    { equipment: [{ category: "weapon", name: "GM carbine with one reload" }, { category: "armor", name: "Vest" }] }
  ]), ["GM carbine"]);
});

function weaponFixture(id) {
  const doc = {
    createElement(tag) {
      return {
        tag, value: "", children: [], listeners: {},
        append(...children) { this.children.push(...children); },
        insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); },
        addEventListener(type, listener) { this.listeners[type] = listener; },
        setCustomValidity(message) { this.validationMessage = message; }
      };
    }
  };
  const input = { id, value: "Old value", before(...elements) { this.controls = elements; } };
  const selector = CombatClient.createWeaponSelector(input, doc);
  const [select, label, custom] = input.controls;
  return { input, selector, select, label, custom };
}

test("weapon selectors require a choice, keep independent selections, and retain custom text only when needed", () => {
  const attacker = weaponFixture("rangedWeapon");
  const other = weaponFixture("ccWeapon");
  for (const fixture of [attacker, other]) fixture.selector.populate(["AK-74", "Knife"]);
  assert.deepEqual(attacker.select.children.map(option => [option.value, option.textContent]), [
    ["", "Choose weapon…"], ["AK-74", "AK-74"], ["Knife", "Knife"], ["__custom__", "Other/custom"]
  ]);
  assert.equal(attacker.select.required, true);
  assert.equal(attacker.input.value, "");
  assert.equal(attacker.custom.hidden, true);
  assert.equal(attacker.custom.disabled, true);
  attacker.select.value = "AK-74";
  attacker.select.listeners.change();
  assert.equal(attacker.selector.shouldSaveCustom(), false);
  other.select.value = "Knife";
  other.select.listeners.change();
  assert.equal(attacker.input.value, "AK-74");
  assert.equal(other.input.value, "Knife");
  attacker.select.value = "__custom__";
  attacker.select.listeners.change();
  assert.equal(attacker.selector.shouldSaveCustom(), true);
  assert.equal(attacker.custom.hidden, false);
  assert.equal(attacker.label.hidden, false);
  assert.equal(attacker.custom.required, true);
  assert.match(attacker.custom.validationMessage, /Enter/);
  attacker.custom.value = "  Campaign weapon  ";
  attacker.custom.listeners.input();
  assert.equal(attacker.input.value, "Campaign weapon");
  assert.equal(attacker.custom.validationMessage, "");
  attacker.select.value = "Knife";
  attacker.select.listeners.change();
  assert.equal(attacker.custom.hidden, true);
  assert.equal(attacker.input.value, "Knife");
  assert.equal(other.input.value, "Knife");
  attacker.select.value = "__custom__";
  attacker.select.listeners.change();
  assert.equal(attacker.input.value, "Campaign weapon");
});

test("saved campaign weapons are shown in matching menus and restore their stored fields", () => {
  const savedWeapon = { name: "GM carbine", kind: "ranged", details: { baseDamage: 5, threshold: 3 } };
  const restored = [];
  const fixture = weaponFixture("rangedWeapon");
  fixture.selector = CombatClient.createWeaponSelector(fixture.input, {
    createElement(tag) {
      return {
        tag, value: "", children: [], listeners: {},
        append(...children) { this.children.push(...children); },
        insertBefore(child, before) { this.children.splice(this.children.indexOf(before), 0, child); },
        addEventListener(type, listener) { this.listeners[type] = listener; },
        setCustomValidity(message) { this.validationMessage = message; }
      };
    }
  }, weapon => restored.push(weapon));
  const [select] = fixture.input.controls;
  fixture.selector.populate(["AK-74"], [savedWeapon, { ...savedWeapon, name: "GM grenade", kind: "grenade" }], "ranged");
  assert.deepEqual(select.children.map(option => option.value), ["", "AK-74", "GM carbine", "__custom__"]);
  select.value = "GM carbine";
  select.listeners.change();
  assert.equal(fixture.selector.shouldSaveCustom(), false);
  assert.deepEqual(restored, [savedWeapon]);
});

test("each calculator instance loads the existing campaign catalog and handles unavailable data", async () => {
  const requests = [];
  const context = {
    module: { exports: {} },
    fetch: async url => {
      requests.push(url);
      return { ok: true, json: async () => catalog };
    }
  };
  runInNewContext(readFileSync(join(__dirname, "..", "combat-client.js"), "utf8"), context);
  const Client = context.module.exports;
  const first = new Client("first campaign");
  const second = new Client("second");
  assert.ok((await first.loadKnownWeaponNames()).includes("AK-74"));
  await second.loadKnownWeaponNames();
  assert.deepEqual(requests, ["/api/campaigns/first%20campaign/npc-archetypes", "/api/campaigns/second/npc-archetypes"]);
  context.fetch = async () => ({ ok: false });
  await assert.rejects(first.loadKnownWeaponNames(), /Other\/custom/);
  context.fetch = async () => ({ ok: true, json: async () => ({}) });
  await assert.rejects(first.loadKnownWeaponNames(), /Other\/custom/);
  context.fetch = async () => { throw new Error("Network unavailable"); };
  await assert.rejects(first.loadKnownWeaponNames(), /Other\/custom/);
});

test("selected names feed existing resolver payloads without replacing GM stats or modifiers", async () => {
  const fixture = weaponFixture("rangedWeapon");
  fixture.selector.populate(["AK-74"]);
  fixture.select.value = "AK-74";
  fixture.select.listeners.change();
  const client = new CombatClient("owned");
  client._post = async (_url, payload) => payload;
  const input = {
    weaponName: fixture.input.value, weaponBaseDamage: "9", weaponThreshold: "7",
    range: "long", agilityRoll: "6", rangedCombatRoll: "5",
    shooterStrengthBonus: "8", targetArmorLevel: "2", modifierDeltas: [-1, 2], ammoAvailable: "4"
  };
  const known = await client.resolveRangedAttack(input);
  assert.equal(known.weaponName, "AK-74");
  assert.equal(known.weaponBaseDamage, 9);
  assert.deepEqual(known.modifierDeltas, [-1, 2]);
  fixture.select.value = "__custom__";
  fixture.select.listeners.change();
  fixture.custom.value = "GM weapon";
  fixture.custom.listeners.input();
  const custom = await client.resolveRangedAttack({
    ...input, weaponName: fixture.input.value, saveCustomWeapon: fixture.selector.shouldSaveCustom()
  });
  assert.deepEqual(custom, { ...known, weaponName: "GM weapon", saveCustomWeapon: true });
  assert.equal(known.saveCustomWeapon, false);
  for (const id of ["rangedWeapon", "ccWeapon", "grenName", "hwName"]) {
    assert.ok(script.includes(`'${id}'`));
    assert.ok(script.includes(`document.getElementById('${id}').value`));
  }
  assert.match(script, /querySelectorAll\('input, select'\)/);
});

test("campaign weapon catalog requests are isolated to the selected runtime campaign", async () => {
  const requests = [];
  const context = {
    module: { exports: {} },
    fetch: async url => {
      requests.push(url);
      return { ok: true, json: async () => ({ weapons: [] }) };
    }
  };
  runInNewContext(readFileSync(join(__dirname, "..", "combat-client.js"), "utf8"), context);
  const Client = context.module.exports;
  assert.deepEqual(await new Client("campaign/one").loadCampaignWeapons(), []);
  assert.deepEqual(requests, ["/api/campaigns/campaign%2Fone/combat-weapons"]);
});

test("combat close-combat client sends the API's ccRoll field", async () => {
  const client = new CombatClient("owned-campaign");
  client._post = async (url, payload) => ({ url, payload });
  const { url, payload } = await client.resolveCloseCombat({
    weaponName: "Training weapon", weaponBaseDamage: "2", weaponThreshold: "4",
    strengthRoll: "6", closeCombatRoll: "5", targetArmorLevel: "0"
  });
  assert.equal(url, "/api/campaigns/owned-campaign/combat/close-combat");
  assert.equal(payload.ccRoll, 5);
  assert.equal(payload.strengthRoll, 6);
  assert.equal(payload.closeCombatRoll, undefined);
});

test("dice choices retain the existing finite ranges without converting free numeric fields", () => {
  assert.equal([...html.matchAll(/<input type="number"[^>]*max="12"/g)].length, 10);
  assert.match(script, /input\[type="number"\]\[max="12"\], #hwScatter/);
  assert.match(script, /radio\.name = input\.id \+ 'Choice'/);
  assert.match(script, /radio\.required = !optional/);
  assert.match(script, /Not rolled/);
  assert.match(script, /input\.value = radio\.value/);
  for (const id of ["rangedBaseDamage", "rangedAmmo", "vehPenetration", "hwArmor"]) {
    assert.match(html, new RegExp(`type="number" id="${id}"`));
  }
});

test("resolver requires explicit validated clicks and never falls back to a demo campaign", () => {
  assert.doesNotMatch(script, /'demo'|alert\(/);
  assert.match(script, /button\.type = 'button'/);
  assert.match(script, /if \(!input\.reportValidity\(\)\) return/);
  assert.match(script, /if \(button\.disabled\) return/);
  assert.match(script, /finally \{ button\.disabled = false; \}/);
  assert.match(script, /window\.parent\.postMessage/);
  assert.match(script, /box\.setAttribute\('aria-live', 'polite'\)/);
});

test("combat feedback renders returned strings as text and reports unsaved output", () => {
  const rows = [];
  const elem = { replaceChildren() { rows.length = 0; }, append(row) { rows.push(row); }, style: {}, focus() { this.focused = true; } };
  const context = {
    document: {
      querySelectorAll: () => [],
      addEventListener() {},
      getElementById: () => elem,
      createElement: () => ({})
    }
  };
  runInNewContext(script, context);
  context.displayResult({ weapon: { name: "<img src=x onerror=alert(1)>" }, damage: { total: 0 }, hit: { isHit: false } }, "rangedResult");
  assert.equal(rows[0].textContent, "MISS");
  assert.equal(rows[1].textContent, "Weapon: <img src=x onerror=alert(1)>");
  assert.equal(rows[2].textContent, "Damage: 0");
  assert.match(rows.at(-1).textContent, /not saved or published/);
  assert.equal(elem.focused, true);
});

test("delayed resolver errors stay with the originating combat view", () => {
  const result = { style: {}, focus() {} };
  let requestedId;
  const context = {
    document: {
      querySelectorAll: () => [], addEventListener() {},
      getElementById: (id) => { requestedId = id; return result; },
      querySelector: () => { throw new Error("Must not redirect errors to a different active view"); }
    }
  };
  runInNewContext(script, context);
  context.showError("Invalid combat input", "closeResult");
  assert.equal(requestedId, "closeResult");
  assert.equal(result.textContent, "Not resolved: Invalid combat input");
});
