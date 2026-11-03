# Quick Start Guide

## Quick Installation

### Prerequisites
- Windows 10/11
- Node.js 24+ installed (https://nodejs.org/)
- ~2 GB free disk space

### Install and Run

1. Run `INSTALL_SERVER.bat` or `INSTALL_SERVER.ps1`.
2. If you used the batch installer, open a new terminal.
3. From this folder, run `npm start`.
4. Open `http://localhost:8080`.
5. Enter the bootstrap token from `token.txt`, then create the GM account.

## Done!

You now have:
- GM Tool running on http://localhost:8080
- ✅ Player Interface at /player-interface.html
- ✅ Campaign Setup Tool at /campaign-setup.html
- ✅ Local database for campaigns
- ✅ Automatic backups every 5 minutes

## First Campaign

1. Click **Campaigns** → **+ New Campaign**
2. Enter name and description
3. Use **Campaign Setup Tool** to design:
   - Factions (who controls what)
   - Settlements (where people live)
   - Threats (what endangers them)
   - Map (upload PMTiles if you have one)

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
| GM Tool | http://localhost:8080 |
| Player Interface | http://localhost:8080/player-interface.html |
| Campaign Setup | http://localhost:8080/campaign-setup.html |
| On network | http://YOUR-IP:8080 |

## Common Commands

```bash
# Start server
npm start

# Run tests
npm test

# Stop server
Ctrl+C (in command prompt)
```

## Password Security

The GM chooses a password during first-run setup. GM-created player accounts receive temporary passwords and must replace them at first sign-in.

## Backup Your Data

Your database and local assets are stored in the `data/` folder. Back up this folder and any offline-basemap sidecars regularly.

Back it up regularly to a safe location!

## Need Help?

1. Check INSTALLATION.md for detailed setup
2. Review FEATURES.md for tool capabilities
3. Check ROADMAP.md for feature status
4. Server console shows detailed error messages

---

**Ready to play?** Go create your campaign! 🎮
