# Quick Start Guide

## 30-Second Installation

### Prerequisites
- Windows 10/11
- Node.js 24+ installed (https://nodejs.org/)
- ~2 GB free disk space

### Install and Run

1. **Double-click** `INSTALL_SERVER.bat`
2. Wait for installation (2-5 minutes)
3. **Double-click** `run.cmd` (or `npm start`)
4. Open browser: http://localhost:3000
5. Login: admin / admin
6. **Change password in Settings immediately!**

## Done!

You now have:
- ✅ GM Tool running on http://localhost:3000
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

Share: `http://YOUR-IP:3000/player-interface.html`

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
| GM Tool | http://localhost:3000 |
| Player Interface | http://localhost:3000/player-interface.html |
| Campaign Setup | http://localhost:3000/campaign-setup.html |
| On network | http://YOUR-IP:3000 |

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

⚠️ **Important:** Change the admin password in Settings as soon as you log in!

Default credentials are for setup only. Use a strong password for security.

## Backup Your Data

Your data is in the `data/` folder:
- `campaigns.db` — All your campaigns
- `backups/` — Automatic backups

Back it up regularly to a safe location!

## Need Help?

1. Check INSTALLATION.md for detailed setup
2. Review FEATURES.md for tool capabilities
3. Check ROADMAP.md for feature status
4. Server console shows detailed error messages

---

**Ready to play?** Go create your campaign! 🎮
