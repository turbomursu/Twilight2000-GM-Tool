# Phase 3.4 UI Integration Quick Start Guide

**For:** Next developer implementing UI integration  
**Status:** Backend complete, ready for UI work  
**Scope:** ~10-14 hours remaining (UI + testing + docs)  

---

## What's Already Done ✅

### Backend (100% Complete)
- [server/runtime-store.cjs](/server/runtime-store.cjs) — 5 publication state functions
- [server/campaigns.cjs](/server/campaigns.cjs) — 5 REST API endpoints
- Database schema — 3 new tables with auto-initialization
- All 233 tests passing, zero regressions

### Visualization Client (100% Complete)
- [map-visualization-client.js](/map-visualization-client.js) — 320 lines
- Ready to import into index.html
- No further backend work needed

### Documentation (100% Complete)
- [PHASE3.4_BACKEND_COMPLETE_REPORT.md](/PHASE3.4_BACKEND_COMPLETE_REPORT.md) — Full API reference
- [SESSION_PHASE3.4_BACKEND_COMPLETE.md](/SESSION_PHASE3.4_BACKEND_COMPLETE.md) — Session summary

---

## What You Need to Implement

### Step 1: GM Publication Control Panel (4-5 hours)

#### A. Add HTML to index.html (Movement dashboard)

Find the Movement dashboard section and add this publication control panel:

```html
<!-- Publication Control Panel -->
<div id="publication-control-panel" style="margin-top: 20px; padding: 15px; border: 1px solid #ccc; border-radius: 4px;">
  <h3>Map Publication Controls</h3>
  
  <div style="margin: 10px 0;">
    <label>
      <input type="checkbox" id="pub-route" class="publication-toggle" data-target="route" />
      Route
      <span id="pub-route-revision" class="revision-badge"></span>
    </label>
  </div>
  
  <div style="margin: 10px 0;">
    <label>
      <input type="checkbox" id="pub-locations" class="publication-toggle" data-target="locations" />
      Locations
      <span id="pub-locations-revision" class="revision-badge"></span>
    </label>
  </div>
  
  <div style="margin: 10px 0;">
    <label>
      <input type="checkbox" id="pub-position" class="publication-toggle" data-target="position" />
      Party Position
      <span id="pub-position-revision" class="revision-badge"></span>
    </label>
  </div>
  
  <div style="margin: 10px 0;">
    <label>
      <input type="checkbox" id="pub-factions" class="publication-toggle" data-target="factions" />
      Factions
      <span id="pub-factions-revision" class="revision-badge"></span>
    </label>
  </div>
  
  <div id="publication-status" style="margin-top: 15px; font-size: 12px; color: #666;">
    Last modified: <span id="pub-last-modified">Unknown</span>
  </div>
  
  <div id="publication-error" style="color: red; margin-top: 10px; display: none;"></div>
</div>
```

#### B. Add JavaScript event handlers

After campaign loads, add this code:

```javascript
// Load publication state when campaign is selected
async function loadPublicationState(campaignId) {
  try {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/map-publication`);
    if (!response.ok) throw new Error("Failed to load publication state");
    
    const { state } = await response.json();
    updatePublicationUI(state);
  } catch (error) {
    console.error("Publication state error:", error);
    showPublicationError(error.message);
  }
}

// Update UI checkboxes based on publication state
function updatePublicationUI(state) {
  document.getElementById('pub-route').checked = state.route.published;
  document.getElementById('pub-locations').checked = state.locations.published;
  document.getElementById('pub-position').checked = state.position.published;
  document.getElementById('pub-factions').checked = state.factions.published;
  
  document.getElementById('pub-route-revision').textContent = `(rev ${state.route.revision})`;
  document.getElementById('pub-locations-revision').textContent = `(rev ${state.locations.revision})`;
  document.getElementById('pub-position-revision').textContent = `(rev ${state.position.revision})`;
  document.getElementById('pub-factions-revision').textContent = `(rev ${state.factions.revision})`;
  
  const lastMod = new Date(state.lastModifiedAt).toLocaleString();
  document.getElementById('pub-last-modified').textContent = lastMod;
}

// Handle checkbox changes
document.querySelectorAll('.publication-toggle').forEach(checkbox => {
  checkbox.addEventListener('change', async (evt) => {
    const target = evt.target.dataset.target;
    const campaignId = currentCampaignId; // Use existing variable
    
    try {
      clearPublicationError();
      
      const state = {};
      state[target] = evt.target.checked;
      
      const response = await fetch(
        `/api/campaigns/${encodeURIComponent(campaignId)}/map-publication`,
        {
          method: 'PUT',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({state})
        }
      );
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Publication update failed');
      }
      
      const result = await response.json();
      updatePublicationUI(result.state);
      
    } catch (error) {
      console.error("Publication update error:", error);
      showPublicationError(error.message);
      // Revert checkbox
      evt.target.checked = !evt.target.checked;
    }
  });
});

function showPublicationError(message) {
  const errorDiv = document.getElementById('publication-error');
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
}

function clearPublicationError() {
  const errorDiv = document.getElementById('publication-error');
  errorDiv.style.display = 'none';
}
```

#### C. Call loadPublicationState when campaign loads

Find where campaign is selected/loaded and add:

```javascript
// When campaign is loaded (in your existing campaign selection handler)
loadPublicationState(campaignId);
```

### Step 2: Map Visualization Integration (2-3 hours)

#### A. Import the visualization client

Add to index.html `<head>` or before closing `</body>`:

```html
<script src="./map-visualization-client.js"></script>
```

#### B. Initialize visualization when map loads

Find where Leaflet map is created and add:

```javascript
// After Leaflet map is initialized
const leafletMap = L.map('map-container'); // Your map ID
mapVisualization.initializeVisualization(leafletMap);

// Then refresh visualizations with campaign data
loadMapVisualizations(campaignId);
```

#### C. Create function to load and render map content

```javascript
async function loadMapVisualizations(campaignId) {
  try {
    // Load all required data in parallel
    const [routeResponse, locationsResponse, publicationResponse, positionResponse] = await Promise.all([
      fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/route-stops`),
      fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/locations`),
      fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/map-publication`),
      fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/party-position`)
    ]);
    
    if (!routeResponse.ok || !locationsResponse.ok || !publicationResponse.ok || !positionResponse.ok) {
      throw new Error("Failed to load map data");
    }
    
    const routeData = await routeResponse.json();
    const locationsData = await locationsResponse.json();
    const publicationData = await publicationResponse.json();
    const positionData = await positionResponse.json();
    
    // Create locations map
    const locationsMap = {};
    locationsData.forEach(loc => {
      locationsMap[loc.id] = loc;
    });
    
    // Refresh all visualizations
    mapVisualization.refreshVisualizations({
      routes: routeData,
      locations: locationsData,
      position: positionData.position,
      publicationState: publicationData.state,
      isGM: true  // Set based on user role
    });
    
  } catch (error) {
    console.error("Map visualization error:", error);
  }
}
```

#### D. Add party position drag handler

```javascript
// Listen for party position drag events
document.addEventListener('mapviz:partyPositionDragged', async (evt) => {
  const { lat, lng } = evt.detail;
  const campaignId = currentCampaignId;
  
  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/party-position`,
      {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({lat, lng})
      }
    );
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Position update failed');
    }
    
    // Success - position updated
    console.log("Party position updated:", {lat, lng});
    
  } catch (error) {
    console.error("Position update error:", error);
    // Revert position (user sees error in console)
    loadMapVisualizations(campaignId);
  }
});
```

### Step 3: Publication History Display (1-2 hours)

#### A. Add HTML for history panel

```html
<!-- Publication History Panel -->
<div id="publication-history-panel" style="margin-top: 20px; max-height: 300px; overflow-y: auto; border: 1px solid #ccc; padding: 10px; border-radius: 4px;">
  <h4>Publication History</h4>
  <div id="publication-history-list">
    <!-- Populated by JavaScript -->
  </div>
</div>
```

#### B. Add JavaScript to load and display history

```javascript
async function loadPublicationHistory(campaignId, limit = 10) {
  try {
    const response = await fetch(
      `/api/campaigns/${encodeURIComponent(campaignId)}/map-publication/history?limit=${limit}`
    );
    
    if (!response.ok) throw new Error("Failed to load history");
    
    const { history } = await response.json();
    
    const list = document.getElementById('publication-history-list');
    list.innerHTML = history.map(entry => `
      <div style="padding: 5px; border-bottom: 1px solid #eee; font-size: 12px;">
        <strong>${entry.target}</strong> 
        ${entry.oldValue ? '✓' : '✗'} → ${entry.newValue ? '✓' : '✗'}
        <br/>
        <small style="color: #999;">
          ${new Date(entry.recordedAt).toLocaleString()} by ${entry.actor}
        </small>
      </div>
    `).join('');
    
  } catch (error) {
    console.error("History load error:", error);
  }
}

// Call after campaign loads
loadPublicationHistory(campaignId);
```

### Step 4: Player Interface Updates (3-4 hours)

#### A. Load publication state in player interface

In public/player-interface.html, after campaign loads:

```javascript
async function loadPlayerPublicationState(campaignId) {
  try {
    const response = await fetch(`/api/campaigns/${encodeURIComponent(campaignId)}/map-publication`);
    if (response.ok) {
      const { state } = await response.json();
      window.publishedLayers = {
        routePublished: state.route.published,
        locationsPublished: state.locations.published,
        positionPublished: state.position.published,
        factionsPublished: state.factions.published
      };
      refreshPlayerMapVisualizations();
    }
  } catch (error) {
    console.error("Failed to load publication state:", error);
  }
}
```

#### B. Conditionally render layers based on publication state

```javascript
function refreshPlayerMapVisualizations() {
  const { routePublished, locationsPublished, positionPublished } = window.publishedLayers;
  
  // Load route only if published
  if (routePublished) {
    loadAndRenderRoute();
  }
  
  // Load locations only if published
  if (locationsPublished) {
    loadAndRenderLocations();
  }
  
  // Load position only if published
  if (positionPublished) {
    loadAndRenderPosition();
  }
}
```

#### C. Make position marker static (no dragging)

When rendering for player:

```javascript
// In player interface only
mapVisualization.renderPartyPosition(position, isDraggable = false);
```

### Step 5: Integration Testing (2-3 hours)

Create `tests/phase3.4.test.cjs`:

```javascript
const { test } = require('node:test');
const { strict: assert } = require('node:assert');
const { openRuntimeDatabase } = require('../server/runtime-store.cjs');

test('Phase 3.4 API Tests', async (t) => {
  // Test suite setup
  const database = await openRuntimeDatabase(':memory:');
  
  // Test 1: Publication state GET
  await t.test('GET /map-publication returns current state', () => {
    // ... test implementation
  });
  
  // Test 2: Publication state PUT
  await t.test('PUT /map-publication updates flags atomically', () => {
    // ... test implementation
  });
  
  // Test 3: Bounds validation
  await t.test('PUT /party-position rejects outside bounds', () => {
    // ... test implementation
  });
  
  // Test 4: Campaign isolation
  await t.test('Non-GM cannot access publication APIs', () => {
    // ... test implementation
  });
  
  // ... more tests ...
});
```

See [PHASE3.4_BACKEND_COMPLETE_REPORT.md](/PHASE3.4_BACKEND_COMPLETE_REPORT.md) for detailed API contracts.

---

## API Quick Reference

### Publication State
```
GET  /api/campaigns/:id/map-publication
PUT  /api/campaigns/:id/map-publication
```

### Party Position
```
GET  /api/campaigns/:id/party-position
PUT  /api/campaigns/:id/party-position
```

### Publication History
```
GET  /api/campaigns/:id/map-publication/history?limit=50&offset=0
```

See [PHASE3.4_BACKEND_COMPLETE_REPORT.md](/PHASE3.4_BACKEND_COMPLETE_REPORT.md) for full specifications.

---

## Key Implementation Notes

### Campaign ID Encoding
Always encode campaign IDs in URLs:
```javascript
encodeURIComponent(campaignId)
```

### Error Handling
Check response status before parsing JSON:
```javascript
if (!response.ok) {
  const error = await response.json();
  throw new Error(error.error);
}
```

### Publication State Auto-Initialization
Backend auto-creates state if not exists. First access always succeeds.

### Bounds Validation
Party position updates are validated server-side. Show error if outside bounds:
```javascript
// Position outside campaign bounds (422 Validation Error)
if (response.status === 422) {
  showError("Position must be within campaign bounds");
}
```

### Player Visibility Enforcement
Enforce in JS layer:
- Route: Show only if `publicationState.route.published`
- Locations: Show only if `publicationState.locations.published`
- Position: Show only if `publicationState.position.published`

Players cannot change this; it's read-only on their end.

---

## Testing Checklist

Before marking Phase 3.4 complete:

- [ ] GM can toggle each publication flag
- [ ] Checkboxes update after successful toggle
- [ ] Revision numbers increment
- [ ] Timestamp updates
- [ ] Publication history shows all changes
- [ ] Route renders when published, hides when not
- [ ] Locations render when published, hide when not
- [ ] Party position renders when published, hides when not
- [ ] GM can drag party position
- [ ] Position update validates bounds
- [ ] Player interface only shows published layers
- [ ] All 233 existing tests still passing
- [ ] 15+ new Phase 3.4 tests passing

---

## Time Estimates

- **Step 1 (GM Publication Panel):** 4-5 hours
- **Step 2 (Map Visualization):** 2-3 hours
- **Step 3 (Publication History):** 1-2 hours
- **Step 4 (Player Interface):** 3-4 hours
- **Step 5 (Testing):** 2-3 hours
- **Documentation Updates:** 1-2 hours

**Total: 13-19 hours**

Good luck! The backend is solid and well-tested. This is purely UI integration work.
