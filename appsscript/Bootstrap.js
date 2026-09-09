/**
 * One-time setup functions. Run these from the Apps Script editor, in order,
 * and read the execution log after each:
 *
 *   1. bootstrapTagExistingSlides() — match existing deal slides to sheet rows
 *      by street address and tag them in the speaker notes.
 *   2. setupTemplate() — duplicate one existing deal pair into a hidden,
 *      placeholder-filled template that new deals are generated from.
 *
 * After running setupTemplate(), open the deck, scroll to the two hidden
 * slides at the end, and eyeball them: every deal-specific value should read
 * as a {{PLACEHOLDER}}. Anything the scrubber couldn't confidently identify is
 * listed in the log — type the placeholder in by hand (it's a normal slide).
 */

function bootstrapTagExistingSlides() {
  var source = readDeals();
  var pres = SlidesApp.openById(CONFIG.DECK_ID);
  var slides = pres.getSlides();

  var info = slides.map(function (slide) {
    var text = slideText(slide);
    return {
      slide: slide,
      norm: normKey(text),
      isSummary: text.indexOf('INVESTMENT SUMMARY') !== -1,
      isGlance: text.indexOf('PORTFOLIO AT A GLANCE') !== -1,
      tagged: !!getSlideTag(slide)
    };
  });

  var matched = 0;
  source.deals.forEach(function (deal) {
    var addrNorm = normKey(deal.address);
    var hits = info.filter(function (s) {
      return !s.isGlance && s.slide !== slides[0] && s.norm.indexOf(addrNorm) !== -1;
    });
    var overview = hits.filter(function (s) { return !s.isSummary; })[0];
    var summary = hits.filter(function (s) { return s.isSummary; })[0];
    if (overview && summary) {
      setSlideTag(overview.slide, 'deal=' + deal.key + ';role=overview');
      setSlideTag(summary.slide, 'deal=' + deal.key + ';role=summary');
      matched++;
      Logger.log('Tagged pair for "%s" (%s).', deal.name, deal.address);
    } else {
      Logger.log('No complete slide pair found for "%s" (%s) — found %s overview, %s summary. ' +
        'It will be created from the template on the next sync.',
        deal.name, deal.address, overview ? 1 : 0, summary ? 1 : 0);
    }
  });
  Logger.log('Bootstrap complete: %s of %s deals tagged.', matched, source.deals.length);
}

/**
 * Build the hidden template pair from an existing deal's slides.
 * @param {string=} optDealKey normKey of the source deal's address; defaults to
 *     the first available deal that has a tagged pair.
 */
function setupTemplate(optDealKey) {
  var source = readDeals();
  var pres = SlidesApp.openById(CONFIG.DECK_ID);
  var idx = indexDeck(pres);

  if (idx.template) {
    Logger.log('A template pair already exists — delete those two hidden slides first if you want to rebuild it.');
    return;
  }

  var deal = null;
  for (var i = 0; i < source.deals.length; i++) {
    var d = source.deals[i];
    if (optDealKey ? d.key === optDealKey : (d.available && idx.pairs[d.key])) {
      if (idx.pairs[d.key]) { deal = d; break; }
    }
  }
  if (!deal) {
    Logger.log('No tagged source pair found — run bootstrapTagExistingSlides() first.');
    return;
  }
  Logger.log('Building template from "%s".', deal.name);

  var pair = idx.pairs[deal.key];
  var overview = pair.overview.duplicate();
  var summary = pair.summary.duplicate();

  scrubToTemplate(overview, summary, deal, source.monthLabel);

  setSlideTag(overview, 'template;role=overview');
  setSlideTag(summary, 'template;role=summary');
  [overview, summary].forEach(function (s) {
    s.setSkipped(true);
    s.move(pres.getSlides().length - 1);
  });
  Logger.log('Template created as two hidden slides at the end of the deck. ' +
    'Open the deck and verify every deal-specific value reads as {{PLACEHOLDER}}.');
}

/** Replace one deal's concrete values with {{PLACEHOLDER}} tokens. */
function scrubToTemplate(overview, summary, deal, monthLabel) {
  var missed = [];

  // --- Values whose formatted strings we know exactly (safe replaceAllText). ---
  var globalRepl = [
    [fmtMoney(deal.price), '{{PRICE}}'],
    [fmtMoney(deal.rent), '{{RENT}}'],
    [fmtMoney(deal.ebitdar), '{{EBITDAR}}'],
    [fmtMoney(deal.ebitda), '{{EBITDA}}'],
    [fmtCov(deal.coverage), '{{COVERAGE}}'],
    [fmtPct(deal.cap), '{{CAP}}'],
    [deal.address, '{{ADDRESS}}'],
    [deal.location, '{{LOCATION}}']
  ];
  if (monthLabel) globalRepl.push([monthLabel, '{{ASOF}}']);

  // --- The deal name: the short line that appears on both slides. ---
  var name = findSharedName(overview, summary, deal);
  if (name) {
    globalRepl.push([name, '{{NAME}}']);
    Logger.log('Detected deal name on slides: "%s".', name);
  } else {
    missed.push('{{NAME}} (could not auto-detect the name line)');
  }

  [overview, summary].forEach(function (s) {
    globalRepl.forEach(function (r) { s.replaceAllText(r[0], r[1]); });
  });

  // --- Overview description: the one long free-text line. ---
  if (!replaceLongLine(overview, '{{OVERVIEW}}')) missed.push('{{OVERVIEW}}');

  // --- Stat chips: exact-line replacement only (values like "0" are too risky
  //     for substring replacement). ---
  var chipMap = [
    [deal.stats.acres, '{{ACRES}}'],
    [deal.stats.trucks, '{{TRUCKS}}'],
    [deal.stats.pumps, '{{PUMPS}}'],
    [deal.stats.showers, '{{SHOWERS}}'],
    [deal.stats.bays, '{{BAYS}}'],
    [deal.stats.aadt, '{{AADT}}']
  ];
  chipMap.forEach(function (m) {
    var value = m[0], ph = m[1];
    if (value === '—' || value === '' || replaceLineExact(overview, value, ph) === 0) {
      missed.push(ph);
    }
  });

  // --- Kicker: numbering is rewritten on every sync, park a placeholder. ---
  regexSetInSlide(overview, KICKER_PATTERN, 'PROPERTY 00 OF 00');

  if (missed.length) {
    Logger.log('Placeholders to add BY HAND on the hidden template slides: %s. ' +
      'Select the value text on the template slide and type the placeholder over it.',
      missed.join(', '));
  } else {
    Logger.log('All placeholders scrubbed automatically.');
  }
}

/**
 * The deal name isn't in the sheet's data for the deck's existing slides, but
 * it's the short line both slides share (e.g. "PTL Carlsbad").
 */
function findSharedName(overview, summary, deal) {
  function candidateLines(slide) {
    var set = {};
    getAllShapes(slide).forEach(function (sh) {
      var text = '';
      try { text = sh.getText().asString(); } catch (e) { return; }
      text.split('\n').forEach(function (line) {
        var t = line.trim();
        if (!t || t.length > 50) return;
        if (/\{\{|INVESTMENT SUMMARY|PROPERTY \d|Google Maps|Satellite|Aerial|Offered at|↗/.test(t)) return;
        if (t === t.toUpperCase() && /[A-Z]{4}/.test(t)) return; // all-caps labels
        set[t] = true;
      });
    });
    return set;
  }
  var a = candidateLines(overview);
  var b = candidateLines(summary);
  var shared = Object.keys(a).filter(function (line) {
    if (!b[line]) return false;
    var n = normKey(line);
    if (!n) return false;
    if (normKey(deal.address).indexOf(n) !== -1) return false;   // address fragment
    if (n === normKey(deal.location)) return false;              // location line
    return true;
  });
  if (shared.length === 1) return shared[0];
  if (shared.length > 1) {
    Logger.log('Multiple name candidates shared by both slides: %s — not auto-replacing.',
      JSON.stringify(shared));
  }
  return null;
}

/** Replace the first line longer than 80 chars (the site description). */
function replaceLongLine(slide, placeholder) {
  var shapes = getAllShapes(slide);
  for (var i = 0; i < shapes.length; i++) {
    var tr;
    try { tr = shapes[i].getText(); } catch (e) { continue; }
    var lines = tr.asString().split('\n');
    for (var j = 0; j < lines.length; j++) {
      var t = lines[j].trim();
      if (t.length > 80 && t.indexOf('{{') === -1) {
        return replaceLineExact(slide, t, placeholder) > 0;
      }
    }
  }
  return false;
}
