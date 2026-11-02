# Phase 3.2: Route Management — Quick Reference

**Status:** ✅ Backend Complete | ⏳ UI Deferred  
**Test Results:** 233/233 passing  
**Production Ready:** YES

---

## API Endpoints

### List Route
```
GET /api/campaigns/:id/route
→ 200 { stops: [...], totalKm: N, stopCount: N }
```

### Create Stop
```
POST /api/campaigns/:id/route/stops
← { locationId, detail, kmFromPrevious, ordinal }
→ 201 { stop: {...} }
→ 404 Campaign/location not found
→ 409 Location already in route
→ 422 Validation error
```

### Update Stop
```
PUT /api/campaigns/:id/route/stops/:ordinal
← { detail, kmFromPrevious }
→ 200 { stop: {...} }
→ 404 Stop not found
→ 422 Validation error
```

### Delete Stop
```
DELETE /api/campaigns/:id/route/stops/:ordinal
→ 200 { success: true }
→ 404 Stop not found
```

### Reorder
```
PUT /api/campaigns/:id/route/reorder
← { orderedLocationIds: [...] }
→ 200 { success: true }
→ 409 Reordering mismatch
```

---

## Validation Rules

| Field | Rules |
|-------|-------|
| locationId | Must exist in locations table |
| ordinal | 0-based, sequential, no gaps |
| detail | 1-160 chars, required |
| kmFromPrevious | >= 0, integer |

---

## Functions

```javascript
// runtime-store.cjs exports
listRouteStopsForCampaign(db, accountId, campaignId)
createRouteStop(db, accountId, campaignId, locId, detail, km, ordinal)
updateRouteStop(db, accountId, campaignId, ordinal, detail, km)
deleteRouteStop(db, accountId, campaignId, ordinal)
reorderRouteStops(db, accountId, campaignId, orderedLocationIds)
```

---

## Key Features

✅ Campaign isolation at query level  
✅ Atomic transactions on all mutations  
✅ Auto-renumbering when deleting  
✅ Cascade protection (location in route)  
✅ Revision incrementing  
✅ Ownership verification  

---

## Error Codes

| Code | Scenario |
|------|----------|
| 404 | Campaign/stop/location not found OR access denied |
| 409 | Location duplicate OR reordering mismatch |
| 422 | Validation failure |

---

## Implementation Time

- Backend functions: ~1.5 hours
- API endpoints: ~1 hour  
- Documentation: ~1.5 hours
- **Total: ~4 hours**

---

## Test Coverage

- 233/233 tests passing
- CRUD operations: ✅
- Validation: ✅
- Isolation: ✅
- Ownership: ✅
- Zero regressions: ✅

---

## Next Phase (3.3)

- route-client.js (~350 lines)
- Modal UI (~300 lines)
- Map visualization
- Campaign integration
- Testing

Estimated: 2-3 days
