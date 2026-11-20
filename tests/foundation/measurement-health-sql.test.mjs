// Spec 2026-11-19 §1: one RPC with checks and a signal inventory, read through RLS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurementDb, asUser, spread, S1, S2, OWNER } from './measurement-fixture.mjs';

const NOW = '2026-11-19T12:00:00Z';
const health = (pg, site = S1) => asUser(pg, OWNER, async () =>
  (await pg.query(`SELECT public.get_measurement_health($1, $2) AS h`, [site, NOW])).rows[0].h);
const byKey = (h) => Object.fromEntries(h.checks.map((c) => [c.key, c]));

test('a site with no data: every signal listed with zeros, no broken checks', async () => {
  const pg = await measurementDb();
  try {
    const h = await health(pg);
    assert.deepEqual(h.checks.map((c) => c.key), ['uptime', 'pipelines', 'goals_configured', 'goal_health', 'consent_rate', 'conversions']);
    assert.deepEqual(h.signals.map((s) => s.signal), ['page_views', 'clicks_button', 'clicks_link', 'clicks_nav', 'form_sessions', 'consent_choices', 'aggregate_hits', 'server_hits', 'link_clicks', 'conversions']);
    assert.ok(h.signals.every((s) => s.count_7d === 0 && s.count_28d === 0 && s.last_seen === null));
    const c = byKey(h);
    assert.equal(c.uptime.status, 'unknown');
    assert.equal(c.goals_configured.status, 'warning');
    assert.equal(c.goal_health.status, 'unknown');
    assert.equal(c.consent_rate.status, 'unknown');
    assert.equal(h.status, 'warning', 'worst check wins; unknown counts as ok');
  } finally { await pg.close(); }
});

test('non-owner is refused', async () => {
  const pg = await measurementDb();
  try {
    await assert.rejects(health(pg, S2), (e) => e.code === '42501');
  } finally { await pg.close(); }
});

test('uptime: open down alert → broken; snippet version and alert evidence are returned', async () => {
  const pg = await measurementDb();
  try {
    await pg.query(`SELECT public.record_uptime_check($1, NULL, 200, NULL, true, '2026-11-19T11:00:00Z', '5.5.13')`, [S1]);
    await pg.query(`INSERT INTO uptime_alerts (site_id, kind, detail, opened_at) VALUES ($1, 'down', 'HTTP 503', '2026-11-19T11:30:00Z')`, [S1]);
    const h = await health(pg);
    const up = byKey(h).uptime;
    assert.equal(up.status, 'broken');
    assert.equal(up.evidence.snippet_version, '5.5.13');
    assert.equal(up.evidence.open[0].detail, 'HTTP 503');
    assert.equal(h.status, 'broken');
  } finally { await pg.close(); }
});

test('goal health: silent, fires too often and duplicate primary', async () => {
  const pg = await measurementDb();
  try {
    await pg.query(`UPDATE sites SET conversion_goals = $2 WHERE id = $1`, [S1, JSON.stringify([
      { id: 'g1', name: 'signup', type: 'event', is_primary: true },
      { id: 'g2', name: 'engaged', type: 'event', is_primary: true },
    ])]);
    for (const t of spread(10, NOW, 20 * 24, 1)) await pg.query(`INSERT INTO tracking_sessions (site_id, started_at) VALUES ($1, $2)`, [S1, t]);
    for (const t of spread(4, NOW, 20 * 24, 1)) await pg.query(`INSERT INTO conversion_events VALUES ($1, 'engaged', NULL, $2)`, [S1, t]);
    const g = byKey(await health(pg)).goal_health;
    assert.equal(g.status, 'warning');
    assert.equal(g.evidence.sessions_30d, 10);
    assert.equal(g.evidence.primary_goals, 2);
    assert.deepEqual(g.evidence.goals.map((x) => [x.id, x.hits_30d, x.issue]), [['g1', 0, 'silent'], ['g2', 4, 'fires_too_often']]);
  } finally { await pg.close(); }
});

test('consent rate: a 15 pp drop with ≥30 choices per window warns', async () => {
  const pg = await measurementDb();
  try {
    const add = (n, yes, from, to) => Promise.all(spread(n, NOW, from, to).map((t, i) =>
      pg.query(`INSERT INTO cookie_consents VALUES ($1, $2, $3)`, [S1, t, JSON.stringify({ analytics: i < yes })])));
    await add(40, 32, 30 * 24, 8 * 24);   // 80 %
    await add(30, 19, 6 * 24, 1);         // 63.3 % → −16.7 pp
    const c = byKey(await health(pg)).consent_rate;
    assert.equal(c.status, 'warning');
    assert.deepEqual(c.evidence, { choices_7d: 30, choices_prior_28d: 40, rate_7d: 63.3, rate_prior_28d: 80.0 });
  } finally { await pg.close(); }
});

test('signals count 7 d and 28 d windows; clicks join through tracking_sessions', async () => {
  const pg = await measurementDb();
  try {
    for (const t of [...spread(3, NOW, 6 * 24, 1), ...spread(2, NOW, 20 * 24, 10 * 24), ...spread(1, NOW, 40 * 24, 39 * 24)]) {
      await pg.query(`INSERT INTO page_views VALUES ($1, $2)`, [S1, t]);
    }
    const sess = (await pg.query(`INSERT INTO tracking_sessions (site_id, started_at) VALUES ($1, $2) RETURNING id`, [S1, '2026-11-18T10:00:00Z'])).rows[0].id;
    const other = (await pg.query(`INSERT INTO tracking_sessions (site_id, started_at) VALUES ($1, $2) RETURNING id`, [S2, '2026-11-18T10:00:00Z'])).rows[0].id;
    await pg.query(`INSERT INTO user_interactions VALUES ($1, 'button_click', '2026-11-18T10:01:00Z'), ($1, 'link_click', '2026-11-18T10:02:00Z'), ($2, 'button_click', '2026-11-18T10:03:00Z')`, [sess, other]);
    await pg.query(`INSERT INTO aggregate_pages_daily VALUES ($1, '2026-11-18', 12), ($1, '2026-11-01', 5)`, [S1]);
    const s = Object.fromEntries((await health(pg)).signals.map((x) => [x.signal, x]));
    assert.deepEqual([s.page_views.count_7d, s.page_views.count_28d], [3, 5]);
    assert.deepEqual([s.clicks_button.count_7d, s.clicks_link.count_7d, s.clicks_nav.count_7d], [1, 1, 0]);
    assert.deepEqual([s.aggregate_hits.count_7d, s.aggregate_hits.count_28d], [12, 17]);
    assert.ok(s.page_views.last_seen);
  } finally { await pg.close(); }
});
