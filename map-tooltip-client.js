(function (root) {
  "use strict";

  const tooltipGap = 8;
  const topControlsClearance = 56;
  const bottomControlsClearance = 36;

  function bindVerticalTooltip(layer, map, content) {
    layer.bindTooltip(content, {
      className: "map-feature-tooltip",
      direction: "top",
      offset: [0, -tooltipGap]
    });
    layer.on("tooltipopen", ({ tooltip }) => {
      const size = map.getSize();
      const point = map.latLngToContainerPoint(tooltip.getLatLng());
      const element = tooltip.getElement();
      const rectangle = element?.getBoundingClientRect();
      const width = rectangle?.width || 0;
      const height = rectangle?.height || 0;
      const topSpace = point.y - topControlsClearance;
      const bottomSpace = size.y - point.y - bottomControlsClearance;
      const fitsAbove = topSpace >= height + tooltipGap;
      const fitsBelow = bottomSpace >= height + tooltipGap;
      const direction = fitsAbove ? "top"
        : fitsBelow ? "bottom"
          : topSpace >= bottomSpace ? "top" : "bottom";
      const left = point.x - width / 2;
      const horizontalOffset = left < tooltipGap
        ? tooltipGap - left
        : left + width > size.x - tooltipGap
          ? size.x - tooltipGap - (left + width)
          : 0;

      tooltip.options.direction = direction;
      tooltip.options.offset = [horizontalOffset, direction === "top" ? -tooltipGap : tooltipGap];
      tooltip.update();
    });
    return layer;
  }

  const api = { bindVerticalTooltip };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.FieldbookMapTooltips = api;
})(typeof globalThis === "object" ? globalThis : this);
