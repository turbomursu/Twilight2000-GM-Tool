# T2K 4E GM Tool - Fresh Session Startup Guide

**Prepared For**: Next Development Session  
**Date Prepared**: 02 November 2026, 15:44 UTC  
**Status**: Production Ready (116/116 tests passing)

---

## Quick Start (< 5 minutes)

### 1. Verify Environment
```bash
cd C:\Users\hemuli\Twilight2000-GM-Tool
npm test
# Expected: 116 pass, 0 fail ✅
```

### 2. Start Server
```bash
npm run start
# Listen on http://0.0.0.0:8080
```

### 3. Access Application
- GM Dashboard: http://localhost:8080
- Combat Interface: http://localhost:8080/combat.html?campaign=<id>
- Setup Tool: http://localhost:8080/campaign-setup.html

---

## Session Preparation Checklist

### Before Starting Work
- [ ] Review ROADMAP.md for planned phases
- [ ] Check FEATURES.md for current feature status
- [ ] Read archive/session-2026-11-02/SESSION_ARCHIVE_INDEX.md
- [ ] Review prior session commits (git log)
- [ ] Run full test suite (npm test)

### Key Files to Know
| File | Purpose |
|------|---------|
| FEATURES.md | Complete feature inventory & status |
| ROADMAP.md | Phase sequence & dependencies |
| DATA_MODEL.md | Campaign schema design |
| gmpack/ | T2K 4E rules reference (OCR Referee Aids) |
| archive/session-2026-11-02/ | Prior session archive |

### Understanding the Architecture

**Backend** (Node.js, 20 modules):
- `server/main.cjs` → HTTP server startup
- `server/app.cjs` → Request routing
- `server/campaigns.cjs` → Campaign CRUD
- `server/combat*.cjs` → Combat system (3 files)
- `server/audit.cjs` → Audit trail
- `server/runtime-store.cjs` → SQLite wrapper

**Frontend** (5 HTML applications):
- `index.html` — GM dashboard
- `campaign-setup.html` — Setup authoring
- `player-interface.html` — Player handset
- `combat.html` — Combat form
- `login.html` — Authentication

**Tests** (16 test files, 116 tests):
- `tests/combat*.test.cjs` → Combat system (47 tests)
- `tests/audit.test.cjs` → Audit trail (8 tests)
- `tests/campaign*.test.cjs` → Campaign system (18 tests)
- [Others] → Infrastructure, validation, API (43 tests)

---

## Current Implementation Status

### What's Done ✅
| System | Status | Tests |
|--------|--------|-------|
| Authentication | Complete | 2 ✅ |
| Campaign Management | Complete | 18 ✅ |
| Player Interface | Complete | 4+ ✅ |
| Combat System | Complete | 47 ✅ |
| Audit Trail | Complete | 8 ✅ |
| Inventory/Conditions | Complete | 3+ ✅ |
| Weather/Clock | Complete | 3+ ✅ |
| Player Permissions | Complete | 6+ ✅ |
| Map Publication | Complete | 9+ ✅ |
| Backup/Recovery | Complete | 12 ✅ |
| **TOTAL** | **✅ 116/116** | **✅ Passing** |

### What's Not Done (Planned)
| System | Status | Notes |
|--------|--------|-------|
| Encounter Generation | Planned | Ambush, roadblock, opposing force |
| Character Creation | Planned | Automate T2K 4E life path system |
| Tactical Map | Planned | Hex-based combat positions |
| World Simulation | Planned | Logistics, economy, diplomacy |
| Scheduled Backups | Planned | Currently manual only |

---

## Common Tasks

### Adding a New Feature
1. **Design**: Update FEATURES.md (mark as "Partial")
2. **Write Tests**: Create new test file with 100% coverage
3. **Implement**: Add to appropriate module
4. **Verify Rules**: Check against gmpack/ocr/ if gameplay-affecting
5. **Document**: Add to README or create quick-ref
6. **Update Status**: Mark FEATURES.md as "Implemented"
7. **Commit**: `git add . && git commit -m "..."`

### Fixing a Bug
1. **Reproduce**: Write failing test
2. **Debug**: Check audit log & database state
3. **Fix**: Modify code to pass test
4. **Verify**: All 116 tests still pass
5. **Test**: Manual browser testing
6. **Commit**: `git add . && git commit -m "Fix: ..."`

### Deploying to Production
1. **Verify Tests**: `npm test` (must be 116/116)
2. **Review Changes**: `git log -p origin/main..`
3. **Performance Check**: Spot-check key operations
4. **Security Check**: Review any auth/permission changes
5. **Tag Release**: `git tag v1.0.X`
6. **Document**: Update project-status.html snapshot
7. **Deploy**: Copy to production host

### Testing Combat System
1. Start server: `npm run start`
2. Create test campaign via setup tool
3. Access combat form: `/combat.html?campaign=<id>`
4. Test each tab: Ranged, Close, Grenade, Heavy, Vehicle
5. Verify calculations match manual T2K 4E procedure
6. Check results logged in audit trail

---

## Important Invariants

### Don't Break These
- ✅ All dice calculations must match T2K 4E rules (verify vs gmpack/ocr/)
- ✅ Audit trail is append-only (never delete/modify entries)
- ✅ Player can only see their own character & inventory
- ✅ Setup packages can only be imported once per campaign
- ✅ Campaign revision must increment on every mutation
- ✅ All mutations must be auditable (user, timestamp, action, delta)
- ✅ Backup/restore must be atomic (all-or-nothing)

### Key Assumptions
- ✅ Single-host LAN deployment (HTTP, no encryption)
- ✅ GM is trusted (no malicious GM in threat model)
- ✅ SQLite for persistence (no distributed database)
- ✅ Session tokens for authentication (no OAuth/LDAP)
- ✅ 1-4 players max per campaign
- ✅ Sequential turns (no true real-time multiplayer)

---

## Useful Commands

### Development
```bash
npm test                    # Run all 116 tests
npm run start              # Start server (http://0.0.0.0:8080)
npm install                # Install dependencies
node -e "..."              # Run Node.js snippet
```

### Git
```bash
git log --oneline -10      # Recent commits
git status                 # Current changes
git diff <file>           # Diff specific file
git add . && git commit -m "Message"  # Commit
git push origin main      # Push to GitHub
```

### Database
```bash
sqlite3 data/fieldbook.sqlite  # Open database
SELECT * FROM campaigns;       # List campaigns
SELECT * FROM audit_log LIMIT 10;  # Recent audit entries
```

### Debugging
- Browser Console (F12): JavaScript errors
- Network Tab (F12): API requests/responses
- VSCode Debugger: Node.js code stepping
- Server logs: Console output from `npm run start`

---

## Decision Points for Next Session

### High Priority (Recommend First)
- [ ] **Encounter Generation** — Implement ambush/roadblock/opposing force generator
  - Needs: T2K 4E unit composition rules (in gmpack/)
  - Estimated effort: 3-5 sessions
  - Value: Essential for dynamic campaigns

- [ ] **Character Creation Automation** — Automate T2K 4E life path
  - Needs: Verify all life path tables (in gmpack/ocr/)
  - Estimated effort: 2-3 sessions
  - Value: Streamlines character generation

### Medium Priority (After Priority Items)
- [ ] **Tactical Map** — Hex-based combat visualization
  - Needs: Leaflet integration for hex rendering
  - Estimated effort: 3-4 sessions
  - Value: Better combat visualization

- [ ] **World Simulation** — Logistics, economy, faction conflict
  - Needs: Game system design & balance testing
  - Estimated effort: 5+ sessions
  - Value: Campaign depth & dynamism

### Low Priority (Polish Later)
- [ ] **Scheduled Backups** — Automated backup system
- [ ] **Real-Archive Rendering** — Actual PMTiles with raster mapping
- [ ] **Dice Integration** — Real dice roller or online integration
- [ ] **Media Attachments** — Support images/maps in reports

---

## Reference Materials

### Game Rules (in gmpack/)
- `gmpack/ocr/` — Official T2K 4E Referee Aids (OCR transcriptions)
  - Close Combat
  - Ranged Combat
  - Heavy Weapons & Explosives
  - Vehicle Combat
  - Strategic Play (6-hour shifts, movement, weather)
  - Life Path Character Generation

### Analysis Documents (in gmpack/)
- `GAME_LOOP.md` — Session loop procedures
- `SESSION_LOOP_COMPARISON.md` — Official vs implemented
- `CHARACTER_AND_NPC_CREATION.md` — Character generation rules
- `ITEM_AND_WEAPON_STATS.md` — Equipment reference
- `STRATEGIC_PLAY_AUTOMATION_ACTIONS.md` — Strategic play automation ideas

### Project Documentation
- `FEATURES.md` — Feature inventory with status
- `ROADMAP.md` — Phase sequence with exit checks
- `DATA_MODEL.md` — Campaign schema design
- `archive/session-2026-11-02/` — Prior session archive (4 documents)

---

## Testing Strategy

### Before Committing Any Change
```bash
npm test  # Must be: 116 pass, 0 fail
```

### When Adding Features
1. Write test first (TDD)
2. Implement until test passes
3. Verify no regressions (all 116 still pass)
4. Add documentation
5. Commit with clear message

### When Fixing Bugs
1. Write test that reproduces bug
2. Fix code to pass test
3. Verify no regressions
4. Verify fix is correct (manual testing)
5. Commit with reference to issue

### Performance Testing
- Combat calculations should be <1ms
- API responses should be <50ms
- Database queries should be <100ms
- If slower, profile and optimize

---

## Clean Slate Notes

This session is starting fresh from the current production state. The following are stable and should not need modification:

### Stable Subsystems (Don't Modify Unless Bug Found)
- ✅ Authentication & authorization
- ✅ Database schema & persistence
- ✅ Audit trail system
- ✅ Campaign package versioning
- ✅ Player permission model
- ✅ API routing & contracts
- ✅ Combat calculation engine
- ✅ Test infrastructure

### Safe to Modify/Extend
- ⚙️ Combat subsystem (add new weapon types, mechanics)
- ⚙️ Campaign features (add new attributes)
- ⚙️ Player interface (new views, better UX)
- ⚙️ GM tools (new automation, utilities)
- ⚙️ Documentation (clarifications, guides)

### Testing Requirement
- **ALL changes must maintain 116/116 test pass rate**
- Add new tests for new features
- Update existing tests if schemas change
- No code should break existing tests

---

## Getting Help

### Understanding the Code
1. Start with README.md (top-level overview)
2. Read DATA_MODEL.md (schema design)
3. Check ROADMAP.md (phase context)
4. Review relevant test file (see how it's used)
5. Check inline JSDoc comments
6. Run `npm test -- --grep "keyword"` to find related tests

### Rules Questions
1. Check gmpack/ocr/ (official Referee Aids)
2. Look in gmpack/*.md (analysis documents)
3. Search combat code for similar mechanics
4. Add rules verification comments in code
5. Document any assumptions or ambiguities

### Git/GitHub Questions
1. Review commit history: `git log`
2. Check branches: `git branch -a`
3. See current status: `git status`
4. Review changes: `git diff`
5. Check remote: `git remote -v`

---

## Session Startup Checklist

### Initial Setup (First Time)
- [ ] Read this file completely
- [ ] Review archive/session-2026-11-02/SESSION_ARCHIVE_INDEX.md
- [ ] Check ROADMAP.md for planned work
- [ ] Run `npm test` (verify 116/116)
- [ ] Review FEATURES.md for current status
- [ ] Pick feature from ROADMAP.md to work on

### Daily Workflow
- [ ] Start with `npm test` (verify baseline)
- [ ] Work on planned feature
- [ ] Run tests frequently (`npm test`)
- [ ] Commit regularly with clear messages
- [ ] Update documentation as you go
- [ ] End with full test pass and documentation update

### Before Finishing Session
- [ ] All 116 tests passing
- [ ] Documentation updated
- [ ] Commits pushed to GitHub
- [ ] Status pages updated if needed
- [ ] Clean working directory (`git status` shows clean)

---

## Quick Reference

### Architecture
- **Frontend**: HTML forms + JS event handlers
- **Backend**: Node.js HTTP server + SQLite database
- **API**: RESTful POST/GET endpoints
- **Auth**: Session tokens (server-validated)
- **Data**: SQLite with append-only audit log
- **Rules**: T2K 4E verified via gmpack/ reference

### Test Run
- `npm test` — All 116 tests
- `npm test -- tests/combat.test.cjs` — Combat only
- `npm test -- --grep "pattern"` — By name pattern

### Deploy
- Verify: `npm test` (116/116)
- Commit: `git add . && git commit -m "..."`
- Push: `git push origin main`
- Tag: `git tag vX.Y.Z && git push --tags`

### Emergency
- **Tests failing**: Check git log, revert last commit, debug
- **Database corrupt**: Restore from backup (cross-host import)
- **Performance issue**: Profile, check database queries
- **Security issue**: Review auth/permission changes, check audit log

---

## Conclusion

The project is in excellent state for continued development. All systems are tested, documented, and production-ready. The next session should focus on planned features in ROADMAP.md (encounter generation is highest priority).

**Happy coding! 🚀**

---

**Prepared By**: AI Assistant (Copilot)  
**Date**: 02 November 2026, 15:44 UTC  
**Status**: Ready for next session  
**Test Status**: 116/116 ✅  
**Recommendation**: Start with encounter generation per ROADMAP.md
