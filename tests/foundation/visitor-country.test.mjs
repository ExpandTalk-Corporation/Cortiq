import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const site = '11111111-1111-4111-8111-111111111111';
const consent = { consent_given: true, consent_types: { analytics: true, marketing: false }, expires_at: '2099-01-01T00:00:00Z' };

async function upsertCountry(body, headers = {}) {
  const rpcCalls = [];
  const rpc = async (name, args) => {
    rpcCalls.push({ name, args });
    return { data: name === 'upsert_unified_visitor' ? 'visitor-1' : true, error: null };
  };
  const db = mockDatabase(op => {
    if (op.table === 'sites') return { data: { id: site, is_active: true, tracking_mode: 'full', domain: 'example.com' }, error: null };
    if (op.table === 'cookie_consents') return { data: consent, error: null };
    return { data: null, error: null };
  }, rpc);
  const handler = loadEdge('visitor-identification', db.client);
  await handler(new Request('https://example.test/visitor-identification', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      siteId: site, sessionId: 'session-1', userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0',
      screenResolution: '1920x1080', viewport: '1200x800', timezone: -60, language: 'sv-SE',
      platform: 'Win32', currentUrl: 'https://example.com/', ...body,
    }),
  }));
  const call = rpcCalls.find(c => c.name === 'upsert_unified_visitor');
  assert.ok(call, 'upsert_unified_visitor was called');
  return call.args.p_country_code;
}

test('visitor country comes from the browser time zone', async () => {
  assert.equal(await upsertCountry({ timeZone: 'Europe/Stockholm' }), 'SE');
});

test('visitor country is null for a missing or unknown time zone', async () => {
  assert.equal(await upsertCountry({}), null);
  assert.equal(await upsertCountry({ timeZone: 'Mars/Olympus' }), null);
});

test('a valid cf-ipcountry header wins, XX and T1 fall back to the time zone', async () => {
  assert.equal(await upsertCountry({ timeZone: 'Europe/Stockholm' }, { 'cf-ipcountry': 'no' }), 'NO');
  assert.equal(await upsertCountry({ timeZone: 'Europe/Stockholm' }, { 'cf-ipcountry': 'XX' }), 'SE');
  assert.equal(await upsertCountry({ timeZone: 'Europe/Stockholm' }, { 'cf-ipcountry': 'T1' }), 'SE');
});

test('the tracker sends the IANA time zone to visitor-identification', () => {
  const tracker = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');
  const identify = tracker.slice(tracker.indexOf('async function identifyVisitor'), tracker.indexOf('/visitor-identification'));
  assert.match(identify, /timeZone: getTimeZone\(\)/);
});
