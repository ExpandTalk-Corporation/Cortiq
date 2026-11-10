// tests/foundation/social-overview.test.mjs
// Social Media tab: get_social_overview contract, SQL/TS classification parity, and the tab copy
// that has to stay (consent note on click IDs, aggregate label, UTM empty state).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classifySocial, isSocialMedium, isPaidSocialMedium } from '../../src/lib/socialNetworks.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';
const OWNER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OWNER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MIGRATION = '../../supabase/migrations/20261117000002_social_overview.sql';

async function setup() {
  const db = new PGlite();
  const fixture = read('./social-overview.sql').replace(/^\\ir \.\.\/\.\.\/(supabase\/migrations\/[^\n]+\.sql)$/gm, (_m, p) => read(`../../${p}`));
  await db.exec(fixture);
  return db;
}

async function asOwner(db, owner, fn) {
  await db.exec(`SELECT set_config('request.jwt.claim.sub', '${owner}', false); SET ROLE authenticated;`);
  try { return await fn(); } finally { await db.exec('RESET ROLE;'); }
}

const overview = async (db, site, from, to, path = null) =>
  (await db.query('SELECT public.get_social_overview($1, $2, $3, $4, NULL) AS r', [site, from, to, path])).rows[0].r;

test('get_social_overview: networks, engagement, conversions, key pages, paid, landing pages, campaigns', async () => {
  const db = await setup();
  try {
    const r = await asOwner(db, OWNER_A, () => overview(db, SITE_A, '2026-09-01', '2026-09-03'));
    const net = Object.fromEntries(r.networks.map((n) => [n.network, n]));
    assert.deepEqual(Object.keys(net).sort(), ['facebook', 'instagram', 'linkedin', 'other']);
    assert.equal(r.total_sessions, 5, 'google + out-of-range + other site excluded from social; total counts in-range sessions');
    assert.equal(r.social_sessions, 4);

    assert.equal(net.facebook.sessions, 1);
    assert.equal(net.facebook.page_views, 3);
    assert.equal(net.facebook.engaged, 1);
    assert.equal(net.facebook.conversions, 1);
    assert.equal(net.facebook.key_page_visits, 1, '/contact/ is a key page');
    assert.equal(net.facebook.click_id_sessions, 1);
    assert.equal(net.facebook.paid_sessions, 1, 'fbclid marks the visit paid');

    assert.equal(net.instagram.engaged, 0, '1 page view, 4 s, no conversion = not engaged');
    assert.equal(net.instagram.tagged_sessions, 1);
    assert.equal(net.instagram.paid_sessions, 0);
    assert.equal(net.linkedin.engaged, 1, '>= 10 s');
    assert.equal(net.linkedin.paid_sessions, 1, 'paid-social medium');
    assert.equal(net.other.sessions, 1, 'utm_medium=social with unknown source');

    const fbLanding = r.landing_pages.filter((l) => l.network === 'facebook');
    assert.deepEqual(fbLanding.map((l) => l.path), ['/blog/post'], 'first page view, query string stripped');

    const camp = r.campaigns.find((c) => c.utm_campaign === 'b2b-q3');
    assert.equal(camp.network, 'linkedin');
    assert.equal(camp.paid, true);
    assert.ok(r.campaigns.some((c) => c.utm_campaign === 'autumn' && c.utm_source === 'ig' && c.paid === false));

    assert.deepEqual(r.daily.map((d) => `${d.day}:${d.network}`), ['2026-09-01:facebook', '2026-09-02:instagram', '2026-09-02:linkedin', '2026-09-03:other']);
    assert.deepEqual(r.aggregate, { enabled: false, networks: [] }, 'aggregate rows ignored when the site has it off');

    const filtered = await asOwner(db, OWNER_A, () => overview(db, SITE_A, '2026-09-01', '2026-09-03', 's1'));
    assert.deepEqual(filtered.networks.map((n) => n.network), ['facebook'], 'URL/segment filter applied');
  } finally {
    await db.close();
  }
});

test('get_social_overview: consent-free aggregate counts only when the site has them on', async () => {
  const db = await setup();
  try {
    const r = await asOwner(db, OWNER_B, () => overview(db, SITE_B, '2026-09-01', '2026-09-01'));
    assert.equal(r.aggregate.enabled, true);
    const agg = Object.fromEntries(r.aggregate.networks.map((n) => [n.network, n]));
    assert.deepEqual(Object.keys(agg).sort(), ['facebook', 'tiktok'], 'google.com is not social');
    assert.equal(agg.facebook.visits, 10);
    assert.equal(agg.facebook.engaged_visits, 4);
    assert.equal(agg.facebook.conversions, 2);
    assert.equal(agg.tiktok.visits, 5);
  } finally {
    await db.close();
  }
});

test('get_social_overview: owner check and range limit', async () => {
  const db = await setup();
  try {
    await asOwner(db, OWNER_A, async () => {
      await assert.rejects(overview(db, SITE_B, '2026-09-01', '2026-09-03'), /not authorised/);
      await assert.rejects(overview(db, SITE_A, '2025-01-01', '2026-09-03'), /invalid range/);
      await assert.rejects(overview(db, SITE_A, '2026-09-03', '2026-09-01'), /invalid range/);
    });
    await db.exec('SET ROLE anon;');
    await assert.rejects(db.query(`SELECT public.get_social_overview('${SITE_A}', '2026-09-01', '2026-09-03')`), /permission denied/);
    await db.exec('RESET ROLE;');
  } finally {
    await db.close();
  }
});

test('SQL and TS social classification agree', async () => {
  const db = await setup();
  const cases = [
    ['https://l.facebook.com/l.php?u=x', null], ['m.facebook.com', null], ['fb.me', null], ['notfacebook.com', null],
    ['https://www.instagram.com/', null], ['lnkd.in', null], ['https://t.co/abc', null], ['x.com', null], ['box.com', null],
    ['www.tiktok.com', null], ['youtu.be', null], ['https://www.youtube.com:443/watch', null], ['pinterest.co.uk', null], ['pin.it', null],
    ['old.reddit.com', null], ['threads.net', null], ['bsky.app', null], ['mastodon.social', null], ['mas.to', null],
    ['snapchat.com', null], ['google.com', null], ['', null], [null, null],
    [null, 'IG'], [null, ' Facebook '], ['google.com', 'linkedin'], [null, 'tw'], [null, 'newsletter'], ['facebook.com', 'newsletter'],
    [null, 'bsky'], [null, 'yt'], [null, 'snap'], [null, 'x.com'],
  ];
  try {
    for (const [host, src] of cases) {
      const { rows } = await db.query('SELECT public.social_network($1, $2) AS n', [host, src]);
      assert.equal(rows[0].n, classifySocial(host, src), `${host} / ${src}`);
    }
    for (const m of ['social', 'Paid-Social', 'cpc', 'email', '', null, 'sm', 'paidsocial', 'cpm', 'organic']) {
      const { rows } = await db.query('SELECT public.is_social_medium($1) AS s, public.is_paid_social_medium($1) AS p', [m]);
      assert.equal(rows[0].s, isSocialMedium(m), `social ${m}`);
      assert.equal(rows[0].p, isPaidSocialMedium(m), `paid ${m}`);
    }
  } finally {
    await db.close();
  }
  assert.equal(classifySocial('notfacebook.com', null), null);
  assert.equal(classifySocial(null, 'IG'), 'instagram');
});

test('migration follows the RPC contract', () => {
  const sql = read(MIGRATION);
  assert.match(sql, /SECURITY DEFINER\s+SET search_path = ''/);
  assert.match(sql, /user_id = auth\.uid\(\)/);
  assert.match(sql, /p_to - p_from \+ 1 > 366/);
  assert.match(sql, /public\.session_matches_filters\(ts, p_path, p_segment\)/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.get_social_overview\(uuid, date, date, text, jsonb\) FROM PUBLIC, anon;/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.get_social_overview\(uuid, date, date, text, jsonb\) TO authenticated;/);
});

test('Social tab reads the RPC and keeps the consent, aggregate and UTM copy', () => {
  const hook = read('../../src/hooks/useSocialMedia.tsx');
  assert.match(hook, /rpc\('get_social_overview'/);
  assert.match(hook, /useFilterParams/);
  const tab = read('../../src/components/dashboard/tabs/SocialMediaTab.tsx');
  assert.match(tab, /only stored when the visitor gave marketing consent/i);
  assert.match(tab, /Aggregate \(consent-free\)/);
  assert.match(tab, /utm_source=/);
  assert.match(tab, /fbclid/);
});
