/**
 * LVP Deck Sync — configuration.
 *
 * Source of truth: the "Consolidated Sheet" inside the tracked Drive folder.
 * Target: the "LVP Current Portfolio Offerings" Google Slides deck.
 */
var CONFIG = {
  // "LVP Current Portfolio Offerings" presentation.
  DECK_ID: '1TbFxByXmSZzZPj-98m8zUXpGnMqCMaRoTAS2_eUVCv0',

  // "Current Deals" folder (LV Petroleum > Funding Program > Current Deals).
  // The Consolidated Sheet is located by name anywhere inside this tree, so the
  // monthly subfolder ("July 2026", "August 2026", ...) can rotate freely.
  TRACKED_FOLDER_ID: '17Zd7xnkRFFtGeGM2YpSZmhBUvkI813_i',
  CONSOLIDATED_SHEET_NAME: 'Consolidated Sheet',

  // Fallback if the name search finds nothing (current July 2026 sheet).
  CONSOLIDATED_SHEET_FALLBACK_ID: '1XxGRiROgHwhlQFGkfhjqeF9znYIG5_90mh8vThf75fY',

  // When true, syncDeck() only logs what it would do and makes no edits.
  DRY_RUN: true,

  // When a deal's sheet data changes, patch only the changed values in place
  // on its existing slides (old value -> new value). Manual edits to anything
  // else — including custom stat chips — are preserved; if an old value can't
  // be found (because it was manually overridden), it's left alone and logged.
  UPDATE_ON_CHANGE: true,

  // Treatment for deals that leave the sheet or flip to Available? = No:
  // slides are hidden (skipped) and marked with this prefix.
  REMOVED_PREFIX: 'REMOVED — ',

  // Hours of the day (0-23) the sync runs, in the script's timezone
  // (appsscript.json "timeZone", currently America/Chicago). Apps Script
  // fires each run at some point within that hour. Default: twice a day
  // during business hours. Re-run installSyncTrigger() after changing this.
  SYNC_AT_HOURS: [9, 16],
};
