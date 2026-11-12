// Attribution layer 2: AI influence and brand signals (docs/superpowers/specs/2026-11-12-attribution-models-and-ai-influence.md).
// Signals, never credit: nothing here assigns a conversion to AI.

export interface AiInfluenceDay { day: string; agentic: number; citation: number; referrals: number }
export interface AiInfluenceAssistant { botType: string; agentic: number; citation: number }
export interface AiInfluencePage { path: string; agentic: number; citation: number; conversions: number }
export interface AiInfluenceBrandPeriod {
  periodStart: string; periodEnd: string;
  brandClicks: number; brandImpressions: number; otherClicks: number; otherImpressions: number;
}

export interface AiInfluence {
  aggregate: boolean;
  windowDays: number;
  daily: AiInfluenceDay[];
  assistants: AiInfluenceAssistant[];
  pages: AiInfluencePage[];
  conversions: { total: number; onAiReadPages: number };
  /** null when the site has no brand keywords set. */
  brand: AiInfluenceBrandPeriod[] | null;
}

const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0);

/** Normalises the get_ai_influence payload; missing parts become empty, never undefined. */
export function parseAiInfluence(raw: unknown): AiInfluence {
  const r = (raw ?? {}) as Record<string, any>;
  const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
  return {
    aggregate: r.aggregate === true,
    windowDays: num(r.windowDays) || 14,
    daily: arr(r.daily).map((d) => ({ day: String(d.day), agentic: num(d.agentic), citation: num(d.citation), referrals: num(d.referrals) })),
    assistants: arr(r.assistants).map((a) => ({ botType: String(a.botType ?? 'other'), agentic: num(a.agentic), citation: num(a.citation) })),
    pages: arr(r.pages).map((p) => ({ path: String(p.path ?? '/'), agentic: num(p.agentic), citation: num(p.citation), conversions: num(p.conversions) })),
    conversions: { total: num(r.conversions?.total), onAiReadPages: num(r.conversions?.onAiReadPages) },
    brand: r.brand == null ? null : arr(r.brand).map((b) => ({
      periodStart: String(b.periodStart), periodEnd: String(b.periodEnd),
      brandClicks: num(b.brandClicks), brandImpressions: num(b.brandImpressions),
      otherClicks: num(b.otherClicks), otherImpressions: num(b.otherImpressions),
    })),
  };
}

export function aiInfluenceTotals(data: AiInfluence) {
  return data.daily.reduce(
    (t, d) => ({ agentic: t.agentic + d.agentic, citation: t.citation + d.citation, referrals: t.referrals + d.referrals }),
    { agentic: 0, citation: 0, referrals: 0 },
  );
}

/** Share of conversions on pages AI assistants read; null when there is nothing to compare. */
export function aiReadShare(conversions: AiInfluence['conversions']): number | null {
  if (conversions.total <= 0) return null;
  return Math.round((Math.min(conversions.onAiReadPages, conversions.total) / conversions.total) * 100);
}

/** Brand share of Search Console clicks per snapshot, for the trend next to AI activity. */
export function brandClickShare(p: AiInfluenceBrandPeriod): number | null {
  const total = p.brandClicks + p.otherClicks;
  return total > 0 ? Math.round((p.brandClicks / total) * 100) : null;
}
