(function (root) {
  "use strict";

  function isImage(bounds) {
    return bounds?.type === "image-km";
  }

  function normalizeBounds(bounds) {
    if (!bounds || typeof bounds !== "object" || Array.isArray(bounds)) return null;
    if (isImage(bounds)) {
      const { widthPixels, heightPixels, widthKm } = bounds;
      if (Object.keys(bounds).length !== 4 || !Number.isSafeInteger(widthPixels) || !Number.isSafeInteger(heightPixels)
        || widthPixels < 1 || heightPixels < 1 || widthPixels > 20000 || heightPixels > 20000
        || !Number.isFinite(widthKm) || widthKm <= 0 || widthKm > 10000) return null;
      return { type: "image-km", widthPixels, heightPixels, widthKm };
    }
    if (Object.hasOwn(bounds, "type")) return null;
    const { south, west, north, east } = bounds;
    if (![south, west, north, east].every(Number.isFinite) || south < -90 || north > 90
      || west < -180 || east > 180 || south >= north || west >= east) return null;
    return { south, west, north, east };
  }

  function heightKm(bounds) {
    return bounds.widthKm * bounds.heightPixels / bounds.widthPixels;
  }

  function validPoint(position, bounds) {
    if (!position || typeof position !== "object" || Array.isArray(position) || Object.keys(position).length !== 2) return false;
    return isImage(bounds)
      ? Number.isFinite(position.x) && Number.isFinite(position.y)
      : Number.isFinite(position.lat) && position.lat >= -90 && position.lat <= 90
        && Number.isFinite(position.lng) && position.lng >= -180 && position.lng <= 180;
  }

  function contains(position, bounds) {
    if (!normalizeBounds(bounds) || !validPoint(position, bounds)) return false;
    return isImage(bounds)
      ? position.x >= 0 && position.x <= bounds.widthKm && position.y >= 0 && position.y <= heightKm(bounds)
      : position.lat >= bounds.south && position.lat <= bounds.north && position.lng >= bounds.west && position.lng <= bounds.east;
  }

  function toLatLng(position, bounds) {
    return isImage(bounds) ? [position.y, position.x] : [position.lat, position.lng];
  }

  function fromLatLng(position, bounds) {
    return isImage(bounds) ? { x: position.lng, y: position.lat } : { lat: position.lat, lng: position.lng };
  }

  function leafletBounds(bounds) {
    return isImage(bounds) ? [[0, 0], [heightKm(bounds), bounds.widthKm]]
      : [[bounds.south, bounds.west], [bounds.north, bounds.east]];
  }

  function center(bounds) {
    return isImage(bounds) ? { x: bounds.widthKm / 2, y: heightKm(bounds) / 2 }
      : { lat: (bounds.south + bounds.north) / 2, lng: (bounds.west + bounds.east) / 2 };
  }

  const api = Object.freeze({ isImage, normalizeBounds, heightKm, validPoint, contains, toLatLng, fromLatLng, leafletBounds, center });
  root.FieldbookMapCoordinates = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(globalThis);
