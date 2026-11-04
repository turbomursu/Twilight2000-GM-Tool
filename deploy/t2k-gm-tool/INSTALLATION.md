# Twilight: 2000 Fourth Edition GM Tool
## Installation and Setup Guide

**Version:** 1.1.0
**Date:** November 2026
**System Requirements:** Windows 10/11, Node.js 24+, Modern Web Browser

---

## 📋 Table of Contents

1. [Quick Start](#quick-start)
2. [System Requirements](#system-requirements)
3. [Installation Steps](#installation-steps)
4. [Starting the Server](#starting-the-server)
5. [Accessing the Tool](#accessing-the-tool)
6. [First-Time Setup](#first-time-setup)
7. [Troubleshooting](#troubleshooting)
8. [Data and Backups](#data-and-backups)

---

## 🚀 Quick Start

### For the Impatient

1. **Install Node.js** (if not already installed)
   - Download from https://nodejs.org/ (version 24.x or later)
   - Use default installation settings

2. **Run Installation Scripts**
   ```
   Double-click: INSTALL_SERVER.bat
   Follow prompts and wait for completion
   Open a new terminal after the batch installer finishes
   ```

3. **Start the Server**
   ```
   npm start
   ```

4. **Access in Browser**
   ```
   Open: http://localhost:8080
   Read the bootstrap token from token.txt
   ```

5. **Create the GM Account**
   - Enter the token from token.txt on the first-run setup page
   - Choose a GM username and password

That's it! You're ready to manage campaigns.

---

## 💻 System Requirements

### Hardware

| Component | Minimum | Recommended |
|-----------|---------|------------|
| CPU | Intel i5 / AMD Ryzen 5 | Intel i7 / AMD Ryzen 7 |
| RAM | 4 GB | 8 GB |
| Storage | 2 GB (install + data) | 10 GB |
| Network | Localhost only | Gigabit for LAN |

### Software

- **Operating System:** Windows 10/11 (64-bit) or macOS 10.15+
- **Node.js:** 24.0.0 or later (https://nodejs.org/)
- **Web Browser:**
  - Chrome 90+
  - Edge 90+
  - Firefox 88+
  - Safari 14+

### Network

- Local area network (LAN) for multi-player: same WiFi or Ethernet network
- Single player: localhost (127.0.0.1) only

---

## 📥 Installation Steps

### Step 1: Install Node.js

1. Visit https://nodejs.org/
2. Download **LTS version 24.x or later**
3. Run the installer
4. Accept default settings (Add to PATH is important!)
5. Verify installation:
   ```
   Open Command Prompt or PowerShell
   Type: node --version
   Expected output: v24.x.x or higher
   ```

### Step 2: Extract GM Tool Files

1. Extract the deployment package to your desired location
   - Example: `C:\Games\T2K-GM-Tool\`
   - Or: `C:\Users\YourName\Desktop\T2K-GM-Tool\`

2. Verify the folder structure:
   ```
   t2k-gm-tool/
   ├── server/          (backend logic and APIs)
   ├── package.json     (dependencies configuration)
   ├── INSTALL_SERVER.bat
   ├── INSTALL_CLIENT.bat
   └── (other files)
   ```

### Step 3: Run Installation Scripts

#### Server Installation (Required)

1. Open the deployment folder
2. **Right-click** `INSTALL_SERVER.bat`
3. Select **"Run as Administrator"**
4. Wait for the script to complete (2-5 minutes)
5. Press any key when prompted

**What this does:**
- Verifies Node.js 24+ is installed
- Installs all npm dependencies
- Verifies server files are present
- Sets up data directories
- Creates necessary folders for campaign data

#### Client Installation (Optional but Recommended)

1. Open the deployment folder
2. **Double-click** `INSTALL_CLIENT.bat`
3. Wait for the script to complete
4. Note the access URLs (write them down!)

**What this does:**
- Verifies server is running
- Provides browser access URLs
- Confirms prerequisites for client access

### Step 4: Verify Installation

After running INSTALL_SERVER.bat:

```
✓ Node.js detected: v24.x.x
✓ Dependencies installed
✓ Server files verified
✓ Database schema ready
✓ Data directories created
```

If you see **ERROR** messages:
- See [Troubleshooting](#troubleshooting) section
- Check Node.js version: `node --version`
- Try running as Administrator

---

## ▶️ Starting the Server

### Option 1: Quick Start (Recommended)

**Windows Command Prompt or PowerShell:**

```bash
# Navigate to the tool directory
cd C:\path\to\t2k-gm-tool

# Start the server (after running the installer)
npm start
```

### Server Startup Output

When the server starts, you'll see:

```
Fieldbook LAN API listening on http://0.0.0.0:8080
Database: Connected (schema version 21)
Sessions: Ready
```

**The server is ready when you see this message.**

### Keeping the Server Running

- **DO NOT close the command prompt window** while using the tool
- Server runs in the foreground (you'll see log messages)
- To stop: Press `Ctrl+C` in the command prompt
- To restart: Press `Ctrl+C`, then run the startup command again

### Running in Background (Advanced)

If you want the server to run without a command prompt window:

```bash
# In PowerShell (as Administrator)
Start-Process -NoNewWindow -FilePath node -ArgumentList server/main.cjs
```

To stop: Use Task Manager to end the node.exe process.

---

## 🌐 Accessing the Tool

### Local Access (Single Player)

After starting the server, open your web browser and go to:

```
http://localhost:8080
```

### Network Access (Local Area Network)

To access from other computers on your network:

1. Find your computer's IP address:
   ```
   Open Command Prompt
   Type: ipconfig
   Look for "IPv4 Address" (usually 192.168.x.x)
   Example: 192.168.1.100
   ```

2. On other computers, use:
   ```
   http://192.168.1.100:8080
   (Replace 192.168.1.100 with your actual IP)
   ```

### Available Interfaces

After login, you can access:

- **GM Tool** — Main campaign management interface
  - URL: http://localhost:8080
  - Full access to all GM features

- **Player Interface** — Player-facing view
  - URL: http://localhost:8080/player-interface.html
  - Characters, inventory, situation reports

- **Campaign Setup Tool** — Campaign creation and management
  - URL: http://localhost:8080/campaign-setup.html
  - Design campaigns, create maps, set up factions

---

## 🔐 First-Time Setup

### First-Run GM Account

There are no default GM credentials. Enter the bootstrap token saved in `token.txt`, then choose the GM username and password. GM-created player accounts receive temporary passwords and must change them at first sign-in.

### Creating Additional Users

In **Settings > User Management:**
- Add GM accounts for co-game masters
- Add player accounts for each participant
- Set appropriate permissions for each role

### Initial Campaign Setup

1. Click **Campaigns** in the main menu
2. Click **+ New Campaign**
3. Enter campaign details:
   - **Name:** Your campaign title
   - **Setting:** Twilight: 2000 Fourth Edition
   - **Description:** Campaign overview
4. Click **Create**
5. Use **Campaign Setup Tool** to design the campaign:
   - Create factions
   - Define settlements
   - Set up map (upload PMTiles basemap if available)
   - Design scenarios and encounters

---

## 🔧 Troubleshooting

### Issue: "Node.js is not installed or not in PATH"

**Solution:**
1. Download and install Node.js 24+ from https://nodejs.org/
2. During installation, **check "Add to PATH"**
3. Restart your computer
4. Re-run INSTALL_SERVER.bat

### Issue: "npm: command not found"

Same solution as above.

### Issue: Installation hangs or times out

**Solution:**
1. Close all windows
2. Right-click INSTALL_SERVER.bat
3. Select "Run as Administrator"
4. If still stuck:
   - Open PowerShell (as Admin)
   - Run: `npm install` from the tool folder
   - This takes 2-5 minutes

### Issue: Server won't start ("Port 8080 already in use")

**Solution 1:** Stop other applications
- Close any other Node.js instances
- Close conflicting apps or change `FIELDBOOK_PORT` (default: 8080)

**Solution 2:** Use a different port
```bash
# In PowerShell
$env:PORT=3001
npm start
# Then access: http://localhost:3001
```

**Solution 3:** Kill the existing process
```bash
# In Command Prompt (as Administrator)
netstat -ano | findstr :8080
taskkill /PID <PID> /F
# Then retry: npm start
```

### Issue: Browser shows "Connection refused"

**Checklist:**
1. Is the server running? (do you see "listening on http://localhost:8080"?)
2. Are you using the correct address?
   - Localhost: `http://localhost:8080`
   - Local IP: `http://192.168.x.x:8080`
3. Is Windows Firewall blocking Node.js?
   - Allow Node.js through Windows Firewall

### Issue: "Cannot find module" errors

**Solution:**
```bash
# Delete node_modules and reinstall
rm -r node_modules
npm install
npm start
```

### Issue: Database errors or corrupted data

**Solution:**
1. Close the server (Ctrl+C)
2. Backup the database:
   ```bash
   # Copy the data folder to a safe location
   ```
3. Delete the old database:
   ```bash
   # Windows Command Prompt
   del data\campaigns.db
   ```
4. Restart the server (database will recreate)

### Issue: Players can't connect on LAN

**Checklist:**
1. Server must be running on the host computer
2. Find host computer's IP: `ipconfig` → IPv4 Address
3. All computers must be on same network (WiFi or Ethernet)
4. Windows Firewall may need to allow Node.js:
   - Windows Defender Firewall > Allow app through firewall
   - Add Node.js to allowed apps
5. Test connectivity from client:
   ```bash
   ping 192.168.x.x
   ```

### Getting Help

If issues persist:

1. **Check the logs:**
   ```bash
   # Server console shows detailed error messages
   # Screenshot the full error and note the timestamp
   ```

2. **Review documentation:**
   - README.md — General overview
   - FEATURES.md — Feature descriptions
   - ROADMAP.md — Implementation status
   - Server logs — Detailed error traces

3. **Common issues database:**
   - Port 8080 conflicts
   - Node.js version mismatch
   - Firewall/antivirus blocking
   - Insufficient disk space
   - File permission issues

---

## 💾 Data and Backups

### Where Your Data Is Stored

All campaign data is stored in the `data/` folder:

```
data/
├── maps/atlas/            (PMTiles archives and matching JSON sidecars)
├── backups/               (automatic backups)
└── fieldbook.sqlite       (SQLite database - all campaigns)
```

### Automatic Backups

The system automatically backs up your data:
- **Schedule:** Every 5 minutes
- **Location:** `data/backups/`
- **Retention:** Keeps 100 recent backups
- **Format:** Timestamped copies

### Manual Backup

To back up your campaigns:

1. **Close the server** (Ctrl+C)
2. **Copy the `data/` folder:**
   ```
   From: C:\path\to\t2k-gm-tool\data\
   To:   C:\Backups\T2K-GM-Backup-[DATE]\
   ```
3. Store backups in at least two locations (cloud + external drive)

### Restoring from Backup

If your data is corrupted:

1. **Close the server**
2. **Replace the database:**
   ```
   Delete: data/campaigns.db
   Copy from backup: your-backup/campaigns.db → data/campaigns.db
   ```
3. **Restart the server**

### PMTiles Atlases

Use only a GM-provided archive whose license permits local server and player use. Check the source's terms and enter its exact required attribution and HTTPS license URL in Campaign Setup; the tool records and displays these details but does not verify rights.

Campaign Setup accepts PMTiles v3 MVT vector archives and PNG, JPEG, WebP, or AVIF raster archives (50 MiB upload limit). Archives and their matching JSON sidecars are stored in `data/maps/atlas/`; the server serves them with byte-range support. Keep the `.pmtiles` and `.json` files together when backing up or migrating. Editable campaign GeoJSON and setup packages remain separate.

### Exporting Campaign Data

To export a campaign for sharing:

1. In **Campaign Setup Tool**
2. Select the campaign
3. Click **Export Campaign Package**
4. Choose format and location
5. Share the `.t2k` file with other GMs

---

## 📊 Performance Tips

### For Smooth Operation

1. **Minimum specs:** 4 GB RAM, SSD storage
2. **Close unnecessary applications** (reduces resource contention)
3. **Use wired Ethernet** for LAN multiplayer (more stable than WiFi)
4. **Regular backups** (every session end)
5. **Restart server** if performance degrades (clears memory)

### For Large Campaigns

- Multiple factions and settlements
- High-resolution maps
- Large combat encounters

**Recommendation:** 8+ GB RAM, place on SSD

### Monitoring Server Health

The server logs show:
- API response times
- Database query timing
- Memory usage
- Connected clients

If response times exceed 500ms, consider:
- Adding RAM
- Moving database to SSD
- Reducing simultaneous players
- Optimizing map resolution

---

## 🎮 Next Steps After Installation

1. **Create Your First Campaign**
   - Go to Campaigns > New Campaign
   - Set the campaign name and description
   - Use Campaign Setup Tool to design it

2. **Set Up Your Factions**
   - Define major factions in your campaign
   - Set relationships and attitudes
   - Track resources and threats

3. **Create NPCs**
   - Use NPC Creation wizard
   - Set personalities, connections, goals
   - Assign to factions/settlements

4. **Design Combat Encounters**
   - Create opposing forces
   - Set up vehicles and equipment
   - Prepare tactical scenarios

5. **Plan Sessions**
   - Create session plans with missions
   - Link to scenarios and encounters
   - Prepare briefings for players

6. **Generate Weather/Travel**
   - Use weather rules to track conditions
   - Plan travel routes with supplies
   - Manage fatigue and morale

7. **Run Your First Session**
   - Publish situation reports to players
   - Handle combat using the combat calculator
   - Record campaign events and rumors
   - Track settlement/faction changes

---

## 📞 Support and Documentation

**Quick References:**
- **FEATURES.md** — Complete feature list and status
- **ROADMAP.md** — Development timeline and future features
- **README.md** — Project overview

**In-Game Help:**
- Click **Help** (? icon) in any tool
- Hover over fields for descriptions
- Check rule book citations for mechanics

**Browser Console (Advanced):**
- Press `F12` to open Developer Tools
- Go to Console tab
- Check for JavaScript errors

---

## ✅ Checklist for First Launch

- [ ] Node.js 24+ installed
- [ ] INSTALL_SERVER.bat ran successfully
- [ ] Server starts without errors
- [ ] Browser can access http://localhost:8080
- [ ] First-run GM account created with the token in token.txt
- [ ] Player temporary-password change is required at first sign-in
- [ ] Data folder created with backups
- [ ] Can create a new campaign
- [ ] Can navigate all main menus
- [ ] Ready to start playing!

---

## 🎯 You're Ready!

Your Twilight: 2000 Fourth Edition GM Tool is now ready to use.

**Start by:**
1. Creating a new campaign
2. Setting up your factions and NPCs
3. Designing your first scenario
4. Inviting players to join

Happy gaming!

---

**Last Updated:** November 2026
**Version:** 1.1.0
**Support:** See FEATURES.md and ROADMAP.md for detailed documentation
