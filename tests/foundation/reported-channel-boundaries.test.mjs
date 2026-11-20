// tests/foundation/reported-channel-boundaries.test.mjs
// Attribution layer 1.5 (jurist review 2026-11-20): blocking 2 — reported_channel never leaves
// CortIQ (not to Google Ads, GA4, AI insights, the public API or MCP); blocking 3 — aggregate
// display only; blocking 1, 4, 5 — DPA 1.7, banner and privacy texts name the self-reported source.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(join(root, rel), 'utf8');
const walk = (dir) => readdirSync(join(root, dir)).flatMap((name) => {
  const rel = `${dir}/${name}`;
  return statSync(join(root, rel)).isDirectory() ? walk(rel) : [rel];
});
const MENTION = /reported_channel|reportedChannel/;

// The only server code that may touch the category: the two capture paths and the shared mapper.
const CAPTURE = new Set([
  'supabase/functions/_shared/reported-channel.ts',
  'supabase/functions/track-event/index.ts',
  'supabase/functions/record-conversion/index.ts',
  'supabase/functions/hubspot-lead-webhook/index.ts',
]);

test('no Edge Function outside the capture paths reads or forwards reported_channel', () => {
  const files = walk('supabase/functions').filter((f) => /\.(ts|js|mjs)$/.test(f));
  const offenders = files.filter((f) => !CAPTURE.has(f) && MENTION.test(read(f)));
  assert.deepEqual(offenders, []);
  for (const f of [
    'supabase/functions/google-ads-quality-upload/index.ts',
    'supabase/functions/ga4-conversion-sync/index.ts',
    'supabase/functions/generate-dashboard-insights/index.ts',
    'supabase/functions/_shared/insight-facts.ts',
    'supabase/functions/public-api/index.ts',
    'supabase/functions/mcp-server/index.ts',
  ]) {
    const src = read(f);
    assert.doesNotMatch(src, MENTION, f);
  }
});

test('no wildcard read of conversion_events that could carry the column along', () => {
  const files = [...walk('supabase/functions'), ...walk('src')].filter((f) => /\.(ts|tsx|js)$/.test(f));
  const wildcard = /from\(['"]conversion_events['"]\)\s*\.select\(\s*(['"]\*['"])?\s*[,)]/;
  assert.deepEqual(files.filter((f) => wildcard.test(read(f))), []);
});

test('capture paths never send the category to an outside service', () => {
  for (const f of CAPTURE) {
    const src = read(f);
    assert.doesNotMatch(src, /googleads\.googleapis|google-analytics\.com|api\.anthropic|openai/i, f);
  }
});

test('SQL: only the layer 1.5 migration knows the column; the read is aggregate', () => {
  const migrations = walk('supabase/migrations').filter((f) => f.endsWith('.sql') && MENTION.test(read(f)));
  assert.deepEqual(migrations.map((f) => f.split('/').pop()), ['20261210000001_reported_channel.sql']);
  const fn = read('supabase/migrations/20261210000001_reported_channel.sql')
    .match(/FUNCTION public\.get_reported_channel[\s\S]*?\$\$;/)[0];
  assert.doesNotMatch(fn, /hashed_email|visitor_id|ce\.id\b|'session_id'/);
});

test('dashboard: only the aggregate RPC and the site settings touch the category', () => {
  const files = walk('src').filter((f) => /\.(ts|tsx)$/.test(f) && f !== 'src/integrations/supabase/types.ts');
  for (const f of files) {
    const src = read(f);
    if (!MENTION.test(src)) continue;
    assert.doesNotMatch(src, /from\(['"]conversion_events['"]\)/, `${f} must not read conversion_events rows`);
  }
});

const LANGS = ['sv', 'en', 'de', 'fr', 'pt', 'nl', 'nb', 'da', 'fi', 'pl', 'it', 'es', 'is'];
const CATEGORY = /kategori|category|Kategorie|catégorie|categoria|categorie|luokka|flokkur|categoría|kategoria/i;

test('banner: analytics and marketing texts in all 13 languages name the self-reported answer', () => {
  const src = read('public/consent-banner.js');
  for (const lang of LANGS) {
    const start = src.search(new RegExp(`^ {4}${lang}: \\{`, 'm'));
    const block = src.slice(start, start + 6000);
    const analytics = block.match(/analytics {4}: \['[^']*',\s*'([^']*)'\]/)[1];
    const marketing = block.match(/marketing {4}: \['[^']*',\s*'([^']*)'\]/)[1];
    assert.match(analytics, CATEGORY, `${lang} analytics`);
    assert.match(marketing, CATEGORY, `${lang} marketing`);
    // The new marketing sentence comes last and ends by saying the category is not sent to Google.
    const tail = marketing.slice(marketing.search(CATEGORY));
    assert.match(tail, /Google/, `${lang}: says the category is not sent to Google`);
    assert.equal(CATEGORY.test(marketing.slice(0, marketing.search(/Google/))), false, `${lang}: category sentence after the Google Ads sentence`);
  }
  assert.match(src, /If a form asks how you heard about the site, the option you select may be stored as a category\./);
  assert.match(src, /Only a category is stored, and it is not sent to Google\./);
  assert.match(src, /Om ett formulär frågar hur du hittade webbplatsen/);
});

test('Privacy, GDPR.md, DPA 1.7 and the tracker comment', () => {
  const privacy = read('src/pages/Privacy.tsx');
  assert.match(privacy, /Form interactions and form submissions\. Field content is not captured, with one exception[^']*how you heard about the site[^']*No other field is read for this, and free text is never read for it\. \(Hashing of an email address with marketing consent is described in section 5A\.\)/);
  // No absolute "never read" claims: the tracker also hashes the email field with marketing consent.
  assert.doesNotMatch(privacy, /Text you type is never read/);
  assert.match(privacy, /Linking your answer to &quot;how did you hear about us\?&quot;/);
  const gdpr = read('GDPR.md');
  assert.match(gdpr, /## Self-reported source/);
  assert.match(gdpr, /form interaction data \(not the content of the fields, except as described below\)/);
  assert.match(gdpr, /\(not the content of the fields, except the self-reported source below\)/);
  assert.match(gdpr, /No other field is read for this, and text inputs and textareas are never read for it\./);
  assert.match(gdpr, /Text you type in other fields is not read for this purpose\./);
  assert.doesNotMatch(gdpr, /Text inputs and textareas are never read\.|Text you type is not read\./);
  assert.match(gdpr, /\[If you use the HubSpot path, add under Marketing:\]/);
  const dpa = read('DPA.md');
  assert.match(dpa, /\*\*Version:\*\* 1\.7, dated 20 November 2026\./);
  assert.match(dpa, /\(d\) lead-quality and self-reported source matching/);
  assert.match(dpa, /self-reported source category \(from a fixed list\) on a conversion/);
  assert.match(dpa, /\*Changes in 1\.7:/);
  assert.match(dpa, /no other field is read for this purpose and free text is never read for it/);
  assert.doesNotMatch(dpa, /no other field content is read/);
  const tracker = read('public/spa-tracking.js');
  assert.doesNotMatch(tracker, /Field values are never read here/);
  assert.match(tracker, /Field values the tracker reads\s*\/\/ elsewhere: the site-configured "how did you hear about us" select\/radio \(readReportedChannel,/);
  assert.match(tracker, /the email field in recordConversion \(hashed in\s*\/\/ the browser, marketing consent only\)/);
});
