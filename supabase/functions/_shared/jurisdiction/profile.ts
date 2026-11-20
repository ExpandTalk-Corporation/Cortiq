// supabase/functions/_shared/jurisdiction/profile.ts
// The site's legal profile. Missing or "don't know" answers count as the law applying (stricter).
import { MARKETS } from './types.ts';
import type { Answer, CustomerProfile, Market } from './types.ts';
import { marketOf } from './markets.ts';

export const DISCLAIMER = "These are CortIQ's technical defaults, not legal advice.";

export interface ProfileQuestion { key: string; market: Market; text: string; help: string; references: readonly { title: string; ref: string }[] }
export const PROFILE_QUESTIONS: readonly ProfileQuestion[] = [{
  key: 'us_ccpa', market: 'us_ca',
  text: 'Does your business meet the applicability thresholds of the CCPA/CPRA?',
  help: "If you are unsure, choose \"I don't know\". CortIQ then applies the stricter default for California visitors.",
  references: [
    { title: 'Cal. Civ. Code § 1798.140 (definitions, including "business")', ref: 'https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=CIV&sectionNum=1798.140' },
    { title: 'California Privacy Protection Agency', ref: 'https://cppa.ca.gov/' },
  ],
}];

export interface ProfileRow { establishment_country: string | null; markets: unknown; answers: unknown }
const ANSWERS: readonly Answer[] = ['yes', 'no', 'dont_know'];

export function profileToCustomer(row: ProfileRow | null): CustomerProfile | null {
  if (!row) return null;
  const est = typeof row.establishment_country === 'string' && /^[A-Za-z]{2}$/.test(row.establishment_country)
    ? row.establishment_country.toUpperCase() : null;
  const markets: Market[] = Array.isArray(row.markets)
    ? row.markets.filter((m): m is Market => typeof m === 'string' && (MARKETS as readonly string[]).includes(m)) : [];
  const estMarket = est ? marketOf(est, null) : null;
  if (estMarket && !markets.includes(estMarket)) markets.push(estMarket);
  const appliesLaws: Record<string, Answer> = {};
  if (row.answers && typeof row.answers === 'object' && !Array.isArray(row.answers)) {
    for (const [k, v] of Object.entries(row.answers as Record<string, unknown>)) {
      appliesLaws[k] = ANSWERS.includes(v as Answer) ? (v as Answer) : 'dont_know';
    }
  }
  return { establishment: est, markets: [...new Set(markets)], appliesLaws };
}
