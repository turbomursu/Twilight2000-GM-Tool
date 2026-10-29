# Project Instructions

This project is a game master's tool for Twilight: 2000 Fourth Edition.

## Website Principles

The website's required functionality includes:

- Character creation using verified Fourth Edition rules.
- AI-assisted campaign creation, with generated material presented for GM review and editing.
- NPC creation using verified Fourth Edition rules where applicable.
- A battle calculator based on verified Fourth Edition procedures.
- Simple local campaign data handling: save, load, import, and export.
- A useful set of game master's tools for preparing and running a campaign.
- A Game Master-operated Campaign Setup Tool that creates a campaign package which can be imported into the GM Tool to run the campaign.
- A GM runtime tool that imports campaign packages and manages the live campaign state.
- A Player Interface with a situation report whose displayed information the GM can add, remove, edit, and publish from the GM Tool.
- A browser-accessible Player Interface for 1-4 players, with a separate assigned character and inventory for each player.
- Players can manage their own character's inventory and items; dice-governed actions must follow verified Fourth Edition procedures wherever applicable.
- In the Player Interface handset layout, use labeled lower-bar shortcuts for common views and actions; omit Select and reserve Menu for future features.
- A clear, simple interface inspired by rugged military communications devices, with readable hierarchy, labeled controls, restrained status colors, and no decorative clutter.
- Do not create mobile-specific layouts or mobile versions unless the user explicitly asks for them.
- Minimize unnecessary scrolling where practical, keeping frequently used campaign information and controls easy to reach without sacrificing readability or accessibility.

Treat this as an extensible list of principles. Preserve existing principles when adding new ones; do not silently remove or replace them. Keep features that are not implemented clearly identified as planned rather than available.

Keep the Campaign Setup Tool, GM runtime tool, and Player Interface as distinct surfaces over a shared, versioned campaign data model. Support 1-4 separately identified player seats, each assigned a character. Players may submit change requests only for their own assigned character and inventory; the GM reviews, approves, and applies authoritative changes. The GM can manage all campaign and player-report data. The player-facing view must contain only information explicitly selected for publication by the GM; never expose GM-only notes, another player's private data, or unrevealed campaign state. Enforce these permissions at the authoritative data boundary, not only by hiding controls in the browser.

See `FEATURES.md` for the detailed user and GM feature roadmap and the current prototype status. Keep that overview synchronized when feature scope or implementation status changes.
See `ROADMAP.md` for the suggested delivery order, dependencies, and phase exit checks. Update it when implementation sequence or product priorities change.

## Ruleset Fidelity

- Use the Twilight: 2000 Fourth Edition core rules and applicable official supplements whenever a feature models an actual game rule. Do not mix in rules from earlier editions or other systems.
- Verify rolls, procedures, thresholds, movement, resource costs, and other mechanics against an authoritative Fourth Edition source before implementing them. Do not guess when a source is unavailable or ambiguous.
- Do not calculate carrying capacity or apply encumbrance penalties until the applicable Fourth Edition procedure, character inputs, and item weights are verified from an authoritative source. If inputs are missing or unverified, show the limitation and leave the effect GM-managed.
- When a rule cannot be verified, keep the behavior GM-managed and label any proposed interpretation or homebrew distinctly. Never present an approximation as an official rule.
- For dice-governed inventory or item actions, record the acting player/character, relevant inputs, roll, and outcome. Apply only verified procedures; leave unclear cases pending for GM adjudication.
- Use verified Fourth Edition core or supplement data for inventory items wherever applicable, and retain a book/page or section reference when known.
- Categorize inventory sources as `RB` (rule book), `GM` (GM-defined), or `UF` (unverified). A player-selected category is only a claim; it is not verified until the GM reviews and accepts it.
- Display the `RB`, `GM`, or `UF` category as the item's source label wherever inventory items are listed.
- Treat player-submitted new items and item-data edits as proposals. They must remain pending until the GM verifies the source and accepts them; do not let unverified proposals alter campaign inventory or appear as official rules data.
- Keep campaign-specific rulings and scenario data separate from rules logic.
- Explain mechanics in original, concise language. Do not reproduce substantial copyrighted rulebook text; cite the book and page or section when known.
- Treat the existing campaign dashboard as bookkeeping, not as a complete rules engine. Do not imply it resolves procedures that it does not implement.
