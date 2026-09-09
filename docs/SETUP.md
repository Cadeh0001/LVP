# Deploying LVP Deck Sync

The script must run as a Google account with **edit access to the deck** and
**read access to the Current Deals folder and Consolidated Sheet** (the deck is
owned by `storage2@sandsig.com`; any editor account works).

## 1. Create the Apps Script project and add the code

### Option A — one-paste bundle (no tools needed)

1. Go to <https://script.google.com> → **New project** → name it "LVP Deck Sync".
2. Open the default `Code.gs`, delete its contents, and paste in the whole of
   **`dist/Code.gs`** from this repo (all source files concatenated).
3. **Project Settings** (gear) → check **Show "appsscript.json" manifest
   file** → open `appsscript.json` in the editor and paste the repo's
   `appsscript/appsscript.json` over it (sets timezone + permissions).
4. Save, then continue to step 2 below.

To update later: regenerate the bundle (`scripts/build-bundle.sh`) after any
source change and repeat the paste.

### Option B — clasp (better for ongoing development)

Requires Node.js. [`clasp`](https://github.com/google/clasp) is Google's CLI
for Apps Script.

```bash
npm install -g @google/clasp
clasp login                      # log in as the account described above
```

Enable the Apps Script API for that account (one-time):
<https://script.google.com/home/usersettings> → turn **Google Apps Script API** on.

Then, from the repo root:

```bash
clasp create --type standalone --title "LVP Deck Sync" --rootDir appsscript
clasp push
```

`clasp create` writes a `.clasp.json` (gitignored — it's account-specific).
On any future code change: `clasp push` again.

## 2. One-time bootstrap (run from the Apps Script editor)

Open the project (`clasp open` or script.google.com), then run these functions
one at a time from the editor toolbar, approving the OAuth prompt on the first
run and reading the **Execution log** after each:

1. **`bootstrapTagExistingSlides`** — matches the existing deal slides to sheet
   rows by street address and tags them invisibly in the speaker notes. The
   log lists every matched pair and every deal it couldn't match (unmatched
   deals simply get fresh slides on the first sync).
2. **`setupTemplate`** — duplicates one existing deal's two slides into a
   hidden template pair at the end of the deck and swaps its values for
   `{{PLACEHOLDER}}` tokens. **Then open the deck and inspect the two hidden
   slides at the end**: every deal-specific value should read as a
   placeholder. The log names any it couldn't scrub automatically (e.g. a stat
   chip) — fix those by selecting the text on the template slide and typing
   the placeholder (`{{BAYS}}`, `{{NAME}}`, …) over it.

Available placeholders:
`{{NAME}} {{LOCATION}} {{ADDRESS}} {{OVERVIEW}} {{PRICE}} {{CAP}} {{RENT}}
{{EBITDAR}} {{EBITDA}} {{COVERAGE}} {{ACRES}} {{TRUCKS}} {{PUMPS}} {{SHOWERS}}
{{BAYS}} {{AADT}} {{ASOF}}`

## 3. Dry run, then go live

1. Run **`syncDeck`** — `CONFIG.DRY_RUN` ships as `true`, so this only logs the
   plan (creates/rebuilds/removals). Check it matches your expectations.
2. In `Config.js`, set `DRY_RUN: false` (`clasp push` or edit in the editor).
3. Run **`syncDeck`** again and review the deck.
4. Run **`installSyncTrigger`** — the sync now runs twice each day, in the
   9 AM and 4 PM hours (script timezone, set in `appsscript.json`; change the
   hours via `SYNC_AT_HOURS` in `Config.js` and re-run this function). Failures
   email the account automatically (default trigger notifications); executions
   are visible under the project's **Executions** tab.

## Day-to-day

Nothing. Edit the Consolidated Sheet; the deck follows at the next scheduled
run (twice daily during business hours):

- add a row with `Available? = Yes` → two new styled slides + table/cover update
- flip `Available?` to `No` (or delete the row) → slides hidden + `REMOVED — `
- flip back to `Yes` → slides reinstated
- edit any field → just that value is patched on the deal's slides; manual
  customizations elsewhere on the slides are preserved

To force an immediate sync, run `syncDeck` from the editor.

## Troubleshooting

- **"no template pair — run setupTemplate()"** — step 2.2 wasn't completed, or
  the hidden template slides were deleted. Re-run `setupTemplate`.
- **A deal's slides didn't update after a sheet edit** — check the Executions
  log. Either the old value was manually overridden on the slide (the log says
  "not found ... left as-is"; paste the sheet value onto the slide to re-sync
  it), or the address was edited, which changes the deal's identity: the old
  pair goes to REMOVED and a fresh pair is created. That's by design (the
  address is the deal key).
- **Cover/glance numbers look off** — they're computed only from rows with
  `Available? = Yes`; verify that column.
