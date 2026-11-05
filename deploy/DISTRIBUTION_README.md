# Fieldbook installation package

**Current version:** 1.2.1

**Release date:** 05 Nov 2026

**Archive:** `t2k-gm-tool-v1.2.1.zip`

This package includes static image map backgrounds across Campaign Setup, GM
runtime, and Player Interface. Geographic overlays remain aligned to campaign
bounds, and publishing to players remains a separate explicit action.

## Install

1. Extract the ZIP and open the `t2k-gm-tool` folder.
2. Install Node.js 24 or newer.
3. On Windows, run `INSTALL_SERVER.ps1` or `INSTALL_SERVER.bat` for first-time
   dependency installation and bootstrap-token creation. Read `RELEASE_NOTES.md`
   and `QUICKSTART.md` first.
4. Start with `npm start`.
5. Open the GM Tool at `http://localhost:8081/`. Players use
   `http://SERVER-IP:8080/` with their own GM-created accounts.

Dependencies are not bundled; initial installation needs network access.
Use HTTP only on a trusted LAN, never on an internet-facing server.

## Upgrade

Stop the existing server and back up the entire `data` directory. Preserve that
directory, map binaries with matching JSON sidecars, and existing bootstrap
configuration when replacing application files. Run `npm ci` before restarting.
Do not rerun first-time setup over an established installation.

## Contents and exclusions

The archive contains 85 files under one `t2k-gm-tool` directory: current runtime
source, locked dependencies manifest, installers, license, reference JSON, and
documentation. `DEPLOYMENT_MANIFEST.txt` records individual SHA-256 hashes.

It excludes campaign databases, uploaded maps, account credentials, bootstrap
tokens, logs, installed dependencies, tests, and previous ZIPs. Images and PMTiles
archives must be backed up separately with their matching JSON sidecars; runtime
backups and setup JSON contain only asset references.

Current product limitations remain documented in the included
`metadata/FEATURES.md` and `metadata/ROADMAP.md`; this is not a complete rules
engine. Older deployment documents are historical and do not override the
current release notes.

See `PACKAGE_DISTRIBUTION_SUMMARY.md` for the archive checksum.
