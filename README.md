# Fieldbook

A small, local-first game master desk for a Twilight: 2000 Fourth Edition campaign. This is an independent fan utility, not an official product.

## Run

Open `index.html` in a current desktop or mobile browser. No package install, build step, or server is required.

## Included

- Campaign situation dashboard and illustrated route sketch
- Personnel roster with condition and status notes
- Travel day, waypoint, distance, food, fuel, and weather tracking
- Field journal entries
- Browser-local autosave and JSON campaign export
- Standalone [Campaign Setup Tool prototype](campaign-setup.html) with Field Papers atlas import, batch terrain, GM-managed location visibility, a location-backed GM-defined settlement generator, overlapping faction influence, multi-settlement faction links with prominence order, and schema-v2 package export/reopen. The GM Tool can load package map/faction/settlement data into a separate browser-local workspace and edit influence relationships live; full campaign initialization, shared runtime state, and player publication remain planned.
- Standalone [radio-handset Player Interface prototype](player-interface.html) with a separate browser-local store and a read-only GM condition-snapshot receiver; authenticated GM publishing and cross-device delivery are not connected

## Ruleset Fidelity

When a feature models a game mechanic, use the Twilight: 2000 Fourth Edition core rules and applicable official supplements. Keep campaign rulings and homebrew distinct, and do not silently substitute guessed procedures. The current dashboard is a campaign bookkeeping aid, not a complete rules engine; consult the rulebooks for procedures it does not explicitly implement.

Campaign data is stored in this browser using local storage. Export a JSON record before clearing browser data or moving to another browser. The sample campaign can be removed or edited in the page's script.

## Product Direction

The product has three connected surfaces: a GM-operated Campaign Setup Tool, a GM runtime tool that imports and runs its campaign package, and a browser-based Player Interface for 1-4 players. Each player has an assigned character and personal inventory; the GM controls published situation-report information. Dice-governed item actions must use verified Fourth Edition procedures. See [FEATURES.md](FEATURES.md) for the full product scope and [ROADMAP.md](ROADMAP.md) for delivery phases, dependencies, and completion checks. These are product goals, not a claim that every surface is already implemented.
