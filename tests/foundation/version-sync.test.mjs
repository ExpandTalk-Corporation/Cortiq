import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';

// The WordPress plugin and the tracking script share one version number: the plugin
// loads spa-tracking.js?ver=CORTIQ_VERSION, so a tracker change only reaches WP sites
// when the plugin version moves with it.
const read = rel => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const lf = s => s.replace(/\r\n/g, '\n');

function versions() {
  const php = read('wordpress-plugin/cortiq-analytics.php');
  const pick = (label, src, re) => {
    const m = src.match(re);
    assert.ok(m, `${label}: version not found`);
    return [label, m[1]];
  };
  return [
    pick('plugin header', php, /^\s*\*\s*Version:\s*([\d.]+)/m),
    pick('CORTIQ_VERSION (php)', php, /define\(\s*'CORTIQ_VERSION',\s*'([\d.]+)'/),
    pick('readme Stable tag', read('wordpress-plugin/readme.txt'), /^Stable tag:\s*([\d.]+)/m),
    pick('plugin-version.ts', read('src/lib/plugin-version.ts'), /PLUGIN_VERSION = '([\d.]+)'/),
    pick('spa-tracking.js', read('public/spa-tracking.js'), /const CORTIQ_VERSION = '([\d.]+)'/),
  ];
}

test('plugin and tracker declare the same version everywhere', () => {
  const found = versions();
  const expected = found[0][1];
  for (const [label, v] of found) assert.equal(v, expected, `${label} is ${v}, expected ${expected}`);
});

test('readme changelog has an entry for the current version', () => {
  const [[, v]] = versions();
  assert.match(read('wordpress-plugin/readme.txt'), new RegExp(`^= ${v.replace(/\./g, '\\.')} =$`, 'm'));
});

test('served plugin zip matches wordpress-plugin/ sources', async () => {
  const zip = await JSZip.loadAsync(readFileSync(new URL('../../public/cortiq-wordpress-plugin.zip', import.meta.url)));
  for (const file of ['cortiq-analytics.php', 'readme.txt']) {
    const entry = zip.file(`cortiq-analytics/${file}`);
    assert.ok(entry, `zip is missing cortiq-analytics/${file}`);
    assert.equal(lf(await entry.async('string')), lf(read(`wordpress-plugin/${file}`)),
      `zip copy of ${file} is stale — run node scripts/build-plugin.mjs`);
  }
});

// ── Plugin banner ↔ tracker consent contract ────────────────────────────────
// Renders the banner's inline script (PHP tags replaced with fixed values) and runs
// it against a stub DOM. spa-tracking.js honours a stored choice only when
// Date.parse(expiresAt) > Date.now(), so the banner must always write one.

const DAY = 24 * 60 * 60 * 1000;

function bannerScript() {
  const php = read('wordpress-plugin/cortiq-analytics.php');
  const start = php.indexOf("<script>\n(function(){\n  var CQ_API");
  const startCrlf = php.indexOf("<script>\r\n(function(){\r\n  var CQ_API");
  const from = start >= 0 ? start : startCrlf;
  assert.ok(from >= 0, 'banner script not found');
  const to = php.indexOf('</script>', from);
  const values = [
    'https://api.test', 'site-1', 'tk_1',
    JSON.stringify({ show: 's', hide: 'h', nec: 'N', pref: 'P', stat: 'S', mark: 'M', cdate: 'd', cid: 'i', cats: 'c' }),
    '1', '365', 'false',
  ];
  let i = 0;
  const js = php.slice(from + '<script>'.length, to).replace(/<\?php[\s\S]*?\?>/g, () => values[i++]);
  assert.equal(i, values.length, 'banner script PHP placeholders changed — update this test');
  return js;
}

function runBanner(stored) {
  const store = new Map(stored ? [['site_cookie_consent', JSON.stringify(stored)]] : []);
  const els = new Map();
  const el = id => {
    if (!els.has(id)) els.set(id, { id, checked: false, style: {}, className: '', innerHTML: '', querySelector: () => null });
    return els.get(id);
  };
  const events = [];
  const context = {
    document: { getElementById: el },
    localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)) },
    window: { crypto: webcryptoShim(), dispatchEvent: e => events.push(e) },
    navigator: { language: 'sv-SE' },
    location: { href: 'https://site.test/' },
    fetch: () => Promise.resolve({ json: () => ({}) }),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
    btoa: s => Buffer.from(s, 'binary').toString('base64'),
    Uint8Array, Date, JSON, String, Promise,
  };
  new Function(...Object.keys(context), bannerScript())(...Object.values(context));
  const saved = () => JSON.parse(store.get('site_cookie_consent') || 'null');
  return { el, saved, events };
}

function webcryptoShim() {
  return { getRandomValues: arr => { for (let i = 0; i < arr.length; i++) arr[i] = i; return arr; } };
}

const trackerAccepts = c => !!c && c.analytics === true && Date.parse(c.expiresAt) > Date.now();

test('banner save writes a future expiresAt the tracker accepts', () => {
  const b = runBanner(null);
  b.el('cq-accept-all').onclick();
  const c = b.saved();
  assert.ok(trackerAccepts(c), `stored consent not accepted by tracker: ${JSON.stringify(c)}`);
  assert.ok(Math.abs(Date.parse(c.expiresAt) - (c.timestamp + 365 * DAY)) < 1000);
  assert.equal(b.events[0].detail.expiresAt, c.expiresAt);
});

test('pre-5.4.0 consent without expiresAt is backfilled without re-prompting', () => {
  const timestamp = Date.now() - 10 * DAY;
  const b = runBanner({ necessary: true, analytics: true, marketing: false, preferences: false,
    timestamp, consentId: 'x', policyVersion: '1' });
  const c = b.saved();
  assert.ok(trackerAccepts(c), 'legacy consent should be accepted after backfill');
  assert.equal(Date.parse(c.expiresAt), timestamp + 365 * DAY);
  assert.notEqual(b.el('cq-overlay').style.display, 'flex', 'banner must not re-prompt');
});

test('expired or other-policy legacy consent is not backfilled', () => {
  const old = runBanner({ analytics: true, timestamp: Date.now() - 400 * DAY, consentId: 'x', policyVersion: '1' });
  assert.equal(old.saved().expiresAt, undefined);
  assert.equal(old.el('cq-overlay').style.display, 'flex');
  const otherPolicy = runBanner({ analytics: true, timestamp: Date.now(), consentId: 'x', policyVersion: '0' });
  assert.equal(otherPolicy.saved().expiresAt, undefined);
});

test('statistics toggle is always rendered (cookieless mode needs consent too)', () => {
  const php = read('wordpress-plugin/cortiq-analytics.php');
  assert.doesNotMatch(php, /show_statistics/);
  assert.match(php, /id="cq-analytics"/);
});
