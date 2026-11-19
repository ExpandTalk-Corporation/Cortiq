// Measurement health (spec 2026-11-19 §1): types for get_measurement_health(), and every sentence the
// dashboard shows for it. No imports: the dashboard and the tests import this file directly.

export type CheckStatus = 'ok' | 'warning' | 'broken' | 'unknown';
export type CheckKey = 'uptime' | 'pipelines' | 'goals_configured' | 'goal_health' | 'consent_rate' | 'conversions';
export type SignalKey = 'page_views' | 'clicks_button' | 'clicks_link' | 'clicks_nav' | 'form_sessions'
  | 'consent_choices' | 'aggregate_hits' | 'server_hits' | 'link_clicks' | 'conversions';

// deno-lint-ignore no-explicit-any
export interface HealthCheck { key: CheckKey; status: CheckStatus; evidence: Record<string, any> }
export interface HealthSignal { signal: SignalKey; count_7d: number; count_28d: number; last_seen: string | null }
export interface MeasurementHealth { status: 'ok' | 'warning' | 'broken'; checked_at: string; checks: HealthCheck[]; signals: HealthSignal[] }
export interface SriManifest { latest: string; versions: Record<string, { securityFix?: boolean }> }

/** fixTab is a dashboard tab value (navSections.ts) where the problem is fixed. */
export const CHECKS: Record<CheckKey, { label: string; fixTab: string }> = {
  uptime: { label: 'Site and snippet', fixTab: 'setup' },
  pipelines: { label: 'Data pipelines', fixTab: 'setup' },
  goals_configured: { label: 'Conversion goals', fixTab: 'conversion-goals' },
  goal_health: { label: 'Goal health', fixTab: 'conversion-goals' },
  consent_rate: { label: 'Consent rate', fixTab: 'consent' },
  conversions: { label: 'Conversions', fixTab: 'forms' },
};

export const SIGNALS: Record<SignalKey, string> = {
  page_views: 'Page views',
  clicks_button: 'Button clicks',
  clicks_link: 'Link clicks (sessions)',
  clicks_nav: 'Navigation clicks',
  form_sessions: 'Form sessions',
  consent_choices: 'Consent choices',
  aggregate_hits: 'Aggregate page views',
  server_hits: 'Server-side hits',
  link_clicks: 'Link clicks (aggregate)',
  conversions: 'Conversion events',
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const names = (goals: { name?: string; id?: string }[]) => goals.map((g) => g.name ?? g.id).join(', ');

export function checkSentence(c: HealthCheck): string {
  const e = c.evidence ?? {};
  switch (c.key) {
    case 'uptime':
      if (c.status === 'broken') return 'The site does not answer (see the alert below).';
      if (c.status === 'warning') return 'The CortIQ snippet is gone from the home page (see the alert below).';
      if (c.status === 'unknown' || !e.checked_at) return 'The home page has not been checked yet. Checks run every 5 minutes.';
      return 'The home page answers. Checked every 5 minutes.';
    case 'pipelines': {
      const n = (e.open ?? []).length;
      return n ? `${plural(n, 'data pipeline', 'data pipelines')} stopped arriving (see below).` : 'Every data pipeline that used to arrive still does.';
    }
    case 'goals_configured': {
      const n = Number(e.goals ?? 0);
      return n ? `${plural(n, 'goal', 'goals')} set up.` : 'No conversion goals set up. Conversion alerts then cover forms only.';
    }
    case 'goal_health': {
      if (c.status === 'unknown') return 'No goals to check.';
      const goals: { name?: string; id?: string; issue?: string | null }[] = e.goals ?? [];
      const silent = goals.filter((g) => g.issue === 'silent');
      const often = goals.filter((g) => g.issue === 'fires_too_often');
      const parts = [
        silent.length ? `No conversions in 30 days: ${names(silent)}.` : '',
        often.length ? `Fires on more than 30% of sessions: ${names(often)}.` : '',
        Number(e.primary_goals ?? 0) > 1 ? `More than one primary goal (${e.primary_goals}).` : '',
      ].filter(Boolean);
      return parts.length ? parts.join(' ') : 'Every goal converted in the last 30 days at a plausible rate.';
    }
    case 'consent_rate': {
      const r = e.rate_7d ?? 0, p = e.rate_prior_28d ?? 0;
      if (c.status === 'unknown') {
        return `Too few consent choices to compare (${Number(e.choices_7d ?? 0)} in the last 7 days, ${Number(e.choices_prior_28d ?? 0)} in the 28 days before; 30 needed in each).`;
      }
      if (c.status === 'warning') return `Analytics acceptance fell to ${r}% in the last 7 days from ${p}% in the 28 days before. Check the banner and its texts.`;
      return `${r}% accepted analytics in the last 7 days, ${p}% in the 28 days before.`;
    }
    case 'conversions': {
      const n = (e.open ?? []).length;
      return n ? `${plural(n, 'conversion alert', 'conversion alerts')} open (see below).` : 'No conversion alerts open.';
    }
    default:
      return `Check ${String((c as HealthCheck).key)}: ${(c as HealthCheck).status}.`;
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  return 0;
}

/** Compares the version read from the home page with the SRI manifest. null = nothing to say. */
export function trackerVersionStatus(version: string | null | undefined, manifest: SriManifest):
  { status: 'ok' | 'warning' | 'broken'; message: string } | null {
  if (!version || !/^\d+\.\d+\.\d+$/.test(version)) return null;
  if (compareVersions(version, manifest.latest) >= 0) return { status: 'ok', message: `Tracker ${version} on the home page is the latest.` };
  const fix = Object.entries(manifest.versions)
    .filter(([v, info]) => info.securityFix && compareVersions(v, version) > 0)
    .map(([v]) => v)
    .sort(compareVersions)[0];
  if (fix) {
    return { status: 'broken', message: `Tracker ${version} on the home page misses the security fix in ${fix}; the latest is ${manifest.latest}. Update the plugin or the pinned snippet.` };
  }
  return { status: 'warning', message: `Tracker ${version} on the home page; the latest is ${manifest.latest}.` };
}
