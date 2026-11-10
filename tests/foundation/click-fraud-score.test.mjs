import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  confidenceFor, exclusionCandidates, geoCheck, levelFor, refundGuidance, scoreSignals, WEIGHTS,
} from '../../supabase/functions/_shared/click-fraud-score.ts';

const clean = { paid_sessions: 200, google_sessions: 200, bot_sessions: 0, reused_click_sessions: 0, burst_sessions: 0, zero_engagement_sessions: 80, conversions: 12 };

test('weights add up to 100', () => {
  assert.equal(Object.values(WEIGHTS).reduce((a, b) => a + b, 0), 100);
});

test('normal paid traffic scores low with no signals', () => {
  const r = scoreSignals(clean);
  assert.equal(r.score, 0);
  assert.equal(r.level, 'low');
  assert.equal(r.confidence, 'high');
  // 40% zero engagement is normal for a landing page and adds a signal worth 0 points at most.
  assert.ok(r.signals.every((s) => s.points === 0));
});

test('bots, reused click ids and bursts push a campaign to high, each with a reason', () => {
  const r = scoreSignals({ paid_sessions: 100, google_sessions: 100, bot_sessions: 12, reused_click_sessions: 10, burst_sessions: 30, zero_engagement_sessions: 95, conversions: 0 });
  assert.equal(r.level, 'high');
  assert.ok(r.score >= 80, `score ${r.score}`);
  assert.deepEqual(r.signals.map((s) => s.key).slice(0, 2), ['automation', 'reused_click']);
  for (const s of r.signals) {
    assert.ok(s.reason.length > 30, s.key);
    assert.ok(s.points <= s.max_points);
  }
  assert.match(r.signals[0].reason, /12 of 100 paid sessions \(12%\)/);
});

test('score never exceeds 100 and handles zero sessions', () => {
  const r = scoreSignals({ paid_sessions: 10, bot_sessions: 10, reused_click_sessions: 10, burst_sessions: 10, zero_engagement_sessions: 10, conversions: 0 },
    { clicks: 500, invalid_clicks: 50, cost: 100 },
    { known: 10, outside: 10, targeted: ['SE'], outside_countries: ['VN'] });
  assert.equal(r.score, 100);
  assert.equal(r.confidence, 'low');
  const empty = scoreSignals({ paid_sessions: 0, bot_sessions: 0, reused_click_sessions: 0, burst_sessions: 0, zero_engagement_sessions: 0, conversions: 0 });
  assert.equal(empty.score, 0);
});

test('Ads click gap only scores when most clicks never became a session', () => {
  const small = scoreSignals(clean, { clicks: 300, invalid_clicks: 0, cost: 0 });
  assert.equal(small.signals.find((s) => s.key === 'click_gap').points, 0, '33% gap is normal (consent banners)');
  const big = scoreSignals(clean, { clicks: 2000, invalid_clicks: 0, cost: 0 });
  assert.equal(big.signals.find((s) => s.key === 'click_gap').points, WEIGHTS.click_gap);
  assert.ok(!scoreSignals(clean, { clicks: 5, invalid_clicks: 0, cost: 0 }).signals.some((s) => s.key === 'click_gap'), 'ignored under 10 clicks');
});

test("Google's own invalid clicks are reported but never scored", () => {
  const r = scoreSignals(clean, { clicks: 200, invalid_clicks: 40, cost: 0 });
  const s = r.signals.find((x) => x.key === 'google_invalid');
  assert.equal(s.points, 0);
  assert.equal(s.count, 40);
  assert.equal(r.score, 0);
});

test('geo check compares countries to targeted ISO codes', () => {
  assert.equal(geoCheck({ SE: 10 }, []), null, 'no targets known -> no check');
  const g = geoCheck({ SE: 70, VN: 20, IN: 10 }, ['se']);
  assert.deepEqual(g, { known: 100, outside: 30, targeted: ['SE'], outside_countries: ['VN', 'IN'] });
  const r = scoreSignals(clean, null, g);
  const geo = r.signals.find((s) => s.key === 'geo');
  assert.equal(geo.points, WEIGHTS.geo);
  assert.match(geo.reason, /VN, IN/);
  assert.match(geo.reason, /time zone/);
});

test('level and confidence thresholds', () => {
  assert.equal(levelFor(29), 'low');
  assert.equal(levelFor(30), 'elevated');
  assert.equal(levelFor(60), 'high');
  assert.equal(confidenceFor(19), 'low');
  assert.equal(confidenceFor(20), 'medium');
  assert.equal(confidenceFor(100), 'high');
});

test('refund guidance lists flagged campaigns with evidence and Google links', () => {
  const flagged = scoreSignals({ paid_sessions: 50, bot_sessions: 10, reused_click_sessions: 5, burst_sessions: 0, zero_engagement_sessions: 20, conversions: 0 });
  const g = refundGuidance({
    customerId: '1234567890', from: '2026-10-01', to: '2026-10-31',
    campaigns: [{ campaign: 'Brand', campaign_id: '42', score: flagged.score, signals: flagged.signals }, { campaign: 'Clean', score: 5, signals: [] }],
  });
  assert.equal(g.recommended, true);
  assert.equal(g.form_url, 'https://support.google.com/google-ads/contact/invalid_clicks_contact');
  assert.equal(g.evidence.length, 1);
  assert.match(g.evidence[0], /^Brand \(id 42\), score \d+: automated or bot traffic: 10 \(20%\)/);
  assert.ok(g.steps.some((s) => s.includes('123-456-7890')));
  assert.equal(refundGuidance({ from: 'a', to: 'b', campaigns: [] }).recommended, false);
});

test('placement exclusion candidates: >= 10 clicks and no conversions, costliest first', () => {
  const rows = [
    { campaign: 'D', placement: 'a.example', clicks: 50, impressions: 100, cost: 20, conversions: 0 },
    { campaign: 'D', placement: 'b.example', clicks: 9, cost: 99, conversions: 0 },
    { campaign: 'D', placement: 'c.example', clicks: 30, cost: 40, conversions: 0 },
    { campaign: 'D', placement: 'd.example', clicks: 30, cost: 80, conversions: 2 },
  ];
  const out = exclusionCandidates(rows);
  assert.deepEqual(out.map((r) => r.placement), ['c.example', 'a.example']);
  assert.match(out[1].reason, /Click rate 50%/);
});
