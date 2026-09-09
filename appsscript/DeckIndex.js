/**
 * Scans the deck and builds an index of what's there, keyed by the LVP tags in
 * each slide's speaker notes (see Util.js: getSlideTag / setSlideTag).
 */

/**
 * @return {{
 *   pairs: Object<string, {overview: Slide, summary: Slide}>,
 *   template: ?{overview: Slide, summary: Slide},
 *   cover: Slide,
 *   glance: ?Slide,
 *   untagged: Slide[]
 * }}
 */
function indexDeck(pres) {
  var slides = pres.getSlides();
  var idx = { pairs: {}, template: null, cover: slides[0] || null, glance: null, untagged: [] };
  var templateParts = {};

  slides.forEach(function (slide) {
    var tag = getSlideTag(slide);
    if (tag && tag.template) {
      if (tag.role) templateParts[tag.role] = slide;
      return;
    }
    if (tag && tag.deal && tag.role) {
      idx.pairs[tag.deal] = idx.pairs[tag.deal] || {};
      idx.pairs[tag.deal][tag.role] = slide;
      return;
    }
    var text = slideText(slide);
    if (!idx.glance && text.indexOf('PORTFOLIO AT A GLANCE') !== -1) {
      idx.glance = slide;
    } else if (slide !== idx.cover) {
      idx.untagged.push(slide);
    }
  });

  if (templateParts.overview && templateParts.summary) {
    idx.template = { overview: templateParts.overview, summary: templateParts.summary };
  }

  // Drop half-pairs (only one of the two slides tagged) — safer to treat as untagged.
  Object.keys(idx.pairs).forEach(function (key) {
    var p = idx.pairs[key];
    if (!p.overview || !p.summary) {
      Logger.log('Deal "%s" has an incomplete slide pair (missing %s) — ignoring it this run. ' +
        'Re-run bootstrapTagExistingSlides() or fix the notes tag by hand.',
        key, p.overview ? 'summary' : 'overview');
      delete idx.pairs[key];
    }
  });

  return idx;
}

/** Current 0-based position of a slide in the presentation. */
function slidePosition(pres, slide) {
  var id = slide.getObjectId();
  var slides = pres.getSlides();
  for (var i = 0; i < slides.length; i++) {
    if (slides[i].getObjectId() === id) return i;
  }
  return -1;
}
