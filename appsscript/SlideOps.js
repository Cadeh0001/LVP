/**
 * Per-deal slide operations: create a pair from the template, apply/undo the
 * REMOVED treatment, renumber the "PROPERTY NN OF NN" kickers, set map links.
 */

var KICKER_PATTERN = 'PROPERTY\\s+\\d+\\s+OF\\s+\\d+';

/** Everything the template placeholders get filled with for one deal. */
function buildReplacements(deal, monthLabel) {
  return {
    '{{NAME}}': deal.name,
    '{{LOCATION}}': deal.location,
    '{{ADDRESS}}': deal.address,
    '{{OVERVIEW}}': deal.overviewText || '',
    '{{PRICE}}': fmtMoney(deal.price),
    '{{CAP}}': fmtPct(deal.cap),
    '{{RENT}}': fmtMoney(deal.rent),
    '{{EBITDAR}}': fmtMoney(deal.ebitdar),
    '{{EBITDA}}': fmtMoney(deal.ebitda),
    '{{COVERAGE}}': fmtCov(deal.coverage),
    '{{ACRES}}': deal.stats.acres,
    '{{TRUCKS}}': deal.stats.trucks,
    '{{PUMPS}}': deal.stats.pumps,
    '{{SHOWERS}}': deal.stats.showers,
    '{{BAYS}}': deal.stats.bays,
    '{{AADT}}': deal.stats.aadt,
    '{{ASOF}}': monthLabel || ''
  };
}

/** Duplicate the hidden template pair and fill it in for the given deal. */
function createPairFromTemplate(pres, template, deal, monthLabel) {
  var overview = template.overview.duplicate();
  var summary = template.summary.duplicate();
  [overview, summary].forEach(function (s) { s.setSkipped(false); });

  var repl = buildReplacements(deal, monthLabel);
  [overview, summary].forEach(function (s) {
    Object.keys(repl).forEach(function (ph) { s.replaceAllText(ph, repl[ph]); });
    setDealLinks(s, deal);
  });

  setSlideTag(overview, 'deal=' + deal.key + ';role=overview');
  setSlideTag(summary, 'deal=' + deal.key + ';role=summary');
  return { overview: overview, summary: summary };
}

function deletePair(pair) {
  pair.overview.remove();
  pair.summary.remove();
}

/**
 * Distinctive values that are safe to find-and-replace anywhere on the pair
 * ("$16,000,000", "8.00%", "PTL Carlsbad", ...). Short stat-chip values like
 * "6" or "0" are NOT here — those only ever get whole-line, unambiguous
 * replacement via replaceUniqueLine.
 */
var GLOBAL_UPDATE_FIELDS = {
  name: 1, location: 1, address: 1, price: 1, cap: 1, rent: 1,
  ebitdar: 1, ebitda: 1, coverage: 1, asof: 1
};

/**
 * Patch changed sheet values in place on a deal's existing slides, leaving
 * everything else (including manual customizations) untouched.
 * @param {Array<{field: string, from: string, to: string}>} changes
 */
function applyFieldUpdates(pair, changes, dealName) {
  changes.forEach(function (ch) {
    var count = 0;
    if (GLOBAL_UPDATE_FIELDS[ch.field]) {
      if (ch.from) {
        count += pair.overview.replaceAllText(ch.from, ch.to);
        count += pair.summary.replaceAllText(ch.from, ch.to);
      }
    } else if (ch.field === 'overview') {
      if (ch.from) count = replaceUniqueLine(pair.overview, ch.from, ch.to);
    } else {
      // Stat chip: whole-line only, and only when unambiguous.
      if (ch.from && ch.from !== '—') count = replaceUniqueLine(pair.overview, ch.from, ch.to);
    }
    if (count > 0) {
      Logger.log('"%s": %s updated "%s" -> "%s".', dealName, ch.field, ch.from, ch.to);
    } else if (count < 0) {
      Logger.log('"%s": %s NOT updated — "%s" appears %s times on the slide, ambiguous. Edit by hand.',
        dealName, ch.field, ch.from, -count);
    } else {
      Logger.log('"%s": %s NOT updated — old value "%s" not found on the slides ' +
        '(manually overridden?). Left as-is; new sheet value is "%s".',
        dealName, ch.field, ch.from, ch.to);
    }
  });
}

/** Point the "Open in Google Maps" / "Satellite" shapes at the deal's address. */
function setDealLinks(slide, deal) {
  var q = encodeURIComponent(deal.address);
  var mapsUrl = 'https://www.google.com/maps/search/?api=1&query=' + q;
  var satUrl = 'https://maps.google.com/?q=' + q + '&t=k';
  getAllShapes(slide).forEach(function (sh) {
    var text = '';
    try { text = sh.getText().asString(); } catch (e) { return; }
    var url = null;
    if (text.indexOf('Google Maps') !== -1) url = mapsUrl;
    else if (/Satellite|Aerial/.test(text)) url = satUrl;
    if (!url) return;
    try {
      sh.getText().getTextStyle().setLinkUrl(url);
    } catch (e) {
      try { sh.setLinkUrl(url); } catch (e2) { /* not linkable */ }
    }
  });
}

/**
 * Hide the pair from presenting/printing and stamp a visible REMOVED marker on
 * the overview kicker and the summary header.
 */
function applyRemovedTreatment(pair) {
  [pair.overview, pair.summary].forEach(function (s) { s.setSkipped(true); });
  prefixFirstMatch(pair.overview, KICKER_PATTERN);
  prefixFirstMatch(pair.summary, 'INVESTMENT SUMMARY');
}

function prefixFirstMatch(slide, pattern) {
  var shapes = getAllShapes(slide);
  for (var i = 0; i < shapes.length; i++) {
    var tr;
    try { tr = shapes[i].getText(); } catch (e) { continue; }
    if (tr.asString().indexOf(CONFIG.REMOVED_PREFIX) !== -1) return; // already marked
    var matches;
    try { matches = tr.find(pattern); } catch (e) { continue; }
    if (matches.length) {
      matches[0].insertText(0, CONFIG.REMOVED_PREFIX);
      return;
    }
  }
}

/** Un-hide a pair and strip the REMOVED markers. */
function reinstatePair(pair) {
  [pair.overview, pair.summary].forEach(function (s) {
    s.setSkipped(false);
    regexSetInSlide(s, CONFIG.REMOVED_PREFIX, '');
  });
}

/**
 * Order the active pairs right after the glance slide (sheet order) and rewrite
 * every kicker as "PROPERTY 01 OF 07" style numbering.
 */
function orderAndRenumber(pres, glanceSlide, activePairs) {
  var pos = glanceSlide ? slidePosition(pres, glanceSlide) + 1 : 2;
  activePairs.forEach(function (pair) {
    [pair.overview, pair.summary].forEach(function (s) {
      var current = slidePosition(pres, s);
      if (current !== pos) s.move(pos);
      pos++;
    });
  });
  var total = activePairs.length;
  activePairs.forEach(function (pair, i) {
    regexSetInSlide(pair.overview, KICKER_PATTERN,
      'PROPERTY ' + pad2(i + 1) + ' OF ' + pad2(total));
  });
}

function pad2(n) { return (n < 10 ? '0' : '') + n; }
