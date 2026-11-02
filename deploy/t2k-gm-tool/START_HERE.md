# START HERE 👋
## Twilight: 2000 Fourth Edition GM Tool
### v1.0.0 — Complete Deployment Package

Welcome! You have everything needed to run a T2K 4E campaign.

---

## 🎯 Choose Your Path

### ⚡ I Just Want to Play (30 seconds)
1. **Read:** [QUICKSTART.md](QUICKSTART.md)
2. **Run:** `INSTALL_SERVER.bat`
3. **Start:** `npm start`
4. **Play:** http://localhost:3000

### 📖 I Need Detailed Instructions (5 minutes)
1. **Read:** [INSTALLATION.md](INSTALLATION.md) (complete step-by-step guide)
2. Follow all steps carefully
3. Open http://localhost:3000
4. Create your campaign

### 📚 I Need to Understand Everything (15 minutes)
1. **Read:** [README_DEPLOYMENT.md](README_DEPLOYMENT.md) — Full overview
2. **Read:** [INSTALLATION.md](INSTALLATION.md) — Complete guide
3. **Skim:** [FEATURES.md](FEATURES.md) — What the tool can do
4. **Ready?** Run INSTALL_SERVER.bat

### 🔧 I Need to Verify the Package
1. **Check:** [DEPLOYMENT_MANIFEST.txt](DEPLOYMENT_MANIFEST.txt) — Files included
2. **Review:** [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) — Pre-install checks
3. **Verify:** All required files are present
4. **Proceed:** Run INSTALL_SERVER.bat

---

## 📁 What's in This Folder

| What | Where | Purpose |
|------|-------|---------|
| **Installation** | `INSTALL_SERVER.bat` | Run this first (Windows) |
| **Installation** | `INSTALL_SERVER.ps1` | Alternative for PowerShell |
| **Start Server** | `run.cmd` or `npm start` | Start the game daily |
| **Quick Guide** | [QUICKSTART.md](QUICKSTART.md) | 30-second setup |
| **Full Guide** | [INSTALLATION.md](INSTALLATION.md) | Complete instructions |
| **Overview** | [README_DEPLOYMENT.md](README_DEPLOYMENT.md) | Deployment details |
| **File List** | [DEPLOYMENT_MANIFEST.txt](DEPLOYMENT_MANIFEST.txt) | What's included |
| **Checklist** | [DEPLOYMENT_CHECKLIST.md](DEPLOYMENT_CHECKLIST.md) | Verification |
| **Completion** | [DEPLOYMENT_COMPLETE.md](DEPLOYMENT_COMPLETE.md) | Status & next steps |

---

## ⚙️ What You Need Before Starting

- ✅ **Windows 10/11**, macOS, or Linux
- ✅ **Node.js 24+** (https://nodejs.org/)
- ✅ **4 GB RAM** (8 GB recommended)
- ✅ **2 GB free disk space**
- ✅ **Web browser** (Chrome, Firefox, Edge, Safari)

**Don't have Node.js?** Install it first: https://nodejs.org/

---

## 🚀 The 3-Step Installation

### Step 1: Run Installer
```
Double-click: INSTALL_SERVER.bat
Wait: 2-5 minutes for completion
```

### Step 2: Start Server
```
Double-click: run.cmd
Or type: npm start
```

### Step 3: Open Browser
```
Go to: http://localhost:3000
Login: admin / admin
⚠️ Change password in Settings immediately!
```

**Done!** You're ready to create campaigns.

---

## 📞 Something Went Wrong?

### Common Issues

| Problem | Solution |
|---------|----------|
| **"Node.js not found"** | Install Node.js 24+ from nodejs.org then restart |
| **"Port 3000 in use"** | Close other apps or see INSTALLATION.md |
| **"npm install fails"** | Run as Administrator, check internet connection |
| **"Can't connect to server"** | Verify server is running (see console) |
| **"Database errors"** | Delete data/campaigns.db to reset |

**For more help:** See [INSTALLATION.md](INSTALLATION.md) → Troubleshooting section

---

## 📖 Documentation Map

```
START HERE (this file)
    ↓
For Quick Install → QUICKSTART.md
For Details → INSTALLATION.md
For Features → README.md, FEATURES.md, ROADMAP.md
For Deployment → DEPLOYMENT_COMPLETE.md
For Troubleshooting → INSTALLATION.md (Troubleshooting section)
For Verification → DEPLOYMENT_CHECKLIST.md
For File Inventory → DEPLOYMENT_MANIFEST.txt
```

---

## 🎮 First Campaign Checklist

After installation:

- [ ] Log in to http://localhost:3000
- [ ] Change admin password in Settings
- [ ] Create a new campaign (Campaigns > + New)
- [ ] Name it (your campaign title)
- [ ] Click Create
- [ ] Go to Campaign Setup Tool
- [ ] Add some factions
- [ ] Add some settlements
- [ ] Create some NPCs
- [ ] Design a scenario
- [ ] Invite players to test
- [ ] Run your first session!

---

## 💾 Important: Backups

Your campaign data is automatically backed up:
- **When:** Every 5 minutes
- **Where:** data/backups/ folder
- **How many:** Keeps 100 backups

**Manual backup:** Copy the `data/` folder to a safe location.

---

## 🔐 Security First!

⚠️ **IMPORTANT:** After first login:

1. Click Settings ⚙️
2. Click User Settings
3. Change your password to something strong
4. Write it down somewhere safe (not in a file!)

Default password (admin/admin) is for setup only!

---

## 🌐 Playing with Others

To let other players join on your network:

1. Find your computer's IP: Open Command Prompt, type `ipconfig`
2. Look for IPv4 Address (like 192.168.1.100)
3. Share this with players: `http://192.168.1.100:3000/player-interface.html`
4. All computers must be on same WiFi or Ethernet network

---

## ✅ Ready to Begin?

Pick one of the guides above and get started:

- **⚡ 30 seconds?** → [QUICKSTART.md](QUICKSTART.md)
- **📖 Full guide?** → [INSTALLATION.md](INSTALLATION.md)
- **📚 Complete info?** → [README_DEPLOYMENT.md](README_DEPLOYMENT.md)

Or just run `INSTALL_SERVER.bat` now!

---

## 🎯 Next Steps

1. **Read:** One of the guides above (2-15 minutes)
2. **Install:** Run INSTALL_SERVER.bat (5 minutes)
3. **Start:** Run npm start (immediately)
4. **Play:** Open http://localhost:3000 (now!)
5. **Create:** Your first campaign (5 minutes)
6. **Enjoy:** Run amazing T2K 4E sessions!

---

## 📚 All Documentation Files

### Quick Reference
- **START_HERE.md** ← You are here
- **QUICKSTART.md** — 30-second setup

### Installation & Setup
- **INSTALLATION.md** — Complete guide (15 KB)
- **README_DEPLOYMENT.md** — Deployment overview (14 KB)
- **INSTALL_SERVER.bat** — Windows installer script
- **INSTALL_SERVER.ps1** — PowerShell installer

### Project & Features
- **README.md** — Project overview
- **FEATURES.md** — All features and status
- **ROADMAP.md** — Development timeline

### Deployment & Verification
- **DEPLOYMENT_MANIFEST.txt** — File inventory
- **DEPLOYMENT_CHECKLIST.md** — Pre-install checks
- **DEPLOYMENT_COMPLETE.md** — Deployment status

---

## 🎮 Welcome to Twilight: 2000

Your campaign awaits. Let's make it legendary!

**Questions?** Check INSTALLATION.md → Troubleshooting

**Ready?** Run INSTALL_SERVER.bat now!

---

**Version:** 1.0.0  
**Status:** ✅ Ready to Deploy  
**Support:** See INSTALLATION.md for detailed help  
**Last Updated:** November 2, 2026
