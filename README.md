# LVP Deck Sync

Keeps the **"LVP Current Portfolio Offerings"** Google Slides deck in lockstep
with the deals in the **Current Deals** Drive folder
(LV Petroleum → Funding Program → Current Deals).

## How it works

```
Consolidated Sheet  ──2x daily──▶  Apps Script (syncDeck)  ──▶  Slides deck
(source of truth)                                             · cover stats
one row per deal                                              · glance table
Available? = Yes/No                                           · 2 slides per deal
```

- **Source of truth:** the `Consolidated Sheet` found anywhere inside the
  tracked folder tree (so the monthly subfolder — "July 2026", "August 2026" —
  can rotate without reconfiguration). One row per deal; the `Available?`
  column controls whether a deal is live.
- **New deal (new row, `Available? = Yes`):** the script duplicates a hidden
  two-slide template pair — a property overview slide and an Investment Summary
  slide, styled identically to the existing ones — and fills in the deal's
  name, location, address, site overview, stat chips, price, CAP, rent,
  proforma EBITDAR/EBITDA, rent coverage, and live Google Maps / satellite
  links.
- **Departed deal (row removed, or `Available?` flips to `No`):** the pair is
  **hidden** (skipped when presenting/printing) and stamped with a
  `REMOVED — ` marker. Nothing is destroyed; flipping back to `Yes`
  reinstates it.
- **Changed deal (any field edited):** only the changed values are patched in
  place on that deal's existing slides (old value → new value). Manual
  customizations — including hand-edited or nonstandard stat chips — are left
  untouched; if an old value can't be found because it was manually
  overridden, it's skipped and logged (`UPDATE_ON_CHANGE` in `Config.js`).
- **Every run** also recomputes the cover stats (property count, portfolio
  price, blended CAP, blended coverage, subtitle sentence), rebuilds the
  "Portfolio at a Glance" table, reorders the deal slides to sheet order, and
  renumbers the `PROPERTY 01 OF 09` kickers.

Slides are matched to deals through an invisible tag in each slide's speaker
notes (`[[LVP:deal=<key>;role=overview]]`), keyed by the deal's street address
— so renaming a deal or restyling a slide never breaks the linkage.

## Repo layout

| Path | Purpose |
| --- | --- |
| `appsscript/Main.js` | `syncDeck()` entry point + trigger install |
| `appsscript/Config.js` | Deck/folder IDs, dry-run flag, behavior switches |
| `appsscript/SheetSource.js` | Locates and parses the Consolidated Sheet |
| `appsscript/DeckIndex.js` | Scans the deck, reads the speaker-notes tags |
| `appsscript/SlideOps.js` | Create/remove/reinstate/renumber deal slide pairs |
| `appsscript/GlanceTable.js` | Rebuilds the Portfolio at a Glance slide |
| `appsscript/CoverStats.js` | Rewrites the cover stats + subtitle |
| `appsscript/Bootstrap.js` | One-time: tag existing slides, build the template |
| `docs/SETUP.md` | Step-by-step deployment guide |

## Deploying

See **[docs/SETUP.md](docs/SETUP.md)**. Short version: push this code to an
Apps Script project with `clasp`, run the two bootstrap functions once, do a
dry run, flip `DRY_RUN` to `false`, and install the triggers (twice daily
during business hours — 9 AM and 3 PM Eastern by default, see
`SYNC_AT_HOURS` in `Config.js`).

## Sheet conventions

- Every deal needs `Address`, `Price`, `CAP`, `Rent`, `Proforma EBITDAR`;
  `Proforma Rent Coverage` and `Site Overview` are used when present.
- **Recommended:** add a `Property Name` column (e.g. "PTL Carlsbad",
  "TA Lowell"). Without it, new deals are titled "City, ST" derived from the
  address. Existing slides keep their hand-written names either way.
- Stat chips (acres, truck parking, dispensers, showers, service bays, AADT)
  are parsed out of the `Site Overview` text; anything not found renders as
  "—". Optional dedicated columns (`Acres`, `Truck Parking`, `Showers`,
  `Service Bays`, `AADT`, `Dispensers`) override the parsed values when
  present.

## Known limits

- In-place updates find the *old* sheet value on the slide and swap it for the
  new one. If you manually overrode that same value on the slide, the sync
  can't find it — it leaves your edit alone and logs the mismatch. To bring a
  field back under sync control, paste the sheet's current value onto the
  slide.
- Editing a deal's **address** changes its identity: the old pair goes to
  REMOVED and a fresh pair is created from the template.
- Style changes for future deals belong on the hidden template slides.
- Deals whose row is deleted outright stay in the deck hidden + `REMOVED — `
  forever (their data is gone, so they can never be auto-reinstated). Delete
  those slides by hand when you're sure.
