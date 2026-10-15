// tests/foundation/conversion-goals.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { normalizeGoals, clientGoals, matchPageVisitGoals } from '../../supabase/functions/_shared/conversion-goals.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const GOALS = normalizeGoals([
  { id: 'contact', name: 'Contact form', type: 'form_submission', selector: '#contact-form', value: 50 },
  { id: 'phone', name: 'Phone click', type: 'phone_click', selector: 'a[href^="tel:"]', value: 25 },
  { id: 'thanks', name: 'Thank you page', type: 'page_visit', selector: '/thank-you, https://a.se/tack' },
  { id: 'docs', name: 'Docs', type: 'page_visit', selector: '/docs/*' },
  { id: 'bad', name: '', type: 'page_visit', selector: '/x' },
  null,
]);

test('normalizeGoals drops malformed goals', () => {
  assert.deepEqual(GOALS.map((g) => g.id), ['contact', 'phone', 'thanks', 'docs']);
});

test('clientGoals: only DOM goals, without names or values', () => {
  assert.deepEqual(clientGoals(GOALS), [
    { id: 'contact', type: 'form_submission', selector: '#contact-form' },
    { id: 'phone', type: 'phone_click', selector: 'a[href^="tel:"]' },
  ]);
});

test('page_visit matching: exact path, trailing slash, query, full URL, wildcard', () => {
  const ids = (url) => matchPageVisitGoals(GOALS, url).map((g) => g.id);
  assert.deepEqual(ids('https://a.se/thank-you'), ['thanks']);
  assert.deepEqual(ids('https://a.se/thank-you/?ref=x'), ['thanks']);
  assert.deepEqual(ids('https://a.se/Tack'), ['thanks']);
  assert.deepEqual(ids('https://a.se/thank-you-old'), []);
  assert.deepEqual(ids('https://a.se/docs/install'), ['docs']);
  assert.deepEqual(ids('not a url'), []);
});

test('PostgreSQL: record_conversion_event links the session and counts a goal once per session', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text, started_at timestamptz DEFAULT now());
      CREATE TABLE public.conversion_events (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL, session_id uuid,
        event_type text NOT NULL, event_name text NOT NULL, event_value numeric, element_selector text, created_at timestamptz DEFAULT now());
    `);
    await db.exec(read('../../supabase/migrations/20261016100000_record_conversion_event.sql'));
    const site = '11111111-1111-4111-8111-111111111111';
    await db.query(`INSERT INTO tracking_sessions (site_id, session_id) VALUES ($1, 's1')`, [site]);
    const rec = async (sess, name, value = 50) =>
      (await db.query(`SELECT public.record_conversion_event($1, $2, $3, 'form_submission', '#f', $4) AS ok`, [site, sess, name, value])).rows[0].ok;
    assert.equal(await rec('s1', 'Contact form'), true);
    assert.equal(await rec('s1', 'Contact form'), false, 'second hit in the same session is ignored');
    assert.equal(await rec('s1', 'Phone click'), true, 'another goal in the same session counts');
    assert.equal(await rec('unknown', 'Contact form'), true, 'no session row: stored without session');
    assert.equal(await rec('s1', '  '), false, 'empty name rejected');
    assert.equal(await rec('s2', 'Huge', 1e12), true);
    const { rows } = await db.query(`SELECT event_name, session_id IS NOT NULL AS linked, event_value::float AS v FROM conversion_events ORDER BY created_at, event_name`);
    assert.equal(rows.length, 4);
    assert.deepEqual(rows.filter((r) => r.linked).map((r) => r.event_name).sort(), ['Contact form', 'Phone click']);
    assert.equal(rows.find((r) => r.event_name === 'Huge').v, null, 'out-of-range value dropped');
  } finally {
    await db.close();
  }
});

test('track-event records conversions and hands DOM goals to the tracker', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /rpc\('record_conversion_event'/);
  assert.match(src, /matchPageVisitGoals\(goals, pageUrl\)/);
  assert.match(src, /goals: goalsForTracker/);
  assert.match(src, /m\.server_record === true/);
});

test('tracker installs goal listeners from the page-view response', () => {
  const src = read('../../public/spa-tracking.js');
  assert.match(src, /res && Array\.isArray\(res\.goals\)\) installConversionGoals\(res\.goals\)/);
  assert.match(src, /goal_id: goal\.id/);
  assert.match(src, /COOKIELESS && \{ server_record: true \}/);
});
