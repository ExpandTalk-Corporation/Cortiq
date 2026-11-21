import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { BANNER_LANGS } from '../../supabase/functions/_shared/banner-langs.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE = '11111111-1111-4111-8111-111111111111';
const LANGS = ['sv', 'en', 'de', 'fr', 'pt', 'nl', 'nb', 'da', 'fi', 'pl', 'it', 'es', 'is'];

test('one list of 13 codes, the same as the sites CHECK', () => {
  assert.deepEqual([...BANNER_LANGS].sort(), [...LANGS].sort());
  const sitesCheck = read('../../supabase/migrations/20261205000001_banner_languages.sql');
  for (const l of LANGS) assert.match(sitesCheck, new RegExp(`'${l}'`));
});

test('the banner posts the language it rendered in', () => {
  const src = read('../../public/consent-banner.js');
  const post = src.slice(src.indexOf('function postConsent'), src.indexOf('function postConsent') + 2000);
  assert.match(post, /banner_lang: cfg\.lang/);
});

async function store(bannerLang) {
  const db = mockDatabase((op) => {
    if (op.table === 'sites') return { data: { id: SITE }, error: null };
    if (op.table === 'cookie_consents' && op.type === 'select') return { data: null, error: null };
    if (op.table === 'cookie_consents' && op.type === 'insert') return { data: { id: 'row-1', ...op.payload }, error: null };
    return { data: null, error: null };
  }, async (name) => ({ data: name === 'check_rate_limit' ? true : null, error: null }));
  const handler = loadEdge('store-consent', db.client);
  const res = await handler(new Request('https://fn.test/store-consent', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ site_id: SITE, session_id: 'c-1', banner_lang: bannerLang, consent_types: { analytics: true, marketing: false, preferences: false } }),
  }));
  assert.equal(res.status, 200);
  return db.calls.find((c) => c.table === 'cookie_consents' && c.type === 'insert').payload.banner_lang;
}

test('the WordPress plugin banner posts its language too, from the same 13 codes', () => {
  const php = read('../../wordpress-plugin/cortiq-analytics.php');
  const list = php.match(/function cortiq_banner_languages\(\) \{\s*return array\(([^)]*)\)/)[1].match(/'([a-z]+)'/g).map((x) => x.slice(1, -1));
  assert.deepEqual(list.sort(), [...LANGS].sort());
  assert.match(php, /\$lang\s+= cortiq_banner_lang\( \$opts \);/);
  assert.match(php, /var CQ_LANG = '<\?php echo esc_js\( \$lang \); \?>';/);
  const post = php.slice(php.indexOf("cqFetch('/store-consent'"), php.indexOf("cqFetch('/store-consent'") + 800);
  assert.match(post, /banner_lang: CQ_LANG/);
});

test('store-consent keeps a known code and stores null for anything else', async () => {
  assert.equal(await store('fi'), 'fi');
  for (const bad of ['xx', 'SV', 'no', '', 42, null, undefined, 'sv-SE']) assert.equal(await store(bad), null, String(bad));
});

test('PostgreSQL: column accepts the 13 codes and NULL only', async () => {
  const pg = new PGlite();
  try {
    await pg.exec('CREATE TABLE public.cookie_consents (id serial PRIMARY KEY, locale text DEFAULT \'sv\');');
    await pg.exec(read('../../supabase/migrations/20261207000003_consent_banner_lang.sql'));
    for (const l of [...LANGS, null]) await pg.query('INSERT INTO cookie_consents (banner_lang) VALUES ($1)', [l]);
    await assert.rejects(pg.query("INSERT INTO cookie_consents (banner_lang) VALUES ('xx')"), /check/i);
  } finally { await pg.close(); }
});
