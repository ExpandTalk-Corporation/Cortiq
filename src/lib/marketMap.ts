// Map category per market, derived from marketStatuses() (never hand-written per market).
// Pure; no '@/' imports (tested directly). CortIQ's technical defaults, not legal advice.
import type { Market, RuleStatus } from './jurisdiction.ts';
import { RULE_STATUS_LABEL, marketStatuses } from './marketStatus.ts';
import type { MarketStatus, RuleOnFile } from './marketStatus.ts';

/**
 * approved      an approved rule decides at least one purpose in this market
 * market_rules  no approved rule, but a rule written for this market alone is on file
 * global_only   no approved rule; only rules shared by several markets are on file (or none)
 */
export const MAP_CATEGORIES = ['approved', 'market_rules', 'global_only'] as const;
export type MapCategory = typeof MAP_CATEGORIES[number];

/** A rule written for one market only. Rules shared by several markets count as global. */
export const isMarketRule = (r: RuleOnFile) => r.markets.length === 1;

export function mapCategory(s: MarketStatus): MapCategory {
  if (s.approved.length) return 'approved';
  return s.rulesOnFile.some(isMarketRule) ? 'market_rules' : 'global_only';
}

const statusList = (statuses: RuleStatus[]) => [...new Set(statuses)].map((st) => RULE_STATUS_LABEL[st]).join(' / ');

export interface MapLegendItem { category: MapCategory; label: string; markets: Market[] }
export interface MarketMapEntry { status: MarketStatus; category: MapCategory; categoryLabel: string }

/** Legend and per-market entries from one derivation, so the map, its legend and its labels always agree. */
export function marketMapModel(statuses: MarketStatus[] = marketStatuses()) {
  const byCat = (c: MapCategory) => statuses.filter((s) => mapCategory(s) === c);
  const labelFor = (c: MapCategory): string => {
    const rows = byCat(c);
    if (c === 'approved') return 'Rule approved internally (CortIQ default, not legal advice)';
    const rules = rows.flatMap((s) => s.rulesOnFile.filter((r) => (c === 'market_rules' ? isMarketRule(r) : !isMarketRule(r))));
    const st = statusList(rules.map((r) => r.status));
    if (c === 'market_rules') return `Market rules on file${st ? ` (${st})` : ''}, logged only`;
    return `Global rules only${st ? ` (${st})` : ''}, logged only`;
  };
  const legend: MapLegendItem[] = MAP_CATEGORIES.map((category) => ({
    category, label: labelFor(category), markets: byCat(category).map((s) => s.market),
  }));
  const label = Object.fromEntries(legend.map((l) => [l.category, l.label])) as Record<MapCategory, string>;
  const entries: MarketMapEntry[] = statuses.map((status) => {
    const category = mapCategory(status);
    return { status, category, categoryLabel: label[category] };
  });
  return { legend, entries };
}
