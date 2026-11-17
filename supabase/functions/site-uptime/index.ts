import { createClient } from '../_shared/supabase.ts';
import { UPTIME_KINDS, checkSite, hostOf, siteUrl, uptimeSentence, type UptimeAlert, type UptimeKind } from '../_shared/uptime.ts';

// Every 5 minutes from pg_cron (x-cron-secret, checked against a vault secret; verify_jwt is off in config.toml).
// Fetches every active site's home page, records the result with record_uptime_check() (which opens and
// resolves alerts), and with RESEND_API_KEY set emails the owner once when an alert opens and once when it resolves.

const CONCURRENCY = 8;

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function emailBody(host: string, opened: UptimeAlert[], resolved: UptimeAlert[]): { subject: string; html: string } {
  const items = [
    ...opened.map((a) => `<li><strong>${escape(uptimeSentence(a, host))}</strong><br>${escape(UPTIME_KINDS[a.kind as UptimeKind]?.check ?? '')}</li>`),
    ...resolved.map((a) => `<li>${escape(a.kind === 'down' ? `${host} answers again.` : `The CortIQ snippet is back on ${host}.`)}</li>`),
  ];
  const subject = opened.length
    ? opened.map((a) => UPTIME_KINDS[a.kind as UptimeKind]?.title(host) ?? a.kind).join('; ')
    : `${host} is back`;
  const html = `<p>CortIQ checks ${escape(host)} every 5 minutes.</p><ul>${items.join('')}</ul>`
    + `<p><a href="https://cortiq.se/dashboard">Open the dashboard</a></p>`;
  return { subject, html };
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: ok } = await supabase.rpc('site_uptime_cron_secret_matches', { p_secret: req.headers.get('x-cron-secret') });
  if (ok !== true) return new Response('Unauthorized', { status: 401 });

  const { data: sites, error } = await supabase.from('sites').select('id, domain, user_id, is_active');
  if (error) {
    console.error('site-uptime sites', error);
    return Response.json({ error: 'sites failed' }, { status: 500 });
  }
  const targets = (sites ?? [])
    .filter((s) => s.is_active !== false)
    .map((s) => ({ ...s, url: siteUrl(s.domain) }))
    .filter((s): s is typeof s & { url: string } => !!s.url);

  let checked = 0;
  for (let i = 0; i < targets.length; i += CONCURRENCY) {
    await Promise.all(targets.slice(i, i + CONCURRENCY).map(async (site) => {
      const result = await checkSite(site.url);
      const { error: recordError } = await supabase.rpc('record_uptime_check', {
        p_site_id: site.id, p_problem: result.problem, p_status: result.status,
        p_detail: result.detail, p_snippet_found: result.snippetFound,
      });
      if (recordError) console.error('record_uptime_check', site.id, recordError);
      else checked++;
    }));
  }

  const { data: alerts } = await supabase.rpc('uptime_alerts_to_email');
  const pending = (alerts ?? []) as UptimeAlert[];
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey || !pending.length) return Response.json({ checked, pending: pending.length, emailed: 0 });

  const from = Deno.env.get('ALERT_EMAIL_FROM') ?? 'CortIQ <alerts@cortiq.se>';
  const bySite = Map.groupBy(pending, (a) => a.site_id);
  let emailed = 0;
  for (const site of targets.filter((s) => bySite.has(s.id))) {
    const { data: owner } = await supabase.auth.admin.getUserById(site.user_id);
    const to = owner?.user?.email;
    if (!to) continue;
    const siteAlerts = bySite.get(site.id) ?? [];
    const opened = siteAlerts.filter((a) => !a.resolved_at);
    const resolved = siteAlerts.filter((a) => a.resolved_at);
    const { subject, html } = emailBody(hostOf(site.domain), opened, resolved);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error('site-uptime email', site.id, res.status, await res.text());
      continue;
    }
    const sentAt = new Date().toISOString();
    if (opened.length) await supabase.from('uptime_alerts').update({ opened_notified_at: sentAt }).in('id', opened.map((a) => a.id));
    if (resolved.length) await supabase.from('uptime_alerts').update({ resolved_notified_at: sentAt }).in('id', resolved.map((a) => a.id));
    emailed++;
  }
  return Response.json({ checked, pending: pending.length, emailed });
});
