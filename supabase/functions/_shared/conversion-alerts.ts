// Conversion alerts (spec 2026-11-19 §2): thresholds, labels and sentences. The rules run in SQL
// (conversion_alert_stats in 20261206000002_conversion_alerts.sql); the numbers below repeat that
// file's constants for UI text, and conversion-alert-thresholds.test.mjs keeps them equal.
// No imports: the dashboard, the Edge Functions and the tests import this file directly.

export const CONVERSION_ALERT_THRESHOLDS = {
  goalMinPriorHits: 3,
  goalMinSiteViews: 50,
  formZeroMinStarts: 5,
  spikeMinStarts: 10,
  spikeOpenPp: 25,
  spikeClosePp: 15,
  retentionDays: 365,
} as const;

export type ConversionAlertKind = 'goal_silent' | 'form_zero_completions' | 'form_abandon_spike';

export interface ConversionAlert {
  id: string;
  site_id: string;
  kind: string;
  subject: string;
  detail: Record<string, unknown>;
  opened_at: string;
  resolved_at: string | null;
}

export const CONVERSION_ALERT_KINDS: Record<ConversionAlertKind, { title: string; check: string }> = {
  goal_silent: {
    title: 'a goal stopped converting',
    check: 'Check that the goal\'s trigger still exists on the page (a renamed button or a changed form often breaks it), then test the goal in the Goals tab.',
  },
  form_zero_completions: {
    title: 'a form gets no completions',
    check: 'Submit the form yourself and check that the confirmation still appears. A broken submit, a captcha or a changed form id can stop completions.',
  },
  form_abandon_spike: {
    title: 'more visitors abandon a form',
    check: 'Look for a new required field, a validation error or a slow submit on this form. A recent change to the page is the usual cause.',
  },
};

const num = (v: unknown) => (typeof v === 'number' ? v : Number(v ?? 0));

export function conversionAlertSentence(a: Pick<ConversionAlert, 'kind' | 'subject' | 'detail' | 'opened_at'>): string {
  const d = a.detail ?? {};
  switch (a.kind) {
    case 'goal_silent':
      return `Goal "${String(d.goal_name ?? a.subject)}" has had no conversions for 7 days (${num(d.hits_prior_28d)} in the 28 days before, ${num(d.page_views_7d)} page views this week).`;
    case 'form_zero_completions':
      return `Form "${a.subject}": ${num(d.starts_7d)} starts and no completions in 7 days (${num(d.completions_prior_28d)} completions in the 28 days before).`;
    case 'form_abandon_spike':
      return `Form "${a.subject}": ${num(d.abandon_rate_7d)}% abandoned in the last 7 days, against ${num(d.abandon_rate_prior_28d)}% in the 28 days before (${num(d.starts_7d)} starts).`;
    default:
      return `Conversion alert: ${a.kind} (${a.subject}).`;
  }
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function conversionEmailBody(domain: string, opened: ConversionAlert[], resolved: ConversionAlert[]): { subject: string; html: string } {
  const items = [
    ...opened.map((a) => `<li><strong>${escape(conversionAlertSentence(a))}</strong><br>${escape(CONVERSION_ALERT_KINDS[a.kind as ConversionAlertKind]?.check ?? '')}</li>`),
    ...resolved.map((a) => `<li>${escape(a.kind === 'goal_silent' ? `Goal "${String(a.detail?.goal_name ?? a.subject)}"` : `Form "${a.subject}"`)} is back to normal.</li>`),
  ];
  const subject = opened.length
    ? `${domain}: ${[...new Set(opened.map((a) => CONVERSION_ALERT_KINDS[a.kind as ConversionAlertKind]?.title ?? a.kind))].join(', ')}`
    : `${domain}: conversions are back to normal`;
  const html = `<p>CortIQ checks conversions on ${escape(domain)} every hour.</p><ul>${items.join('')}</ul>`
    + `<p><a href="https://cortiq.se/dashboard">Open the dashboard</a></p>`;
  return { subject, html };
}
