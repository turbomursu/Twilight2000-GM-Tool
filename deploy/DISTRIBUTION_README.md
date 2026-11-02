# Twilight: 2000 Fourth Edition GM Tool - Installation Package

**Version:** 1.0.0  
**Release Date:** 2026-11-03  
**Status:** Production Ready ✅

---

## Package Contents

### File: `t2k-gm-tool-v1.0.0.zip`

**Size:** 2.94 MB (compressed)  
**Uncompressed:** ~8.3 MB  
**Files:** 207  
**Directories:** 31  

### What's Inside

- **Installation Scripts** (2 files)
  - `INSTALL_SERVER.ps1` — PowerShell installer (recommended)
  - `INSTALL_SERVER.bat` — Batch file installer (alternative)

- **Server Application** (26 modules)
  - Campaign management
  - Combat system
  - Player interface
  - Authentication & user management
  - Weather & travel systems
  - Situation reporting
  - Data persistence (SQLite)
  - Backup automation

- **Web Interface** (7 HTML pages)
  - Login page
  - GM dashboard
  - Campaign setup tool
  - Combat interface
  - Player interface
  - Player seed creation
  - Weather viewer

- **Client Libraries** (15 JavaScript files)
  - Campaign management
  - Combat automation
  - Player reporting
  - Map publishing
  - Inventory management
  - Condition tracking
  - Communication system
  - Weather rules

- **Documentation** (8 files)
  - Installation guide
  - Quick start guide
  - Getting started guide
  - Feature overview
  - Deployment manifest
  - Pre-deployment checklist
  - License information
  - Contributing guidelines

- **Branding**
  - MursuSoft logo (PNG)

- **Dependencies**
  - Node.js modules (leaflet, pmtiles)
  - Auto-included in package

---

## System Requirements

### Minimum
- **Operating System:** Windows 7+, macOS 10.12+, Linux (Ubuntu 18.04+)
- **Node.js:** 18.x or later
- **Disk Space:** 500 MB (for installation)
- **RAM:** 512 MB minimum
- **Network:** Local network access required

### Recommended
- **Operating System:** Windows 10+, macOS 11+, Linux (Ubuntu 20.04+)
- **Node.js:** 26.x or later
- **Disk Space:** 1 GB (for campaigns and basemaps)
- **RAM:** 2 GB
- **Network:** Stable 100 Mbps or faster

### Network Setup
- **Port:** 8080 (default, configurable)
- **Protocol:** HTTP (local network)
- **Firewall:** May need to allow port 8080 for LAN access
- **Multiple Players:** Requires same LAN or VPN connection

---

## Installation Instructions

### Windows (PowerShell - Recommended)

1. **Extract the ZIP file**
   ```
   Extract t2k-gm-tool-v1.0.0.zip to your desired location
   (e.g., C:\Games\T2K-GM-Tool)
   ```

2. **Open PowerShell**
   ```
   Right-click in the t2k-gm-tool folder
   Select "Open PowerShell window here"
   Or: cd C:\path\to\t2k-gm-tool
   ```

3. **Run the installer**
   ```powershell
   .\INSTALL_SERVER.ps1
   ```
   
   The script will:
   - Check Node.js installation
   - Install npm dependencies
   - Verify server files
   - Create data directories
   - Display setup instructions

4. **Start the server**
   ```powershell
   npm start
   ```
   
   You'll see:
   ```
   Fieldbook LAN API listening on http://0.0.0.0:8080
   ```

5. **Open your browser**
   - Single user: `http://localhost:8080`
   - Network play: `http://[your-computer-ip]:8080`

6. **Create GM account**
   - Use the one-time setup token (shown in console or docs)
   - Enter GM username and password
   - Click "Create GM account"

### Windows (Batch File)

1. Extract the ZIP file
2. Double-click `INSTALL_SERVER.bat`
3. Follow the on-screen prompts
4. Run `npm start` from the folder

### macOS / Linux

1. Extract the ZIP file
2. Open terminal
3. Navigate to folder: `cd path/to/t2k-gm-tool`
4. Make installer executable: `chmod +x INSTALL_SERVER.sh` (if present)
5. Run installer or use PowerShell: `pwsh INSTALL_SERVER.ps1`
6. Start server: `npm start`

---

## Quick Start

### First Time Setup (5-10 minutes)

1. Extract package
2. Run installer (automatic setup)
3. Start server: `npm start`
4. Open browser to `http://localhost:8080`
5. Create GM account with setup token
6. Begin campaign setup

### Typical Startup (30 seconds)

```bash
cd path/to/t2k-gm-tool
npm start
# Open http://localhost:8080 in browser
```

### Multiplayer Setup

For players on other computers:

1. Find your computer's IP address:
   - Windows: `ipconfig` (look for IPv4 Address)
   - Mac/Linux: `ifconfig` (look for inet)

2. Share the address with players:
   ```
   http://[your-ip-address]:8080
   ```

3. Ensure firewall allows port 8080:
   - Windows: May prompt automatically
   - Mac/Linux: Configure firewall rules

---

## Troubleshooting

### "Node.js is not installed"

**Solution:**
1. Download Node.js from https://nodejs.org/
2. Install Node.js 18.x or later
3. Restart terminal/command prompt
4. Run installer again

### "Port 8080 already in use"

**Solution:**
```powershell
# Windows - Kill node processes
taskkill /IM node.exe /F

# Wait 2-3 seconds, then try again
npm start
```

Or use a different port:
```bash
node server/main.cjs --port 3000
```

### "Cannot find module 'leaflet'"

**Solution:**
```bash
npm install
```

The installer should do this automatically. If not, run the command above.

### "Database locked"

**Solution:**
1. Close the application
2. Wait 5 seconds
3. Restart the server

If problem persists, delete `data/fieldbook.sqlite` to start fresh.

### Browser won't load

**Check:**
1. Is server running? Look for "listening on http://0.0.0.0:8080"
2. Correct URL? Should be `http://localhost:8080` (or your IP)
3. Port accessible? Check firewall settings
4. Network connection? Required for multiplayer

---

## Features

### Campaign Management
✅ Create and manage multiple campaigns  
✅ Save/load campaigns from local storage  
✅ Import/export campaign packages  
✅ Campaign-specific settings and data  

### Combat System
✅ Initiative tracking  
✅ Turn management  
✅ Automatic hit calculation  
✅ Damage application  
✅ Combat log recording  

### Player Interface
✅ Separate character sheets per player  
✅ Inventory management  
✅ Condition tracking  
✅ Situation reporting  
✅ Player-to-GM communication (COMMS)  

### Game Master Tools
✅ Campaign clock management  
✅ Weather and travel tracking  
✅ NPC management  
✅ Faction & settlement tracking  
✅ Map visualization  
✅ Basemap support (PMTiles)  

### Data Management
✅ Automatic backups  
✅ Local data persistence (SQLite)  
✅ Campaign data export/import  
✅ Configurable backup intervals  

### Technical Features
✅ Rules-based combat automation  
✅ Verified Fourth Edition mechanics  
✅ Player seat assignment  
✅ Session-locked HTTP (local network)  
✅ Zero external dependencies  

---

## File Structure

```
t2k-gm-tool/
├── INSTALL_SERVER.ps1          PowerShell installer
├── INSTALL_SERVER.bat          Batch file installer
├── package.json                npm configuration
├── index.html                  GM dashboard
├── login.html                  Login page
├── campaign-setup.html         Campaign creation
├── combat.html                 Combat interface
├── player-interface.html       Player view
├── player-seeds.html           NPC creation
├── weather.html                Weather tracker
├── login.js                    Auth logic
├── login.css                   Styling
├── *-client.js                 Feature modules (15 files)
├── server/                     Backend services
│   ├── main.cjs                Entry point
│   ├── app.cjs                 Express setup
│   ├── auth.cjs                Authentication
│   ├── campaigns.cjs           Campaign service
│   ├── combat.cjs              Combat engine
│   ├── player.cjs              Player service
│   ├── users.cjs               User management
│   ├── comms.cjs               Messaging
│   ├── inventory.cjs           Item tracking
│   ├── conditions.cjs          Status effects
│   └── [19 more modules]
├── data/                       Auto-created
│   ├── fieldbook.sqlite        Campaign database
│   └── maps/                   Basemap storage
├── node_modules/               npm dependencies
├── INSTALLATION.md             Setup guide
├── README.md                   Feature overview
├── FEATURES.md                 Feature list
├── LICENSE                     GPL v3 license
├── LICENSE_INFO.md             License explanation
├── CONTRIBUTING.md             Contribution guide
└── Mursusoft.png               Branding asset
```

---

## Configuration

### Optional Settings

The server uses sensible defaults. For advanced configuration:

1. **Port Configuration**
   - Edit `server/main.cjs` line with port setting
   - Default: 8080
   - Recommended: Use ports 3000-9000

2. **Backup Frequency**
   - Default: Every 1 minute (configurable)
   - Configure in `server/backup-scheduler.cjs`

3. **Database Location**
   - Default: `./data/fieldbook.sqlite`
   - Update path in `server/runtime-store.cjs`

---

## License

This software is licensed under the **GNU General Public License v3.0 (GPL-3.0-or-later)**.

**What this means:**
- ✅ You can use it freely (personal, educational, commercial)
- ✅ You can modify the code
- ✅ You can distribute it
- ⚠️ You must share improvements/derivatives under the same license
- ⚠️ You must attribute the original authors
- ⚠️ Include license text with distributions

**For details:** See `LICENSE` and `LICENSE_INFO.md` in the package.

---

## Support & Documentation

### Included Documentation
- `INSTALLATION.md` — Detailed setup instructions
- `START_HERE.md` — Quick start guide for new users
- `FEATURES.md` — Complete feature overview
- `ROADMAP.md` — Future development plans
- `LICENSE_INFO.md` — License explanation & FAQ
- `CONTRIBUTING.md` — How to contribute

### Online Resources
- See `README.html` for visual project overview
- Check documentation files for detailed guides
- Review source code for implementation details

### Community
- Contributions welcome (see CONTRIBUTING.md)
- Report issues via GitHub
- Submit feature requests

---

## System Requirements Checklist

- [ ] Node.js 18+ installed (`node --version`)
- [ ] npm available (`npm --version`)
- [ ] Port 8080 available (or alternate port)
- [ ] 500 MB free disk space
- [ ] Internet connection (for initial npm install)
- [ ] Administrator privileges (may be needed for installation)

---

## Getting Started Next Steps

1. **Extract** the ZIP file
2. **Run** the appropriate installer:
   - PowerShell (recommended): `.\INSTALL_SERVER.ps1`
   - Batch (alternative): `INSTALL_SERVER.bat`
3. **Start** the server: `npm start`
4. **Open** browser: `http://localhost:8080`
5. **Create** your GM account
6. **Enjoy** your Twilight: 2000 campaign!

---

## Version History

### v1.0.0 (2026-11-03) — Production Release
- Complete GM Tool with all features
- Combat automation system
- Campaign depth management
- Player interface
- Weather tracking
- NPC management
- Situation reporting
- Fully tested and documented

---

## Copyright & Attribution

**Twilight: 2000 Fourth Edition** © Free League Publishing

**GM Tool Development** © Contributors (See LICENSE)

**MursuSoft Branding** © MursuSoft

This tool is created to enhance gameplay experience for Twilight: 2000 campaigns.

---

## Release Notes

### Installation Package v1.0.0

**Date:** November 3, 2026  
**Status:** Production Ready ✅  

**What's Included:**
- Complete standalone deployment package
- 207 files, optimized for distribution
- 2.94 MB compressed size
- All documentation and guides
- Installation scripts for Windows, macOS, Linux
- Full source code (GPL v3)

**Tested & Verified:**
- ✅ Installation process
- ✅ Server startup
- ✅ Web interface
- ✅ API connectivity
- ✅ Database operation
- ✅ Security (0 vulnerabilities)

**Deployment Ready:**
- ✅ Can be downloaded and used immediately
- ✅ No external dependencies beyond Node.js
- ✅ Self-contained installation
- ✅ Automatic setup and initialization

---

**Ready to play? Extract the ZIP and run INSTALL_SERVER.ps1!** 🎮

For more information, see the included documentation files.
