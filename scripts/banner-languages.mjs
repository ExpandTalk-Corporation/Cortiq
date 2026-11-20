/**
 * Cuts public/consent-banner.js into one file per language: consent-banner.<lang>.js keeps the banner
 * code and only that language's texts. A site with a fixed banner language loads its file instead of
 * every language. Used by minify-tracker.mjs; the foundation tests import it too.
 */

const BLOCK_START = /^ {4}([a-z]{2}): \{$/gm;

function textTable(source) {
  const start = source.indexOf('  var T = {\n');
  const end = source.indexOf('\n  };\n', start);
  if (start === -1 || end === -1) throw new Error('consent-banner.js: text table `var T = {` not found');
  return { start, bodyStart: start + '  var T = {\n'.length, end };
}

/** Language codes in the order consent-banner.js defines them. */
export function bannerLanguages(source) {
  const { bodyStart, end } = textTable(source);
  return [...source.slice(bodyStart, end).matchAll(BLOCK_START)].map(m => m[1]);
}

/** consent-banner.js with only `lang` left in the text table. */
export function singleLanguage(source, lang) {
  const { bodyStart, end } = textTable(source);
  const body = source.slice(bodyStart, end);
  const starts = [...body.matchAll(BLOCK_START)];
  const i = starts.findIndex(m => m[1] === lang);
  if (i === -1) throw new Error(`consent-banner.js has no ${lang} texts`);
  const block = body.slice(starts[i].index, i + 1 < starts.length ? starts[i + 1].index : body.length)
    .replace(/,\s*$/, '').replace(/\s*$/, '');
  return source.slice(0, bodyStart) + block + source.slice(end);
}
