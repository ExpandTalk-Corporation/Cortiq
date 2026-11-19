// Traceable AI insights (spec 2026-11-19 §3). The server computes every number as a Fact; the model may
// only cite facts as {{mN}} and never writes digits itself. validateInsight enforces that, and the
// dashboard renders the values with their source. No imports: the dashboard, the Edge Function and the
// tests import this file directly.

export type FactUnit = 'count' | 'percent' | 'seconds' | 'ratio';

export interface Fact {
  id: string;
  label: string;
  value: number;
  unit: FactUnit;
  source: string;
  period: { from: string; to: string };
  formula: string;
  rows: number;
}

export interface PeriodSummary {
  total_page_views: number;
  total_sessions: number;
  /** Paths only — the caller strips query strings and fragments before this point. */
  top_pages?: { path: string; views: number }[] | null;
  device_breakdown?: Record<string, number> | null;
}

export interface FactInput {
  period: { from: string; to: string };
  previous: { from: string; to: string };
  summary: PeriodSummary;
  previousSummary: PeriodSummary | null;
  heatmapCount: number;
  formSessions: { form_id: string | null; completed_at: string | null; abandoned_at: string | null }[];
  lifetimeForms: { form_name: string | null; total_starts: number | null; total_completions: number | null }[];
  conversionEvents: { event_name: string | null }[];
  healthChecks: { key: string; status: string }[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
// Labels carry site data (paths, form names) into the prompt: no braces, no line breaks, bounded length.
const clean = (s: string) => s.replace(/[{}]/g, '').replace(/[\r\n\t|]+/g, ' ').trim().slice(0, 80);

export function buildFacts(input: FactInput): Fact[] {
  const facts: Fact[] = [];
  const add = (f: Omit<Fact, 'id'>) => { facts.push({ id: `m${facts.length + 1}`, ...f }); };
  const cur = input.period;
  const s = input.summary;
  const p = input.previousSummary;

  add({ label: 'Page views', value: s.total_page_views, unit: 'count', source: 'get_analytics_summary', period: cur, formula: 'count(page_views)', rows: s.total_page_views });
  add({ label: 'Sessions', value: s.total_sessions, unit: 'count', source: 'get_analytics_summary', period: cur, formula: 'count(tracking_sessions)', rows: s.total_sessions });
  if (p) {
    add({ label: 'Page views (previous period)', value: p.total_page_views, unit: 'count', source: 'get_analytics_summary', period: input.previous, formula: 'count(page_views)', rows: p.total_page_views });
    add({ label: 'Sessions (previous period)', value: p.total_sessions, unit: 'count', source: 'get_analytics_summary', period: input.previous, formula: 'count(tracking_sessions)', rows: p.total_sessions });
    add({ label: 'Page views: change from previous period', value: s.total_page_views - p.total_page_views, unit: 'count', source: 'get_analytics_summary', period: cur, formula: 'current - previous', rows: s.total_page_views + p.total_page_views });
    add({ label: 'Sessions: change from previous period', value: s.total_sessions - p.total_sessions, unit: 'count', source: 'get_analytics_summary', period: cur, formula: 'current - previous', rows: s.total_sessions + p.total_sessions });
  }
  if (s.total_sessions > 0) {
    add({ label: 'Pages per session', value: round2(s.total_page_views / s.total_sessions), unit: 'ratio', source: 'get_analytics_summary', period: cur, formula: 'page views / sessions', rows: s.total_sessions });
  }
  for (const page of (s.top_pages ?? []).slice(0, 5)) {
    add({ label: `Page '${clean(page.path)}': views`, value: page.views, unit: 'count', source: 'get_analytics_summary', period: cur, formula: 'count(page_views) for the path', rows: page.views });
  }
  for (const [device, n] of Object.entries(s.device_breakdown ?? {}).slice(0, 5)) {
    add({ label: `Device '${clean(device)}'`, value: n, unit: 'count', source: 'get_analytics_summary', period: cur, formula: 'count by device type', rows: n });
  }
  add({ label: 'Heatmap interactions', value: input.heatmapCount, unit: 'count', source: 'heatmap_data', period: cur, formula: 'count(heatmap_data)', rows: input.heatmapCount });

  const forms = new Map<string, { done: number; dropped: number }>();
  for (const r of input.formSessions) {
    if (!r.form_id) continue;
    const f = forms.get(r.form_id) ?? { done: 0, dropped: 0 };
    if (r.completed_at) f.done++; else if (r.abandoned_at) f.dropped++;
    forms.set(r.form_id, f);
  }
  const formRows = [...forms].map(([id, f]) => ({ id, ...f, starts: f.done + f.dropped }))
    .filter((f) => f.starts > 0).sort((a, b) => b.starts - a.starts || a.id.localeCompare(b.id)).slice(0, 10);
  for (const f of formRows) {
    const name = clean(f.id);
    add({ label: `Form '${name}': starts`, value: f.starts, unit: 'count', source: 'form_sessions', period: cur, formula: 'completed + abandoned', rows: f.starts });
    add({ label: `Form '${name}': completions`, value: f.done, unit: 'count', source: 'form_sessions', period: cur, formula: 'count(completed)', rows: f.starts });
    add({ label: `Form '${name}': abandon rate`, value: round1((100 * f.dropped) / f.starts), unit: 'percent', source: 'form_sessions', period: cur, formula: 'abandoned / (completed + abandoned)', rows: f.starts });
  }
  for (const f of input.lifetimeForms.slice(0, 10)) {
    const starts = Number(f.total_starts ?? 0);
    if (starts <= 0) continue;
    add({ label: `Form '${clean(f.form_name ?? 'unnamed')}': completion rate (LIFETIME counter, not a total for this period)`, value: round1((100 * Number(f.total_completions ?? 0)) / starts), unit: 'percent', source: 'form_analytics', period: { from: 'lifetime', to: cur.to }, formula: 'total_completions / total_starts', rows: starts });
  }

  const events = new Map<string, number>();
  for (const e of input.conversionEvents) if (e.event_name) events.set(e.event_name, (events.get(e.event_name) ?? 0) + 1);
  for (const [name, n] of [...events].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    add({ label: `Conversion events '${clean(name)}'`, value: n, unit: 'count', source: 'conversion_events', period: cur, formula: 'count(conversion_events) by event_name', rows: n });
  }
  if (input.healthChecks.length) {
    const bad = input.healthChecks.filter((c) => c.status === 'warning' || c.status === 'broken').length;
    add({ label: 'Measurement checks not ok', value: bad, unit: 'count', source: 'get_measurement_health', period: cur, formula: 'checks with status warning or broken', rows: input.healthChecks.length });
  }
  return facts;
}

export function factLine(f: Fact): string {
  return `${f.id} | ${f.label} | ${f.value} ${f.unit} | ${f.period.from}..${f.period.to}`;
}

const TOKEN = /\{\{\s*(m\d+)\s*\}\}/g;

/** Words that contain a digit but are not an allowed name (GA4, H1) or a URL path (/blog/2026/). */
export function bareNumbers(text: string): string[] {
  const out: string[] = [];
  for (const word of text.replace(TOKEN, ' ').split(/\s+/)) {
    if (!word) continue;
    if (/[{}]/.test(word)) { if (/\p{Nd}/u.test(word) || /m\d/.test(word)) out.push(word); continue; }
    if (!/\p{Nd}/u.test(word)) continue;
    const core = word.replace(/^[^\p{L}\p{Nd}/]+/u, '').replace(/[^\p{L}\p{Nd}]+$/u, '');
    if (core.startsWith('/')) continue;
    if (/^m\d+$/i.test(core)) { out.push(word); continue; }
    if (/^\p{L}[\p{L}\p{Nd}_-]*$/u.test(core)) continue;
    out.push(word);
  }
  return out;
}

export function validateInsight(
  insight: { title: string; description: string; actionItems: string[] },
  facts: Fact[],
): { ok: boolean; errors: string[]; factIds: string[] } {
  const known = new Set(facts.map((f) => f.id));
  const used = new Set<string>();
  const errors: string[] = [];
  for (const text of [insight.title, insight.description, ...insight.actionItems]) {
    for (const m of text.matchAll(TOKEN)) {
      if (known.has(m[1])) used.add(m[1]); else errors.push(`unknown fact {{${m[1]}}}`);
    }
    for (const n of bareNumbers(text)) errors.push(`number "${n}" written without a fact token`);
  }
  if (!used.size) errors.push('no fact token: every insight must cite at least one fact');
  const factIds = [...used].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1)));
  return { ok: errors.length === 0, errors, factIds };
}

export function formatFact(f: Fact): string {
  switch (f.unit) {
    case 'percent': return `${round1(f.value)} %`;
    case 'ratio': return f.value.toFixed(2);
    case 'seconds': {
      const total = Math.round(f.value);
      const m = Math.trunc(total / 60), s = Math.abs(total % 60);
      return m ? `${m} m ${s} s` : `${total} s`;
    }
    default: return Math.round(f.value).toLocaleString('en-US');
  }
}

export function splitTokens(text: string): Array<string | { id: string }> {
  const parts: Array<string | { id: string }> = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push({ id: m[1] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
