/**
 * Reads the deal list from the Consolidated Sheet — the source of truth.
 *
 * Required columns (matched by header text, order doesn't matter):
 *   Available?, Address, Price, CAP, Rent, Proforma EBITDAR
 * Used when present:
 *   Property Name (or Name), Proforma Rent Coverage, Site Overview, Year Built,
 *   Acres, Truck Parking, Showers, Service Bays, AADT, Dispensers
 *
 * Stat-chip values (acres, truck parking, ...) come from dedicated columns when
 * they exist, otherwise they're extracted from the Site Overview text.
 */

/** Find the Consolidated Sheet anywhere inside the tracked folder tree. */
function locateConsolidatedSheet() {
  var best = null;
  var queue = [{ folder: DriveApp.getFolderById(CONFIG.TRACKED_FOLDER_ID), depth: 0 }];
  while (queue.length) {
    var item = queue.shift();
    var files = item.folder.getFilesByName(CONFIG.CONSOLIDATED_SHEET_NAME);
    while (files.hasNext()) {
      var f = files.next();
      if (f.getMimeType() !== MimeType.GOOGLE_SHEETS) continue;
      if (!best || f.getLastUpdated() > best.file.getLastUpdated()) {
        best = { file: f, monthLabel: item.folder.getName() };
      }
    }
    if (item.depth < 4) {
      var sub = item.folder.getFolders();
      while (sub.hasNext()) queue.push({ folder: sub.next(), depth: item.depth + 1 });
    }
  }
  if (best) {
    return { id: best.file.getId(), monthLabel: best.monthLabel };
  }
  Logger.log('No "%s" found in the tracked folder tree — using fallback sheet ID.',
    CONFIG.CONSOLIDATED_SHEET_NAME);
  var fallback = DriveApp.getFileById(CONFIG.CONSOLIDATED_SHEET_FALLBACK_ID);
  var parents = fallback.getParents();
  return {
    id: CONFIG.CONSOLIDATED_SHEET_FALLBACK_ID,
    monthLabel: parents.hasNext() ? parents.next().getName() : ''
  };
}

/** @return {{deals: Object[], monthLabel: string, sheetId: string}} */
function readDeals() {
  var loc = locateConsolidatedSheet();
  var ss = SpreadsheetApp.openById(loc.id);
  var values = ss.getSheets()[0].getDataRange().getValues();

  // Find the header row (the one that contains "Address").
  var headerIdx = -1;
  for (var r = 0; r < values.length; r++) {
    if (values[r].some(function (c) { return normKey(c) === 'address'; })) {
      headerIdx = r;
      break;
    }
  }
  if (headerIdx === -1) {
    throw new Error('Could not find a header row containing "Address" in the Consolidated Sheet.');
  }

  var col = {};
  values[headerIdx].forEach(function (h, i) {
    var k = normKey(h);
    if (!k) return;
    if (k.indexOf('available') === 0) col.available = i;
    else if (k === 'address') col.address = i;
    else if (k === 'propertyname' || k === 'name' || k === 'property') col.name = i;
    else if (k === 'price' || k === 'askingprice') col.price = i;
    else if (k === 'cap' || k === 'caprate') col.cap = i;
    else if (k === 'rent' || k === 'annualrent') col.rent = i;
    else if (k.indexOf('ebitdar') !== -1) col.ebitdar = i;
    else if (k.indexOf('coverage') !== -1) col.coverage = i;
    else if (k.indexOf('overview') !== -1) col.overview = i;
    else if (k === 'acres') col.acres = i;
    else if (k.indexOf('truckparking') !== -1) col.trucks = i;
    else if (k === 'showers') col.showers = i;
    else if (k.indexOf('servicebays') !== -1) col.bays = i;
    else if (k === 'aadt' || k === 'totalaadt') col.aadt = i;
    else if (k.indexOf('dispenser') !== -1 || k === 'dieselgas' || k === 'pumps') col.pumps = i;
  });
  ['address', 'price', 'cap', 'rent', 'ebitdar'].forEach(function (req) {
    if (col[req] === undefined) throw new Error('Consolidated Sheet is missing a "' + req + '" column.');
  });

  var deals = [];
  var seen = {};
  for (var i = headerIdx + 1; i < values.length; i++) {
    var row = values[i];
    var address = String(row[col.address] || '').replace(/\\/g, '').trim();
    if (!address) continue;

    var key = normKey(address);
    if (seen[key]) {
      Logger.log('Duplicate address on sheet row %s ("%s") — skipping the duplicate.', i + 1, address);
      continue;
    }
    seen[key] = true;

    var overviewText = col.overview !== undefined
      ? String(row[col.overview] || '').replace(/\\/g, '').trim()
      : '';
    var stats = extractStats(overviewText);
    // Dedicated stat columns win over text extraction.
    [['acres', 'acres'], ['trucks', 'trucks'], ['showers', 'showers'],
     ['bays', 'bays'], ['aadt', 'aadt'], ['pumps', 'pumps']].forEach(function (map) {
      if (col[map[0]] !== undefined && String(row[col[map[0]]]).trim() !== '') {
        stats[map[1]] = String(row[col[map[0]]]).trim();
      }
    });

    var price = parseMoney(row[col.price]);
    var rent = parseMoney(row[col.rent]);
    var ebitdar = parseMoney(row[col.ebitdar]);
    var coverage = col.coverage !== undefined && String(row[col.coverage]).trim() !== ''
      ? parseCov(row[col.coverage])
      : (rent ? ebitdar / rent : 0);
    var name = col.name !== undefined && String(row[col.name]).trim() !== ''
      ? String(row[col.name]).trim()
      : defaultDealName(address);

    deals.push({
      key: key,
      address: address,
      name: name,
      location: locationFromAddress(address),
      // No Available? column at all -> treat every row as live rather than
      // sweeping the whole deck into REMOVED.
      available: col.available === undefined ? true : /^y/i.test(String(row[col.available] || '')),
      price: price,
      cap: parseCap(row[col.cap]),
      rent: rent,
      ebitdar: ebitdar,
      ebitda: ebitdar - rent,
      coverage: coverage,
      overviewText: overviewText,
      stats: stats,
      order: deals.length
    });
  }

  Logger.log('Read %s deals (%s available) from "%s" [%s].',
    deals.length,
    deals.filter(function (d) { return d.available; }).length,
    CONFIG.CONSOLIDATED_SHEET_NAME,
    loc.monthLabel);
  return { deals: deals, monthLabel: loc.monthLabel, sheetId: loc.id };
}

/** Fallback display name when the sheet has no Property Name column. */
function defaultDealName(address) {
  var cs = cityStateFromAddress(address);
  return cs.city ? cs.city + ', ' + cs.state : address;
}

/** Portfolio-level rollups over the active (available) deals. */
function computeTotals(activeDeals) {
  var price = 0, rent = 0, ebitdar = 0;
  var states = {};
  activeDeals.forEach(function (d) {
    price += d.price;
    rent += d.rent;
    ebitdar += d.ebitdar;
    var st = cityStateFromAddress(d.address).state;
    if (st) states[st] = true;
  });
  return {
    count: activeDeals.length,
    price: price,
    rent: rent,
    ebitdar: ebitdar,
    cap: price ? rent / price : 0,
    coverage: rent ? ebitdar / rent : 0,
    states: Object.keys(states).length
  };
}
