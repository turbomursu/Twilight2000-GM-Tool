/**
 * Map visualization client for Phase 3.4
 * Manages rendering of routes, locations, and party position on the campaign map
 * Separates GM-controlled rendering from player-visible layer publication
 */

const mapVisualization = (() => {
  let mapInstance = null; // Leaflet map object
  let routePolyline = null;
  let stopMarkers = [];
  let locationMarkers = [];
  let positionMarker = null;
  let visualizationState = {
    campaignId: null,
    routePublished: false,
    locationsPublished: false,
    positionPublished: false,
    factionsPublished: false
  };

  /**
   * Initialize or reinitialize the map visualization layer
   * Called after map instance is created
   */
  function initializeVisualization(leafletMapInstance) {
    if (!leafletMapInstance) throw new Error("Leaflet map instance required.");
    mapInstance = leafletMapInstance;
    clearAllMarkers();
  }

  /**
   * Render route as polyline with numbered stop markers
   * @param {Array} routeStops - Array of {ordinal, locationId, detail, ...location data}
   * @param {Object} locations - Map of locationId -> {lat, lng, name, ...}
   * @param {boolean} isPublished - Whether route is published to players
   */
  function renderRoute(routeStops, locations, isPublished = false) {
    if (!mapInstance) return;
    clearRouteVisualization();
    
    if (!Array.isArray(routeStops) || routeStops.length === 0) return;

    // Build polyline coordinates
    const polylineCoords = [];
    const markersByOrdinal = new Map();
    
    for (const stop of routeStops) {
      const location = locations[stop.locationId];
      if (!location) continue;
      
      const lat = typeof location.lat === 'number' ? location.lat : null;
      const lng = typeof location.lng === 'number' ? location.lng : null;
      if (lat === null || lng === null) continue;
      
      polylineCoords.push([lat, lng]);
      markersByOrdinal.set(stop.ordinal, {stop, location, lat, lng});
    }

    // Render polyline (visible to GM always, published only if isPublished)
    if (polylineCoords.length >= 2) {
      const polylineOptions = {
        color: isPublished ? '#00ff00' : '#ffaa00',
        weight: 2,
        opacity: isPublished ? 0.8 : 0.5,
        className: isPublished ? 'route-published' : 'route-gm-only'
      };
      routePolyline = L.polyline(polylineCoords, polylineOptions).addTo(mapInstance);
    }

    // Add numbered stop markers
    markersByOrdinal.forEach((data) => {
      const stopIcon = L.divIcon({
        html: `<div class="stop-marker" style="
          background: ${isPublished ? '#00ff00' : '#ffaa00'};
          color: black;
          font-weight: bold;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 2px solid ${isPublished ? '#00cc00' : '#cc8800'};
          font-size: 11px;
        ">${data.stop.ordinal + 1}</div>`,
        className: '',
        iconSize: [24, 24],
        iconAnchor: [12, 12],
        popupAnchor: [0, -12]
      });

      const marker = L.marker([data.lat, data.lng], {icon: stopIcon})
        .bindPopup(`<strong>${data.location.name || 'Location'}</strong><br/>Stop ${data.stop.ordinal + 1}<br/>${data.stop.detail || ''}`)
        .addTo(mapInstance);
      
      stopMarkers.push(marker);
    });
  }

  /**
   * Render location markers on map
   * @param {Array} locations - Array of location objects
   * @param {boolean} isPublished - Whether locations are published to players
   */
  function renderLocations(locations, isPublished = false) {
    if (!mapInstance) return;
    clearLocationMarkers();
    
    if (!Array.isArray(locations)) return;

    for (const location of locations) {
      const lat = typeof location.lat === 'number' ? location.lat : null;
      const lng = typeof location.lng === 'number' ? location.lng : null;
      if (lat === null || lng === null) continue;

      const locationIcon = L.circleMarker([lat, lng], {
        radius: 6,
        color: isPublished ? '#0066ff' : '#666666',
        weight: 2,
        opacity: isPublished ? 0.8 : 0.5,
        fillColor: isPublished ? '#0066ff' : '#999999',
        fillOpacity: isPublished ? 0.6 : 0.3,
        className: isPublished ? 'location-published' : 'location-gm-only'
      });

      const locationName = location.name || 'Location';
      const locationKind = location.kind || 'Unnamed';
      locationIcon.bindPopup(`<strong>${locationName}</strong><br/>${locationKind}`);
      locationIcon.addTo(mapInstance);
      locationMarkers.push(locationIcon);
    }
  }

  /**
   * Render party position marker
   * @param {Object} position - {lat, lng, published}
   * @param {boolean} isDraggable - True for GM, false for players
   */
  function renderPartyPosition(position, isDraggable = false) {
    if (!mapInstance || typeof position.lat !== 'number' || typeof position.lng !== 'number') return;
    
    clearPositionMarker();

    const positionIcon = L.icon({
      iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSI4IiBmaWxsPSIjZmY2NjAwIiBzdHJva2U9IiNmZmZmZmYiIHN0cm9rZS13aWR0aD0iMiIvPjwvc3ZnPg==',
      iconSize: [24, 24],
      iconAnchor: [12, 12],
      popupAnchor: [0, -12]
    });

    positionMarker = L.marker([position.lat, position.lng], {
      icon: positionIcon,
      draggable: isDraggable,
      title: 'Party Position'
    });

    positionMarker.bindPopup('Party Position');
    positionMarker.addTo(mapInstance);

    if (isDraggable) {
      positionMarker.on('dragend', (evt) => {
        const newPos = evt.target.getLatLng();
        dispatchEvent('partyPositionDragged', {
          lat: newPos.lat,
          lng: newPos.lng
        });
      });
    }
  }

  /**
   * Update visualization state (publication flags)
   * @param {Object} state - {route, locations, position, factions} with {published, revision}
   */
  function updatePublicationState(state) {
    if (!state || typeof state !== 'object') return;
    
    visualizationState.routePublished = Boolean(state.route?.published);
    visualizationState.locationsPublished = Boolean(state.locations?.published);
    visualizationState.positionPublished = Boolean(state.position?.published);
    visualizationState.factionsPublished = Boolean(state.factions?.published);
  }

  /**
   * Refresh all visualizations (e.g., after campaign load or publication change)
   * @param {Object} data - {routes, locations, position, publicationState}
   */
  async function refreshVisualizations(data) {
    if (!data || typeof data !== 'object') return;

    updatePublicationState(data.publicationState);

    // Render route if available
    if (Array.isArray(data.routes) && Array.isArray(data.locations)) {
      const locationsMap = {};
      data.locations.forEach(loc => {
        locationsMap[loc.id] = loc;
      });
      renderRoute(data.routes, locationsMap, visualizationState.routePublished);
    }

    // Render locations
    if (Array.isArray(data.locations)) {
      renderLocations(data.locations, visualizationState.locationsPublished);
    }

    // Render party position
    if (data.position && typeof data.position === 'object') {
      const isDraggable = data.isGM === true;
      renderPartyPosition(data.position, isDraggable);
    }
  }

  /**
   * Clear all route visualization (polyline + stop markers)
   */
  function clearRouteVisualization() {
    if (routePolyline) {
      routePolyline.remove();
      routePolyline = null;
    }
    stopMarkers.forEach(marker => marker.remove());
    stopMarkers = [];
  }

  /**
   * Clear all location markers
   */
  function clearLocationMarkers() {
    locationMarkers.forEach(marker => marker.remove());
    locationMarkers = [];
  }

  /**
   * Clear party position marker
   */
  function clearPositionMarker() {
    if (positionMarker) {
      positionMarker.remove();
      positionMarker = null;
    }
  }

  /**
   * Clear all visualizations
   */
  function clearAllMarkers() {
    clearRouteVisualization();
    clearLocationMarkers();
    clearPositionMarker();
  }

  /**
   * Get current visualization state
   */
  function getVisualizationState() {
    return { ...visualizationState };
  }

  /**
   * Dispatch custom events for UI layer
   */
  function dispatchEvent(eventType, detail) {
    const event = new CustomEvent(`mapviz:${eventType}`, {
      detail,
      bubbles: true,
      cancelable: true
    });
    document.dispatchEvent(event);
  }

  return {
    initializeVisualization,
    renderRoute,
    renderLocations,
    renderPartyPosition,
    updatePublicationState,
    refreshVisualizations,
    clearRouteVisualization,
    clearLocationMarkers,
    clearPositionMarker,
    clearAllMarkers,
    getVisualizationState
  };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = mapVisualization;
}
