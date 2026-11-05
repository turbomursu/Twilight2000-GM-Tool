# Distribution summary / v1.2.1

| Attribute | Value |
|---|---|
| Release date | 05 Nov 2026 |
| Archive | `deploy/t2k-gm-tool-v1.2.1.zip` |
| Size | 1,960,683 bytes |
| Files | 85 |
| Archive root | `t2k-gm-tool` |
| Application source | `3a000d3747bb35bc04dca23db6aadf09f6d52976` |
| Node.js | 24 or newer |
| Default GM / player ports | 8081 / 8080 |

**SHA-256**

```text
35e6d92d4220b0a0f395fe754a0ea8ab496dcb6397632238ebd3395c8e756641
```

## Changes

- Static PNG/JPEG/WebP map backgrounds aligned to editable campaign bounds.
- Standalone image setup without Field Papers.
- GM runtime background switching with explicit player preview/publication.
- Authenticated local image assets, attribution, and image-reference recovery.
- Refreshed staged application files, dependency lock, release notes, and
  first-time installation instructions.
- Source navigation tests exclude distribution copies of status pages.

## Packaging

The ZIP is built from the refreshed `deploy/t2k-gm-tool` directory. The generated
`DEPLOYMENT_MANIFEST.txt` records SHA-256 hashes for all other packaged files.
Campaign data, uploaded maps, credentials, bootstrap tokens, logs,
`node_modules`, test fixtures, and older archives are excluded.

The source regression suite passes all 287 tests. The extracted ZIP is checked
against its manifest and current source, then installed with `npm ci` and
smoke-tested for GM authentication, pages, image scripts, and map dependencies.
Source browser checks cover image setup/export/reimport, GM route/influence maps,
explicit publication, and assigned-player 200% zoom/reset without online tiles.

No campaign data or user-provided licensed archives are bundled. Cross-host map
asset migration and real licensed PMTiles rendering remain open acceptance work;
see the included current feature overview and release notes.
