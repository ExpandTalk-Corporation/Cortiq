// Click-fraud scoring. Pure functions (no imports, no Deno APIs), so foundation tests import this
// file directly and the dashboard shows exactly what the Edge Function computed.
//
// Input is counts from get_click_fraud_signals (CortIQ's own sessions) plus, when the site has
// Google Ads connected, billed clicks, Google's own invalid clicks and campaign location targets.
// Every signal carries the points it added and a plain-language reason, so a score can always be
// traced back to numbers the user can check.
//
// The score is a triage aid, not proof: it ranks days and campaigns worth a closer look. Weights:
//   automation (bot/headless)       30  full at 10% of paid sessions
//   reused click ids                20  full at 10%
//   bursts                          15  full at 25%
//   zero engagement                 15  from 60% (normal paid bounce) to 90%
//   Ads clicks without a session    10  from 50% missing to 85% (consent banners cause a gap)
//   outside location targeting      10  full at 20%; country comes from the browser time zone
// Sum of weights = 100.

export interface SignalCounts {
  paid_sessions: number;
  google_sessions?: number;
  bot_sessions: number;
  reused_click_sessions: number;
  burst_sessions: number;
  zero_engagement_sessions: number;
  conversions: number;
}

export interface AdsCounts {
  clicks: number;
  invalid_clicks: number;
  cost: number;
}

export interface GeoCheck {
  /** Sessions with a known country. */
  known: number;
  /** Of those, sessions from a country the campaign does not target. */
  outside: number;
  /** ISO country codes the campaign targets. */
  targeted: string[];
  /** Countries seen outside targeting, most sessions first. */
  outside_countries: string[];
}

export type SignalKey = 'automation' | 'reused_click' | 'burst' | 'zero_engagement' | 'click_gap' | 'geo' | 'google_invalid';

export interface Signal {
  key: SignalKey;
  label: string;
  count: number;
  /** Share of the base (0..1). */
  rate: number;
  points: number;
  max_points: number;
  reason: string;
  action?: string;
}

export interface FraudScore {
  score: number;
  level: 'low' | 'elevated' | 'high';
  confidence: 'low' | 'medium' | 'high';
  signals: Signal[];
}

export const WEIGHTS = {
  automation: 30,
  reused_click: 20,
  burst: 15,
  zero_engagement: 15,
  click_gap: 10,
  geo: 10,
} as const;

export const GOOGLE_INVALID_CLICK_FORM_URL = 'https://support.google.com/google-ads/contact/invalid_clicks_contact';
export const GOOGLE_INVALID_TRAFFIC_HELP_URL = 'https://support.google.com/google-ads/answer/42995';

const clamp01 = (v: number) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0);
/** 0 at `from`, 1 at `to`, linear in between. */
const ramp = (v: number, from: number, to: number) => clamp01((v - from) / (to - from));
const pct = (v: number) => `${Math.round(v * 100)}%`;
const round1 = (v: number) => Math.round(v * 10) / 10;

export function levelFor(score: number): FraudScore['level'] {
  return score >= 60 ? 'high' : score >= 30 ? 'elevated' : 'low';
}

export function confidenceFor(paidSessions: number): FraudScore['confidence'] {
  return paidSessions >= 100 ? 'high' : paidSessions >= 20 ? 'medium' : 'low';
}

export function scoreSignals(counts: SignalCounts, ads?: AdsCounts | null, geo?: GeoCheck | null): FraudScore {
  const base = Math.max(0, counts.paid_sessions || 0);
  const signals: Signal[] = [];
  const rate = (n: number) => (base > 0 ? clamp01(n / base) : 0);

  if (counts.bot_sessions > 0) {
    const r = rate(counts.bot_sessions);
    signals.push({
      key: 'automation', label: 'Automated or bot traffic', count: counts.bot_sessions, rate: r,
      points: round1(WEIGHTS.automation * ramp(r, 0, 0.1)), max_points: WEIGHTS.automation,
      reason: `${counts.bot_sessions} of ${base} paid sessions (${pct(r)}) came from a known bot or agent user agent, or the page saw browser automation (webdriver/headless).`,
      action: 'Exclude the placements and campaigns these sessions came from; include the counts as evidence in an invalid-click report.',
    });
  }

  if (counts.reused_click_sessions > 0) {
    const r = rate(counts.reused_click_sessions);
    signals.push({
      key: 'reused_click', label: 'Reused click ids', count: counts.reused_click_sessions, rate: r,
      points: round1(WEIGHTS.reused_click * ramp(r, 0, 0.1)), max_points: WEIGHTS.reused_click,
      reason: `${counts.reused_click_sessions} paid sessions (${pct(r)}) landed with a gclid/msclkid that another session had already used. A real ad click creates a new id; replayed ids suggest scripted or copied ad URLs (or a shared/bookmarked ad link).`,
      action: 'Check the landing URLs in the period; replayed click ids are strong evidence for a refund request.',
    });
  }

  if (counts.burst_sessions > 0) {
    const r = rate(counts.burst_sessions);
    signals.push({
      key: 'burst', label: 'Click bursts', count: counts.burst_sessions, rate: r,
      points: round1(WEIGHTS.burst * ramp(r, 0, 0.25)), max_points: WEIGHTS.burst,
      reason: `${counts.burst_sessions} paid sessions (${pct(r)}) arrived in 10-minute windows with at least 5 sessions and far above the campaign's normal pace.`,
      action: 'Look at the burst times in Google Ads (segment by hour); add an ad schedule or exclusions if they repeat.',
    });
  }

  if (counts.zero_engagement_sessions > 0) {
    const r = rate(counts.zero_engagement_sessions);
    signals.push({
      key: 'zero_engagement', label: 'Zero engagement', count: counts.zero_engagement_sessions, rate: r,
      points: round1(WEIGHTS.zero_engagement * ramp(r, 0.6, 0.9)), max_points: WEIGHTS.zero_engagement,
      reason: `${counts.zero_engagement_sessions} paid sessions (${pct(r)}) viewed one page with no recorded interaction and no conversion. Up to about 60% is normal for paid landing pages; above that the clicks are unlikely to be real visitors.`,
      action: 'Compare with the landing page speed and message match before blaming fraud; if both are fine, review placements.',
    });
  }

  if (ads && ads.clicks >= 10) {
    const sessions = counts.google_sessions ?? counts.paid_sessions;
    const gap = clamp01(1 - sessions / ads.clicks);
    if (gap > 0) {
      signals.push({
        key: 'click_gap', label: 'Ads clicks without a session', count: Math.max(0, ads.clicks - sessions), rate: gap,
        points: round1(WEIGHTS.click_gap * ramp(gap, 0.5, 0.85)), max_points: WEIGHTS.click_gap,
        reason: `Google Ads billed ${ads.clicks} clicks; CortIQ recorded ${sessions} sessions from Google ads (${pct(gap)} missing). A gap is normal: visitors who decline the consent banner, block scripts or leave before the page loads are not tracked. Only a large gap counts.`,
      });
    }
  }

  if (geo && geo.targeted.length > 0 && geo.known > 0 && geo.outside > 0) {
    const r = clamp01(geo.outside / geo.known);
    signals.push({
      key: 'geo', label: 'Outside location targeting', count: geo.outside, rate: r,
      points: round1(WEIGHTS.geo * ramp(r, 0, 0.2)), max_points: WEIGHTS.geo,
      reason: `${geo.outside} of ${geo.known} paid sessions with a known country (${pct(r)}) came from ${geo.outside_countries.slice(0, 5).join(', ')}, outside the campaign's targets (${geo.targeted.slice(0, 8).join(', ')}). CortIQ derives country from the browser time zone, and "presence or interest" targeting allows some outside traffic, so treat this as a hint.`,
      action: 'Set location options to "Presence: people in or regularly in your targeted locations" in the campaign settings.',
    });
  }

  if (ads && ads.invalid_clicks > 0) {
    const total = ads.clicks + ads.invalid_clicks;
    const r = total > 0 ? clamp01(ads.invalid_clicks / total) : 0;
    signals.push({
      key: 'google_invalid', label: 'Invalid clicks filtered by Google', count: ads.invalid_clicks, rate: r,
      points: 0, max_points: 0,
      reason: `Google already filtered ${ads.invalid_clicks} invalid clicks (${pct(r)} of all clicks) and did not charge for them. This does not add to the score; it shows the campaign is being targeted.`,
    });
  }

  const score = Math.min(100, Math.round(signals.reduce((s, x) => s + x.points, 0)));
  signals.sort((a, b) => b.points - a.points || b.count - a.count);
  return { score, level: levelFor(score), confidence: confidenceFor(base), signals };
}

/** Country check for one campaign: CortIQ country counts against the campaign's targeted ISO codes. */
export function geoCheck(countries: Record<string, number> | null | undefined, targeted: string[]): GeoCheck | null {
  if (!targeted.length || !countries) return null;
  const allowed = new Set(targeted.map((c) => c.toUpperCase()));
  let known = 0;
  let outside = 0;
  const outsideList: Array<[string, number]> = [];
  for (const [country, n] of Object.entries(countries)) {
    const count = Number(n) || 0;
    known += count;
    if (!allowed.has(country.toUpperCase())) {
      outside += count;
      outsideList.push([country, count]);
    }
  }
  outsideList.sort((a, b) => b[1] - a[1]);
  return { known, outside, targeted: [...allowed], outside_countries: outsideList.map(([c]) => c) };
}

export interface RefundCampaign {
  campaign: string;
  campaign_id?: string | null;
  score: number;
  clicks?: number;
  signals: Signal[];
}

/**
 * Guidance for Google's invalid-click form. Google investigates and credits clicks it confirms as
 * invalid; it asks for the customer id, affected campaigns, dates and why the traffic looks invalid.
 */
export function refundGuidance(input: {
  customerId?: string | null;
  from: string;
  to: string;
  campaigns: RefundCampaign[];
}): { recommended: boolean; form_url: string; help_url: string; steps: string[]; evidence: string[] } {
  const flagged = input.campaigns.filter((c) => c.score >= 30).sort((a, b) => b.score - a.score).slice(0, 10);
  const evidence = flagged.map((c) => {
    const parts = c.signals.filter((s) => s.points > 0).map((s) => `${s.label.toLowerCase()}: ${s.count} (${pct(s.rate)})`);
    const id = c.campaign_id ? ` (id ${c.campaign_id})` : '';
    return `${c.campaign}${id}, score ${c.score}: ${parts.join('; ') || 'see dashboard'}`;
  });
  const steps = [
    'Open Google\'s invalid click activity form (link below) while signed in to the Google account that manages the Ads account.',
    `Enter the customer id${input.customerId ? ` ${input.customerId.replace(/(\d{3})(\d{3})(\d{4})/, '$1-$2-$3')}` : ''} and the period ${input.from} to ${input.to}.`,
    'List the affected campaigns and paste the evidence lines below; attach an export of this report if asked.',
    'Before sending, exclude the worst placements and tighten location options so the traffic stops while Google reviews the case.',
    'Google credits clicks it confirms as invalid; credits appear as "Invalid activity" adjustments in Billing. CortIQ cannot see Google\'s click-level data, so the decision is Google\'s.',
  ];
  return {
    recommended: flagged.length > 0,
    form_url: GOOGLE_INVALID_CLICK_FORM_URL,
    help_url: GOOGLE_INVALID_TRAFFIC_HELP_URL,
    steps,
    evidence,
  };
}

export interface PlacementRow {
  campaign: string;
  placement: string;
  display_name?: string | null;
  type?: string | null;
  clicks: number;
  impressions?: number;
  cost: number;
  conversions: number;
}

/** Placements worth excluding: at least 10 clicks and no conversions, or a click rate that looks forced. */
export function exclusionCandidates(rows: PlacementRow[], limit = 25): Array<PlacementRow & { reason: string }> {
  return rows
    .filter((r) => r.clicks >= 10 && r.conversions === 0)
    .map((r) => {
      const ctr = r.impressions && r.impressions > 0 ? r.clicks / r.impressions : null;
      const ctrNote = ctr !== null && ctr >= 0.1 ? ` Click rate ${pct(ctr)} is unusually high for a placement.` : '';
      return { ...r, reason: `${r.clicks} clicks, no conversions.${ctrNote}` };
    })
    .sort((a, b) => b.cost - a.cost || b.clicks - a.clicks)
    .slice(0, limit);
}
