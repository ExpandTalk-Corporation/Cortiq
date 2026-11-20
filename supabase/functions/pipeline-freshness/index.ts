import { createClient } from '../_shared/supabase.ts';
import { PIPELINES, alertSentence, pipelineLabel, type Pipeline, type PipelineAlert } from '../_shared/pipeline-alerts.ts';
import { conversionEmailBody, type ConversionAlert } from '../_shared/conversion-alerts.ts';
import { escapeHtml as escape, sendAlertEmail } from '../_shared/resend.ts';

// Hourly from pg_cron (x-cron-secret, checked against a vault secret; verify_jwt is off in config.toml).
// check_pipeline_freshness() opens and resolves pipeline alerts; check_conversion_alerts() does the same for
// goals and forms (spec 2026-11-19 §2). Open alerts show in the dashboard regardless. With RESEND_API_KEY set,
// the site owner also gets one email when an alert opens and one when it resolves, per kind of check.

type Alert = { id: string; site_id: string; resolved_at: string | null };
type Supabase = ReturnType<typeof createClient>;

function emailBody(domain: string, opened: PipelineAlert[], resolved: PipelineAlert[]): { subject: string; html: string } {
  const now = new Date();
  // aggregate_never resolves either because a hit arrived or because the flag was turned off, so
  // "is arriving again" (true for every other pipeline, which only ever resolve on a fresh hit)
  // would be wrong half the time here.
  const items = [
    ...opened.map((a) => `<li><strong>${escape(alertSentence(a, now))}</strong><br>${escape(PIPELINES[a.pipeline as Pipeline]?.check ?? '')}</li>`),
    ...resolved.map((a) => a.pipeline === 'aggregate_never'
      ? `<li>Aggregate measurement: the alert cleared — a hit arrived, or it was turned off.</li>`
      : `<li>${escape(pipelineLabel(a.pipeline))} is arriving again.</li>`),
  ];
  // aggregate_never never "stopped arriving" — it never started. Give it its own subject clause
  // so it doesn't get glued to the generic "stopped arriving" suffix used for the other pipelines.
  const subject = opened.length
    ? `${domain}: ${opened.map((a) => a.pipeline === 'aggregate_never'
        ? 'aggregate measurement never sent a hit'
        : `${pipelineLabel(a.pipeline).toLowerCase()} stopped arriving`).join(', ')}`
    : `${domain}: data is arriving again`;
  const html = `<p>CortIQ checks every hour that data still arrives for ${escape(domain)}.</p><ul>${items.join('')}</ul>`
    + `<p><a href="https://cortiq.se/dashboard">Open the dashboard</a></p>`;
  return { subject, html };
}

/** Emails each site owner once for the pending alerts of one table; returns how many emails went out. */
async function emailOwners<T extends Alert>(
  supabase: Supabase, apiKey: string, table: 'pipeline_alerts' | 'conversion_alerts', pending: T[],
  body: (domain: string, opened: T[], resolved: T[]) => { subject: string; html: string },
): Promise<number> {
  const bySite = Map.groupBy(pending, (a) => a.site_id);
  const { data: sites } = await supabase.from('sites').select('id, domain, user_id').in('id', [...bySite.keys()]);
  let emailed = 0;
  for (const site of sites ?? []) {
    const { data: owner } = await supabase.auth.admin.getUserById(site.user_id);
    const to = owner?.user?.email;
    if (!to) continue;
    const siteAlerts = bySite.get(site.id) ?? [];
    const opened = siteAlerts.filter((a) => !a.resolved_at);
    const resolved = siteAlerts.filter((a) => a.resolved_at);
    const { subject, html } = body(site.domain.replace(/^https?:\/\//, '').replace(/\/$/, ''), opened, resolved);
    if (!(await sendAlertEmail({ apiKey, to, subject, html, context: site.id }))) continue;
    const sentAt = new Date().toISOString();
    if (opened.length) await supabase.from(table).update({ opened_notified_at: sentAt }).in('id', opened.map((a) => a.id));
    if (resolved.length) await supabase.from(table).update({ resolved_notified_at: sentAt }).in('id', resolved.map((a) => a.id));
    emailed++;
  }
  return emailed;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: ok } = await supabase.rpc('pipeline_freshness_cron_secret_matches', { p_secret: req.headers.get('x-cron-secret') });
  if (ok !== true) return new Response('Unauthorized', { status: 401 });

  const { data: alerts, error } = await supabase.rpc('check_pipeline_freshness');
  if (error) {
    console.error('check_pipeline_freshness', error);
    return Response.json({ error: 'check failed' }, { status: 500 });
  }
  // A failing conversion check must not stop pipeline alerts; it is reported in the response.
  const { data: conversionRows, error: conversionError } = await supabase.rpc('check_conversion_alerts');
  if (conversionError) console.error('check_conversion_alerts', conversionError);

  const pending = (alerts ?? []) as PipelineAlert[];
  const conversions = (conversionRows ?? []) as ConversionAlert[];
  const resendKey = Deno.env.get('RESEND_API_KEY');
  const emailed = resendKey && pending.length ? await emailOwners(supabase, resendKey, 'pipeline_alerts', pending, emailBody) : 0;
  const conversionEmailed = resendKey && conversions.length
    ? await emailOwners(supabase, resendKey, 'conversion_alerts', conversions, conversionEmailBody) : 0;
  return Response.json({
    pending: pending.length, emailed,
    conversions: { pending: conversions.length, emailed: conversionEmailed, ...(conversionError ? { error: 'check failed' } : {}) },
  });
});
