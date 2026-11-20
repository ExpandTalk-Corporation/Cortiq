// What CortIQ's technical defaults decide per market and purpose for a site, before any consent.
// Pure; no '@/' imports (tested directly). Not legal advice.
import { decide, PURPOSES, STRICTEST_DEFAULT } from './jurisdiction.ts';
import type { CustomerProfile, Market, Outcome, Purpose } from './jurisdiction.ts';

// One representative signed country per market, so decide() evaluates exactly that market.
const SAMPLE: Record<Market, [string, string | null]> = {
  eu: ['SE', null], uk: ['GB', null], ch: ['CH', null], us_ca: ['US', 'CA'], us_other: ['US', 'TX'],
  ca_qc: ['CA', 'QC'], ca_other: ['CA', 'ON'], br: ['BR', null], other: ['JP', null],
};

export interface EffectiveRow { market: Market; purpose: Purpose; outcome: Outcome; ruleIds: string[]; status: 'production' | 'baseline' }

export function effectiveByMarket(input: { customer: CustomerProfile | null; tighten: Partial<Record<Purpose, string>> }): EffectiveRow[] {
  const markets = input.customer?.markets?.length ? input.customer.markets : [...STRICTEST_DEFAULT];
  const rows: EffectiveRow[] = [];
  for (const market of markets) {
    const [country, region] = SAMPLE[market];
    for (const purpose of PURPOSES) {
      const d = decide({
        visitor: { country, region, geoSource: 'ip' }, purpose,
        signals: { consent: { analytics: null, marketing: null }, evidence: 'none', gpc: false },
        technique: { storage: 'none', identifiers: 'none' },
        // Each market on its own: the customer profile is narrowed to this market.
        customer: { establishment: input.customer?.establishment ?? null, markets: [market], appliesLaws: input.customer?.appliesLaws ?? {} },
        exceptions: [], tighten: input.tighten, testSite: false,
      });
      // 'tighten.*' is the customer's own setting and 'baseline.*' is the synthetic fallback
      // when no usable (approved_internal / reviewed_counsel) rule matched — neither is a market rule.
      const marketRules = d.ruleIds.filter((id) => !id.startsWith('tighten.') && !id.startsWith('baseline.'));
      rows.push({ market, purpose, outcome: d.outcome, ruleIds: marketRules, status: marketRules.length ? 'production' : 'baseline' });
    }
  }
  return rows;
}
