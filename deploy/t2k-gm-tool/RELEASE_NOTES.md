# Fieldbook v1.2.1

Released 05 Nov 2026. Application source includes merged commit
`3a000d3747bb35bc04dca23db6aadf09f6d52976`.

## Static image campaign maps

Campaign Setup, GM runtime, and Player Interface now support PNG, JPEG, and
WebP backgrounds up to 50 MiB. Images stretch to the editable geographic campaign
bounds beneath existing locations, routes, markings, and terrain overlays.
Use a north-up image whose extent and projection match those bounds.

In Campaign Setup, open **Base map**, enter bounds, select **Static map image**,
and upload the image with attribution. A Field Papers atlas is not required.

For an existing campaign, open **Player map > Campaign map background** in the
GM Tool. Apply an image or switch back to online OSM. This updates GM maps only;
preview and publish separately to change the player map. Players retain read-only
pan, zoom up to 200%, and reset to the GM-set position.

Use only images you have permission to share. Anything already drawn into a
published image is visible to players; there is no fog mask. Attribution is
required, and an HTTPS license link is optional for GM-owned images.

## Installation

- Requires Node.js 24 or newer. Install dependencies with `npm ci`.
- Windows first-time installation: run `INSTALL_SERVER.ps1` or
  `INSTALL_SERVER.bat`. The installer generates a local bootstrap token.
- Start with `npm start`. The default GM URL is `http://localhost:8081/`;
  players use `http://SERVER-IP:8080/`.
- Use HTTP only on a trusted LAN. Do not expose these ports to the internet.
- Dependencies are not bundled. The initial `npm ci` requires network access;
  image rendering uses local files after installation.

## Upgrading and backups

Stop the existing server and back up its entire `data` directory before
replacing application files. Preserve that directory and the existing bootstrap
configuration; do not rerun first-time setup over an established installation.
Run `npm ci` in the updated folder before restarting.

The ZIP contains no campaign database, account credentials, token, uploaded maps,
logs, or installed dependencies. Setup JSON and runtime backups retain image
references, not the binaries. Transfer each `data/maps/atlas/<assetId>.image`
and matching `<assetId>.json` sidecar together; PMTiles archives also require
their matching sidecars. Keep the campaign/runtime backup alongside those files.

## Verification and limitations

The source regression suite passed all 287 tests. Browser checks covered image
setup, export/reimport, GM route/influence maps, publication, source switching
without changing the current publication, and player pan/zoom/reset with no
online tile requests.

This release does not complete the broader rules engine or fix the pre-existing
missing dashboard initialization for freshly imported setup campaigns. See
`metadata/FEATURES.md` and `metadata/ROADMAP.md` for current feature status.
Older deployment documents describe previous packages; these release notes and
the current feature/status documents take precedence.
