// supabase/functions/_shared/jurisdiction/decide.ts
// Spec 2026-11-18 ADR-1 A+: rules decide, the customer can only tighten, untrusted input fails closed.
import { IDENT_RANK, OUTCOME_RANK, STORAGE_RANK } from './types.ts';
import type { CustomerProfile, Decision, DecideInput, Fallback, Market, Outcome, Rule, Technique, Visitor } from './types.ts';
import { marketOf, STRICTEST_DEFAULT } from './markets.ts';
import { BASELINE, CATEGORY, SHARING_PURPOSES } from './baseline.ts';
import { PACK, usable } from './packs.ts';

const NONE: Technique = { storage: 'none', identifiers: 'none' };
const stricter = (a: Outcome, b: Outcome): Outcome => (OUTCOME_RANK[a] >= OUTCOME_RANK[b] ? a : b);
const ruleKey = (r: Rule) => `${r.id}@${r.version}`;

export const covers = (rule: Rule, t: Technique): boolean =>
  STORAGE_RANK[t.storage] <= STORAGE_RANK[rule.technique.storage] && IDENT_RANK[t.identifiers] <= IDENT_RANK[rule.technique.identifiers];

const lawApplies = (rule: Rule, customer: CustomerProfile | null): boolean =>
  !rule.law || !customer || customer.appliesLaws[rule.law] !== 'no';

export function marketsFor(visitor: Visitor, customer: CustomerProfile | null): { markets: Market[]; fallback: Fallback } {
  const own = visitor.geoSource === 'ip' ? marketOf(visitor.country, visitor.region) : null;
  if (!customer) return { markets: [...new Set<Market>([...(own ? [own] : []), ...STRICTEST_DEFAULT])], fallback: 'no_profile' };
  if (!own) return { markets: customer.markets.length ? [...customer.markets] : [...STRICTEST_DEFAULT], fallback: 'unknown_geo' };
  return { markets: [own], fallback: null };
}

function marketOutcome(market: Market, input: DecideInput, now: number): { outcome: Outcome; ruleId: string } {
  const pack = input.pack ?? PACK;
  const candidates = pack.rules.filter((r) => r.markets.includes(market) && r.purposes.includes(input.purpose)
    && covers(r, input.technique) && lawApplies(r, input.customer) && Date.parse(r.effectiveFrom) <= now);
  let outcome: Outcome = BASELINE[input.purpose];
  let ruleId = `baseline.${input.purpose}`;
  const fixed = candidates.filter((r) => !r.relaxable && usable(r, !!input.testSite));
  if (fixed.length) {
    const strictest = fixed.reduce((a, b) => (OUTCOME_RANK[b.outcome] > OUTCOME_RANK[a.outcome] ? b : a));
    outcome = strictest.outcome; ruleId = ruleKey(strictest);
  }
  return { outcome, ruleId };
}

export function decide(input: DecideInput): Decision {
  const now = (input.now ?? new Date()).getTime();
  const pack = input.pack ?? PACK;
  const { markets, fallback } = marketsFor(input.visitor, input.customer);
  let outcome: Outcome = 'allowed';
  const ruleIds: string[] = [];
  for (const m of markets) {
    const r = marketOutcome(m, input, now);
    outcome = stricter(outcome, r.outcome);
    if (!ruleIds.includes(r.ruleId)) ruleIds.push(r.ruleId);
  }

  const s = input.signals;
  const category = CATEGORY[input.purpose];
  let permit = false;
  let reason: Decision['reason'];
  if (outcome === 'blocked') reason = 'rule_blocked';
  else if (SHARING_PURPOSES.has(input.purpose) && s.gpc) { reason = 'gpc'; ruleIds.push('floor.gpc_sharing'); }
  else if (outcome === 'allowed') { permit = true; reason = 'allowed'; }
  else if (outcome === 'allowed_unless_opt_out') {
    if (s.gpc) reason = 'gpc';
    else if (s.consent[category] === false || s.consentModeUpdate === 'denied') reason = 'opt_out';
    else { permit = true; reason = 'allowed'; }
  } else {
    const c = s.consent[category];
    if (c === true) { permit = true; reason = 'allowed'; } else reason = c === false ? 'consent_refused' : 'consent_missing';
  }
  return { outcome, permit, reason, evidence: s.evidence, constraints: permit ? { ...input.technique } : { ...NONE },
    ruleIds, markets, fallback, packVersion: pack.version };
}
