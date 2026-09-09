/**
 * LVP Deck Sync — entry points.
 *
 * syncDeck()             The scheduled sync. Sheet -> deck.
 * installSyncTrigger()   Create the time-driven triggers (CONFIG.SYNC_AT_HOURS).
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
      if (!pair) {
        plan.push({ type: 'create', deal: deal });
        return;
      }
      var snap = dealSnapshot(deal, source.monthLabel);
      var stored = readStoredSnapshot(props, deal.key);
      if (!stored) {
        // First time we see this pair (e.g. just bootstrapped): adopt as-is.
        adoptions.push(deal);
      } else if (CONFIG.UPDATE_ON_CHANGE) {
        var changes = diffSnapshots(stored, snap);
        if (changes.length) plan.push({ type: 'update', deal: deal, pair: pair, changes: changes });
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
      case 'create':
        if (!idx.template) {
          Logger.log('Cannot create "%s": no template pair exists. Run setupTemplate().', a.deal.name);
          return;
        }
        idx.pairs[a.deal.key] = createPairFromTemplate(pres, idx.template, a.deal, source.monthLabel);
        storeSnapshot(props, a.deal, source.monthLabel);
        break;
      case 'update':
        applyFieldUpdates(a.pair, a.changes, a.deal.name);
        storeSnapshot(props, a.deal, source.monthLabel);
        break;
      case 'reinstate':
        reinstatePair(a.pair);
        break;
      case 'remove':
        applyRemovedTreatment(a.pair);
        break;
    }
  });
  adoptions.forEach(function (deal) { storeSnapshot(props, deal, source.monthLabel); });

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

/**
 * Everything that lands on a deal's slides, in the exact formatted strings the
 * slides carry — stored after each sync so the next run can diff field-by-field
 * and patch only what changed.
 */
function dealSnapshot(deal, monthLabel) {
  return {
    name: deal.name,
    location: deal.location,
    address: deal.address,
    overview: deal.overviewText || '',
    price: fmtMoney(deal.price),
    cap: fmtPct(deal.cap),
    rent: fmtMoney(deal.rent),
    ebitdar: fmtMoney(deal.ebitdar),
    ebitda: fmtMoney(deal.ebitda),
    coverage: fmtCov(deal.coverage),
    acres: deal.stats.acres,
    trucks: deal.stats.trucks,
    pumps: deal.stats.pumps,
    showers: deal.stats.showers,
    bays: deal.stats.bays,
    aadt: deal.stats.aadt,
    asof: monthLabel || ''
  };
}

function storeSnapshot(props, deal, monthLabel) {
  props.setProperty('deal:' + deal.key, JSON.stringify(dealSnapshot(deal, monthLabel)));
}

function readStoredSnapshot(props, key) {
  var raw = props.getProperty('deal:' + key);
  if (!raw) return null;
  try {
    var parsed = JSON.parse(raw);
    // Older versions stored an array hash — treat as "no snapshot" (re-adopt).
    return (parsed && !Array.isArray(parsed) && typeof parsed === 'object') ? parsed : null;
  } catch (e) {
    return null;
  }
}

function diffSnapshots(stored, current) {
  var changes = [];
  Object.keys(current).forEach(function (field) {
    var from = stored[field];
    var to = current[field];
    if (from !== undefined && from !== to) {
      changes.push({ field: field, from: from, to: to });
    }
  });
  return changes;
}

function describeAction(a) {
  var label = a.type + ':' + (a.deal ? a.deal.name : a.label);
  if (a.type === 'update') {
    label += '(' + a.changes.map(function (c) { return c.field; }).join(',') + ')';
  }
  return label;
}

// ---------------------------------------------------------------------------
// Triggers
// ---------------------------------------------------------------------------

function installSyncTrigger() {
  removeAllTriggers();
  CONFIG.SYNC_AT_HOURS.forEach(function (hour) {
    ScriptApp.newTrigger('syncDeck').timeBased().everyDays(1).atHour(hour).create();
  });
  Logger.log('syncDeck triggers installed: daily at hours %s (%s).',
    CONFIG.SYNC_AT_HOURS.join(', '), Session.getScriptTimeZone());
}

function removeAllTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
}
