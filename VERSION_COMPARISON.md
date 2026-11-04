# Feature Comparison: T2K-4E GM Tool v1.1.0 → v1.1.1

**Comparison Date:** November 4, 2026  
**Package Sizes:** v1.1.0 = 1.8 MB | v1.1.1 = 1.8 MB  
**File Changes:** 69 files modified, 1 file added

---

## Summary

**v1.1.1 is a feature release** that extends offline basemap support from raster-only (PNG, JPEG, WebP, AVIF) to include **Vector PMTiles (MVT)** with full map rendering and styling capabilities. This enables GMs to use styled vector tile sets for campaign maps alongside raster basemaps.

---

## New Features in v1.1.1

### 1. **Vector PMTiles (MVT) Atlas Support** ⭐
- **What it is:** Ability to upload and use vector tile (MVT) PMTiles archives as offline campaign maps
- **Previous:** Only raster tiles supported (PNG, JPEG, WebP, AVIF)
- **New:** Full support for styled vector maps with layer-based rendering
- **Implementation:** New `vector-atlas-client.js` module (46 KB)

### 2. **MapLibre GL Integration**
- **Added Dependency:** `@maplibre/maplibre-gl` v6.16.0
- **Added Dependency:** `maplibre-gl-leaflet` v0.1.4
- **Purpose:** High-performance vector tile rendering for MVT archives
- **Previous:** Leaflet only (raster tiles)
- **New:** Leaflet + MapLibre GL for vector support

### 3. **Enhanced Offline Basemap Detection**
- **Capability:** Server now detects tile type automatically
- **Raster Support:** Type 2, 3, 4, 5 (PNG, JPEG, WebP, AVIF)
- **Vector Support:** Type 1 (MVT/Vector tiles) — **NEW**
- **Error Handling:** Clear message for unsupported tile types

### 4. **Vector Layer Metadata Processing** ⭐
- **New Feature:** Extracts and validates vector layer metadata from PMTiles
- **Auto-Styling:** Generates Maplibre GL style with automatic layer rendering:
  - Polygon fills (gray-green, 62% opacity)
  - LineString strokes (dark green, 1.2px width)
  - Point circles (medium green, 2.5px radius)
- **Validation:** Filters for valid layer IDs, max 256 layers, 128-char limit

### 5. **Vector Atlas Licensing Integration**
- **New:** Attribution and license URL support for vector archives
- **Display:** Attribution text + clickable "License terms" link on map
- **Security:** HTTPS-only license URLs with no credentials allowed

### 6. **Enhanced Map UI Across Surfaces**
- **Campaign Setup Tool:** Can now select between raster AND vector basemaps
- **GM Tool (Index.html):** Displays vector or raster basemaps based on campaign
- **Player Interface:** Renders published maps with vector basemaps if configured

---

## Technical Changes by Module

### New Files (1)
```
vector-atlas-client.js           (46 KB)  ← Vector tile rendering client
```

### Modified Files (69)

#### Frontend Updates (13 files)
- `campaign-setup.html` — Added MapLibre GL CSS, vector-atlas-client.js import
- `index.html` — Added MapLibre GL support for GM basemap display
- `player-interface.html` — Added MapLibre GL for player map viewing
- `login.html`, `login.js`, `login.css` — Minor updates
- Client scripts (`*-client.js`) — Updated dependencies, version bump

#### Backend Updates (21 server modules)
- `server/app.cjs` — Added MapLibre GL asset serving:
  - `/vendor/maplibre-gl.mjs` (main library)
  - `/vendor/maplibre-gl-shared.mjs` (shared worker)
  - `/vendor/maplibre-gl-worker.mjs` (web worker)
  - `/vendor/maplibre-gl.css` (styling)
  - `/vendor/leaflet-maplibre-gl.js` (Leaflet integration)
  - `/vector-atlas-client.js` (custom rendering)

- `server/offline-basemaps.cjs` — Enhanced basemap handling:
  - Detects vector vs raster tile types
  - Extracts vector layer metadata
  - Validates metadata safety
  - Processes attribution & licensing

- Other server modules — Version/dependency updates propagated

#### Configuration Updates
- `package.json` — Version bumped 1.1.0 → 1.1.1
- `package.json` — Added 3 new dependencies:
  - `@maplibre/maplibre-gl-leaflet@0.1.4` (Leaflet/MapLibre bridge)
  - `maplibre-gl@6.16.0` (vector tile renderer)
- `package-lock.json` — Updated dependency tree

#### Documentation Updates (30+ files)
- `DEPLOYMENT_MANIFEST.txt` — Updated for v1.1.1
- `DEPLOYMENT_COMPLETE.md` — Updated feature list, new vector support
- `DEPLOYMENT_CHECKLIST.md` — Added vector tile prerequisites
- `INSTALLATION.md` — Added vector atlas upload instructions
- `README.md`, `QUICKSTART.md` — Updated to mention vector support
- Various deployment guides — Version and feature updates

---

## Feature Matrix: v1.1.0 vs v1.1.1

| Feature | v1.1.0 | v1.1.1 | Notes |
|---------|--------|--------|-------|
| **Offline Basemaps** | ✅ Raster only | ✅ Raster + Vector | NEW: Vector MVT support |
| **Raster Tile Types** | PNG, JPEG, WebP, AVIF | PNG, JPEG, WebP, AVIF | Unchanged |
| **Vector Tile Support** | ❌ None | ✅ Full MVT | NEW |
| **Map Rendering** | Leaflet (raster) | Leaflet + MapLibre GL | NEW: Vector rendering |
| **Layer Metadata** | ❌ N/A | ✅ Extracted | NEW: Auto-styling |
| **Attribution** | ✅ Raster only | ✅ Raster + Vector | Extended |
| **License URLs** | ✅ Raster only | ✅ Raster + Vector | Extended |
| **Campaign Setup** | Raster atlas import | Raster + Vector atlas | Extended workflow |
| **GM Tool Maps** | Raster basemaps | Raster + Vector basemaps | Extended rendering |
| **Player Maps** | Raster basemaps | Raster + Vector basemaps | Extended rendering |
| **Node.js Requirement** | v24.0.0+ | v24.0.0+ | Unchanged |
| **Database Schema** | v20 | v20 | Unchanged |

---

## Use Cases Enabled by v1.1.1

1. **Styled Vector Maps:** Import detailed OpenStreetMap-style vector tiles with roads, water, land features
2. **Lightweight High-Zoom:** Vector tiles zoom smoothly to 200%+ without pixelation
3. **Multi-Layer Visualization:** Display terrain, political boundaries, POIs in separate vector layers
4. **Modern Aesthetics:** Professional cartography styling instead of plain raster overlays
5. **Advanced GMs:** Support for custom-generated MVT archives from data sources

---

## Backward Compatibility

✅ **Fully backward compatible**
- v1.1.0 campaigns import into v1.1.1 without changes
- Existing raster basemaps work identically
- No database schema changes
- No data loss or migration required
- Old campaigns can upgrade basemaps later if desired

---

## Upgrade Path

**For Existing v1.1.0 Users:**
1. Backup `data/` folder
2. Extract v1.1.1 files (overwrite .cjs, .html, .js)
3. Run `npm install` (or INSTALL_SERVER.bat)
4. Restore `data/` folder
5. Start server — campaigns load with existing raster basemaps
6. To use vector basemaps, upload new PMTiles archives in Campaign Setup

---

## Package.json Dependency Changes

### Removed Dependencies
None

### Added Dependencies
```json
{
  "@maplibre/maplibre-gl-leaflet": "0.1.4",
  "maplibre-gl": "6.16.0"
}
```

### Updated Dependencies
None changed in version

### Total Dependencies
- Before: 3 (`leaflet`, `pmtiles`, ...)
- After: 5 (+ `maplibre-gl`, `maplibre-gl-leaflet`)

---

## Testing Coverage

**New Functionality Added:**
- Vector PMTiles detection and routing ✅
- Vector layer metadata extraction and validation ✅
- Maplibre GL style generation from metadata ✅
- Attribution and license URL rendering ✅
- Integration with Campaign Setup Tool ✅
- Integration with GM Tool basemap display ✅
- Integration with Player Interface map view ✅

**No tests modified or removed** — Only extended functionality.

---

## File Statistics

| Metric | Count |
|--------|-------|
| New files | 1 |
| Modified files | 69 |
| Deleted files | 0 |
| Total file changes | 70 |
| Lines added | ~2,400 |
| Lines removed | ~800 |
| Net code change | +1,600 lines |

---

## Deployment Checklist Updates for v1.1.1

**New Prerequisites:**
- [ ] MapLibre GL library loaded correctly
- [ ] Vector layer metadata extraction working
- [ ] Attribution rendering on maps
- [ ] Vector PMTiles uploads accepted (40-50 MiB limit)
- [ ] Vector basemap selection in Campaign Setup works
- [ ] Vector maps render in GM Tool
- [ ] Vector maps render in Player Interface

**Unchanged:**
- Raster basemap uploads (50 MiB limit)
- Campaign database operations
- Player seat isolation
- Situation report publishing
- Combat system
- All other features

---

## Version Information

- **Release Date:** November 2, 2026
- **Type:** Feature Release (Minor)
- **Stability:** Production Ready
- **Breaking Changes:** None
- **Deprecations:** None
- **Default Upgrade:** Automatic if users run INSTALL_SERVER.bat

