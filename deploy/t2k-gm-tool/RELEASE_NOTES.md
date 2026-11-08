# Fieldbook v1.2.1 live-testing build

Built 08 Nov 2026 from source commit
`e591d10533030cd9409273c514f85e2d2b282cb2` (merged PRs #25, #26, and #27).
This is a live-testing package, not a new numbered release.

## What's included

- Campaign Setup uses the MapTiler online map to select a geographic campaign
  extent and supports static-image campaigns with an explicit GM-entered scale.
- Saved setup packages can be reviewed and imported as separate GM-owned
  runtime campaigns. Static-image assets are saved with their metadata sidecars.
- The GM runtime supports published map layers and retains campaign selection
  when a campaign load fails, allowing the GM to retry.
- The Player Interface continues to show only information explicitly published
  by the GM. See `metadata/FEATURES.md` and `metadata/ROADMAP.md` for current
  implementation status and limitations.

## Install

- Requires Node.js 24 or newer.
- On Windows, run `INSTALL_SERVER.ps1` or `INSTALL_SERVER.bat` for first-time
  dependency installation and bootstrap-token creation.
- Run `npm ci`, then `npm start`.
- The default GM URL is `http://localhost:8081/`; players use
  `http://SERVER-IP:8080/`.
- Use HTTP only on a trusted LAN. Do not expose these ports to the internet.

Dependencies are not bundled. The initial `npm ci` requires network access.
Campaign Setup may use a GM-supplied MapTiler key at runtime; no API key is
included in this package.

## Live-testing package contents

The ZIP excludes campaign databases, uploaded maps, account credentials,
bootstrap tokens, logs, installed dependencies, tests, and previous archives.
It does not include source map-generator data. Transfer licensed map archives
and their matching JSON sidecars separately; preserve their attribution and
license information.

This package is built from the `1.2.1` application version without assigning a
new release number. Its deployment manifest records the exact source commit
and SHA-256 hashes for every other packaged file.
