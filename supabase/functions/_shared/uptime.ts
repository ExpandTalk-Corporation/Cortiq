// Uptime monitoring (migration 20261130000001_site_uptime.sql): fetch a site's home page and say whether it
// is down, loaded, or could not be judged, and whether the CortIQ snippet is in the HTML.
// Shared by the site-uptime Edge Function and the dashboard (src/components/dashboard/overview/PipelineAlerts.tsx).
import { assertSafeUrl, type Resolver } from './safe-url.ts';

export type UptimeKind = 'down' | 'snippet_missing';

export interface UptimeCheck {
  problem: 'down' | 'inconclusive' | null;
  status: number | null;
  detail: string | null;
  /** The loaded page contains the CortIQ snippet; null when it did not load. */
  snippetFound: boolean | null;
}

export interface UptimeAlert {
  id: string;
  site_id: string;
  kind: string;
  detail: string | null;
  opened_at: string;
  resolved_at: string | null;
}

// No "Mozilla" prefix, as for Tracking Check: some hosts reset the connection for a fake browser.
export const USER_AGENT = 'CortIQ-Uptime/1.0 (+https://cortiq.se/)';
const TIMEOUT_MS = 15_000;
const MAX_BODY = 1_000_000;
const MAX_HOPS = 5;

// The install snippet, the WordPress plugin and self-hosted copies all leave one of these in the HTML.
const SNIPPET = /cortiqConfig|<script\b[^>]*\bsrc=["'][^"']*cortiq/i;
// Bot challenges and walls that answer our fetch differently from a visitor.
const CHALLENGE = /cf-chl|challenges\.cloudflare\.com|Just a moment\.\.\.|Attention Required! \| Cloudflare|captcha-delivery\.com|verify you are human/i;

/** https://<host>/ for a sites.domain value ("ekonom.biz", "https://www.x.se/"), or null. */
export function siteUrl(domain: string | null | undefined): string | null {
  const raw = (domain ?? '').trim();
  if (!raw) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return `https://${url.host}/`;
  } catch {
    return null;
  }
}

export function hasSnippet(html: string): boolean {
  return SNIPPET.test(html);
}

/** Judges the final response of a check. */
export function classify(status: number, body: string): UptimeCheck {
  if (CHALLENGE.test(body)) return { problem: 'inconclusive', status, detail: 'Bot challenge', snippetFound: null };
  if (status >= 200 && status < 300) return { problem: null, status, detail: null, snippetFound: hasSnippet(body) };
  // Basic auth (staging) or rate limiting says nothing about whether visitors reach the site.
  if (status === 401 || status === 429) return { problem: 'inconclusive', status, detail: `HTTP ${status}`, snippetFound: null };
  return { problem: 'down', status, detail: `HTTP ${status}`, snippetFound: null };
}

async function readCapped(res: Response): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BODY) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => {});
  const bytes = new Uint8Array(Math.min(size, MAX_BODY));
  let offset = 0;
  for (const c of chunks) {
    const part = c.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
  }
  return new TextDecoder().decode(bytes);
}

/** Fetches the page (redirects hop by hop, SSRF-checked) and classifies it. Never throws. */
export async function checkSite(url: string, opts: { fetchImpl?: typeof fetch; resolve?: Resolver | null } = {}): Promise<UptimeCheck> {
  const doFetch = opts.fetchImpl ?? fetch;
  let current = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    try {
      await assertSafeUrl(current, opts.resolve);
    } catch {
      return { problem: 'inconclusive', status: null, detail: 'Blocked address', snippetFound: null };
    }
    let res: Response;
    try {
      res = await doFetch(current, { redirect: 'manual', headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      const timeout = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
      return { problem: 'down', status: null, detail: timeout ? 'No answer within 15 seconds' : 'No connection', snippetFound: null };
    }
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).toString();
      continue;
    }
    let body = '';
    try { body = await readCapped(res); } catch { /* judged on the status alone */ }
    return classify(res.status, body);
  }
  return { problem: 'down', status: null, detail: 'Redirect loop', snippetFound: null };
}

export const UPTIME_KINDS: Record<UptimeKind, { title: (host: string) => string; check: string }> = {
  down: {
    title: (host) => `${host} is down`,
    check: 'Open the site yourself and check with your host. Hosts suspend a site when they find malware on it — look for an email from them.',
  },
  snippet_missing: {
    title: (host) => `The CortIQ snippet is gone from ${host}`,
    check: 'The home page loads but no longer contains the CortIQ snippet. If nobody changed the site, check for a replaced theme, a restored backup or unauthorised changes.',
  },
};

/** "ekonom.biz is down since 14:35 (HTTP 403)." */
export function uptimeSentence(alert: Pick<UptimeAlert, 'kind' | 'detail' | 'opened_at'>, host: string): string {
  const kind = UPTIME_KINDS[alert.kind as UptimeKind];
  const since = new Date(alert.opened_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Stockholm' });
  return `${kind ? kind.title(host) : alert.kind} since ${since}${alert.detail ? ` (${alert.detail})` : ''}.`;
}

export function hostOf(domain: string): string {
  return domain.replace(/^https?:\/\//i, '').replace(/\/.*$/, '');
}

/** Shown in the dashboard while RESEND_API_KEY is not set: alerts then only appear there. */
export const EMAIL_SETUP_STEPS = [
  'In Resend, create an API key with Sending access, restricted to the cortiq.se domain.',
  'Under Domains in Resend, add cortiq.se and add its DKIM, SPF and MX records at the DNS host (Loopia). Wait until it shows Verified.',
  'Set the Edge Function secrets: supabase secrets set RESEND_API_KEY=re_… ALERT_EMAIL_FROM="CortIQ <alerts@cortiq.se>"',
  'The next uptime check (within 5 minutes) picks the key up and this notice disappears. Pipeline alerts use the same key.',
];
