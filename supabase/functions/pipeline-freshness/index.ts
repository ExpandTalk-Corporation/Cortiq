import { createClient } from '../_shared/supabase.ts';
import { PIPELINES, alertSentence, pipelineLabel, type Pipeline, type PipelineAlert } from '../_shared/pipeline-alerts.ts';

// Hourly from pg_cron (x-cron-secret, checked against a vault secret; verify_jwt is off in config.toml).
// check_pipeline_freshness() opens and resolves alerts; open alerts show in the dashboard regardless.
// With RESEND_API_KEY set, the site owner also gets one email when an alert opens and one when it resolves.

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function emailBody(domain: string, opened: PipelineAlert[], resolved: PipelineAlert[]): { subject: string; html: string } {
  const now = new Date();
  const items = [
    ...opened.map((a) => `<li><strong>${escape(alertSentence(a, now))}</strong><br>${escape(PIPELINES[a.pipeline as Pipeline]?.check ?? '')}</li>`),
    ...resolved.map((a) => `<li>${escape(pipelineLabel(a.pipeline))} is arriving again.</li>`),
  ];
  const subject = opened.length
    ? `${domain}: ${opened.map((a) => pipelineLabel(a.pipeline).toLowerCase()).join(', ')} stopped arriving`
    : `${domain}: data is arriving again`;
  const html = `<p>CortIQ checks every hour that data still arrives for ${escape(domain)}.</p><ul>${items.join('')}</ul>`
    + `<p><a href="https://cortiq.se/dashboard">Open the dashboard</a></p>`;
  return { subject, html };
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
  const pending = (alerts ?? []) as PipelineAlert[];
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey || !pending.length) return Response.json({ pending: pending.length, emailed: 0 });

  const from = Deno.env.get('ALERT_EMAIL_FROM') ?? 'CortIQ <alerts@cortiq.se>';
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
    const { subject, html } = emailBody(site.domain.replace(/^https?:\/\//, '').replace(/\/$/, ''), opened, resolved);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error('pipeline-freshness email', site.id, res.status, await res.text());
      continue;
    }
    const sentAt = new Date().toISOString();
    if (opened.length) await supabase.from('pipeline_alerts').update({ opened_notified_at: sentAt }).in('id', opened.map((a) => a.id));
    if (resolved.length) await supabase.from('pipeline_alerts').update({ resolved_notified_at: sentAt }).in('id', resolved.map((a) => a.id));
    emailed++;
  }
  return Response.json({ pending: pending.length, emailed });
});
