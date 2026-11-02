# Phase 3.3: Route UI — Quick Reference

## Files

| File | Lines | Purpose |
|------|-------|---------|
| route-client.js | 580 | Client module (5 APIs, modals, rendering) |
| index.html | +600 | Modal HTML, CSS, event handlers |
| Total | ~780 | Complete route management UI |

---

## API Functions

### Load Route
```javascript
await window.routeClient.loadRouteForCampaign(campaignId);
// Sets routeState.route, totalKm, stopCount
```

### Create Stop
```javascript
await window.routeClient.createStopViaAPI(locationId, detail, kmFromPrevious);
// Returns {id, ordinal, locationId, ...}
// Throws on duplicate, validation error, or access denied
```

### Update Stop
```javascript
await window.routeClient.updateStopViaAPI(ordinal, detail, kmFromPrevious);
// Cannot change location
// Auto-reloads route after update
```

### Delete Stop
```javascript
await window.routeClient.deleteStopViaAPI(ordinal);
// Confirms with user first
// Auto-renumbering handled by backend
```

### Reorder Route
```javascript
await window.routeClient.reorderRouteViaAPI(orderedLocationIds);
// Pass locationIds in desired order
// Must match current route (just reordered)
```

---

## Modal Handlers

| Handler | Trigger | Action |
|---------|---------|--------|
| openRouteEditorModal() | Click "Manage route" | Show modal |
| closeRouteEditorModal() | Click Done or close | Hide modal |
| handleAddStopToRoute() | Click "+ Add Stop" | Show form |
| handleEditStop(ordinal) | Click Edit on stop | Load edit form |
| handleDeleteStop(ordinal) | Click Delete on stop | Confirm & delete |
| handleSaveStop() | Form submit | Validate & save |

---

## Rendering

| Function | Output | When |
|----------|--------|------|
| renderRouteList() | Stop cards in grid | Modal opened |
| renderRouteSummary() | Stats: km/stops/avg | Modal opened |
| renderRouteDisplay() | Compact preview | Dashboard load |
| populateLocationSelector() | <select> options | Add form opened |

---

## State

```javascript
window.routeClient.routeState = {
  campaignId: "...",           // Current campaign
  route: [{ordinal, locationId, locationName, gridReference, detail, kmFromPrevious}, ...],
  selectedStopOrdinal: null,   // Currently editing
  editingStop: null,           // Current form values
  totalKm: 0,                  // Sum of all kmFromPrevious
  stopCount: 0,                // Length of route
  error: null,                 // Last error message
  isLoading: false             // Loading indicator
};
```

---

## Events

### User Actions → Event Handlers

| User Action | Event | Handler |
|---|---|---|
| Click "Manage route" | data-action="open-route-editor" | openRouteEditorModal() |
| Click "+" | data-action="open-add-stop-form" | handleAddStopToRoute() |
| Click Stop Edit | data-action="edit-stop-N" | handleEditStop(N) |
| Click Stop Delete | data-action="delete-stop-N" | handleDeleteStop(N) |
| Form Submit | Form submit | handleSaveStop() |
| Click Cancel | data-action="close-stop-editor" | Hide form, reset |
| Click Done | data-action="close-route-editor" | closeRouteEditorModal() |

---

## Integration Points

### Campaign Selection
```javascript
// In applyRuntimeSnapshot() → locationClient loaded → routeClient loaded
if (window.routeClient) {
  window.routeClient.loadRouteForCampaign(runtime.campaign.id)
    .then(() => {
      window.routeClient.renderRouteDisplay();
      window.routeClient.setupRouteEventListeners();
    });
}
```

### Movement Dashboard
```html
<!-- Added button to Movement section -->
<button class="button" data-action="open-route-editor">Manage route</button>
```

### Dashboard Summary
```html
<!-- Route preview shown in campaign area -->
<div id="route-display"></div>  <!-- Populated by renderRouteDisplay() -->
```

---

## CSS Classes

| Class | Purpose |
|-------|---------|
| route-stops-grid | Grid container for stop cards |
| stop-card | Individual stop card |
| stop-header | Card title section |
| stop-ordinal | Stop number badge |
| stop-location | Stop name |
| stop-detail | Stop description |
| stop-km | Distance display |
| stop-actions | Edit/Delete buttons |
| form-feedback | Error/success message |
| route-summary | Stats section |
| route-modal-header | Modal title bar |
| route-modal-body | Modal content area |
| route-modal-footer | Modal action buttons |

---

## Validation Rules

### Location Selector
- ✅ Lists all campaign locations
- ❌ Excludes locations already in route
- ❌ Empty option if all used

### Stop Detail
- ✅ Required (non-empty)
- ✅ Max 160 characters
- ✅ Trims whitespace

### Distance
- ✅ Must be a number
- ✅ Min: 0.0
- ✅ Step: 0.1 km
- ✅ Decimal support

### Stop Ordinal (edit)
- ✅ Must be integer ≥ 0
- ✅ Must match current route
- ❌ Cannot edit location

---

## Error Handling

| Error | Message | Action |
|-------|---------|--------|
| No campaign | "Select a runtime campaign first" | Toast, disable controls |
| Duplicate location | "Location already in route" | Show in form feedback |
| Invalid input | Field-specific message | Show in form feedback |
| API 404 | "Campaign/stop not found" | Toast |
| API 409 | "Location already in route" or "Reorder mismatch" | Toast |
| API 422 | Validation error detail | Toast |
| Network error | "Failed to load/save route" | Toast |

---

## Next Steps (Phase 3.4)

- [ ] Visualize route on campaign map
- [ ] Display stop markers with labels
- [ ] Show total distance on map
- [ ] Publish/hide route toggle
- [ ] Player interface shows published route
- [ ] Map controls for GM visibility

---

## Testing Validation

**What Works:**
- ✅ Backend route CRUD operations (Phase 3.2 tests: 22/22 passing)
- ✅ Campaign isolation (location tests validate this)
- ✅ Location deletion blocks if in route (integration test)
- ✅ Campaign revision incrementing (backend validation)

**Manual Testing Needed:**
- [ ] Modal opens and closes
- [ ] Form validation messages appear
- [ ] Location selector populates correctly
- [ ] Stops render in grid layout
- [ ] Stats display correct totals
- [ ] Errors handled gracefully
- [ ] Responsive at mobile widths

---

## Debug Tips

### Check Route State
```javascript
console.log(window.routeClient.routeState);
```

### Test API Directly
```javascript
const result = await window.routeClient.loadRouteForCampaign("campaign-id");
console.log(window.routeClient.routeState.route);
```

### Check Modal
```javascript
document.getElementById("route-editor-modal").showModal(); // Show
document.getElementById("route-editor-modal").close();     // Hide
```

### Inspect Form
```javascript
console.log(document.getElementById("stop-location-select").value);
console.log(document.getElementById("stop-detail-input").value);
console.log(document.getElementById("stop-km-input").value);
```

### View Errors
```javascript
console.log(window.routeClient.routeState.error);
```

---

## Performance Notes

- Route loads once per campaign selection (cached in routeState)
- Modal renders all stops (efficient for <50 stops)
- API calls reload full route (ensures consistency)
- No debouncing needed (user-paced operations)
- Location selector re-populated each time (small dataset)

---

## Accessibility

- ✅ Semantic HTML (dialog, form, labels)
- ✅ ARIA labels on modal and buttons
- ✅ Focus management (modal autofocus)
- ✅ Keyboard navigation (form inputs, buttons)
- ✅ Error messages linked to form feedback
- ✅ Confirmation dialogs for destructive actions

---

## Browser Compatibility

- ✅ ES2020+ (async/await, arrow functions, spread)
- ✅ Fetch API (no polyfill needed)
- ✅ HTML5 `<dialog>` element
- ✅ CSS Grid (for card layout)
- ✅ CSS Flexbox (for modal layout)
- ⚠️ No IE11 support (use modern browsers)

---
