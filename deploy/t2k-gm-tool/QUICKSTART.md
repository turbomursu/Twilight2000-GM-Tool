# Quick Start Guide / v1.2.1

## Quick Installation

### Prerequisites
- Windows 10/11
- Node.js 24+ installed (https://nodejs.org/)
- ~2 GB free disk space

### Install and Run

1. Run `INSTALL_SERVER.bat` or `INSTALL_SERVER.ps1`.
2. From this folder, run `npm start`.
3. Open the GM Tool at `http://localhost:8081`.
4. Create the first GM username.

## Done!

You now have:
- GM Tool running on http://localhost:8081
- ✅ Player Interface at /player-interface.html
- ✅ Campaign Setup Tool at /campaign-setup.html
- ✅ Local database for campaigns
- Backup scheduling is GM-configured, not automatically enabled every five minutes.

## First Campaign

Use **Campaign Setup Tool** to create a schema-v2 campaign package with bounds,
terrain, locations, settlements, factions, and GM notes. In **Base map**, choose
a static PNG/JPEG/WebP image or an atlas/PMTiles background. Static images need
editable geographic bounds and attribution; a Field Papers atlas is optional.
See `metadata/FEATURES.md` for current prototype limitations, including dashboard
initialization for freshly imported packages.

For an existing campaign, open **Player map > Campaign map background** to apply
an image or return to online OSM. Preview and publish separately for players.

## For Players

Share: `http://YOUR-IP:8080/player-interface.html`

Players can:
- View their character
- Check inventory
- Review situation reports (what you publish)
- Send messages to GM and other players

## Help

- **Installation issues?** See INSTALLATION.md
- **Feature questions?** See FEATURES.md
- **What's coming?** See ROADMAP.md
- **Server won't start?** See Troubleshooting in INSTALLATION.md

## Key URLs

| Use | URL |
|-----|-----|
| GM Tool | http://localhost:8081 |
| Player Interface | http://localhost:8080/player-interface.html |
| Campaign Setup | http://localhost:8081/campaign-setup.html |
| GM on network | http://YOUR-IP:8081 |
| Players on network | http://YOUR-IP:8080 |

## Common Commands

```bash
# Start server
npm start

# Stop server
Ctrl+C (in command prompt)
```

## Access

Everyone signs in by username only. Anyone with server access can impersonate any player or GM, so use only on a trusted LAN.

## Backup Your Data

Your database and local assets are stored in the `data/` folder. Back up this folder and any offline-basemap sidecars regularly.

See `RELEASE_NOTES.md` before upgrading. Keep `.image`/`.pmtiles` assets with their
matching JSON sidecars: campaign JSON and runtime backups do not embed them.

Back it up regularly to a safe location!

## Need Help?

1. Check INSTALLATION.md for detailed setup
2. Review FEATURES.md for tool capabilities
3. Check ROADMAP.md for feature status
4. Server console shows detailed error messages

---

**Ready to play?** Go create your campaign! 🎮
