/**
 * Shared helpers: normalization, parsing, formatting, and Slides text surgery.
 */

var STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

var NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];

/** Aggressive normalization used for matching addresses across sheet and deck. */
function normKey(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function numberWord(n, capitalize) {
  var w = (n >= 0 && n < NUMBER_WORDS.length) ? NUMBER_WORDS[n] : String(n);
  return capitalize ? w.charAt(0).toUpperCase() + w.slice(1) : w;
}

function withCommas(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function fmtMoney(n) { return '$' + withCommas(n); }

function fmtMoneyM(n) { return '$' + (n / 1e6).toFixed(1) + 'M'; }

/** cap is stored as a fraction (0.08) — render "8.00%". */
function fmtPct(cap) { return (cap * 100).toFixed(2) + '%'; }

function fmtCov(x) { return Number(x).toFixed(2) + 'x'; }

function parseMoney(v) {
  if (typeof v === 'number') return v;
  var n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

function parseCap(v) {
  var n = (typeof v === 'number') ? v : parseFloat(String(v).replace(/[%\s]/g, ''));
  if (isNaN(n)) return 0;
  return n > 1 ? n / 100 : n; // "8.00%" -> 8 -> 0.08; sheets may already give 0.08
}

function parseCov(v) {
  var n = (typeof v === 'number') ? v : parseFloat(String(v).replace(/[x\s]/g, ''));
  return isNaN(n) ? 0 : n;
}

/**
 * Best-effort "City", "ST" extraction from a street address.
 * "111 E County Rd 2, South Coffeyville, OK 74072" -> { city: "South Coffeyville", state: "OK" }
 */
function cityStateFromAddress(address) {
  var s = String(address || '').trim().replace(/\s+\d{5}(-\d{4})?\s*$/, '');
  var m = s.match(/\b([A-Z]{2})\.?\s*$/);
  if (!m || !STATE_NAMES[m[1]]) return { city: '', state: '' };
  var state = m[1];
  var rest = s.slice(0, m.index).replace(/[،,.\s]+$/, '');
  var segments = rest.split(/[,.]/).map(function (x) { return x.trim(); }).filter(String);
  var seg = segments.length ? segments[segments.length - 1] : rest;
  // Segments that start with a street number ("15587 M-60 Tekonsha") keep only the last word.
  var city = /^\d/.test(seg) ? seg.split(/\s+/).pop() : seg;
  return { city: city, state: state };
}

function locationFromAddress(address) {
  var cs = cityStateFromAddress(address);
  if (!cs.city) return String(address || '');
  return cs.city + ', ' + (STATE_NAMES[cs.state] || cs.state);
}

/**
 * Pull the property-overview stat chips out of the free-text Site Overview.
 * Any stat that can't be found comes back as "—".
 */
function extractStats(text) {
  var t = String(text || '').replace(/\\/g, '');
  function grab(re, group) {
    var m = t.match(re);
    return m ? m[group || 1] : '—';
  }
  var stats = {
    acres: grab(/(~?[\d.]+)\s*-?\s*acre/i),
    trucks: grab(/(~?[\d,]+)\s+truck\s+parking/i),
    showers: grab(/(\d+)\s+showers?/i),
    bays: grab(/(\d+)\s+(?:truck\s+)?service\s+bays?/i),
    aadt: grab(/(~?[\d,]+)\s+(?:total\s+)?AADT/i),
    pumps: '—'
  };
  var both = t.match(/(\d+)\s+diesel\s+and\s+(\d+)\s+gasoline/i);
  if (both) {
    stats.pumps = both[1] + ' / ' + both[2];
  } else {
    var diesel = t.match(/(\d+)\s+diesel\s+(?:pumps?|lanes?|dispensers?)/i);
    if (diesel) stats.pumps = diesel[1];
  }
  return stats;
}

// ---------------------------------------------------------------------------
// Slides helpers
// ---------------------------------------------------------------------------

/** All shapes on a slide, including shapes nested inside groups. */
function getAllShapes(page) {
  var out = [];
  function walk(elements) {
    elements.forEach(function (el) {
      var t = el.getPageElementType();
      if (t === SlidesApp.PageElementType.SHAPE) {
        out.push(el.asShape());
      } else if (t === SlidesApp.PageElementType.GROUP) {
        walk(el.asGroup().getChildren());
      }
    });
  }
  walk(page.getPageElements());
  return out;
}

/** Concatenated visible text of a slide (shapes + tables). */
function slideText(slide) {
  var parts = getAllShapes(slide).map(function (sh) {
    try { return sh.getText().asString(); } catch (e) { return ''; }
  });
  slide.getTables().forEach(function (tbl) {
    for (var r = 0; r < tbl.getNumRows(); r++) {
      for (var c = 0; c < tbl.getNumColumns(); c++) {
        try { parts.push(tbl.getCell(r, c).getText().asString()); } catch (e) { /* merged cell */ }
      }
    }
  });
  return parts.join('\n');
}

/**
 * Replace every regex match inside a slide's shape text with newText,
 * preserving the styling of the surrounding text.
 */
function regexSetInSlide(slide, pattern, newText) {
  var count = 0;
  getAllShapes(slide).forEach(function (sh) {
    var tr;
    try { tr = sh.getText(); } catch (e) { return; }
    var matches;
    try { matches = tr.find(pattern); } catch (e) { return; }
    for (var i = matches.length - 1; i >= 0; i--) {
      matches[i].setText(newText);
      count++;
    }
  });
  return count;
}

/**
 * Replace a whole line whose trimmed content exactly equals `exact`, editing
 * only that line's character range so other lines keep their styles.
 */
function replaceLineExact(slide, exact, replacement) {
  var count = 0;
  getAllShapes(slide).forEach(function (sh) {
    var tr;
    try { tr = sh.getText(); } catch (e) { return; }
    var s = tr.asString();
    if (!s) return;
    var lines = s.split('\n');
    var offset = 0;
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (line.trim() === exact) {
        var start = offset + line.indexOf(line.trim());
        var end = start + line.trim().length;
        tr.getRange(start, end).setText(replacement);
        count++;
        return; // offsets are stale after an edit; one replacement per shape
      }
      offset += line.length + 1; // +1 for the newline
    }
  });
  return count;
}

/**
 * Replace a whole line equal to `exact`, but only if exactly ONE such line
 * exists on the slide — used for short values (stat chips) where the same
 * text could legitimately appear twice and guessing would corrupt the slide.
 * @return {number} 1 if replaced; 0 if not found; -n if n ambiguous matches.
 */
function replaceUniqueLine(slide, exact, replacement) {
  var hits = [];
  getAllShapes(slide).forEach(function (sh) {
    var s;
    try { s = sh.getText().asString(); } catch (e) { return; }
    var lines = s.split('\n');
    var offset = 0;
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim() === exact) {
        hits.push({ shape: sh, start: offset + lines[i].indexOf(lines[i].trim()) });
      }
      offset += lines[i].length + 1;
    }
  });
  if (hits.length !== 1) return hits.length === 0 ? 0 : -hits.length;
  var h = hits[0];
  h.shape.getText().getRange(h.start, h.start + exact.length).setText(replacement);
  return 1;
}

// ---------------------------------------------------------------------------
// Speaker-notes tags: how the sync recognizes which slide belongs to which deal
// ---------------------------------------------------------------------------

var TAG_RE = /\[\[LVP:([^\]]*)\]\]/;

function getSlideTag(slide) {
  try {
    var notes = slide.getNotesPage().getSpeakerNotesShape().getText().asString();
    var m = notes.match(TAG_RE);
    if (!m) return null;
    var tag = { raw: m[1] };
    m[1].split(';').forEach(function (part) {
      var kv = part.split('=');
      if (kv.length === 2) tag[kv[0].trim()] = kv[1].trim();
      else if (part.trim()) tag[part.trim()] = true;
    });
    return tag;
  } catch (e) {
    return null;
  }
}

/** Set (replacing any existing) LVP tag in a slide's speaker notes. */
function setSlideTag(slide, tagBody) {
  var shape = slide.getNotesPage().getSpeakerNotesShape();
  var tr = shape.getText();
  var existing = tr.asString();
  var tagText = '[[LVP:' + tagBody + ']]';
  if (TAG_RE.test(existing)) {
    tr.setText(existing.replace(TAG_RE, tagText));
  } else {
    tr.setText((existing.replace(/\n+$/, '') + '\n' + tagText).replace(/^\n/, ''));
  }
}
