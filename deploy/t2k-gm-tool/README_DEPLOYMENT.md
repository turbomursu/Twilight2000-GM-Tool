# Twilight: 2000 Fourth Edition GM Tool
## Deployment Package v1.1.0

**A complete game master's tool for Twilight: 2000 Fourth Edition tabletop RPG campaigns**

---

## 📦 What's Included

This package contains everything needed to run the GM Tool on Windows, macOS, or Linux:

- **Server Backend** — Node.js-based REST API and database
- **Web Interfaces** — GM Tool, Player Interface, Campaign Setup Tool
- **Campaign Database** — SQLite with automatic schema migration
- **Combat System** — Turn-based combat tracker with Fourth Edition rules
- **Faction Manager** — Track NPCs, relationships, and territories
- **Weather & Travel** — Planning tools with rules integration
- **Situation Reports** — Publish campaign updates to players
- **Automatic Backups** — Every 5 minutes, 100 backups retained

---

## 🚀 Quick Start (2 Minutes)

### 1. Install Node.js
If you don't have Node.js installed:
- Download Node.js 24+ from https://nodejs.org/
- Run the installer with default settings
- Verify: Open Command Prompt and type `node --version`

### 2. Install GM Tool
```bash
# Navigate to the tool folder
cd C:\path\to\t2k-gm-tool

# Run one-time setup
INSTALL_SERVER.bat

# Follow the prompts (takes 2-5 minutes)
```

### 3. Start the Server
```bash
# Start from this folder
npm start
```

### 4. Open in Browser
```
http://localhost:8080
```

Enter the bootstrap token from `token.txt` and create the GM account.

### 5. Player Passwords
GM-created player accounts receive a temporary password. Players must replace it at first sign-in before accessing campaign pages or APIs.

---

## 📋 What This Tool Does

### For Game Masters

✅ **Campaign Management**
- Create and manage multiple campaigns
- Set up factions, settlements, and threats
- Track NPCs and relationships
- Record campaign events and rumors
- Manage resources and supply chains

✅ **Combat System**
- Turn-based combat tracker
- Support for infantry, vehicles, and heavy weapons
- Opposed rolls for attack/defense
- Damage calculation with armor
- Fatigue and condition tracking

✅ **Session Planning**
- Weather generation with terrain modifiers
- Travel planning with supply consumption
- Scenario templates and encounter design
- Mission briefing preparation

✅ **Player Management**
- Create player accounts with individual characters
- Assign seats and character sheets
- Publish situation reports to players
- Track inventory and equipment
- Record player actions and decisions

✅ **Maps & Territory**
- Upload offline maps (PMTiles format)
- Mark factions, settlements, threats
- Publish route and player positions
- Support up to 200% zoom on published map

✅ **Audit Trail**
- Complete history of all campaign changes
- Owner-only journal entries
- Backup and recovery options
- Event logging and timestamps

### For Players

✅ **Character Sheet**
- View assigned character
- Check inventory and equipment
- Review conditions and status
- See situation reports (GM-published only)

✅ **Communication**
- Send messages to GM and other players
- Include game time with messages
- See message history

✅ **Map View**
- Browse published map
- Scroll and zoom (up to 200%)
- See GM-marked positions
- View accessible areas

✅ **Campaign Participation**
- Track ongoing missions
- Participate in combat (dice rolls via GM)
- Manage character inventory
- View faction and settlement information (as revealed)

---

## 📂 Installation Locations

### Windows
```
C:\Users\YourName\Desktop\t2k-gm-tool\
C:\Games\t2k-gm-tool\
C:\Program Files\Twilight2000-GM\
```

### macOS
```
~/Desktop/t2k-gm-tool/
~/Applications/Twilight2000-GM/
```

### Linux
```
~/t2k-gm-tool/
/opt/t2k-gm-tool/
```

**Important:** Use a path without spaces if possible (easier command-line access)

---

## 💻 System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|------------|
| **OS** | Windows 10, macOS 10.15, Ubuntu 18.04 | Windows 11, macOS 12+, Ubuntu 20+ |
| **Node.js** | 24.0.0 | 24.x (latest LTS) |
| **RAM** | 4 GB | 8 GB |
| **Disk** | 2 GB free | 10 GB free |
| **Browser** | Chrome 90+, Firefox 88+ | Chrome 120+, Firefox 120+, Edge 120+ |

### For Single Player
- Localhost only
- ~500 MB RAM
- Wired connection (not required)

### For Network Play (LAN)
- Same WiFi or Ethernet network
- GM computer: 2+ GB RAM
- Player computers: ~200 MB RAM each
- Wired connection recommended for smooth play

---

## 🔧 Installation Files Explained

| File | Purpose | When to Use |
|------|---------|-----------|
| **INSTALL_SERVER.bat** | One-time setup | First installation (required) |
| **npm start** | Start server | From the package folder |
| **INSTALLATION.md** | Detailed setup guide | Full setup instructions |
| **QUICKSTART.md** | 30-second guide | Quick reference |
| **DEPLOYMENT_MANIFEST.txt** | File listing | What's included |

---

## 🎮 Your First Campaign

### Step 1: Create Campaign
1. Click **Campaigns** in the main menu
2. Click **+ New Campaign**
3. Enter campaign name and description
4. Click **Create**

### Step 2: Design Campaign
1. Click **Campaign Setup Tool**
2. Add factions (major powers, organizations, groups)
3. Add settlements (cities, bases, towns)
4. Set relationships between factions
5. Add threats (enemies, conflicts, disasters)
6. Optionally upload map (PMTiles format)

### Step 3: Create NPCs
1. Click **Personnel** or **NPC Roster**
2. Click **+ Add NPC**
3. Fill in details:
   - Name, role, affiliation
   - Skills, equipment, motivations
   - Connections to factions/settlements
4. Save and organize by type

### Step 4: Prepare Session
1. Create a mission or scenario
2. Set up combat encounter (if needed)
3. Generate weather
4. Plan travel route and supplies
5. Prepare briefing

### Step 5: Run Session
1. Open **Combat Tracker** (if combat)
2. Publish **Situation Report** for players
3. Handle **COMMS** messages from players
4. Track **Campaign Events** as they occur
5. Update **Conditions** and **Inventory**

### Step 6: Document Campaign
1. Record what happened in **Campaign Events**
2. Update **Threat Status** if changed
3. Save **Faction/Settlement Changes**
4. Backup your data!

---

## 📡 Network Play Setup

### Host Computer (Game Master)
1. Find your IP address:
   ```bash
   # Windows Command Prompt
   ipconfig
   # Look for IPv4 Address (like 192.168.1.100)
   ```
2. Start server: `npm start`
3. Share this with players: `http://192.168.1.100:3000/player-interface.html`

### Player Computers
1. Open browser
2. Type address: `http://192.168.1.100:3000/player-interface.html`
3. Wait for GM to load their character
4. Watch for situation reports

### Firewall Settings
If players can't connect:
1. Windows Defender Firewall > "Allow app through firewall"
2. Add "Node.js" to allowed applications
3. Or add port 8080 specifically

---

## 🔐 Security & Passwords

### Default Login
```
Username: admin
Password: admin
```

⚠️ **Change this immediately after first login!**

### Setting Strong Passwords
- At least 8 characters
- Mix of uppercase, lowercase, numbers
- Include a special character (@, #, $, etc.)
- Don't reuse old passwords
- Don't write down in unsecured locations

### User Accounts
Create separate accounts for:
- Each player
- Each GM (if co-running)
- Backup admin account (for emergency access)

### Data Security
- All data stored locally (no cloud)
- Database is SQLite (no network exposure by default)
- Backups are unencrypted (store securely!)
- Network play uses plain HTTP (LAN only, not internet)

---

## 💾 Backups & Data Management

### Automatic Backups
- Created every 5 minutes
- Stored in `data/backups/`
- Keeps 100 most recent backups
- No action needed from you

### Manual Backup
```bash
# Stop the server first (Ctrl+C)

# Windows: Copy this folder
C:\path\to\t2k-gm-tool\data\
→ C:\Backups\T2K-GM-Backup-2026-11-02\

# macOS/Linux:
cp -r ~/t2k-gm-tool/data ~/Backups/t2k-backup-$(date +%Y-%m-%d)
```

### Data Location
```
data/
├── campaigns.db        # All campaign data
├── maps/               # PMTiles basemaps
└── backups/            # Automatic backups
```

### Restore from Backup
1. Stop the server (Ctrl+C)
2. Delete `data/campaigns.db`
3. Copy backup version to `data/campaigns.db`
4. Restart server

---

## 📚 Documentation Guide

| Document | Contents | When to Read |
|----------|----------|-------------|
| **INSTALLATION.md** | Complete setup guide (15 KB) | First installation |
| **QUICKSTART.md** | 30-second version | Quick reference |
| **README.md** | Project overview | Understanding the tool |
| **FEATURES.md** | All features and status | Learning capabilities |
| **ROADMAP.md** | What's coming next | Future planning |
| **DEPLOYMENT_MANIFEST.txt** | File inventory | Deployment verification |

---

## 🔍 Troubleshooting Quick Guide

| Problem | Solution |
|---------|----------|
| **"Node.js not found"** | Install Node.js 24+ from nodejs.org |
| **"Port 8080 in use"** | Close other apps or set `FIELDBOOK_PORT` to another port |
| **"npm install fails"** | Run as Administrator, check internet |
| **"Server won't start"** | Check console error, see INSTALLATION.md |
| **"Browser won't connect"** | Verify server is running, try http not https |
| **"Can't reach on LAN"** | Find IP: `ipconfig`, check firewall, same network |
| **"Database error"** | Delete `data/campaigns.db` to reset |
| **"Players disconnected"** | Restart server, check network, verify IP |

**Detailed troubleshooting:** See INSTALLATION.md "Troubleshooting" section

---

## 🎯 Next Steps

### Immediate (Now)
- [ ] Install Node.js 24+ (if needed)
- [ ] Run INSTALL_SERVER.bat
- [ ] Double-click run.cmd
- [ ] Open http://localhost:8080
- [ ] Change admin password

### First Session (Today)
- [ ] Create a test campaign
- [ ] Add a faction
- [ ] Create a test NPC
- [ ] Create a test player character
- [ ] Invite a player to test

### First Campaign (Week 1)
- [ ] Design your campaign setting
- [ ] Create major factions and NPCs
- [ ] Design opening scenario
- [ ] Test all interfaces with team
- [ ] Establish backup routine

### Ongoing
- [ ] Play sessions regularly
- [ ] Backup data weekly
- [ ] Update factions/events after sessions
- [ ] Track player progress
- [ ] Document campaign events

---

## 📞 Getting Help

### In-Tool Help
- Press **?** for context help
- Hover over fields for descriptions
- Check **Rules References** for mechanics

### Documentation
- See INSTALLATION.md for detailed guides
- See FEATURES.md for feature descriptions
- See ROADMAP.md for development status

### Common Questions

**Q: Can I play online (internet)?**
A: Not currently. Designed for local network only.

**Q: How many players can play?**
A: Recommended 1-4 players per session.

**Q: Can I import campaigns from other tools?**
A: Basic format is supported. See FEATURES.md for details.

**Q: Where's my data stored?**
A: All data stays local in the `data/` folder. No cloud.

**Q: Can I backup while playing?**
A: Yes! Automatic backups run every 5 minutes even during play.

**Q: How do I update?**
A: Extract new files (overwrite .cjs/.html), data stays safe.

---

## ✅ Before You Start

Make sure you have:
- [ ] **Windows 10+** or **macOS 10.15+** or **Ubuntu 18.04+**
- [ ] **Node.js 24.x** installed (verify: `node --version`)
- [ ] **2 GB free disk space**
- [ ] **Administrator access** (for initial install)
- [ ] **Modern web browser** (Chrome, Firefox, Edge, Safari)
- [ ] **Internet connection** (for first npm install only)

---

## 🎮 Ready to Play?

1. **Install:** Run INSTALL_SERVER.bat
2. **Start:** Run `npm start` from this folder
3. **Open:** http://localhost:8080
4. **Create:** Your first campaign
5. **Play:** Invite players and start the adventure!

---

## 📋 File Checklist

Before deployment, verify all files are present:

### Required
- [ ] server/ folder (21 .cjs files)
- [ ] index.html, login.html, campaign-setup.html, player-interface.html
- [ ] All *-client.js files (13 total)
- [ ] package.json, package-lock.json
- [ ] INSTALL_SERVER.bat
- [ ] run.cmd or run.ps1
- [ ] INSTALLATION.md, QUICKSTART.md

### Documentation (Recommended)
- [ ] README.md
- [ ] FEATURES.md
- [ ] ROADMAP.md
- [ ] DEPLOYMENT_MANIFEST.txt

### Optional
- [ ] gmpack/ (reference data)
- [ ] Previous documentation/archives

---

## 📊 System Specs After Installation

| Component | Details |
|-----------|---------|
| **Node.js** | Runtime engine for server |
| **npm** | Package manager (included with Node.js) |
| **Express.js** | Web framework for APIs |
| **SQLite** | Local database (no server needed) |
| **Leaflet** | Map visualization |
| **PMTiles** | Offline map format support |

Total installed: ~250 MB (mostly node_modules dependencies)

---

## 🎯 Success Indicators

After installation, you should see:

✅ INSTALL_SERVER.bat completes without errors
✅ Server starts with "listening on http://localhost:8080"
✅ Browser connects to http://localhost:8080
✅ Login page accepts the first-run bootstrap token
✅ GM account setup succeeds
✅ Can access GM Tool dashboard
✅ Can see Campaigns menu
✅ Can create a new campaign
✅ Database folder created: `data/campaigns.db`
✅ Backups folder created: `data/backups/`

If all above are ✅, you're ready to start!

---

## 🚀 Version Information

- **Release:** v1.1.0 - Production Ready
- **Release Date:** November 2026
- **Node.js:** 24.0.0 or later
- **Database Schema:** Version 21
- **Total Features:** 50+
- **Test Coverage:** 267/267 tests passing

---

## 📝 License & Attribution

This tool implements:
- **Twilight: 2000 Fourth Edition** rules (Fria Ligan/Free League)
- Licensed game mechanics and procedures
- Original tool design and implementation

See gmpack/ for official game references and materials.

---

**Last Updated:** November 2026
**Package Size:** ~650 KB (uncompressed)
**Estimated Setup Time:** 5-10 minutes
**Status:** ✅ Production Ready

---

## 🎮 Let's Play!

Your Twilight: 2000 Fourth Edition GM Tool is ready. Time to run an amazing campaign!

Questions? Check INSTALLATION.md for detailed guidance.
