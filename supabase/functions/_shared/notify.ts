/**
 * _shared/notify.ts — dispatch incident notifications to configured channels.
 *
 * Usage (in any edge function after creating a behavioral_incident):
 *
 *   import { dispatchNotifications } from '../_shared/notify.ts';
 *
 *   dispatchNotifications(supabase, siteId, incidentType, severity, details)
 *     .catch(e => console.warn('[fn] notify error:', e));
 *
 * Best-effort: errors are caught internally and logged, never thrown.
 * A delivery failure must never block the incident that triggered it.
 *
 * Supported channels: telegram, webhook.
 */

import { createClient } from './supabase.ts';

type SupabaseClient = ReturnType<typeof createClient>;

const SEVERITY_EMOJI: Record<string, string> = {
  critical: '🔴',
  high:     '🟠',
  medium:   '🟡',
  low:      '🟢',
};

/**
 * Fetch all active notification channels for a site and dispatch in parallel.
 */
export async function dispatchNotifications(
  supabase: SupabaseClient,
  siteId: string,
  incidentType: string,
  severity: string,
  details: Record<string, unknown>,
): Promise<void> {
  const { data: channels, error } = await supabase
    .from('notification_channels')
    .select('id, channel, config, label')
    .eq('site_id', siteId)
    .eq('is_active', true);

  if (error) {
    console.warn('[notify] Could not load channels:', error.message);
    return;
  }
  if (!channels?.length) return;

  const message = formatMessage(incidentType, severity, details);
  const payload = { event: incidentType, severity, site_id: siteId, timestamp: new Date().toISOString(), details };

  await Promise.allSettled(
    channels.map(ch =>
      dispatch(supabase, ch.id, ch.channel, ch.config as Record<string, string>, message, siteId, incidentType, payload)
    )
  );
}

// ── Formatting ────────────────────────────────────────────────────────────────

function formatMessage(
  incidentType: string,
  severity: string,
  details: Record<string, unknown>,
): string {
  const emoji = SEVERITY_EMOJI[severity] ?? '⚪';
  const title = incidentType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  const lines: string[] = [
    `${emoji} *CortIQ Alert — ${title}*`,
    `Severity: \`${severity}\``,
  ];

  for (const [k, v] of Object.entries(details)) {
    if (v === null || v === undefined) continue;
    // Skip internal keys unlikely to be meaningful to the user
    if (k === 'type') continue;
    const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    lines.push(`${label}: \`${v}\``);
  }

  return lines.join('\n');
}

// ── Dispatcher ────────────────────────────────────────────────────────────────

async function dispatch(
  supabase: SupabaseClient,
  channelId: string,
  channel: string,
  config: Record<string, string>,
  message: string,
  siteId: string,
  eventType: string,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (channel) {
    case 'telegram':
      await sendTelegram(config.bot_token, config.chat_id, message);
      break;
    case 'webhook':
      await sendWebhook(supabase, channelId, siteId, eventType, config.url, config.secret, payload);
      break;
    // Future: case 'email': case 'slack':
    default:
      console.warn('[notify] Unknown channel type:', channel);
  }
}

// ── Webhook ───────────────────────────────────────────────────────────────────

async function sendWebhook(
  supabase: SupabaseClient,
  channelId: string,
  siteId: string,
  eventType: string,
  url: string,
  secret: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  if (!url) {
    console.warn('[notify] Webhook url missing — skipping');
    return;
  }

  const body = JSON.stringify(payload);
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  if (secret) {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
    headers['X-CortIQ-Signature'] = 'sha256=' + Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  let httpStatus: number | null = null;
  let responseBody: string | null = null;
  let status: 'success' | 'failed' = 'failed';

  try {
    const res = await fetch(url, { method: 'POST', headers, body });
    httpStatus = res.status;
    responseBody = await res.text().catch(() => null);
    status = res.ok ? 'success' : 'failed';
    if (!res.ok) {
      console.warn(`[notify] Webhook returned ${res.status} for ${url}`);
    }
  } catch (err) {
    console.warn('[notify] Webhook fetch error:', err);
  }

  await supabase.from('webhook_deliveries').insert({
    channel_id: channelId,
    site_id: siteId,
    event_type: eventType,
    payload,
    status,
    http_status: httpStatus,
    response_body: responseBody?.slice(0, 2000) ?? null,
  }).then(({ error }) => {
    if (error) console.warn('[notify] Failed to log webhook delivery:', error.message);
  });
}

// ── Telegram ──────────────────────────────────────────────────────────────────

async function sendTelegram(
  botToken: string,
  chatId: string,
  text: string,
): Promise<void> {
  if (!botToken || !chatId) {
    console.warn('[notify] Telegram config incomplete — skipping');
    return;
  }

  const res = await fetch(
    `https://api.telegram.org/bot${botToken}/sendMessage`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id:    chatId,
        text,
        parse_mode: 'Markdown',
      }),
    }
  );

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.warn(`[notify] Telegram error ${res.status}: ${body}`);
  }
}
