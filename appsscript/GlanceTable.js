/**
 * Keeps the "Portfolio at a Glance" slide consistent with the active deals:
 * subtitle, table rows (one per deal + a Portfolio Total row), and the
 * as-of month in the footnote.
 */

function updateGlance(slide, activeDeals, totals, monthLabel) {
  if (!slide) {
    Logger.log('No "PORTFOLIO AT A GLANCE" slide found — skipping glance update.');
    return;
  }

  // Subtitle: "Nine Travel Centers · 8.00% CAP"
  regexSetInSlide(slide, '[A-Za-z]+ Travel Centers\\s*·\\s*[\\d.]+% CAP',
    numberWord(totals.count, true) + ' Travel Centers · ' + fmtPct(totals.cap) + ' CAP');

  // Footnote as-of month: "... underwriting models, July 2026."
  if (monthLabel) {
    regexSetInSlide(slide, 'underwriting models, [A-Za-z]+ \\d{4}',
      'underwriting models, ' + monthLabel);
  }

  var tables = slide.getTables();
  if (!tables.length) {
    Logger.log('Glance slide has no table — skipping table rebuild.');
    return;
  }
  var table = tables[0];
  var numCols = table.getNumColumns();

  // Snapshot text styles from an existing data row and the total row so
  // appended rows look the same.
  var dataStyle = table.getNumRows() >= 3 ? captureRowStyles(table, 1, numCols) : null;
  var totalStyle = table.getNumRows() >= 2
    ? captureRowStyles(table, table.getNumRows() - 1, numCols) : null;

  var needed = activeDeals.length + 2; // header + deals + total
  while (table.getNumRows() > needed) table.getRow(table.getNumRows() - 1).remove();
  while (table.getNumRows() < needed) table.appendRow();

  activeDeals.forEach(function (d, i) {
    writeRow(table, i + 1, numCols,
      [d.name, d.location, fmtMoney(d.price), fmtMoney(d.rent), fmtMoney(d.ebitdar), fmtCov(d.coverage)],
      dataStyle);
  });
  writeRow(table, needed - 1, numCols,
    ['Portfolio Total', totals.states + ' states', fmtMoney(totals.price),
      fmtMoney(totals.rent), fmtMoney(totals.ebitdar), fmtCov(totals.coverage)],
    totalStyle);
}

function writeRow(table, rowIdx, numCols, values, styles) {
  for (var c = 0; c < Math.min(numCols, values.length); c++) {
    var tr;
    try { tr = table.getCell(rowIdx, c).getText(); } catch (e) { continue; }
    tr.setText(values[c]);
    if (styles && styles[c]) applyStyleSnapshot(tr, styles[c]);
  }
}

function captureRowStyles(table, rowIdx, numCols) {
  var out = [];
  for (var c = 0; c < numCols; c++) {
    var snap = null;
    try {
      var ts = table.getCell(rowIdx, c).getText().getTextStyle();
      snap = { family: ts.getFontFamily(), size: ts.getFontSize(), bold: ts.isBold(), color: null };
      var col = ts.getForegroundColor();
      if (col && col.getColorType() === SlidesApp.ColorType.RGB) {
        snap.color = col.asRgbColor().asHexString();
      }
    } catch (e) { /* merged or unstyled cell */ }
    out.push(snap);
  }
  return out;
}

function applyStyleSnapshot(textRange, snap) {
  try {
    var ts = textRange.getTextStyle();
    if (snap.family) ts.setFontFamily(snap.family);
    if (snap.size) ts.setFontSize(snap.size);
    if (snap.bold !== null && snap.bold !== undefined) ts.setBold(snap.bold);
    if (snap.color) ts.setForegroundColor(snap.color);
  } catch (e) { /* best effort */ }
}
