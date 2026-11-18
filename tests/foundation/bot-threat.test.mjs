import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  MIN_VISITS_FOR_SCORE, matchScanner, groupSources, assessThreat, parseAiReview, pathOf,
} from '../../supabase/functions/_shared/bot-threat.ts';

const IUBENDA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 iubenda-radar/3.37.0';

const visit = (i, over = {}) => ({
  id: `t${i}`, bot_name: 'Unknown Bot', bot_type: 'unknown', user_agent: 'curl/8.0', url: 'https://example.com/',
  ip_address: '203.0.113.5', country_code: null, js_executed: true,
  detected_at: new Date(Date.UTC(2026, 10, 1, 9, 0, 0) + i * 120_000).toISOString(), ...over,
});

test('the two iubenda visits that scored "High" are a known scanner and get no threat level', () => {
  const traffic = [
    visit(1, { user_agent: IUBENDA, detected_at: '2026-11-01T09:38:37Z' }),
    visit(2, { user_agent: IUBENDA, detected_at: '2026-11-01T09:38:39Z' }),
  ];
  const probes = traffic.map((t) => ({
    traffic_id: t.id, webdriver_detected: true, headless_detected: false,
    automation_signals: { noChromeRuntime: true, singleLanguage: true, defaultScreen: true },
  }));
  const a = assessThreat(traffic, probes);
  assert.equal(a.assessed, false);
  assert.equal(a.scoredVisits, 0);

  const [src] = groupSources(traffic, probes);
  assert.equal(src.name, 'iubenda Radar');
  assert.equal(src.scanner.kind, 'Cookie compliance scanner');
  assert.equal(src.visits, 2);
  assert.deepEqual(src.countries, { unknown: 2 });
  assert.equal(src.webdriver, 2);
  assert.equal(src.automation, 2);
  assert.equal(src.peakPerMinute, 2);
});

test('below the minimum there is no score, at it there is', () => {
  const few = Array.from({ length: MIN_VISITS_FOR_SCORE - 1 }, (_, i) => visit(i));
  assert.equal(assessThreat(few, []).assessed, false);
  const enough = Array.from({ length: MIN_VISITS_FOR_SCORE }, (_, i) => visit(i));
  const a = assessThreat(enough, []);
  assert.equal(a.assessed, true);
  // Slow, one page, no signals: only IP concentration counts → Low.
  assert.equal(a.indicators.rapidFireRequests, 0);
  assert.equal(a.indicators.urlScanningPattern, 0);
  assert.equal(a.level, 'Low');
});

test('a fast scraper over many pages scores High', () => {
  const traffic = Array.from({ length: 80 }, (_, i) => visit(i, {
    url: `https://example.com/p/${i}?token=x`,
    detected_at: new Date(Date.UTC(2026, 10, 1, 9) + i * 1000).toISOString(),
  }));
  const probes = traffic.map((t) => ({ traffic_id: t.id, webdriver_detected: true, headless_detected: true, automation_signals: { a: true, b: true, c: true } }));
  const a = assessThreat(traffic, probes);
  assert.equal(a.level, 'High');
  assert.equal(a.indicators.rapidFireRequests, 100);
  assert.equal(a.indicators.urlScanningPattern, 100);
  const [src] = groupSources(traffic, probes);
  assert.ok(src.topPages.every((p) => !p.includes('?')), 'query strings stripped');
});

test('scanner list and path helper', () => {
  assert.equal(matchScanner('CortIQ-Uptime/1.0')?.name, 'CortIQ Uptime');
  assert.equal(matchScanner('Mozilla/5.0 Chrome/120'), null);
  assert.equal(pathOf('https://a.se/x/y?email=a@b.se#h'), '/x/y');
});

test('parseAiReview accepts the agreed JSON and rejects markdown', () => {
  const ok = parseAiReview('```json\n{"summary":"s","findings":[{"title":"t","detail":"d"}],"actions":[]}\n```');
  assert.deepEqual(ok, { summary: 's', findings: [{ title: 't', detail: 'd' }], actions: [] });
  assert.equal(parseAiReview('**Behavior Pattern Analysis**: ...'), null);
  assert.equal(parseAiReview('{"summary":"s","findings":[],"actions":[1]}'), null);
});

test('edge function sends no IPs to the AI and the widget has no dead action buttons', () => {
  const fn = readFileSync(new URL('../../supabase/functions/ai-bot-behavior-analysis/index.ts', import.meta.url), 'utf8');
  const evidence = fn.slice(fn.indexOf('const evidence'), fn.indexOf('const prompt'));
  assert.doesNotMatch(evidence, /ip/i);
  assert.doesNotMatch(fn, /lovable/i);
  const widget = readFileSync(new URL('../../src/components/dashboard/AIBotSecurityWidget.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(widget, /Block Threat IP|Update Robots\.txt|Enable Rate Limiting/);
  assert.doesNotMatch(widget, /whitespace-pre-wrap/);
});
