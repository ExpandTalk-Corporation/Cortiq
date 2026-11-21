// Per-market status for public pages, derived from the rule engine (never hand-written).
// Pure; no '@/' imports (tested directly). CortIQ's technical defaults, not legal advice.
import { MARKETS, PACK, PURPOSES } from './jurisdiction.ts';
import type { Market, Purpose, RuleStatus } from './jurisdiction.ts';
import { effectiveByMarket } from './effectiveByMarket.ts';

export const MARKET_LABEL: Record<Market, string> = {
  eu: 'EU/EEA', uk: 'United Kingdom', ch: 'Switzerland', us_ca: 'United States: California',
  us_other: 'United States: other states', ca_qc: 'Canada: Québec', ca_other: 'Canada: other provinces',
  br: 'Brazil', mx: 'Mexico', ar: 'Argentina', cl: 'Chile', co: 'Colombia', za: 'South Africa', other: 'Rest of the world',
};

export const PURPOSE_LABEL: Record<Purpose, string> = {
  statistics: 'Statistics', conversion: 'Conversions', attribution: 'Attribution',
  ad_platform_sharing: 'Sharing with ad platforms', agent_measurement: 'Server-side AI-agent measurement',
};

export const RULE_STATUS_LABEL: Record<RuleStatus, string> = {
  draft: 'draft', reviewed_agent: 'in review', approved_internal: 'approved internally',
  reviewed_counsel: 'reviewed by counsel', suspended: 'suspended',
};

export interface RuleOnFile { id: string; markets: Market[]; purposes: Purpose[]; status: RuleStatus; text: string }
export interface MarketStatus {
  market: Market;
  /** Purposes where an approved rule decides (production status). The rest fall back to the baseline. */
  approved: Purpose[];
  /** True when every purpose falls back to the opt-in baseline. */
  baselineOnly: boolean;
  rulesOnFile: RuleOnFile[];
  status: string;
  /** The same status in a few words, for the homepage grid; `status` stays the full sentence. */
  statusShort: string;
}

const list = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);
const purposeList = (ps: readonly Purpose[]) => list(ps.map((p, i) => (i === 0 ? PURPOSE_LABEL[p] : PURPOSE_LABEL[p].toLowerCase())));

export function marketStatus(market: Market): MarketStatus {
  // The engine on its own: a customer who operates only in this market, no tighten, no consent yet.
  const rows = effectiveByMarket({ customer: { establishment: null, markets: [market], appliesLaws: {} }, tighten: {} });
  const approved = PURPOSES.filter((p) => rows.some((r) => r.purpose === p && r.status === 'production'));
  const baselineOnly = approved.length === 0 && rows.every((r) => r.outcome === 'needs_opt_in');
  const rulesOnFile = PACK.rules
    .filter((r) => r.markets.includes(market))
    .map((r) => ({ id: r.id, markets: [...r.markets], purposes: [...r.purposes], status: r.status, text: `${purposeList(r.purposes)}: ${RULE_STATUS_LABEL[r.status]}` }));
  const statuses = new Set(rulesOnFile.map((r) => r.status));

  let status: string;
  let statusShort: string;
  if (approved.length) {
    status = approved.length === PURPOSES.length
      ? 'Approved internally for every purpose'
      : `Approved internally for ${purposeList(approved).toLowerCase()}; baseline opt-in for the rest`;
    statusShort = approved.length === PURPOSES.length ? 'Approved' : 'Partly approved';
  } else if (!baselineOnly) {
    status = 'Stricter than opt-in (no approved rule yet)';
    statusShort = 'Stricter than opt-in';
  } else if (statuses.has('reviewed_agent')) {
    status = 'Baseline opt-in (rule in review, none approved)';
    statusShort = 'Opt-in · rule in review';
  } else if (statuses.has('draft')) {
    status = 'Baseline opt-in (draft rules only, none approved)';
    statusShort = 'Opt-in · draft rules';
  } else {
    status = 'Baseline opt-in (no rule yet)';
    statusShort = 'Opt-in · no rule yet';
  }
  return { market, approved, baselineOnly, rulesOnFile, status, statusShort };
}

export const marketStatuses = (): MarketStatus[] => MARKETS.map(marketStatus);
