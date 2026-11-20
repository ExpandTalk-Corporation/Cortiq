// Spec 2026-11-19 §2: rule-based conversion alerts for goals and measured forms.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measurementDb, asUser, spread, S1, S2, OWNER, OTHER } from './measurement-fixture.mjs';
import { CONVERSION_ALERT_KINDS, conversionAlertSentence, conversionEmailBody } from '../../supabase/functions/_shared/conversion-alerts.ts';

const NOW = '2026-11-19T12:00:00Z';
const check = async (pg, now = NOW) => (await pg.query(`SELECT kind, subject, resolved_at FROM public.check_conversion_alerts($1)`, [now])).rows;
const open = async (pg) => (await pg.query(
  `SELECT site_id, kind, subject, detail FROM public.conversion_alerts WHERE resolved_at IS NULL ORDER BY kind, subject`)).rows;
const views = (pg, site, n, from, to) => Promise.all(spread(n, NOW, from, to).map((t) => pg.query(`INSERT INTO page_views VALUES ($1, $2)`, [site, t])));
const hits = (pg, site, name, n, from, to) => Promise.all(spread(n, NOW, from, to).map((t) => pg.query(`INSERT INTO conversion_events VALUES ($1, $2, NULL, $3)`, [site, name, t])));
const forms = (pg, site, form, done, dropped, from, to) => Promise.all([
  ...spread(done, NOW, from, to).map((t) => pg.query(`INSERT INTO form_sessions VALUES ($1, $2, $3, $3, NULL)`, [site, form, t])),
  ...spread(dropped, NOW, from, to).map((t) => pg.query(`INSERT INTO form_sessions VALUES ($1, $2, $3, NULL, $3)`, [site, form, t])),
]);
const goals = (pg, site, list) => pg.query(`UPDATE sites SET conversion_goals = $2 WHERE id = $1`, [site, JSON.stringify(list)]);

test('goal_silent: opens only with ≥3 prior hits, 0 this week and ≥50 page views; resolves on a hit', async () => {
  const pg = await measurementDb();
  try {
    await goals(pg, S1, [{ id: 'g1', name: 'signup', type: 'event' }, { id: 'g2', name: 'rare', type: 'event' }]);
    await hits(pg, S1, 'signup', 3, 30 * 24, 8 * 24);
    await hits(pg, S1, 'rare', 2, 30 * 24, 8 * 24);
    await views(pg, S1, 49, 7 * 24 - 1, 1);
    await check(pg);
    assert.deepEqual(await open(pg), [], '49 page views is too quiet to tell');
    await views(pg, S1, 1, 2, 1);
    const emails = await check(pg);
    const rows = await open(pg);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].subject, 'g1', 'two prior hits is not enough history');
    assert.deepEqual(rows[0].detail, { goal_name: 'signup', hits_7d: 0, hits_prior_28d: 3, page_views_7d: 50 });
    assert.equal(emails.length, 1);
    await check(pg);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM conversion_alerts`)).rows[0].n, 1, 'never duplicated');
    await hits(pg, S1, 'signup', 1, 2, 1);
    await check(pg);
    assert.deepEqual(await open(pg), []);
  } finally { await pg.close(); }
});

test('goal matching follows matchesGoal: event name, or the first selector part inside element_selector', async () => {
  const pg = await measurementDb();
  try {
    await goals(pg, S1, [{ id: 'g1', name: 'Buy', type: 'click', selector: '#buy , .cta' }]);
    for (const t of spread(3, NOW, 30 * 24, 8 * 24)) await pg.query(`INSERT INTO conversion_events VALUES ($1, 'click', 'body > button#buy', $2)`, [S1, t]);
    await views(pg, S1, 60, 7 * 24 - 1, 1);
    await check(pg);
    assert.equal((await open(pg))[0]?.detail.hits_prior_28d, 3);
  } finally { await pg.close(); }
});

test('form_zero_completions: ≥5 starts, 0 completions, ≥1 completion before; resolves on a completion', async () => {
  const pg = await measurementDb();
  try {
    await forms(pg, S1, 'contact', 4, 2, 30 * 24, 8 * 24);
    await forms(pg, S1, 'contact', 0, 4, 6 * 24, 1);
    await check(pg);
    assert.deepEqual((await open(pg)).map((r) => r.kind), [], '4 starts is too few');
    await forms(pg, S1, 'contact', 0, 1, 2, 1);
    await check(pg);
    const zero = (await open(pg)).find((r) => r.kind === 'form_zero_completions');
    assert.deepEqual(zero.detail, { starts_7d: 5, completions_7d: 0, completions_prior_28d: 4 });
    await forms(pg, S1, 'contact', 1, 0, 1, 0.5);
    await check(pg);
    assert.equal((await open(pg)).some((r) => r.kind === 'form_zero_completions'), false);
  } finally { await pg.close(); }
});

test('an inactive site keeps its open alerts open instead of silently "resolving" them', async () => {
  const pg = await measurementDb();
  try {
    await forms(pg, S1, 'contact', 4, 2, 30 * 24, 8 * 24);
    await forms(pg, S1, 'contact', 0, 4, 6 * 24, 1);
    await forms(pg, S1, 'contact', 0, 1, 2, 1);
    await check(pg);
    const zero = (await open(pg)).find((r) => r.kind === 'form_zero_completions');
    assert.ok(zero, 'alert opened while the site was active');
    await pg.query(`UPDATE sites SET is_active = false WHERE id = $1`, [S1]);
    await check(pg);
    const stillOpen = (await open(pg)).find((r) => r.kind === 'form_zero_completions');
    assert.ok(stillOpen, 'the alert stays open once the site is deactivated: no stats row, no resolve, no email');
  } finally { await pg.close(); }
});

test('form_abandon_spike: +25 pp opens, staying 15–25 pp above keeps it open, below 15 pp resolves', async () => {
  const pg = await measurementDb();
  try {
    await forms(pg, S1, 'quote', 16, 4, 30 * 24, 8 * 24);         // prior: 20 % abandoned
    await forms(pg, S1, 'quote', 11, 9, 6 * 24, 1);                // last 7 d: 45 % → +25 pp
    await check(pg);
    const spike = (await open(pg)).find((r) => r.kind === 'form_abandon_spike');
    assert.deepEqual(spike.detail, { starts_7d: 20, starts_prior_28d: 20, abandon_rate_7d: 45.0, abandon_rate_prior_28d: 20.0 });
    await forms(pg, S1, 'quote', 4, 0, 0.9, 0.5);                  // 9/24 = 37.5 % → +17.5 pp: hysteresis keeps it
    await check(pg);
    assert.ok((await open(pg)).some((r) => r.kind === 'form_abandon_spike'));
    await forms(pg, S1, 'quote', 12, 0, 0.4, 0.1);                 // 9/36 = 25 % → +5 pp
    await check(pg);
    assert.equal((await open(pg)).some((r) => r.kind === 'form_abandon_spike'), false);
  } finally { await pg.close(); }
});

test('deleted goal and vanished form resolve', async () => {
  const pg = await measurementDb();
  try {
    await goals(pg, S1, [{ id: 'g1', name: 'signup', type: 'event' }]);
    await hits(pg, S1, 'signup', 5, 30 * 24, 8 * 24);
    await views(pg, S1, 60, 7 * 24 - 1, 1);
    await forms(pg, S1, 'contact', 3, 0, 30 * 24, 8 * 24);
    await forms(pg, S1, 'contact', 0, 6, 6 * 24, 1);
    await check(pg);
    assert.deepEqual((await open(pg)).map((r) => r.kind), ['form_zero_completions', 'goal_silent']);
    await goals(pg, S1, []);
    await pg.exec(`DELETE FROM form_sessions`);
    await check(pg);
    assert.deepEqual(await open(pg), []);
  } finally { await pg.close(); }
});

test('emails: opened once, resolved once after an opening email; resolved alerts older than 365 d are deleted', async () => {
  const pg = await measurementDb();
  try {
    await forms(pg, S1, 'contact', 3, 0, 30 * 24, 8 * 24);
    await forms(pg, S1, 'contact', 0, 6, 6 * 24, 1);
    assert.equal((await check(pg)).length, 1);
    await pg.exec(`UPDATE conversion_alerts SET opened_notified_at = now()`);
    assert.equal((await check(pg)).length, 0);
    await forms(pg, S1, 'contact', 1, 0, 0.9, 0.5);
    const resolved = await check(pg);
    assert.equal(resolved.length, 1);
    assert.ok(resolved[0].resolved_at);
    await pg.exec(`UPDATE conversion_alerts SET resolved_at = '2025-11-01T00:00:00Z'`);
    await check(pg);
    assert.equal((await pg.query(`SELECT count(*)::int n FROM conversion_alerts`)).rows[0].n, 0);
  } finally { await pg.close(); }
});

test('RLS: owners read their own alerts; rules and stats are service_role only', async () => {
  const pg = await measurementDb();
  try {
    await pg.query(`INSERT INTO conversion_alerts (site_id, kind, subject) VALUES ($1, 'goal_silent', 'g1'), ($2, 'goal_silent', 'g9')`, [S1, S2]);
    const mine = await asUser(pg, OWNER, async () => (await pg.query(`SELECT subject FROM conversion_alerts`)).rows);
    assert.deepEqual(mine, [{ subject: 'g1' }]);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`SELECT * FROM check_conversion_alerts()`)), /permission denied/);
    await assert.rejects(asUser(pg, OTHER, () => pg.query(`SELECT * FROM conversion_alert_stats()`)), /permission denied/);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`UPDATE conversion_alerts SET resolved_at = now()`)), /permission denied/);
  } finally { await pg.close(); }
});

test('every kind has a title, a check and a sentence built from its own numbers', () => {
  const at = '2026-11-19T12:00:00Z';
  assert.equal(conversionAlertSentence({ kind: 'goal_silent', subject: 'g1', detail: { goal_name: 'signup', hits_7d: 0, hits_prior_28d: 3, page_views_7d: 50 }, opened_at: at }),
    'Goal "signup" has had no conversions for 7 days (3 in the 28 days before, 50 page views this week).');
  assert.equal(conversionAlertSentence({ kind: 'form_zero_completions', subject: 'contact', detail: { starts_7d: 5, completions_7d: 0, completions_prior_28d: 4 }, opened_at: at }),
    'Form "contact": 5 starts and no completions in 7 days (4 completions in the 28 days before).');
  assert.equal(conversionAlertSentence({ kind: 'form_abandon_spike', subject: 'quote', detail: { starts_7d: 20, starts_prior_28d: 20, abandon_rate_7d: 45, abandon_rate_prior_28d: 20 }, opened_at: at }),
    'Form "quote": 45% abandoned in the last 7 days, against 20% in the 28 days before (20 starts).');
  for (const k of Object.values(CONVERSION_ALERT_KINDS)) assert.ok(k.title.length && k.check.length);
  const { subject, html } = conversionEmailBody('one.example.test', [{ id: 'a', site_id: S1, kind: 'goal_silent', subject: 'g1', detail: { goal_name: '<b>x</b>', hits_7d: 0, hits_prior_28d: 3, page_views_7d: 50 }, opened_at: at, resolved_at: null }], []);
  assert.equal(subject, 'one.example.test: a goal stopped converting');
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;') && !html.includes('<b>x</b>'), 'names are escaped');
});
