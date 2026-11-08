const assert = require("node:assert/strict");
const test = require("node:test");
const { bindVerticalTooltip } = require("../map-tooltip-client.js");

function createMap(width, height, point) {
  return {
    getSize: () => ({ x: width, y: height }),
    latLngToContainerPoint: () => point
  };
}

function createLayer() {
  return {
    handlers: {},
    bindTooltip(content, options) {
      this.content = content;
      this.options = options;
      return this;
    },
    on(event, handler) {
      this.handlers[event] = handler;
      return this;
    }
  };
}

function openTooltip(layer, width, height) {
  const tooltip = {
    options: {},
    getLatLng: () => ({ lat: 10, lng: 20 }),
    getElement: () => ({ getBoundingClientRect: () => ({ width, height }) }),
    update() {
      this.updated = true;
    }
  };
  layer.handlers.tooltipopen({ tooltip });
  return tooltip;
}

test("runtime map tooltips stay above or below, flip around controls, and remain within map edges", () => {
  const content = "A GM map label";
  const topLayer = createLayer();
  bindVerticalTooltip(topLayer, createMap(400, 300, { x: 200, y: 30 }), content);
  assert.equal(topLayer.content, content);
  assert.equal(topLayer.options.direction, "top");
  const below = openTooltip(topLayer, 120, 40);
  assert.equal(below.options.direction, "bottom");
  assert.deepEqual(below.options.offset, [0, 8]);
  assert.equal(below.updated, true);

  const bottomLayer = createLayer();
  bindVerticalTooltip(bottomLayer, createMap(400, 300, { x: 200, y: 280 }), content);
  const above = openTooltip(bottomLayer, 120, 40);
  assert.equal(above.options.direction, "top");
  assert.deepEqual(above.options.offset, [0, -8]);

  const leftLayer = createLayer();
  bindVerticalTooltip(leftLayer, createMap(400, 300, { x: 30, y: 150 }), content);
  const leftTooltip = openTooltip(leftLayer, 120, 40);
  assert.equal(leftTooltip.options.direction, "top");
  assert.deepEqual(leftTooltip.options.offset, [38, -8]);
});
