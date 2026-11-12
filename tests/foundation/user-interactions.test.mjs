// tests/foundation/user-interactions.test.mjs
// Per-event click interactions reach user_interactions (20261126000001_user_interactions_ingest.sql)
// only from analytics-consented sources: the tracker's 'interaction' events via track-event, and
// pixel-tracking when its caller passes analytics consent. pixel-tracking used to insert a
// non-existent site_id column and text session ids into uuid FKs, so the table stayed empty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { sanitizeInteraction, maskText, storedHref } from '../../supabase/functions/_shared/interaction.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: record_user_interaction resolves the visit and page view, else stores nothing', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL,
        session_id text NOT NULL, started_at timestamptz NOT NULL DEFAULT now(), last_activity timestamptz);
      CREATE TABLE public.page_views (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid REFERENCES public.tracking_sessions(id) ON DELETE CASCADE, site_id uuid NOT NULL,
        url text NOT NULL, viewed_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.user_interactions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id uuid NOT NULL REFERENCES public.tracking_sessions(id) ON DELETE CASCADE,
        page_view_id uuid NOT NULL REFERENCES public.page_views(id) ON DELETE CASCADE,
        interaction_type text NOT NULL, element_tag text, element_id text, element_class text, element_text text,
        x_coordinate int, y_coordinate int, scroll_position int, timestamp_ms bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now());
    `);
    await db.exec(read('../../supabase/migrations/20261126000001_user_interactions_ingest.sql'));

    const site = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    const call = (siteId, session, url, type = 'link_click') => db.query(
      `SELECT public.record_user_interaction($1,$2,$3,$4,'a',null,'btn','Read more','https://x.se/b',null,null,null,now()) AS id`,
      [siteId, session, url, type]).then((r) => r.rows[0].id);

    assert.equal(await call(site, 's1', 'https://x.se/a'), null, 'no visit → nothing stored');

    const { rows: [s] } = await db.query(
      `INSERT INTO tracking_sessions (site_id, session_id, started_at) VALUES ($1,'s1', now() - interval '10 minutes') RETURNING id`, [site]);
    assert.equal(await call(site, 's1', 'https://x.se/a'), null, 'visit without a page view → nothing stored');

    const { rows: [pvA] } = await db.query(
      `INSERT INTO page_views (session_id, site_id, url, viewed_at) VALUES ($1,$2,'https://x.se/a?utm=1', now() - interval '5 minutes') RETURNING id`, [s.id, site]);
    await db.query(
      `INSERT INTO page_views (session_id, site_id, url, viewed_at) VALUES ($1,$2,'https://x.se/c', now() - interval '1 minute')`, [s.id, site]);

    assert.ok(await call(site, 's1', 'https://x.se/a#top'), 'stored');
    assert.equal(await call(other, 's1', 'https://x.se/a'), null, 'another site cannot use the session id');
    assert.equal(await call(site, 's1', 'https://x.se/a', 'DROP TABLE'), null, 'invalid type rejected');

    const { rows } = await db.query(`SELECT session_id, page_view_id, interaction_type, element_href, timestamp_ms > 0 AS ts FROM user_interactions`);
    assert.equal(rows.length, 1);
    assert.deepEqual(rows[0], { session_id: s.id, page_view_id: pvA.id, interaction_type: 'link_click', element_href: 'https://x.se/b', ts: true },
      'attached to the uuid visit and the page view of the same path');

    for (const role of ['anon', 'authenticated']) {
      const { rows: [p] } = await db.query(`SELECT has_function_privilege($1,
        'public.record_user_interaction(uuid,text,text,text,text,text,text,text,text,integer,integer,integer,timestamptz)', 'EXECUTE') AS ok`, [role]);
      assert.equal(p.ok, false, `${role} cannot call it`);
    }

    await db.query(`DELETE FROM tracking_sessions WHERE id = $1`, [s.id]);
    const { rows: [n] } = await db.query(`SELECT count(*)::int AS n FROM user_interactions`);
    assert.equal(n.n, 0, 'retention: deleting the visit deletes its interactions');
  } finally {
    await db.close();
  }
});

test('interaction values are stored minimally', () => {
  const clean = sanitizeInteraction({
    interaction_type: 'LINK_CLICK', element_tag: 'A', element_id: 'cta',
    element_class: 'btn   primary', element_text: '  Mail anna@example.com or call +46 70-123 45 67  ',
    href: 'https://shop.se/checkout?email=anna@example.com#pay',
  });
  assert.deepEqual(clean, {
    interaction_type: 'link_click', element_tag: 'a', element_id: 'cta', element_class: 'btn primary',
    element_text: 'Mail [email] or call [number]', element_href: 'https://shop.se/checkout',
  });
  assert.equal(storedHref('mailto:anna@example.com'), 'mailto:');
  assert.equal(storedHref('tel:+46701234567'), 'tel:');
  assert.equal(storedHref('javascript:alert(1)'), null);
  assert.equal(maskText('x'.repeat(300)).length, 100);
  assert.equal(sanitizeInteraction({ interaction_type: "click'); DROP" }), null);
  assert.equal(sanitizeInteraction(null), null);
});

test('track-event stores tracker interaction events through the RPC', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /allowed_event_types \|\| \[[^\]]*'interaction'/, "'interaction' is on the default allow-list");
  assert.match(src, /event_type === 'interaction'/);
  assert.match(src, /rpc\('record_user_interaction'/);
  assert.match(src, /sanitizeInteraction\(body\.metadata\)/);
  assert.doesNotMatch(src, /from\('user_interactions'\)/, 'no direct insert');
});

test('pixel-tracking: no site_id on user_interactions, uuid visit ids, nothing stored without analytics consent', () => {
  const src = read('../../supabase/functions/pixel-tracking/index.ts');
  assert.doesNotMatch(src, /from\('user_interactions'\)/, 'interactions go through record_user_interaction');
  assert.match(src, /rpc\('record_user_interaction'/);
  assert.match(src, /async function sessionRowId/);
  assert.doesNotMatch(src, /session_id: sessionId,\s*\n\s*(url|page_view_id):/, 'page_views never get the text session id');
  const gate = src.indexOf('if (!hasAnalyticsConsent(event))');
  assert.ok(gate > 0 && gate < src.indexOf(".from('sites')"), 'consent gate runs before any database access');
  assert.match(src, /event\.consent\?\.analytics === true/);
  const gdpr = read('../../supabase/functions/gdpr-compliant-tracking/index.ts');
  assert.match(gdpr, /consent: \{ analytics: \(consentData\.allowed_consent_types \|\| \[\]\)\.includes\('analytics'\) \}/);
});

test('only the analytics-consented tracker sends interactions, in every tracking mode', () => {
  const tracker = read('../../public/spa-tracking.js');
  assert.match(tracker, /function hasInteractionConsent\(\) \{\s*return hasStoredAnalyticsConsent\(\);\s*\}/,
    'cookieless or operator flags never unlock interaction tracking');
  const setup = tracker.slice(tracker.indexOf('function setupInteractionTracking()'), tracker.indexOf('function setupFormAnalytics()'));
  assert.match(setup, /if \(!hasInteractionConsent\(\)\) \{ deferUntilInteractionConsent/);
  assert.match(setup, /if \(!hasInteractionConsent\(\)\) return;/, 'rechecked per click (withdrawal)');
  assert.match(setup, /trackEvent\('interaction'/);
  assert.match(tracker, /async function trackEvent\([^)]*\) \{\s*if \(!hasStoredAnalyticsConsent\(\)\) return;/);
  const beacon = read('../../src/lib/aggregate-beacon.js');
  assert.doesNotMatch(beacon, /track-event|interaction|pixel-tracking/, 'aggregate mode never sends per-event data');
});
