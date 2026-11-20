// tests/foundation/hubspot-reported-channel.test.mjs
// Attribution layer 1.5, HubSpot path (jurist review 2026-11-20, blocking 4): the "how did you
// hear about us" property is mapped in memory, only the category reaches the database, unmatched
// contacts are dropped, and the path never touches upload_status or quality_classified_at.
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

function database(siteRow, rpcResult = 1) {
  const calls = [];
  const client = {
    rpc(name, args) { calls.push({ type: 'rpc', name, args }); return Promise.resolve({ data: rpcResult, error: null }); },
    from(table) {
      const op = { table, type: 'select', filters: [], payload: null, columns: null };
      const q = {
        select(c) { op.columns = c; return q; },
        update(p) { op.type = 'update'; op.payload = p; return q; },
        insert(p) { op.type = 'insert'; op.payload = p; return q; },
        eq(k, v) { op.filters.push([k, v]); return q; },
        is(k, v) { op.filters.push([k, v]); return q; },
        limit() { return q; }, single() { return q; }, maybeSingle() { return q; },
        then(yes, no) {
          calls.push(op);
          const data = table === 'sites' ? siteRow : op.type === 'select' ? [] : null;
          return Promise.resolve({ data, error: null }).then(yes, no);
        },
      };
      return q;
    },
  };
  return { client, calls };
}

const configured = {
  id: site, hubspot_webhook_secret: secret, hubspot_quality_property: 'lead_quality',
  reported_channel_hubspot_property: 'how_did_you_hear',
  reported_channel_hubspot_map: { ChatGPT: 'ai_assistant', 'The Podcast': 'podcast' },
  reported_channel_policy_version: '2',
};

function signedRequest(events) {
  const body = JSON.stringify(events);
  const signature = createHash('sha256').update((secret + body).toLowerCase().trim()).digest('hex');
  return new Request(`https://example.test/hubspot-lead-webhook?site_id=${site}`, {
    method: 'POST', body, headers: { 'x-hubspot-signature': signature },
  });
}

const answer = (value) => ({ propertyName: 'how_did_you_hear', propertyValue: value, email });

test('a mapped answer sends only the category and the hash', async () => {
  const { client, calls } = database(configured);
  const res = await loadEdge('hubspot-lead-webhook', client)(signedRequest([answer('  chatgpt ')]));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).reported_count, 1);
  const rpc = calls.filter((c) => c.type === 'rpc');
  assert.equal(rpc.length, 1);
  assert.equal(rpc[0].name, 'apply_reported_channel_hubspot');
  assert.deepEqual(rpc[0].args, { p_site_id: site, p_hashed_email: hashed, p_category: 'ai_assistant' });
  assert.equal(calls.some((c) => c.type === 'update' || c.type === 'insert'), false, 'no direct row write');
  const sent = JSON.stringify(calls).toLowerCase();
  assert.equal(sent.includes('chatgpt'), false, 'raw answer never reaches the database');
  assert.equal(sent.includes('lead@example.com'), false, 'plain email never reaches the database');
});

test('an unknown answer becomes other; the raw value is not sent', async () => {
  const { client, calls } = database(configured);
  await loadEdge('hubspot-lead-webhook', client)(signedRequest([answer('My therapist recommended you')]));
  const rpc = calls.find((c) => c.type === 'rpc');
  assert.equal(rpc.args.p_category, 'other');
  assert.equal(JSON.stringify(calls).includes('therapist'), false);
});

test('unmatched contact: 200, nothing written, no retry', async () => {
  const { client } = database(configured, 0);
  const res = await loadEdge('hubspot-lead-webhook', client)(signedRequest([answer('ChatGPT')]));
  assert.equal(res.status, 200);
  assert.equal((await res.json()).reported_count, 0);
});

test('off without a policy version or property', async () => {
  for (const row of [
    { ...configured, reported_channel_policy_version: null },
    { ...configured, reported_channel_hubspot_property: null },
  ]) {
    const { client, calls } = database(row);
    await loadEdge('hubspot-lead-webhook', client)(signedRequest([answer('ChatGPT')]));
    assert.equal(calls.some((c) => c.type === 'rpc'), false);
  }
});

test('the reported path is its own branch: no upload_status, no quality_classified_at, no raw value logged', () => {
  const branch = source.slice(source.indexOf('if (reportedProperty && event.propertyName'), source.indexOf('if (event.propertyName !== qualityProperty)'));
  assert.ok(branch.length > 100);
  assert.doesNotMatch(branch, /upload_status|quality_classified_at|lead_quality|from\('conversion_events'\)/);
  for (const line of source.split('\n').filter((l) => /console\.\w+\(/.test(l))) {
    assert.doesNotMatch(line, /propertyValue|category|reportedMap|value\b/i, line.trim());
  }
  assert.doesNotMatch(source, /anthropic|openai|claude/i, 'no LLM call');
});
