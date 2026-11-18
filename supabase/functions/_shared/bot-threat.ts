// Threat scoring for the AI Bot security analysis (ai-bot-behavior-analysis).
// Pure functions, no Deno or '@/' imports, so the foundation tests import this file directly.
//
// Earlier scoring gave "High" to two visits: URL scanning was unique URLs / visits × 200 (one visit
// to one page = 100), IP concentration was 100 % whenever all visits shared a prefix, and two hits
// a second apart counted as rapid fire. Now:
// - self-identified scanners (compliance, uptime, performance tools) are listed, never scored;
// - below MIN_VISITS_FOR_SCORE scored visits there is no threat level at all;
// - each indicator is computed per source, not over the whole period.

/** Fewer scored visits than this and no threat level is given: the figures would be noise. */
export const MIN_VISITS_FOR_SCORE = 20;

export interface KnownScanner {
  pattern: RegExp;
  name: string;
  kind: string;
}

// Automated tools that state who they are in the User-Agent and visit to check a site, not to
// scrape it. Not AI bots, so they stay out of ai-bot-registry.ts (which drives marketing claims).
export const KNOWN_SCANNERS: KnownScanner[] = [
  { pattern: /CortIQ-TrackingCheck/,  name: 'CortIQ Tracking Check', kind: 'CortIQ test run' },
  { pattern: /CortIQ-Uptime/,         name: 'CortIQ Uptime',         kind: 'CortIQ uptime check' },
  { pattern: /iubenda-radar/i,        name: 'iubenda Radar',         kind: 'Cookie compliance scanner' },
  { pattern: /Cookiebot/i,            name: 'Cookiebot scanner',     kind: 'Cookie compliance scanner' },
  { pattern: /Chrome-Lighthouse/i,    name: 'Lighthouse',            kind: 'Performance test' },
  { pattern: /PTST\//,                name: 'WebPageTest',           kind: 'Performance test' },
  { pattern: /GTmetrix/i,             name: 'GTmetrix',              kind: 'Performance test' },
  { pattern: /Pingdom/i,              name: 'Pingdom',               kind: 'Uptime monitor' },
  { pattern: /UptimeRobot/i,          name: 'UptimeRobot',           kind: 'Uptime monitor' },
];

export const matchScanner = (ua: string | null | undefined): KnownScanner | null =>
  KNOWN_SCANNERS.find((s) => s.pattern.test(ua ?? '')) ?? null;

export interface TrafficRow {
  id: string;
  bot_name: string | null;
  bot_type: string | null;
  user_agent: string | null;
  url: string | null;
  ip_address: string | null;
  country_code: string | null;
  js_executed: boolean | null;
  detected_at: string;
}

export interface ProbeRow {
  traffic_id: string;
  webdriver_detected: boolean | null;
  headless_detected: boolean | null;
  automation_signals: Record<string, unknown> | null;
}

/** One bot as seen by the site: what it called itself, where from, what it did and which signals fired. */
export interface BotSource {
  name: string;
  userAgent: string;
  scanner: { name: string; kind: string } | null;
  visits: number;
  firstSeen: string;
  lastSeen: string;
  countries: Record<string, number>;
  uniquePages: number;
  topPages: string[];
  /** Most requests inside any 60-second window. */
  peakPerMinute: number;
  jsExecuted: number;
  webdriver: number;
  headless: number;
  /** Visits where 3 or more automation signals fired. */
  automation: number;
}

/** Path only: query strings can carry tokens or e-mail addresses. */
export const pathOf = (url: string | null | undefined): string => {
  if (!url) return '(unknown)';
  try { return new URL(url).pathname || '/'; } catch { return url.split(/[?#]/)[0] || '(unknown)'; }
};

const ipPrefix = (ip: string | null) => (ip ? ip.split(/[.:]/).slice(0, 2).join('.') : 'unknown');

function peakPerMinute(times: number[]): number {
  const t = [...times].sort((a, b) => a - b);
  let best = 0;
  for (let i = 0, j = 0; j < t.length; j++) {
    while (t[j] - t[i] >= 60_000) i++;
    best = Math.max(best, j - i + 1);
  }
  return best;
}

const automationHits = (p: ProbeRow | undefined) =>
  Object.values(p?.automation_signals ?? {}).filter((v) => v === true).length;

/** Groups visits per bot (registry name, or the User-Agent for unknown bots), busiest first. */
export function groupSources(traffic: TrafficRow[], probes: ProbeRow[]): BotSource[] {
  const probeBy = new Map(probes.map((p) => [p.traffic_id, p]));
  const groups = new Map<string, TrafficRow[]>();
  for (const t of traffic) {
    const ua = t.user_agent ?? '';
    const known = t.bot_name && t.bot_name !== 'Unknown Bot' ? t.bot_name : null;
    const key = known ?? (ua || 'unknown');
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  return [...groups.entries()].map(([key, rows]) => {
    const ua = rows[0].user_agent ?? '';
    const scanner = matchScanner(ua);
    const pages = new Map<string, number>();
    const countries: Record<string, number> = {};
    for (const r of rows) {
      const p = pathOf(r.url);
      pages.set(p, (pages.get(p) ?? 0) + 1);
      const c = r.country_code || 'unknown';
      countries[c] = (countries[c] ?? 0) + 1;
    }
    const times = rows.map((r) => Date.parse(r.detected_at)).filter(Number.isFinite);
    const probesFor = rows.map((r) => probeBy.get(r.id));
    return {
      name: scanner?.name ?? (key === ua ? 'Unidentified bot' : key),
      userAgent: ua,
      scanner: scanner && { name: scanner.name, kind: scanner.kind },
      visits: rows.length,
      firstSeen: new Date(Math.min(...times)).toISOString(),
      lastSeen: new Date(Math.max(...times)).toISOString(),
      countries,
      uniquePages: pages.size,
      topPages: [...pages.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p]) => p),
      peakPerMinute: peakPerMinute(times),
      jsExecuted: rows.filter((r) => r.js_executed).length,
      webdriver: probesFor.filter((p) => p?.webdriver_detected).length,
      headless: probesFor.filter((p) => p?.headless_detected).length,
      automation: probesFor.filter((p) => automationHits(p) >= 3).length,
    };
  }).sort((a, b) => b.visits - a.visits);
}

export interface ThreatIndicators {
  rapidFireRequests: number;
  ipConcentration: number;
  urlScanningPattern: number;
  automationScore: number;
  headlessRatio: number;
}

export type ThreatAssessment =
  | { assessed: true; scoredVisits: number; score: number; level: 'Low' | 'Medium' | 'High'; indicators: ThreatIndicators }
  | { assessed: false; scoredVisits: number; reason: string };

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Threat level over the visits that are not from a known scanner. Indicators (0–100):
 * - rapid fire: busiest source's peak per minute; 10/min or less = 0, 30/min or more = 100;
 * - IP concentration: share of scored visits from the top /16 (or IPv6 /32-ish) prefix;
 * - URL scanning: most distinct pages one source requested; 20 or fewer = 0, 70 or more = 100;
 * - automation / headless: share of scored visits with those probe signals.
 */
export function assessThreat(traffic: TrafficRow[], probes: ProbeRow[]): ThreatAssessment {
  const scored = traffic.filter((t) => !matchScanner(t.user_agent));
  if (scored.length < MIN_VISITS_FOR_SCORE) {
    return {
      assessed: false,
      scoredVisits: scored.length,
      reason: `Too few bot visits to assess a threat level (${scored.length}; at least ${MIN_VISITS_FOR_SCORE} needed, known scanners excluded).`,
    };
  }
  const sources = groupSources(scored, probes);
  const prefixes = new Map<string, number>();
  for (const t of scored) prefixes.set(ipPrefix(t.ip_address), (prefixes.get(ipPrefix(t.ip_address)) ?? 0) + 1);
  const topPrefix = Math.max(...prefixes.values());
  const n = scored.length;
  const sum = (f: (s: BotSource) => number) => sources.reduce((a, s) => a + f(s), 0);

  const indicators: ThreatIndicators = {
    rapidFireRequests: clamp((Math.max(...sources.map((s) => s.peakPerMinute)) - 10) * 5),
    ipConcentration: (topPrefix / n) * 100,
    urlScanningPattern: clamp((Math.max(...sources.map((s) => s.uniquePages)) - 20) * 2),
    automationScore: (sum((s) => s.automation) / n) * 100,
    headlessRatio: (sum((s) => s.headless) / n) * 100,
  };
  const score =
    indicators.rapidFireRequests * 0.25 +
    indicators.ipConcentration * 0.15 +
    indicators.urlScanningPattern * 0.2 +
    indicators.automationScore * 0.2 +
    indicators.headlessRatio * 0.2;
  return { assessed: true, scoredVisits: n, score, level: score < 30 ? 'Low' : score < 60 ? 'Medium' : 'High', indicators };
}

export interface AiReview {
  summary: string;
  findings: { title: string; detail: string }[];
  actions: string[];
}

/** Validates the model's JSON; anything else is rejected rather than shown. */
export function parseAiReview(text: string): AiReview | null {
  try {
    const o = JSON.parse(text.trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    const ok = o && typeof o.summary === 'string'
      && Array.isArray(o.findings) && o.findings.length <= 5
      && o.findings.every((f: unknown) => f && typeof (f as AiReview['findings'][0]).title === 'string' && typeof (f as AiReview['findings'][0]).detail === 'string')
      && Array.isArray(o.actions) && o.actions.length <= 5 && o.actions.every((a: unknown) => typeof a === 'string');
    return ok ? { summary: o.summary, findings: o.findings, actions: o.actions } : null;
  } catch {
    return null;
  }
}
