// tests/foundation/consent-acceptance.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptanceRate, fetchAnalyticsAcceptance } from '../../src/lib/consentAcceptance.ts';

test('acceptanceRate: share of answers granting analytics, null without answers', () => {
  assert.equal(acceptanceRate([]), null);
  assert.equal(acceptanceRate([{ consent_types: { analytics: true } }, { consent_types: { analytics: false } },
    { consent_types: null }, { consent_types: { analytics: true, marketing: true } }]), 0.5);
});

test('fetchAnalyticsAcceptance queries the last-N-days window for the site', async () => {
  const seen = [];
  const q = { select() { return q; }, eq(k, v) { seen.push([k, v]); return q; }, gte(k, v) { seen.push([k, v]); return q; },
              limit() { return Promise.resolve({ data: [{ consent_types: { analytics: true } }], error: null }); } };
  const client = { from(t) { seen.push(['table', t]); return q; } };
  assert.equal(await fetchAnalyticsAcceptance(client, 'site-1', '2026-10-01T00:00:00Z'), 1);
  assert.deepEqual(seen, [['table', 'cookie_consents'], ['site_id', 'site-1'], ['created_at', '2026-10-01T00:00:00Z']]);
});
