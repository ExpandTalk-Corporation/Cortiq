// tests/foundation/ecommerce-tracking-consent.test.mjs
// spa-tracking.js trackEcommercePurchase sends no consentGranted and uses { orderId, currency, total, items }.
// ecommerce-tracking used to require consentGranted, so every tracker purchase got a 400. Consent now comes
// from the consent ledger by session id (as in record-conversion), fail closed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const LEDGER_OK = { consent_given: true, consent_types: { analytics: true, marketing: false }, gpc_signal: false, expires_at: '2099-01-01T00:00:00Z' };
const tracker = readFileSync(new URL('../../public/spa-tracking.js', import.meta.url), 'utf8');

// The exact body trackEcommercePurchase builds (see the source assertion below).
const trackerBody = (over = {}) => ({
  siteId: SITE, sessionId: 'sess_abc', eventType: 'purchase',
  orderId: 'order_1732100000000', currency: 'SEK', total: 499,
  items: [{ id: '/checkout', name: '/checkout', price: 499, quantity: 1 }],
  ...over,
});

async function send(body, { ledger = LEDGER_OK, ledgerError = null, site = { id: SITE } } = {}) {
  const d = mockDatabase((op) => {
    if (op.table === 'sites') return { data: site, error: null };
    if (op.table === 'cookie_consents') return { data: ledgerError ? null : ledger, error: ledgerError };
    return { data: { id: 'row-1' }, error: null };
  }, async (name) => (name === 'get_site_jurisdiction' ? { data: null, error: null } : { data: true, error: null }));
  const handler = loadEdge('ecommerce-tracking', d.client);
  const res = await handler(new Request('https://fn.test/ecommerce-tracking', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://shop.test' }, body: JSON.stringify(body) }));
  return { res, body: await res.json(), inserts: d.calls.filter((c) => c.table === 'ecommerce_events' && c.type === 'insert') };
}

test('tracker source: trackEcommercePurchase sends no consentGranted, in the shape this test uses', () => {
  const fn = tracker.slice(tracker.indexOf('function trackEcommercePurchase'), tracker.indexOf('function setupClickConversions'));
  assert.ok(fn.includes("apiFetch('/ecommerce-tracking'"));
  assert.doesNotMatch(fn, /consentGranted/);
  for (const key of ['siteId: SITE_ID', 'sessionId: touchSession()', "eventType: 'purchase'", 'orderId:', 'currency:', 'total: value', 'items: [{ id: id, name: id, price: value, quantity: 1 }]']) {
    assert.ok(fn.includes(key), key);
  }
});

test('tracker source: trackEcommercePurchase is only called from handlers that require analytics consent', () => {
  const calls = [...tracker.matchAll(/(?<!function )trackEcommercePurchase\(/g)].map((m) => m.index);
  assert.equal(calls.length, 2);
  for (const at of calls) {
    const setupAt = tracker.lastIndexOf('function setup', at);
    const setup = tracker.slice(setupAt, at);
    assert.match(setup, /^function (setupConversionTracking|setupClickConversions)\(/);
    // Setup defers until consent, and the event handler re-checks it on every event.
    assert.match(setup, /if \(!hasInteractionConsent\(\)\) \{\s*deferUntilInteractionConsent/);
    assert.match(setup, /addEventListener\('(submit|click)', function ?\(e\) \{\s*if \(!hasInteractionConsent\(\)\) return;/);
  }
  assert.match(tracker, /function hasInteractionConsent\(\) \{\s*return hasStoredAnalyticsConsent\(\);/);
});

test('tracker payload with analytics consent in the ledger is stored (was 400 Invalid consentGranted)', async () => {
  const { res, body, inserts } = await send(trackerBody());
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.equal(body.success, true);
  assert.equal(inserts.length, 1);
  const row = inserts[0].payload;
  assert.equal(row.site_id, SITE);
  assert.equal(row.session_id, 'sess_abc');
  assert.equal(row.event_type, 'purchase');
  assert.equal(row.transaction_id, 'order_1732100000000');
  assert.equal(row.revenue, 499);
  assert.equal(row.product_id, '/checkout');
  assert.equal(row.price, 499);
  assert.equal(row.quantity, 1);
  assert.equal(row.currency, 'SEK');
  assert.equal(row.consent_granted, true);
});

test('fail closed: no ledger row, a refusal, analytics false, an expired row or a failed read = no write', async () => {
  const cases = {
    none: { ledger: null },
    refused: { ledger: { ...LEDGER_OK, consent_given: false } },
    analyticsFalse: { ledger: { ...LEDGER_OK, consent_types: { analytics: false, marketing: true } } },
    expired: { ledger: { ...LEDGER_OK, expires_at: '2020-01-01T00:00:00Z' } },
    readError: { ledgerError: { message: 'boom' } },
  };
  for (const [name, opts] of Object.entries(cases)) {
    const { res, body, inserts } = await send(trackerBody(), opts);
    assert.equal(res.status, 200, name);
    assert.deepEqual([body.success, body.skipped], [false, 'no_consent'], name);
    assert.equal(inserts.length, 0, name);
  }
});

test('a client consentGranted: false is never overridden by the ledger', async () => {
  const { body, inserts } = await send(trackerBody({ consentGranted: false }));
  assert.deepEqual([body.success, body.skipped], [false, 'no_consent']);
  assert.equal(inserts.length, 0);
});

test('the legacy productData/transactionData shape still works with ledger consent', async () => {
  const { body, inserts } = await send({ siteId: SITE, sessionId: 's-1', eventType: 'purchase', consentGranted: true,
    transactionData: { id: 't-1', revenue: 100 } });
  assert.equal(body.success, true);
  assert.equal(inserts[0].payload.revenue, 100);
  assert.equal(inserts[0].payload.transaction_id, 't-1');
});

test('invalid tracker fields are still rejected', async () => {
  for (const over of [{ total: -1 }, { total: '10' }, { items: 'x' }, { orderId: 'x'.repeat(201) }, { consentGranted: 'yes' }]) {
    const { res, inserts } = await send(trackerBody(over));
    assert.equal(res.status, 400, JSON.stringify(over));
    assert.equal(inserts.length, 0);
  }
});
