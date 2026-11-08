# Shared GM Roll Tables

The GM Desk keeps one roll-table catalog in SQLite, independent of campaigns and shared across GM accounts on that service. The API requires an authenticated GM for reads and writes; player accounts cannot access the catalog. Import replaces the whole catalog only after confirmation and uses a revision check to prevent overwriting another GM's recent import.

The modal is available from Situation, Personnel, Movement, and Conflicts. A table can be restricted to one or more of those sections with `contexts`; an empty array makes it available everywhere. A GM must click **Roll** to generate a result. The browser uses secure randomness, displays the matching range, and does not save the roll or change campaign state.

Download the empty template from the modal. Imports must be standard JSON in this versioned shape:

```json
{
  "schemaVersion": 1,
  "tables": [
    {
      "id": "sample-table",
      "name": "Sample table",
      "contexts": ["situation"],
      "dice": "1d6",
      "columns": ["Roll", "Outcome"],
      "rows": [
        { "min": 1, "max": 3, "values": ["1-3", "Example outcome A"] },
        { "min": 4, "max": 6, "values": ["4-6", "Example outcome B"] }
      ],
      "notes": [
        { "label": "Use", "text": "Example plain-text guidance." }
      ]
    }
  ]
}
```

Validation accepts at most 200 tables and 5 MiB per import. IDs and case-insensitive names must be unique. Dice use `NdS` notation with 1-20 dice, 2-100 sides, and no total above 1,000. Each table needs 2-8 unique column labels and 1-1,000 ranges. Inclusive integer ranges must cover every possible dice total exactly once without overlaps or gaps; every row must provide one plain-text value for each column. Notes are optional label/text pairs. Unknown properties are rejected. Text is rendered as text, never interpreted as HTML.

The initial catalog includes the 17 supplied tables. **Stationary Encounters** uses `1d100` and its ranges cover 1–100. The GM confirmed redistribution rights for the included user-provided data; no external table content is fetched or added.
