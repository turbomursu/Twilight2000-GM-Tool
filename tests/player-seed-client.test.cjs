const assert = require("node:assert/strict");
const test = require("node:test");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { runInNewContext } = require("node:vm");

class ElementStub {
  constructor(tag = "div") {
    this.tag = tag;
    this.children = [];
    this.events = new Map();
    this.dataset = {};
    this.value = "";
    this.hidden = false;
    this.disabled = false;
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  addEventListener(event, handler) { this.events.set(event, handler); }
  getAttribute() { return null; }
  querySelectorAll(tag) {
    return this.children.flatMap((child) => [ ...(child.tag === tag ? [child] : []), ...child.querySelectorAll(tag) ]);
  }
  async emit(event) { await this.events.get(event)?.({ preventDefault() {} }); }
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

async function harness() {
  const elements = new Map();
  const node = (selector) => {
    if (!elements.has(selector)) elements.set(selector, new ElementStub());
    return elements.get(selector);
  };
  const requests = [];
  let gate = null;
  const character = { status: "playable", displayLabel: "Assigned player", campaignName: "Campaign A", setting: "Test", campaignId: "campaign-a",
    fields: [{ key: "appearance", label: "Appearance", value: "Accepted value", required: false, playerEditable: true }], pendingChangeRequest: null };
  const response = (body) => ({ ok: true, status: 200, json: async () => structuredClone(body) });
  const fetch = async (path, options = {}) => {
    requests.push({ path, ...options });
    if (path === "/api/player/campaigns") return response({ campaigns: [{ id: "campaign-a", name: "Campaign A", setting: "Test" }] });
    if (options.method === "PUT") {
      const fields = JSON.parse(options.body).fields;
      character.pendingChangeRequest = { id: "request-a", submittedAt: "2026-11-01T00:00:00Z", fields: fields.map((field) => ({ ...field, label: "Appearance", oldValue: "Accepted value" })) };
      return response({ changeRequest: character.pendingChangeRequest });
    }
    const snapshot = structuredClone(character);
    if (gate) await gate;
    return response({ character: snapshot });
  };
  runInNewContext(readFileSync(join(__dirname, "..", "player-seed-client.js"), "utf8"), {
    document: { querySelector: node, createElement: (tag) => new ElementStub(tag) }, fetch,
    location: { pathname: "/player-interface.html", replace() {} }, console
  });
  await flush();
  return { node, requests, character, holdReads() {
    let release; gate = new Promise((resolve) => { release = resolve; });
    return () => { const complete = release; gate = null; complete(); };
  } };
}

test("finalized character edits reach the proposal API and remain locked while pending", async () => {
  const state = await harness();
  state.node("#player-campaign-select").value = "campaign-a";
  await state.node("#player-campaign-select").emit("change"); await flush();
  state.node("#player-seed-fields").querySelectorAll("textarea")[0].value = "Proposed value";
  await state.node("#player-seed-form").emit("submit"); await flush();
  assert.equal(state.requests.filter((request) => request.method === "PUT").length, 1);
  assert.equal(state.character.fields[0].value, "Accepted value");
  assert.equal(state.character.pendingChangeRequest.fields[0].value, "Proposed value");
  assert.equal(state.node("#save-player-seed").disabled, true);
  await state.node("#player-seed-form").emit("submit");
  assert.equal(state.requests.filter((request) => request.method === "PUT").length, 1);
});

test("a delayed character response cannot repopulate a deselected campaign", async () => {
  const state = await harness();
  state.node("#player-campaign-select").value = "campaign-a";
  await state.node("#player-campaign-select").emit("change"); await flush();
  const release = state.holdReads();
  await state.node("#refresh-player-character").emit("click"); await flush();
  state.node("#player-campaign-select").value = "";
  await state.node("#player-campaign-select").emit("change");
  release(); await flush();
  assert.equal(state.node("#player-seed-form").hidden, true);
  assert.equal(state.node("#save-player-seed").disabled, true);
  assert.equal(state.node("#player-change-request-summary").hidden, true);
  assert.equal(state.node("#player-record-name").textContent, "Select a campaign");
});