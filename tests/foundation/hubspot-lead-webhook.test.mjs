import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { loadEdge } from './edge-harness.mjs';

const site = '11111111-1111-4111-8111-111111111111';
const secret = 'hubspot-secret';
const email = 'Lead@Example.com ';
const hashed = createHash('sha256').update(email.toLowerCase().trim()).digest('hex');
const source = readFileSync(new URL('../../supabase/functions/hubspot-lead-webhook/index.ts', import.meta.url), 'utf8');

// Local mock: edge-harness's mockDatabase has no `.is()`, which this function uses.
function database(matches) {
  const calls = [];
  const client = {
    from(table) {
      const op = { table, type: 'select', filters: [], payload: null };
      const q = {
        select() { return q; },
        insert(p) { op.type = 'insert'; op.payload = p; return q; },
        upsert(p) { op.type = 'upsert'; op.payload = p; return q; },
        update(p) { op.type = 'update'; op.payload = p; return q; },
        eq(k, v) { op.filters.push([k, v]); return q; },
        is(k, v) { op.filters.push([k, v]); return q; },
        limit() { return q; }, single() { return q; }, maybeSingle() { return q; },
        then(yes, no) {
          calls.push(op);
          const data = table === 'sites'
            ? { id: site, hubspot_webhook_secret: secret, hubspot_quality_property: 'lead_quality' }
            : op.type === 'select' ? matches : null;
          return Promise.resolve({ data, error: null }).then(yes, no);
        },
      };
      return q;
    },
  };
  return { client, calls };
}

function signedRequest(events) {
  const body = JSON.stringify(events);
  const signature = createHash('sha256').update((secret + body).toLowerCase().trim()).digest('hex');
  return new Request(`https://example.test/hubspot-lead-webhook?site_id=${site}`, {
    method: 'POST', body, headers: { 'x-hubspot-signature': signature },
  });
}

const event = { propertyName: 'lead_quality', propertyValue: 'Qualified', email };

test('unmatched contact: 200 matched:false and no write of any kind', async () => {
  const { client, calls } = database([]);
  const res = await loadEdge('hubspot-lead-webhook', client)(signedRequest([event]));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).matched, false);
  assert.equal(calls.some(c => c.type !== 'select'), false);
});

test('lookup is by hash, site and click_id_consent_given = true; plaintext never sent to DB', async () => {
  const { client, calls } = database([{ id: 'ce-1', gclid: 'g-1' }]);
  const res = await loadEdge('hubspot-lead-webhook', client)(signedRequest([event]));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).matched, true);
  const lookup = calls.find(c => c.table === 'conversion_events' && c.type === 'select');
  assert.deepEqual(lookup.filters.slice(0, 3), [['site_id', site], ['hashed_email', hashed], ['click_id_consent_given', true]]);
  const update = calls.find(c => c.table === 'conversion_events' && c.type === 'update');
  assert.ok(update.filters.some(([k, v]) => k === 'click_id_consent_given' && v === true));
  assert.equal(update.payload.lead_quality, 'Qualified');
  assert.equal(calls.some(c => c.type === 'insert' || c.type === 'upsert'), false);
  assert.equal(JSON.stringify(calls).toLowerCase().includes('lead@example.com'), false);
});

test('invalid signature is rejected before any conversion lookup', async () => {
  const { client, calls } = database([{ id: 'ce-1', gclid: 'g-1' }]);
  const req = new Request(`https://example.test/hubspot-lead-webhook?site_id=${site}`, {
    method: 'POST', body: JSON.stringify([event]), headers: { 'x-hubspot-signature': 'bad' },
  });
  assert.equal((await loadEdge('hubspot-lead-webhook', client)(req)).status, 401);
  assert.equal(calls.some(c => c.table === 'conversion_events'), false);
});

test('source has no insert/upsert path and never logs email or payload', () => {
  assert.doesNotMatch(source, /\.(insert|upsert)\s*\(/);
  for (const line of source.split('\n').filter(l => /console\.\w+\(/.test(l))) {
    assert.doesNotMatch(line, /email|rawBody|body\b|event\b|events\b|err\)/i, line.trim());
  }
});
