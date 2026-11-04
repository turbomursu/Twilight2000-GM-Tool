# Map Import System - Technical Quick Reference

## Two Workflows

### 1️⃣ FIELD PAPERS (Bounds Definition)
- **Input**: GeoJSON file from https://fieldpapers.org
- **Processing**: Browser-side (campaign-setup.html)
- **Validates**: Bounds (S,W,N,E) within [-90,90] × [-180,180]
- **Generates**: 10 km hex grid (axial Q-R coordinates)
- **Output**: `state.map.bounds`, `state.map.grid`
- **Result**: Defines campaign playable area

### 2️⃣ OFFLINE BASEMAP (Tiles)
- **Input**: PMTiles v3 archive (50 MiB max)
- **Format**: Raster (PNG/JPEG/WebP/AVIF) OR Vector (MVT)
- **Processing**: Server-side (offline-basemaps.cjs)
- **Validates**: PMTiles magic header + size
- **Detects**: Tile format (raster vs. vector)
- **Stores**: `data/maps/atlas/{assetId}.pmtiles` + `.json` sidecar
- **Serves**: Via HTTP byte-range requests (206 Partial Content)
- **Result**: Persistent offline map tiles

---

## Data Structures

### Campaign State (Browser)
```javascript
state.map = {
  // From Field Papers
  bounds: { south, west, north, east },
  center: { lat, lng },
  zoom: number,
  fieldPapersAtlas: { id: string },
  
  // Terrain grid (populated in Step 3)
  grid: {
    coordinateSystem: "axial-q-r",
    cellKm: 10,
    terrainCells: [
      { q: number, r: number, terrainType: string },
      ...
    ]
  },
  
  // If PMTiles uploaded
  offlineBasemap: {
    assetId: "uuid-string",
    format: "raster-pmtiles" | "vector-pmtiles",
    attribution: string,
    licenseUrl: "https://..."
  },
  
  offlineAnnotations: []
}
```

### Setup Package (JSON)
```json
{
  "packageType": "fieldbook.campaign-setup",
  "schemaVersion": 2,
  "campaign": { id, name, setting, premise, era },
  "map": {
    "id": "string",
    "name": "string",
    "bounds": { south, west, north, east },
    "center": { lat, lng },
    "zoom": number,
    "fieldPapersAtlas": { id },
    "grid": { coordinateSystem, cellKm, terrainCells[] },
    "offlineBasemap": { assetId, format, attribution, licenseUrl },
    "offlineAnnotations": []
  },
  "locations": [ /* Step 4 */ ],
  "factions": [ /* Step 5 */ ],
  "settlements": [ /* Step 5 */ ],
  "scenarioNotes": [ /* Step 6 */ ]
}
```

### Server Storage
```
File System:
  data/maps/atlas/
    ├─ {assetId}.pmtiles        (actual tile data, 50 MiB max)
    └─ {assetId}.json          (metadata: assetId, ownerAccountId, byteLength, format)

Database:
  maps table:
    ├─ runtime_campaign_id
    ├─ source_map_id
    ├─ name
    ├─ bounds_json           (parsed from Field Papers)
    ├─ center_json
    ├─ zoom
    ├─ atlas_json           (Field Papers reference)
    ├─ offlineBasemap_json  (assetId, format, attribution, licenseUrl)
    ├─ attribution
    └─ annotations_json
  
  terrain_cells table:
    ├─ runtime_campaign_id
    ├─ q                    (hex coordinate)
    ├─ r                    (hex coordinate)
    └─ terrain_type
```

---

## HTTP Endpoints

### Upload Basemap
```http
POST /api/campaigns/upload-basemap
Content-Type: application/vnd.pmtiles
Authorization: Cookie [session]

[Binary PMTiles data stream]

Response 200:
{
  "assetId": "550e8400-e29b-41d4-a716-446655440000",
  "byteLength": 48392192,
  "format": "raster-pmtiles"
}
```

### Serve Basemap Tiles
```http
GET /map/asset/{assetId}.pmtiles
Range: bytes=0-1023

Response 206:
Content-Type: application/vnd.pmtiles
Content-Range: bytes 0-1023/48392192
Accept-Ranges: bytes
[Tile data]
```

### Import Setup Package
```http
POST /api/campaigns/import-setup
Content-Type: application/json
Authorization: Cookie [session]

{
  "packageType": "fieldbook.campaign-setup",
  "schemaVersion": 2,
  "map": { /* map data */ },
  ...
}

Response 201:
{
  "campaign": {
    "id": "runtime-campaign-uuid",
    "name": "...",
    "setting": "...",
    ...
  }
}
```

---

## Validation Rules

### Bounds (from campaign-package-contract.js)
```javascript
const { south, west, north, east } = bounds;
const valid = 
  Number.isFinite(south) && south >= -90 && south < north &&
  Number.isFinite(north) && north <= 90 &&
  Number.isFinite(west) && west >= -180 && west < east &&
  Number.isFinite(east) && east <= 180;
```

### PMTiles (from offline-basemaps.cjs)
```javascript
// Magic header validation
const valid = 
  data.length >= 127 &&
  data.subarray(0, 7).toString("ascii") === "PMTiles" &&
  data[7] === 3;  // Version 3

// Format detection
const tileType = data[99];
const format = 
  tileType === 1 ? "vector-pmtiles" :
  [2, 3, 4, 5].includes(tileType) ? "raster-pmtiles" :
  null;
```

### Offline Basemap (from campaign-package-contract.js)
```javascript
// Must have 3-4 required fields
const hasLegacyFields = keys.length === 3 && !hasOwn("licenseUrl");
const hasLicenseFields = keys.length === 4 && hasOwn("licenseUrl");

const valid = 
  (hasLegacyFields || hasLicenseFields) &&
  hasOwn("assetId") &&
  hasOwn("attribution") &&
  hasOwn("format") &&
  ["raster-pmtiles", "vector-pmtiles"].includes(format) &&
  (format === "vector-pmtiles" ? hasLicenseFields : true) &&
  isValidUUID(assetId) &&
  isValidAttribution(attribution) &&
  (hasLicenseFields ? isValidHttpsUrl(licenseUrl) : true);
```

---

## Key Coordinates

### Field Papers → State
1. GM downloads atlas GeoJSON from fieldpapers.org
2. Browser parses to extract:
   ```javascript
   const features = geoJSON.features;
   const pages = features.filter(f => f.properties.tileType === "page");
   const bounds = calculateBoundsFromPages(pages);
   // bounds = { south, west, north, east }
   ```

### Upload → Storage
1. Client POST to `/api/campaigns/upload-basemap`
2. Server receives stream (max 50 MiB)
3. Validates PMTiles v3 header
4. Generates UUID assetId
5. Saves: `{assetId}.pmtiles` + `{assetId}.json`
6. Returns assetId to client

### Serve → Player
1. Client GET `/map/asset/{assetId}.pmtiles` with Range header
2. Server sends 206 Partial Content
3. Byte-range allows efficient streaming
4. MapLibre GL requests specific tiles as needed

### Import → Runtime
1. Client POST `/api/campaigns/import-setup`
2. Server validates schema v2
3. Extracts all map data (bounds, terrain, locations, etc.)
4. Inserts into database tables
5. Campaign ready to play
6. Player interface receives `assetId` reference
7. Players access tiles via HTTP ranges

---

## Performance Considerations

### Field Papers Import
- **Client-side**: Fast (parsing JSON in browser)
- **Limits**: None (just JSON parsing)
- **Typical time**: <100ms

### PMTiles Upload
- **Server-side streaming**: Efficient (doesn't buffer entire file)
- **Size limit**: 50 MiB
- **Validation**: Quick (header check at byte 7)
- **Typical time**: 2-30s (depending on file size and connection)

### Tile Serving
- **Byte-range requests**: Very efficient
- **Typical flow**:
  - First request: 0-1023 bytes (tile metadata)
  - Subsequent: Only needed tiles downloaded
  - Result: Large archives usable without waiting for full download
- **Caching**: Private, max-age 3600s (1 hour)

### Database
- **Terrain cells**: Index on (runtime_campaign_id, q, r)
- **Locations**: Index on (runtime_campaign_id)
- **Query time**: <50ms for typical campaign

---

## Permission Model

| Action | GM Only | Player | Notes |
|--------|---------|--------|-------|
| Upload basemap | ✓ | ✗ | Server-side enforcement |
| View uploaded maps | ✓ | ✓ | Via authenticated session |
| Access byte-range | ✓ | ✓ | Per-campaign authorization |
| Modify map | ✓ | ✗ | Campaign immutable after import |
| Publish locations | ✓ | ✗ | GM controls what appears |
| See GM-only marks | ✓ | ✗ | Permission enforced at API |

---

## Error Handling

### Upload Errors
- Invalid Content-Type → 415 Unsupported Media Type
- File >50 MiB → 413 Payload Too Large
- Invalid PMTiles header → 422 Unprocessable Entity
- Disk write failure → 500 Internal Server Error

### Serving Errors
- Invalid assetId format → 404 Not Found
- File missing → 404 Not Found
- Invalid range header → 416 Range Not Satisfiable
- Unauthorized session → 401 Unauthorized

### Import Errors
- Invalid bounds → 422 Unprocessable Entity
- Schema v2 mismatch → 422 Unprocessable Entity
- Duplicate assetId → 422 Unprocessable Entity
- Database error → 500 Internal Server Error

---

## Testing

### Field Papers Validation
```javascript
// campaign-package-contract.js
assertCampaignSetupPackage(input);
// Validates: schema v2, bounds, grid, collections
```

### PMTiles Validation
```javascript
// offline-basemaps.cjs
getArchiveFormat(data);
// Checks: magic header, tile type byte
```

### Full Import
```javascript
// runtime-store.cjs
importSetupPackage(database, sourceJson, options);
// Creates campaign, stores all data
```

### Mock Campaign
See: [test-gm-runtime-import.cjs]() - creates complete campaign with:
- 3 locations (1 starting)
- 3 factions
- 2 settlements
- 3 scenario notes
- Dashboard initialized
- Full API validation

---

## Offline Workflow

**Scenario**: Campaign in conflict zone without reliable internet

1. **Preparation Phase** (online, at base)
   - Create campaign in Setup Tool
   - Import Field Papers atlas
   - Upload offline PMTiles (high-quality raster map)
   - Export setup package
   - Load database to portable drive

2. **Deployment Phase** (offline, in field)
   - Start GM Tool with preloaded database
   - Import setup package
   - PMTiles already on disk
   - Map renders without internet
   - All gameplay offline

3. **Sync Phase** (back online)
   - Export campaign backup
   - Upload to cloud storage
   - Merge with other GMs' data if needed

---

## Files

| File | Purpose |
|------|---------|
| [campaign-setup.html](/C:/Users/hemuli/Twilight2000-GM-Tool/campaign-setup.html) | Campaign authoring UI (Field Papers + basemap upload) |
| [offline-basemaps.cjs](/C:/Users/hemuli/Twilight2000-GM-Tool/server/offline-basemaps.cjs) | PMTiles upload handler + byte-range server |
| [campaign-package-contract.js](/C:/Users/hemuli/Twilight2000-GM-Tool/campaign-package-contract.js) | Schema validation (bounds, grid, collections) |
| [runtime-store.cjs](/C:/Users/hemuli/Twilight2000-GM-Tool/server/runtime-store.cjs) | Import handler + database storage |
| [MAP_IMPORT_SYSTEM.md](/C:/Users/hemuli/Twilight2000-GM-Tool/MAP_IMPORT_SYSTEM.md) | Complete documentation (this file's companion) |
