/**
 * Keeps the cover slide's headline stats and subtitle sentence in sync:
 *   9 PROPERTIES · $277.0M PORTFOLIO PRICE · 8.00% CAP RATE · 2.51x COVERAGE
 * plus the sentence "Nine travel centers across eight states, offered at an
 * 8.00% CAP with 2.5x proforma rent coverage."
 */

function updateCover(coverSlide, totals) {
  if (!coverSlide) return;

  setStatAboveLabel(coverSlide, 'PROPERTIES', String(totals.count));
  setStatAboveLabel(coverSlide, 'PORTFOLIO PRICE', fmtMoneyM(totals.price));
  setStatAboveLabel(coverSlide, 'CAP RATE', fmtPct(totals.cap));
  setStatAboveLabel(coverSlide, 'PROFORMA RENT COVERAGE', fmtCov(totals.coverage));

  var sentence = coverSentence(totals);
  var shapes = getAllShapes(coverSlide);
  for (var i = 0; i < shapes.length; i++) {
    var text = '';
    try { text = shapes[i].getText().asString(); } catch (e) { continue; }
    if (text.indexOf('offered at an') !== -1) {
      shapes[i].getText().setText(sentence);
      return;
    }
  }
  Logger.log('Cover subtitle sentence ("... offered at an ...") not found — left as-is.');
}

function coverSentence(totals) {
  var centers = totals.count === 1 ? 'travel center' : 'travel centers';
  var states = totals.states === 1 ? 'state' : 'states';
  return numberWord(totals.count, true) + ' ' + centers + ' across ' +
    numberWord(totals.states, false) + ' ' + states + ', offered at an ' +
    fmtPct(totals.cap) + ' CAP with ' + totals.coverage.toFixed(1) +
    'x proforma rent coverage.';
}

/**
 * Cover stats are laid out as a big value shape sitting directly above a small
 * all-caps label shape. Find the label, then the nearest shape above it that
 * horizontally overlaps, and rewrite its text.
 */
function setStatAboveLabel(slide, labelText, value) {
  var shapes = getAllShapes(slide);
  var label = null;
  for (var i = 0; i < shapes.length; i++) {
    var t = '';
    try { t = shapes[i].getText().asString().trim(); } catch (e) { continue; }
    if (t === labelText) { label = shapes[i]; break; }
  }
  if (!label) {
    Logger.log('Cover label "%s" not found — skipping that stat.', labelText);
    return;
  }

  var best = null, bestBottom = -Infinity;
  shapes.forEach(function (sh) {
    if (sh === label) return;
    var top, left, width, height, lTop, lLeft, lWidth;
    try {
      top = sh.getTop(); left = sh.getLeft(); width = sh.getWidth(); height = sh.getHeight();
      lTop = label.getTop(); lLeft = label.getLeft(); lWidth = label.getWidth();
    } catch (e) { return; }
    var bottom = top + height;
    var overlaps = left < lLeft + lWidth && left + width > lLeft;
    if (overlaps && bottom <= lTop + 6 && bottom > bestBottom) {
      best = sh;
      bestBottom = bottom;
    }
  });
  if (best) {
    best.getText().setText(value);
  } else {
    Logger.log('No value shape found above cover label "%s" — skipping.', labelText);
  }
}
