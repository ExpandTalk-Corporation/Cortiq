import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { loadEdge, mockDatabase } from './edge-harness.mjs';
import { signGeo, GEO_HEADER } from '../../supabase/functions/_shared/geo-token.js';

const SITE = '11111111-1111-4111-8111-111111111111';
const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const KEY = 'tk_' + 'a'.repeat(32);
const GEO_KEY = 'k'.repeat(32);
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36';
const GOALS = [
  { id: 'g-form', name: 'Demo form', type: 'form_submission', selector: '#demo-form', value: 100 },
  { id: 'g-thanks', name: 'Thank-you page', type: 'page_visit', selector: '/tack' },
];

function setup({ ingest = { data: true, error: null } } = {}) {
  const rpcCalls = [];
  const db = mockDatabase((op) => {
    if (op.table === 'sites') {
      const byKey = op.filters.find(([k]) => k === 'tracking_id');
      return { data: byKey && byKey[1] === KEY ? { id: SITE, user_id: OWNER, is_active: true, domain: 'shop.test', aggregate_measurement: true, conversion_goals: GOALS } : null, error: null };
    }
    return { data: null, error: null };
  }, async (name, args) => {
    rpcCalls.push({ name, args });
    if (name === 'aggregate_daily_salt') return { data: 'f'.repeat(64), error: null };
    if (name === 'ingest_aggregate_hit') return ingest;
    if (name === 'get_site_jurisdiction') return { data: null, error: null };
    return { data: true, error: null };
  });
  return { rpcCalls, handler: loadEdge('aggregate-hit', db.client, { env: { GEO_SIGNING_KEY: GEO_KEY } }) };
}
const post = (body, headers = {}) => new Request('https://fn.test/aggregate-hit', {
  method: 'POST', headers: { Authorization: `Bearer ${KEY}`, 'user-agent': CHROME, 'cf-connecting-ip': '203.0.113.9', ...headers },
  body: JSON.stringify({ siteId: SITE, ...body }),
});
const goalCountries = (rpcCalls) => rpcCalls.filter((c) => c.name === 'ingest_aggregate_goal_country').map((c) => [c.args.p_goal_id, c.args.p_country]);
const signed = async (country) => ({ [GEO_HEADER]: await signGeo({ country, region: null, ip: '203.0.113.9' }, GEO_KEY, Math.floor(Date.now() / 1000)) });

test('page-visit and form goals are counted per signed country', async () => {
  const { handler, rpcCalls } = setup();
  await handler(post({ kind: 'pageview', url: 'https://shop.test/tack' }, await signed('NO')));
  await handler(post({ kind: 'goal', url: 'https://shop.test/demo', goalId: 'g-form' }, await signed('DE')));
  assert.deepEqual(goalCountries(rpcCalls), [['g-thanks', 'NO'], ['g-form', 'DE']]);
});

test('time-zone geo is not used for goal countries; burst-dropped views add nothing', async () => {
  const tz = setup();
  await tz.handler(post({ kind: 'pageview', url: 'https://shop.test/tack', tz: 'Europe/Stockholm' }));
  assert.deepEqual(goalCountries(tz.rpcCalls), [['g-thanks', '']]);
  const burst = setup({ ingest: { data: false, error: null } });
  await burst.handler(post({ kind: 'pageview', url: 'https://shop.test/tack' }, await signed('NO')));
  assert.deepEqual(goalCountries(burst.rpcCalls), []);
});

test('PostgreSQL: daily counts per country and goal, owner RLS, service-role ingest, retention', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid);
      CREATE TABLE public.aggregate_pages_daily (site_id uuid, day date);
      INSERT INTO sites VALUES ('${SITE}', '${OWNER}');
      INSERT INTO aggregate_pages_daily VALUES ('${SITE}', '2026-11-01');`);
    await pg.exec(readFileSync(new URL('../../supabase/migrations/20261207000004_aggregate_goal_countries.sql', import.meta.url), 'utf8'));
    const ing = (c, g, now) => pg.query('SELECT public.ingest_aggregate_goal_country($1, $2, $3, $4)', [SITE, c, g, now]);
    await ing('se', 'g-1', '2026-11-02T10:00:00Z'); await ing('SE', 'g-1', '2026-11-02T11:00:00Z'); await ing('XX', 'g-1', '2026-11-02T12:00:00Z');
    await ing('SE', 'g-1', '2026-10-01T00:00:00Z');
    const rows = (await pg.query('SELECT day::text, country, goal_id, conversions FROM aggregate_goal_countries_daily ORDER BY day, country')).rows;
    assert.deepEqual(rows, [
      { day: '2026-10-01', country: 'SE', goal_id: 'g-1', conversions: 1 },
      { day: '2026-11-02', country: '', goal_id: 'g-1', conversions: 1 },
      { day: '2026-11-02', country: 'SE', goal_id: 'g-1', conversions: 2 },
    ]);
    assert.equal((await pg.query('SELECT public.aggregate_goal_countries_retention() n')).rows[0].n, 1, 'older than the oldest page day');
    for (const role of ['anon', 'authenticated']) {
      const g = (await pg.query(`SELECT has_function_privilege('${role}', 'public.ingest_aggregate_goal_country(uuid,text,text,timestamptz)', 'EXECUTE') a`)).rows[0].a;
      assert.equal(g, false, role);
    }
    await assert.rejects(ing('SE', 'x'.repeat(201), '2026-11-02T10:00:00Z'), /check/i);
  } finally { await pg.close(); }
});
