# Map Import System - Complete Explanation

## Overview

The Twilight 2000 GM Tool's map import system has **two distinct workflows**:

1. **Field Papers Import** - Browser-based GeoJSON import for establishing campaign bounds
2. **Offline Basemap Upload** - PMTiles archive upload for persistent offline map tiles

Both feeds into the **Campaign Setup Tool** (Step 2: "Import atlas"), which creates the geographic foundation for the campaign.

---

## Workflow 1: Field Papers Atlas Import

### Purpose
- Establishes the **campaign geographic bounds** (south, west, north, east latitude/longitude)
- Defines the **map coordinate system** and layout
- Provides a reference atlas structure (page grid from Field Papers)

### How It Works

**Step 1: Download from Field Papers**
```
User visits: https://fieldpapers.org/
- Creates a new map atlas
- Prints and annotates the paper map
- Downloads the atlas as GeoJSON
```

**Step 2: Import GeoJSON in Campaign Setup Tool**
```html
<!-- In campaign-setup.html -->
<button id="choose-fieldpapers-file">Import atlas GeoJSON</button>
<input id="fieldpapers-file" type="file" accept=".json,.geojson">
```

**Step 3: Parse the Field Papers GeoJSON**

The browser-side JavaScript (in campaign-setup.html) processes the GeoJSON:
```javascript
// Pseudo-code flow
1. User selects the Field Papers atlas GeoJSON file
2. Parse the GeoJSON to extract:
   - Atlas properties (id, title, pages layout)
   - Feature geometry (bounding boxes)
   - Page grid coordinates
3. Extract geographic bounds from the atlas features:
   - Calculate minLat, maxLat, minLon, maxLon
4. Display preview to user showing:
   - Atlas name and page count
   - Calculated bounds (south, west, north, east)
   - Page grid visualization
5. On confirmation, store in campaign state:
   - state.map.atlas = { id, title, pages: [...] }
   - state.map.bounds = { south, west, north, east }
```

**Step 4: Validate Bounds**

The bounds are validated against the campaign-package-contract.js requirements:
```javascript
// From campaign-package-contract.js
const { south, west, north, east } = input.map.bounds || {};
if (![south, west, north, east].every(Number.isFinite)
  || south < -90 || north > 90 || west < -180 || east > 180 
  || south >= north || west >= east) {
  fail("The setup package needs valid campaign-area bounds.");
}
```

**Step 5: Generate Hex Grid**

Once bounds are set, the system generates a **10 km travel-scale hex grid**:
```javascript
// Grid coordinates use axial Q-R system
// Each hex = 10 km travel-scale cell
// Origin = northwest corner of atlas bounds
// Grid is used for:
//   - Terrain assignment
//   - Faction influence mapping
//   - Location placement (hex references)
```

### Data Stored from Field Papers

In the campaign setup state:
```javascript
state.map = {
  bounds: { south: 59, west: 13, north: 61, east: 15 },
  center: { lat: 60, lng: 14 },
  zoom: 8,
  fieldPapersAtlas: { id: "atlas-12345" },
  grid: {
    coordinateSystem: "axial-q-r",
    cellKm: 10,
    terrainCells: [
      { q: 1, r: -2, terrainType: "forest" },
      { q: 0, r: -1, terrainType: "clear" }
      // ... more cells
    ]
  }
}
```

### UI Flow in Campaign Setup

```
Step 02: Import atlas
├─ Field Papers atlas import
│  ├─ Button: "Import atlas GeoJSON"
│  ├─ File input (accepts .json, .geojson)
│  ├─ Preview: Shows atlas name, bounds, page grid
│  └─ Button: "Apply imported atlas"
│
└─ Online/Offline Basemap selection
   ├─ Option A: Online OpenStreetMap reference (default)
   └─ Option B: Upload offline PMTiles archive
```

---

## Workflow 2: Offline Basemap Upload (PMTiles)

### Purpose
- Provides **persistent offline map tiles** for the campaign
- Supports both **raster** (PNG/JPEG/WebP/AVIF) and **vector** (MVT) tile formats
- Serves tiles to GM, Campaign Setup Tool, and Players via HTTP byte-range requests

### PMTiles Format

**PMTiles v3** is a single-file archive containing map tiles:
- **Raster format**: PNG, JPEG, WebP, AVIF tiles (standard map images)
- **Vector format**: MVT (Mapbox Vector Tile) tiles (lightweight, styleable)
- **Size limit**: 50 MiB
- **File location**: `data/maps/atlas/{assetId}.pmtiles`

### How Upload Works

**Step 1: GM Prepares the Archive**
```
GM obtains a PMTiles v3 archive (from:)
- MapBox
- Felt
- PMTiles.io
- Custom tools
- Offline editing tools

Requirements:
- Valid PMTiles v3 file
- License permits: offline use, local use, player distribution
- Must provide: attribution text + HTTPS license URL
- Max size: 50 MiB
```

**Step 2: Upload in Campaign Setup Tool**
```html
<!-- In campaign-setup.html -->
<div class="offline-basemap-tools">
  <input id="offline-basemap-attribution" 
         placeholder="Exact required map credit"
         maxlength="300">
  <input id="offline-basemap-license-url" 
         type="url"
         placeholder="https://…"
         maxlength="2048">
  <input id="offline-basemap-file" 
         type="file"
         accept=".pmtiles">
  <button id="upload-offline-basemap">Upload and use</button>
</div>
```

**Step 3: Server-Side Upload Handler**

From [offline-basemaps.cjs](/C:/Users/hemuli/Twilight2000-GM-Tool/server/offline-basemaps.cjs):

```javascript
async function uploadOfflineBasemap(request, directory, ownerAccountId) {
  // 1. Validate content type
  if (!contentType includes 'pmtiles' or 'octet-stream') {
    throw "Upload a PMTiles archive"
  }
  
  // 2. Stream file and enforce 50 MiB limit
  chunks = []
  for await chunk of request:
    byteLength += chunk.length
    if byteLength > 50 * 1024 * 1024:
      throw "Offline basemaps must be no larger than 50 MiB"
    chunks.push(chunk)
  
  // 3. Validate PMTiles v3 magic header
  data = Buffer.concat(chunks)
  if data[0:7].toString("ascii") !== "PMTiles" || data[7] !== 3:
    throw "Choose a valid PMTiles v3 archive"
  
  // 4. Detect tile format
  tileType = data[99]
  format = (tileType === 1) ? "vector-pmtiles" : "raster-pmtiles"
  
  // 5. Store the archive
  assetId = randomUUID()  // e.g., "550e8400-e29b-41d4-a716-446655440000"
  writeFile(`${assetId}.pmtiles`, data)
  writeFile(`${assetId}.json`, {
    assetId,
    ownerAccountId,
    byteLength: data.length,
    format
  })
  
  return { assetId, byteLength, format }
}
```

**Step 4: Store Metadata Sidecar**

For each PMTiles archive, a JSON sidecar is created:
```json
// data/maps/atlas/550e8400-e29b-41d4-a716-446655440000.json
{
  "assetId": "550e8400-e29b-41d4-a716-446655440000",
  "ownerAccountId": "gm-user-123",
  "byteLength": 48392192,
  "format": "raster-pmtiles"
}
```

**Purpose of sidecar:**
- Tracks who uploaded the archive (ownership)
- Records file size for quota tracking
- Identifies tile format (raster vs. vector)
- Enables migration/backup procedures

### How Tiles Are Served

From [offline-basemaps.cjs](/C:/Users/hemuli/Twilight2000-GM-Tool/server/offline-basemaps.cjs) - `sendOfflineBasemap()`:

```javascript
function sendOfflineBasemap(request, response, directory, assetId) {
  // 1. Validate asset ID (UUID format)
  if (!assetId.match(UUID_PATTERN))
    return false
  
  // 2. Get file size
  filePath = directory + "/" + assetId + ".pmtiles"
  fileSize = stat(filePath).size
  
  // 3. Handle HTTP Range requests (for efficient tile streaming)
  range = request.headers["range"]  // e.g., "bytes=1000-2000"
  
  if range is present:
    // Parse range header (e.g., "bytes=0-1023")
    start = parse range start
    end = parse range end
    status = 206  // Partial Content
  else:
    // Full file request
    start = 0
    end = fileSize - 1
    status = 200
  
  // 4. Send file with proper headers
  response.writeHead(status, {
    "Content-Type": "application/vnd.pmtiles",
    "Content-Length": (end - start + 1),
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600, immutable",
    "X-Content-Type-Options": "nosniff"
  })
  
  if status === 206:
    response.headers["Content-Range"] = `bytes ${start}-${end}/${fileSize}`
  
  // 5. Stream the file
  stream(filePath, { start, end }).pipe(response)
}
```

### Why Byte-Range Requests?

**PMTiles are efficient because:**
- Only necessary tiles are downloaded (browser requests specific ranges)
- Large archives don't all download at once
- Supports streaming on slow connections
- HTTP 206 "Partial Content" response signals successful range request
- Client libraries (Leaflet, MapLibre) use ranges automatically

**Example range request sequence:**
```
Browser: GET /map/asset-uuid.pmtiles
         Range: bytes=0-1023
Server:  206 Partial Content
         Content-Range: bytes 0-1023/48392192
         [tile data]

Browser: (needs another tile)
         Range: bytes=45000-46023
Server:  206 Partial Content
         Content-Range: bytes 45000-46023/48392192
         [tile data]
```

### Integration with Campaign Data

Once uploaded, the basemap is stored in the campaign setup state:
```javascript
state.map.offlineBasemap = {
  assetId: "550e8400-e29b-41d4-a716-446655440000",
  format: "raster-pmtiles",
  attribution: "Custom Map Data © 2024 Local Provider",
  licenseUrl: "https://maps.example.com/license"
}
```

When exported as setup package JSON, it becomes:
```json
{
  "map": {
    "offlineBasemap": {
      "assetId": "550e8400-e29b-41d4-a716-446655440000",
      "format": "raster-pmtiles",
      "attribution": "Custom Map Data © 2024 Local Provider",
      "licenseUrl": "https://maps.example.com/license"
    }
  }
}
```

---

## How Maps Display

### In Campaign Setup Tool

**Leaflet.js Map** shows:
1. **Base layer**: 
   - Online: OpenStreetMap tiles (default)
   - Offline: PMTiles archive (if uploaded) with custom attribution
2. **Overlay layers**:
   - 10 km hex grid (terrain cells)
   - Field Papers atlas page grid (if imported)
   - Drawn area bounds
   - Terrain cell highlighting
   - Location markers
   - Faction influence coloring

### In GM Runtime

**Map-publications.cjs** handles what GM publishes to players:
- GM selects which locations/markings are visible
- GM controls published route and party position
- Players see only published information
- Map publication state is versioned and audited

### In Player Interface

Players see:
- Published campaign map (read-only)
- Their assigned character's position
- Published locations and routes
- Scroll and zoom (up to 200%) 
- Reset to center on assigned position
- No ability to change campaign map state

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    USER ACTIONS                              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. Download Field Papers GeoJSON                           │
│     └─> "atlas-12345.geojson"                              │
│                                                               │
│  2. Obtain PMTiles archive                                  │
│     └─> "northern_sweden.pmtiles" (50 MiB max)             │
│                                                               │
│  3. Upload in Campaign Setup Tool                           │
│     ├─ Attribution: "© MyMapProvider"                       │
│     ├─ License URL: "https://…/license"                     │
│     └─ PMTiles file                                         │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│              CAMPAIGN SETUP TOOL (Browser)                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  Parse GeoJSON ──> Extract bounds (S,W,N,E)                │
│                                                               │
│  Validate bounds:                                           │
│  - Lat: [-90, 90]                                           │
│  - Lon: [-180, 180]                                         │
│  - South < North, West < East                              │
│                                                               │
│  Generate 10 km hex grid                                    │
│  ├─ Coordinate system: axial-q-r                           │
│  ├─ Origin: NW corner of bounds                            │
│  └─ Terrain cells: {}                                       │
│                                                               │
│  Store map metadata:                                        │
│  ├─ Bounds                                                  │
│  ├─ Center (calculated)                                    │
│  ├─ Zoom level                                             │
│  ├─ Field Papers atlas reference                          │
│  ├─ Offline basemap reference (assetId)                   │
│  └─ Attribution                                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│          SERVER: offline-basemaps.cjs (Upload)              │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  POST /api/campaigns/upload-basemap                         │
│                                                               │
│  1. Validate Content-Type (vnd.pmtiles)                     │
│  2. Stream file, enforce 50 MiB limit                       │
│  3. Validate PMTiles v3 magic header                        │
│  4. Detect format (vector or raster)                        │
│  5. Generate UUID assetId                                  │
│  6. Write to disk:                                          │
│     ├─ data/maps/atlas/{assetId}.pmtiles                   │
│     └─ data/maps/atlas/{assetId}.json (metadata)           │
│  7. Return assetId to client                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│            CAMPAIGN SETUP STATE (Browser)                    │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  state.map = {                                              │
│    bounds: { south, west, north, east },                   │
│    center: { lat, lng },                                    │
│    zoom: 8,                                                 │
│    fieldPapersAtlas: { id: "atlas-12345" },               │
│    grid: {                                                  │
│      coordinateSystem: "axial-q-r",                        │
│      cellKm: 10,                                            │
│      terrainCells: [                                       │
│        { q: 1, r: -2, terrainType: "forest" },            │
│        { q: 0, r: -1, terrainType: "clear" }              │
│      ]                                                      │
│    },                                                        │
│    offlineBasemap: {                                        │
│      assetId: "550e8400-e29b-41d4-a716-446655440000",    │
│      format: "raster-pmtiles",                            │
│      attribution: "© MyMapProvider",                       │
│      licenseUrl: "https://maps.example.com/license"       │
│    }                                                        │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│        EXPORT SETUP PACKAGE (schema v2 JSON)                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  campaign-setup-package.json                               │
│  {                                                          │
│    "packageType": "fieldbook.campaign-setup",              │
│    "schemaVersion": 2,                                      │
│    "map": {                                                 │
│      "bounds": { ... },                                    │
│      "grid": { ... },                                      │
│      "fieldPapersAtlas": { ... },                         │
│      "offlineBasemap": { ... },                           │
│      "offlineAnnotations": [ ... ]                        │
│    },                                                       │
│    "locations": [ ... ],                                  │
│    "factions": [ ... ],                                   │
│    "settlements": [ ... ],                                │
│    "scenarioNotes": [ ... ]                               │
│  }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│        GM RUNTIME: Import Package                            │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  POST /api/campaigns/import-setup                           │
│                                                               │
│  1. Validate schema v2                                      │
│  2. Extract campaign metadata                              │
│  3. Create runtime campaign ID                             │
│  4. Store setup package in database                        │
│  5. Import all map data:                                   │
│     ├─ bounds                                              │
│     ├─ terrain cells                                       │
│     ├─ locations                                           │
│     ├─ factions                                            │
│     └─ settlements                                         │
│  6. Create player party faction                            │
│  7. Return campaign ID                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│       RUNNING CAMPAIGN: Display Maps                         │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  GM Runtime (index.html)                                    │
│  └─ Leaflet + MapLibre GL                                  │
│     ├─ Base layer: PMTiles via HTTP ranges                 │
│     ├─ Map markings (terrain, locations)                   │
│     ├─ Faction influence overlay                           │
│     └─ Party position indicator                            │
│                                                               │
│  Player Interface (player-interface.html)                   │
│  └─ Leaflet + MapLibre GL                                  │
│     ├─ Published map only (read-only)                      │
│     ├─ Published locations                                 │
│     ├─ Party position (GM-set)                             │
│     └─ Zoom up to 200%, scroll, reset button              │
└─────────────────────────────────────────────────────────────┘
```

---

## Security & Permissions

### Basemap Upload
- **Ownership**: Tied to uploading GM account
- **Access**: Served via authenticated API to authorized players
- **Verification**: PMTiles magic header validated (prevents arbitrary files)
- **License**: Attribution and license URL required (not automatically verified)

### Byte-Range Serving
- **Permission check**: Verified before sending any data
- **Authenticated**: Via session cookie
- **Immutable**: Once uploaded, archives cannot be modified
- **Versioned**: Campaign setup package stores asset ID reference

### Player-Facing Maps
- **Read-only**: Players cannot modify map state
- **Projection**: Only published GM selections visible
- **Movement**: Player position controlled by GM only

---

## File Organization

```
Repository:
├── campaign-setup.html          # Campaign authoring UI
├── campaign-package-contract.js # Schema validation
├── server/
│   ├── offline-basemaps.cjs     # PMTiles upload & serving
│   ├── app.cjs                  # HTTP endpoints
│   └── runtime-store.cjs        # Campaign storage
└── gmpack/                      # Game data (not maps)

Deployment:
├── t2k-gm-tool/
│   ├── campaign-setup.html
│   ├── server/
│   └── data/
│       └── maps/
│           └── atlas/           # PMTiles storage
│               ├── {assetId}.pmtiles
│               └── {assetId}.json
```

---

## Key Design Decisions

1. **Two-Step Map Definition**
   - **Step 1**: Field Papers (bounds) - free, user-driven, browser-based
   - **Step 2**: Basemap (tiles) - optional, GM-provided, enables offline play

2. **Offline-First Architecture**
   - Assumes unreliable internet in conflict zones
   - PMTiles enables complete offline operation
   - Attribution required for licensing compliance

3. **Byte-Range Serving**
   - Large archives don't block gameplay
   - Tiles stream on demand
   - Efficient bandwidth usage

4. **Schema Validation**
   - Setup packages are schema-versioned
   - Enables future upgrades without breaking imports
   - Contracts enforced at authorship and import time

5. **Sidecar Metadata**
   - Separated from PMTiles archive
   - Enables migration, backup, quota tracking
   - Ownership model enforced

---

## Example: Complete Import Flow

```
1. GM downloads Field Papers GeoJSON
   File: "sweden-map-atlas-55.geojson"

2. GM obtains offline map (PMTiles)
   File: "sweden-topo-10m.pmtiles" (25 MB)
   License: CC-BY-SA with attribution

3. Campaign Setup Tool Step 2: Import atlas
   - Imports sweden-map-atlas-55.geojson
   - Extracts bounds: S=59, W=13, N=61, E=15
   - Generates 10 km hex grid (approx 20x20 cells)
   - Uploads sweden-topo-10m.pmtiles
   - Stores attribution: "© OpenStreetMap contributors"
   - Stores license: "https://creativecommons.org/licenses/by-sa/2.0/"

4. Server processes upload
   - Validates PMTiles v3 header
   - Detects raster format
   - Generates assetId: "a1b2c3d4-e5f6-4g7h-8i9j-k0l1m2n3o4p5"
   - Saves to: data/maps/atlas/a1b2c3d4-e5f6-4g7h-8i9j-k0l1m2n3o4p5.pmtiles
   - Saves metadata: data/maps/atlas/a1b2c3d4-e5f6-4g7h-8i9j-k0l1m2n3o4p5.json

5. Campaign Setup continues (Step 3: Terrain)
   - Map displays with terrain hex grid overlay
   - GM clicks hexes to assign terrain types
   - Map visualization uses PMTiles for background

6. Export setup package
   - Includes assetId reference (not the entire PMTiles file)
   - Package size: ~50 KB (not 25 MB)
   - Schema v2 validation passes

7. GM Runtime Import
   - Party imports setup package
   - Creates new campaign
   - Stores assetId reference in campaign record
   - Creates player party faction at starting location

8. Campaign Play
   - GM and players access campaign
   - Map loads:
     * Browser requests: GET /map/asset/{assetId}.pmtiles Range: bytes=0-1023
     * Server responds: 206 Partial Content with tile data
     * Browser renders with attribution
   - Multiple range requests load only needed tiles

9. Player Interface
   - Players see published map (read-only)
   - Zoom, scroll, reset button work
   - Party position indicator shows GM-set location
   - Attribution displayed: "© OpenStreetMap contributors"
```

---

## Limitations & Future Work

**Current Limitations:**
- No in-tool PMTiles creation (must be external)
- Attribution not automatically verified (GM responsibility)
- No tile inspection tool (what's in each tile)
- Field Papers dependency (could add other atlas sources)
- No map editing after import (immutable design)

**Future Enhancements:**
- Integration with Felt.com for easier PMTiles export
- Built-in tile format conversion
- Map annotation import (beyond bounds)
- Collaborative atlas sharing between GMs
- Tile caching/preload strategies
- Map comparison tools (before/after states)
