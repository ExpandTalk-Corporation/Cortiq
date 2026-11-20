// Spec 2026-11-18 AC5/AC6 for the WordPress plugin banner (source of every consent row in prod).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const php = readFileSync('wordpress-plugin/cortiq-analytics.php', 'utf8');

// The inline banner script between "(function(){" after CQ_API and its closing "})();".
function bannerScript() {
  const start = php.indexOf("var CQ_API = '");
  const body = php.slice(start, php.indexOf('})();', start));
  // Replace PHP echoes with test values.
  return body
    .replace(/<\?php echo esc_js\( CORTIQ_API \); \?>/, 'https://api.test')
    .replace(/<\?php echo esc_js\( CORTIQ_GEO_API \); \?>/, 'https://api.test')
    .replace(/<\?php echo wp_json_encode\([\s\S]*?\) \); \?>/, '{"show":"s","hide":"h","nec":"N","pref":"P","stat":"S","mark":"M","cdate":"d","cid":"i","cats":"c","gpc":"GPC note"}')
    .replace(/<\?php echo max\( 1, intval\( \$opts\['reprompt_cooldown_days'\] \) \); \?>/, '365')
    .replace(/<\?php echo max\( 1, intval\( \$opts\['reprompt_reject_days'\] \) \); \?>/, '180')
    .replace(/<\?php echo ! empty\( \$opts\['geo_gating'\] \) \? 'true' : 'false'; \?>/, 'false')
    .replace(/<\?php echo esc_js\( \$opts\['[a-z_]+'\] \); \?>/g, 'x');
}

function run({ gpc, existing }) {
  const els = {};
  const el = (id) => (els[id] ||= { id, checked: false, disabled: false, style: {}, innerHTML: '', textContent: '', className: '',
    querySelector: () => null, onclick: null });
  const posts = [];
  const store = new Map();
  if (existing) { store.set('site_cookie_consent', JSON.stringify(existing)); }
  const context = {
    document: { getElementById: el },
    navigator: { language: 'sv-SE', globalPrivacyControl: gpc },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: 'America/New_York' }) }) },
    localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    window: { dispatchEvent() {}, crypto: { getRandomValues: (a) => a } },
    CustomEvent: class { constructor(n, i) { this.detail = i.detail; } },
    location: { href: 'https://site.test/' },
    fetch: (url, init) => { posts.push(JSON.parse(init.body)); return { catch() {} }; },
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'), Date, JSON, Math, String,
  };
  // bannerScript() is sliced from right after "(function(){" to right before its closing
  // "})();" (both markers excluded), so both must be restored around it to run as the IIFE.
  runInNewContext('(function(){' + bannerScript() + '\n})();', context);
  return { els, posts, saved: () => JSON.parse(store.get('site_cookie_consent')) };
}

test('plugin banner: accept all under GPC saves and posts marketing false, time zone sent', () => {
  const b = run({ gpc: true });
  assert.equal(b.els['cq-marketing'].disabled, true);
  b.els['cq-accept-all'].onclick();
  assert.equal(b.saved().marketing, false);
  assert.equal(b.saved().analytics, true);
  assert.equal(b.posts[0].consent_types.marketing, false);
  assert.equal(b.posts[0].gpc_signal, true);
  assert.equal(b.posts[0].time_zone, 'America/New_York');
});

test('plugin banner: no GPC → accept all grants marketing', () => {
  const b = run({ gpc: false });
  assert.equal(b.els['cq-marketing'].disabled, false);
  b.els['cq-accept-all'].onclick();
  assert.equal(b.saved().marketing, true);
});

test('plugin banner: replay of a pre-GPC stored marketing grant is masked in the UI, not rewritten', () => {
  // policyVersion 'x' matches the test's stubbed POLICY_VERSION so this stored choice reads as fresh.
  const stored = { necessary: true, preferences: false, analytics: false, marketing: true,
    timestamp: Date.now(), expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    consentId: 'prior-id', policyVersion: 'x' };
  const b = run({ gpc: true, existing: stored });
  assert.equal(b.els['cq-marketing'].checked, false);
  assert.equal(b.els['cq-marketing'].disabled, true);
  // localStorage itself must stay untouched — GPC only masks the UI, never rewrites the stored choice.
  assert.equal(b.saved().marketing, true);
});

test('plugin banner: replay of a pre-GPC stored marketing grant is masked in details/reopen icon too', () => {
  const stored = { necessary: true, preferences: false, analytics: false, marketing: true,
    timestamp: Date.now(), expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    consentId: 'prior-id', policyVersion: 'x' };
  const b = run({ gpc: true, existing: stored });
  // showDetails(existing) must not list marketing (CQ_T.mark stubbed as 'M') in the cats <dd>.
  const catsMatch = b.els['cq-details'].innerHTML.match(/<dt>c<\/dt><dd>([^<]*)<\/dd>/);
  assert.ok(catsMatch, 'cats row not found in details output');
  assert.doesNotMatch(catsMatch[1], /M/);
  // iconState(existing) must not treat this as a full-consent visit (reopen icon stays hollow).
  assert.equal(b.els['cq-reopen'].className, 'cq-min');
});

test('plugin banner: every language has a GPC note', () => {
  const langs = [...php.matchAll(/'(en|sv|de|fr|pt|nl|nb|da|fi|pl|it|es|is)' => array\(/g)].map((m) => m[1]);
  assert.ok(langs.length >= 3);
  // One 'gpc' => per language string, plus one for CQ_T's 'gpc' => $t['gpc'] passthrough
  // (the server-side hit's Sec-GPC field is not a banner string and is left out).
  assert.equal((php.match(/'gpc'\s*=>(?!\s*\( isset\( \$_SERVER\['HTTP_SEC_GPC'\])/g) || []).length, langs.length + 1);
  assert.match(php, /'gpc'\s*=> \$t\['gpc'\]/);
});
