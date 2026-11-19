// One alert email through Resend. Used by site-uptime and pipeline-freshness; callers only send when
// RESEND_API_KEY is set and record opened/resolved_notified_at when this returns true.

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export async function sendAlertEmail(opts: { apiKey: string; to: string; subject: string; html: string; context?: string }): Promise<boolean> {
  const from = Deno.env.get('ALERT_EMAIL_FROM') || 'CortIQ <alerts@cortiq.se>';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${opts.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
  });
  if (!res.ok) console.error('alert email', ...(opts.context ? [opts.context] : []), res.status, await res.text());
  return res.ok;
}
