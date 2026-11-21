// Homepage "Routing per country": the market table's status comes from the rule engine, and the copy
// keeps to the jurisdiction copy rules (technical defaults, not legal advice; no compliance claims).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { decide, DISCLAIMER, MARKETS, PACK, PURPOSES, PRODUCTION_STATUSES } from '../../src/lib/jurisdiction.ts';
import { marketStatuses, MARKET_LABEL } from '../../src/lib/marketStatus.ts';
import { CHECK_KEYS } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { ROUTING_LAWS, ROUTING_OFF_COLLECTORS, ROUTING_WORKS_TODAY } from '../../src/components/home/copy.ts';

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const HOME = 'src/components/home/';
const homeText = () => readdirSync(new URL(HOME, root)).filter((f) => /\.tsx?$/.test(f)).map((f) => read(HOME + f)).join('\n');

// Independent of marketStatus: unknown geo + a customer in exactly one market makes decide() use that market.
function engineView(market) {
  const decisions = PURPOSES.map((purpose) => decide({
    visitor: { country: null, region: null, geoSource: 'unknown' }, purpose,
    signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false },
    technique: { storage: 'none', identifiers: 'none' },
    customer: { establishment: null, markets: [market], appliesLaws: {} },
    exceptions: [], tighten: {}, testSite: false,
  }));
  const approved = PURPOSES.filter((_, i) => decisions[i].ruleIds.some((id) => !id.startsWith('baseline.') && !id.startsWith('tighten.')));
  const allOptIn = decisions.every((d) => d.outcome === 'needs_opt_in');
  const statuses = PACK.rules.filter((r) => r.markets.includes(market)).map((r) => r.status);
  return { approved, allOptIn, statuses, decisions };
}

test('the table lists every market the engine knows, in engine order', () => {
  const rows = marketStatuses();
  assert.deepEqual(rows.map((r) => r.market), [...MARKETS]);
  assert.equal(rows.length, 9);
  for (const m of MARKETS) {
    assert.ok(MARKET_LABEL[m], `label for ${m}`);
    assert.ok(ROUTING_LAWS[m], `laws for ${m}`);
  }
});

test('status per market agrees with decide()', () => {
  for (const row of marketStatuses()) {
    const e = engineView(row.market);
    assert.deepEqual(row.approved, e.approved, `${row.market}: approved purposes`);
    if (e.approved.length) {
      assert.match(row.status, /^Approved internally/, `${row.market}: an approved rule decides, status says ${row.status}`);
      continue;
    }
    assert.ok(e.decisions.every((d) => d.ruleIds.every((id) => id.startsWith('baseline.'))), `${row.market}: baseline only`);
    assert.equal(row.baselineOnly, e.allOptIn);
    if (!e.allOptIn) { assert.match(row.status, /^Stricter than opt-in/); continue; }
    assert.match(row.status, /^Baseline opt-in \(/, `${row.market}: ${row.status}`);
    if (e.statuses.includes('reviewed_agent')) assert.match(row.status, /rule in review/);
    else if (e.statuses.includes('draft')) assert.match(row.status, /draft rules only/);
    else assert.match(row.status, /no rule yet/);
    if (e.statuses.length) assert.match(row.status, /none approved\)$/);
  }
});

test('rules on file mirror the rule pack, status included', () => {
  for (const row of marketStatuses()) {
    const pack = PACK.rules.filter((r) => r.markets.includes(row.market));
    assert.deepEqual(row.rulesOnFile.map((r) => [r.id, r.status]), pack.map((r) => [r.id, r.status]));
  }
});

test('no market is described as approved while no rule has a production status', () => {
  const anyProduction = PACK.rules.some((r) => PRODUCTION_STATUSES.includes(r.status));
  if (anyProduction) return;
  for (const row of marketStatuses()) assert.doesNotMatch(row.status, /^Approved/);
});

test('the section renders status from the engine, never as hand-written text', () => {
  const src = read(HOME + 'RoutingSection.tsx');
  assert.match(src, /<MarketTable \/>/);
  assert.match(src, /\{DISCLAIMER\}/);
  const table = read(HOME + 'MarketTable.tsx');
  assert.match(table, /marketStatuses\(\)/);
  assert.match(table, /\{s\.status\}/);
  assert.match(table, /\{DISCLAIMER\}/);
  for (const f of ['RoutingSection.tsx', 'MarketTable.tsx', 'MarketMap.tsx', 'copy.ts']) {
    assert.doesNotMatch(read(HOME + f), /Baseline opt-in|draft rules only|rule in review|none approved/i, `${f} hardcodes a status`);
  }
  assert.match(read('src/pages/Index.tsx'), /<AiTrafficSection \/>\s*<RoutingSection \/>\s*<ToolsSection \/>/);
});

test('the disclaimer says technical defaults, not legal advice', () => {
  assert.match(DISCLAIMER, /CortIQ's technical defaults, not legal advice\./);
});

test('home copy makes no compliance or consent-free claims', () => {
  const all = homeText();
  for (const re of [/GDPR[- ]compliant/i, /no consent (is )?needed/i, /no banner (is )?needed/i, /compliant in \d+/i,
    /compliant in (all|every)/i, /replaces? (your )?(legal|compliance)/i, /no longer need/i]) {
    assert.doesNotMatch(all, re, `forbidden phrase ${re}`);
  }
});

test('the Off list on the homepage is the dashboard wording', () => {
  assert.ok(read('src/components/dashboard/jurisdiction/RulesByMarketTab.tsx').includes(ROUTING_OFF_COLLECTORS.replace(' Some other collectors do not check it yet.', '')));
  assert.ok(ROUTING_WORKS_TODAY.some((w) => w.text.includes(ROUTING_OFF_COLLECTORS)));
});

test('the GTM Audit card renders its check count from the engine', () => {
  assert.equal(CHECK_KEYS.length, 15);
  assert.match(read(HOME + 'ToolsSection.tsx'), /\{CHECK_KEYS\.length\}/);
});
