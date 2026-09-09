/**
 * LVP Deck Sync — entry points.
 *
 * syncDeck()             The hourly sync. Sheet -> deck.
 * installHourlyTrigger() Create the hourly time-driven trigger.
 * removeAllTriggers()    Remove this project's triggers.
 *
 * First-time setup lives in Bootstrap.js (bootstrapTagExistingSlides, then
 * setupTemplate), and CONFIG.DRY_RUN in Config.js starts as true so the first
 * syncDeck() run only logs its plan.
 */

function syncDeck() {
  var source = readDeals();
  var deals = source.deals;
  var pres = SlidesApp.openById(CONFIG.DECK_ID);
  var idx = indexDeck(pres);
  var props = PropertiesService.getScriptProperties();

  var active = deals.filter(function (d) { return d.available; });
  var totals = computeTotals(active);
  var byKey = {};
  deals.forEach(function (d) { byKey[d.key] = d; });

  // ---- Build the plan -----------------------------------------------------
  var plan = [];
  var adoptions = [];

  deals.forEach(function (deal) {
    var pair = idx.pairs[deal.key];
    if (deal.available) {
      var hash = dealHash(deal, source.monthLabel);
      if (!pair) {
        plan.push({ type: 'create', deal: deal });
        return;
      }
      var stored = props.getProperty('deal:' + deal.key);
      if (stored === null) {
        // First time we see this pair (e.g. just bootstrapped): adopt as-is.
        adoptions.push(deal);
      } else if (stored !== hash && CONFIG.REBUILD_ON_CHANGE) {
        plan.push({ type: 'rebuild', deal: deal, pair: pair });
        return;
      }
      if (pair.overview.isSkipped()) plan.push({ type: 'reinstate', deal: deal, pair: pair });
    } else if (pair && !pair.overview.isSkipped()) {
      plan.push({ type: 'remove', label: deal.name, pair: pair });
    }
  });

  // Slides whose deal no longer has any sheet row.
  Object.keys(idx.pairs).forEach(function (key) {
    if (!byKey[key] && !idx.pairs[key].overview.isSkipped()) {
      plan.push({ type: 'remove', label: key, pair: idx.pairs[key] });
    }
  });

  Logger.log('Active deals: %s | plan: %s', active.length,
    plan.length ? plan.map(describeAction).join(' | ') : 'no per-deal slide changes');

  if (CONFIG.DRY_RUN) {
    Logger.log('DRY_RUN is on — no edits made. Set CONFIG.DRY_RUN = false to go live.');
    return;
  }

  // ---- Execute ------------------------------------------------------------
  plan.forEach(function (a) {
    switch (a.type) {
      case 'rebuild':
      case 'create':
        if (!idx.template) {
          Logger.log('Cannot %s "%s": no template pair exists. Run setupTemplate().', a.type, a.deal.name);
          return;
        }
        if (a.type === 'rebuild') deletePair(a.pair);
        idx.pairs[a.deal.key] = createPairFromTemplate(pres, idx.template, a.deal, source.monthLabel);
        props.setProperty('deal:' + a.deal.key, dealHash(a.deal, source.monthLabel));
        break;
      case 'reinstate':
        reinstatePair(a.pair);
        break;
      case 'remove':
        applyRemovedTreatment(a.pair);
        break;
    }
  });
  adoptions.forEach(function (deal) {
    props.setProperty('deal:' + deal.key, dealHash(deal, source.monthLabel));
  });

  // ---- Ordering, numbering, rollups --------------------------------------
  var activePairs = active
    .map(function (d) { return idx.pairs[d.key]; })
    .filter(function (p) { return p; });
  orderAndRenumber(pres, idx.glance, activePairs);
  updateGlance(idx.glance, active, totals, source.monthLabel);
  updateCover(idx.cover, totals);

  Logger.log('Sync complete: %s active deals on %s slides, portfolio %s at %s / %s coverage.',
    active.length, activePairs.length * 2, fmtMoneyM(totals.price),
    fmtPct(totals.cap), fmtCov(totals.coverage));
}

/** Stable fingerprint of everything that lands on a deal's slides. */
function dealHash(deal, monthLabel) {
  return JSON.stringify([
    deal.name, deal.location, deal.address, deal.price, deal.cap, deal.rent,
    deal.ebitdar, deal.coverage, deal.overviewText, deal.stats, monthLabel
  ]);
}

function describeAction(a) {
  return a.type + ':' + (a.deal ? a.deal.name : a.label);
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function installHourlyTrigger() {
  removeAllTriggers();
  ScriptApp.newTrigger('syncDeck').timeBased().everyHours(1).create();
  Logger.log('Hourly syncDeck trigger installed.');
}

function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
