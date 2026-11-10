/**
 * Shared Google Ads API client (ported from SentriSK `_shared/google-ads.ts`).
 *
 * One place for the API version, OAuth refresh, request headers, response parsing and error
 * messages. Every edge function that talks to googleads.googleapis.com goes through here, so a
 * version bump is a one-line change.
 *
 * Versions are sunset roughly 12 months after release:
 * https://developers.google.com/google-ads/api/docs/sunset-dates
 * v26 was released 2026-10-14 and is sunset in November 2027.
 *
 * Credentials: the developer token and OAuth client are app-level secrets
 * (GOOGLE_ADS_DEVELOPER_TOKEN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET). The per-site refresh token
 * is sealed with GOOGLE_ADS_TOKEN_KEY in `google_ads_tokens`, which only the service role can read.
 */
// deno-lint-ignore-file no-explicit-any
import { openToken } from './google-ads-oauth.ts';

export const GOOGLE_ADS_API_VERSION = 'v26';
export const GOOGLE_ADS_BASE = `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}`;
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export interface AdsAuth {
  accessToken: string;
  developerToken: string;
  /** Account the request is about. Dashes are stripped. */
  customerId: string;
  /** Manager (MCC) account the OAuth user signs in through, when access goes via one. */
  loginCustomerId?: string | null;
  /** Account currency (ISO 4217), when known. */
  currencyCode?: string | null;
  /** Account time zone (IANA), when known. Google Ads report dates are in this zone. */
  timeZone?: string | null;
  /** Conversion action (UPLOAD_CLICKS) picked for lead-quality uploads, numeric id. */
  conversionActionId?: string | null;
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  return await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
}

/** "123-456-7890" → "1234567890". Returns '' for empty input. */
export function cleanCustomerId(id: string | null | undefined): string {
  return (id ?? '').replace(/[^0-9]/g, '');
}

export function developerTokenFromEnv(): string {
  return Deno.env.get('GOOGLE_ADS_DEVELOPER_TOKEN') ?? Deno.env.get('GOOGLE_ADS_DEV_TOKEN') ?? '';
}

/** Exchange a refresh token for a fresh access token. Client id/secret default to the app's OAuth client. */
export async function refreshAccessToken(
  refreshToken: string,
  clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '',
  clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '',
): Promise<string> {
  const resp = await fetchWithTimeout(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }),
  }, 20_000);
  if (!resp.ok) {
    // Never echo the response body: it can contain token material in edge cases.
    throw new Error(`Token refresh failed (${resp.status}). Reconnect Google Ads in Settings → Integrations.`);
  }
  return (await resp.json()).access_token as string;
}

export function adsHeaders(auth: Pick<AdsAuth, 'accessToken' | 'developerToken' | 'loginCustomerId'>): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${auth.accessToken}`,
    'developer-token': auth.developerToken,
    'Content-Type': 'application/json',
  };
  const login = cleanCustomerId(auth.loginCustomerId);
  if (login) headers['login-customer-id'] = login;
  return headers;
}

/**
 * Pull a readable message out of a Google Ads error body. searchStream wraps errors
 * in an array, the other endpoints return a bare object.
 */
export function parseAdsError(status: number, body: string): string {
  let detail = body.slice(0, 300);
  try {
    const parsed = JSON.parse(body);
    const err = Array.isArray(parsed) ? parsed[0]?.error : parsed?.error;
    const first = err?.details?.find((d: any) => Array.isArray(d?.errors))?.errors?.[0];
    detail = first?.message ?? err?.message ?? detail;
    const code = first?.errorCode ? Object.values(first.errorCode)[0] : null;
    if (code && typeof code === 'string') detail = `${code}: ${detail}`;
  } catch {
    // not JSON, keep the raw slice
  }
  return `Google Ads API error (${status}): ${detail}`;
}

/**
 * searchStream returns a JSON array of response chunks, each with `results`.
 * The body is usually pretty-printed across many lines, so it must be parsed whole.
 */
export function parseSearchStream(text: string): any[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const chunks = Array.isArray(parsed) ? parsed : [parsed];
  const rows: any[] = [];
  for (const chunk of chunks) {
    if (Array.isArray(chunk?.results)) rows.push(...chunk.results);
  }
  return rows;
}

/** A non-2xx answer from the Google Ads API; `status` is Google's HTTP status. */
export class AdsApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'AdsApiError';
  }
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 10_000;

/**
 * Should a failed call be sent again? 429 (RESOURCE_EXHAUSTED) means Google did not run the
 * request, so every call may retry it. 500/502/503/504 and network errors may have been applied
 * already, so only idempotent calls (reports) retry them; an upload is never sent twice.
 */
export function isRetryable(status: number | null, idempotent: boolean): boolean {
  if (status === 429) return true;
  if (!idempotent) return false;
  return status === null || status === 500 || status === 502 || status === 503 || status === 504;
}

/** Exponential backoff with full jitter; a Retry-After header (seconds) wins when present. */
export function retryDelayMs(attempt: number, retryAfter: string | null, random = Math.random): number {
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(seconds * 1_000, MAX_DELAY_MS);
  return Math.round(random() * Math.min(BASE_DELAY_MS * 2 ** attempt, MAX_DELAY_MS));
}

async function request(
  method: 'GET' | 'POST',
  url: string,
  auth: Pick<AdsAuth, 'accessToken' | 'developerToken' | 'loginCustomerId'>,
  body: unknown,
  timeoutMs: number,
  idempotent: boolean,
): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    let resp: Response;
    try {
      resp = await fetchWithTimeout(url, {
        method,
        headers: adsHeaders(auth),
        body: method === 'POST' ? JSON.stringify(body) : undefined,
      }, timeoutMs);
    } catch (e) {
      if (attempt + 1 < MAX_ATTEMPTS && isRetryable(null, idempotent)) {
        await new Promise((r) => setTimeout(r, retryDelayMs(attempt, null)));
        continue;
      }
      throw e;
    }
    const text = await resp.text();
    if (resp.ok) return text;
    if (attempt + 1 < MAX_ATTEMPTS && isRetryable(resp.status, idempotent)) {
      await new Promise((r) => setTimeout(r, retryDelayMs(attempt, resp.headers.get('retry-after'))));
      continue;
    }
    throw new AdsApiError(resp.status, parseAdsError(resp.status, text));
  }
}

/** Run a GAQL query and return every row. Reports are idempotent, so transient errors are retried. */
export async function searchStream(auth: AdsAuth, query: string, timeoutMs = 45_000): Promise<any[]> {
  const url = `${GOOGLE_ADS_BASE}/customers/${cleanCustomerId(auth.customerId)}/googleAds:searchStream`;
  return parseSearchStream(await request('POST', url, auth, { query: query.trim() }, timeoutMs, true));
}

/**
 * CustomerService.ListAccessibleCustomers: the accounts the OAuth user can reach directly.
 * No customer id or login-customer-id is involved. Returns plain numeric ids.
 */
export async function listAccessibleCustomers(
  auth: Pick<AdsAuth, 'accessToken' | 'developerToken'>,
  timeoutMs = 20_000,
): Promise<string[]> {
  const text = await request('GET', `${GOOGLE_ADS_BASE}/customers:listAccessibleCustomers`,
    { ...auth, loginCustomerId: null }, null, timeoutMs, true);
  const names: unknown = JSON.parse(text || '{}')?.resourceNames;
  if (!Array.isArray(names)) return [];
  return names.map((n) => cleanCustomerId(String(n).split('/').pop())).filter(Boolean);
}

/**
 * ConversionUploadService.UploadClickConversions with partial failure on. Never retried on 5xx
 * (each conversion carries an orderId, so Google would also drop a duplicate).
 */
export async function uploadClickConversions(
  auth: AdsAuth,
  conversions: object[],
  timeoutMs = 20_000,
): Promise<any> {
  const url = `${GOOGLE_ADS_BASE}/customers/${cleanCustomerId(auth.customerId)}:uploadClickConversions`;
  return JSON.parse(await request('POST', url, auth, { conversions, partialFailure: true }, timeoutMs, false) || '{}');
}

/** GAQL id filter values must be plain numbers; anything else is refused (no query injection). */
export function numericId(v: unknown, name: string): string {
  const s = String(v ?? '').split('/').pop()!.trim();
  if (!/^\d{1,20}$/.test(s)) throw new Error(`${name} must be a numeric id`);
  return s;
}

/** GAQL date literals must be YYYY-MM-DD; anything else is refused. */
export function gaqlDate(v: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error('date must be YYYY-MM-DD');
  return v;
}

/** Google wants "yyyy-mm-dd hh:mm:ss+00:00". Accepts an ISO string and drops milliseconds. */
export function toAdsDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${iso}`);
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '+00:00');
}

/** Google Ads money fields are micros (1/1,000,000 of the account currency). */
export function fromMicros(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n / 1_000_000 : 0;
}

export type AdsAuthResult = AdsAuth | { error: string; status: number; code: 'not_configured' | 'not_connected' | 'no_customer' | 'token' };

/**
 * Load a site's Google Ads connection with the service role: customer and manager ids from
 * `google_ads_connections`, sealed refresh token from `google_ads_tokens`, then a fresh access token.
 * Returns an error object the caller can show instead of throwing.
 */
export async function loadSiteAdsAuth(svc: any, siteId: string): Promise<AdsAuthResult> {
  const developerToken = developerTokenFromEnv();
  if (!developerToken) {
    return { error: 'Google Ads is not configured on this CortIQ instance (GOOGLE_ADS_DEVELOPER_TOKEN missing).', status: 503, code: 'not_configured' };
  }

  const { data: conn } = await svc
    .from('google_ads_connections')
    .select('customer_id, login_customer_id, currency_code, time_zone, conversion_action_id, status')
    .eq('site_id', siteId)
    .maybeSingle();
  if (!conn) return { error: 'Google Ads is not connected. Connect it in Settings → Integrations.', status: 400, code: 'not_connected' };

  const customerId = cleanCustomerId(conn.customer_id);
  if (!customerId) {
    return { error: 'Pick a Google Ads account in Settings → Integrations.', status: 400, code: 'no_customer' };
  }

  const { data: tok } = await svc
    .from('google_ads_tokens')
    .select('refresh_token_sealed')
    .eq('site_id', siteId)
    .maybeSingle();
  if (!tok?.refresh_token_sealed) {
    return { error: 'Google Ads credentials are missing. Reconnect in Settings → Integrations.', status: 400, code: 'token' };
  }

  let refreshToken: string;
  try {
    refreshToken = await openToken(tok.refresh_token_sealed);
  } catch {
    return { error: 'Google Ads credentials could not be read. Reconnect in Settings → Integrations.', status: 500, code: 'token' };
  }

  const accessToken = await refreshAccessToken(refreshToken);
  return {
    accessToken,
    developerToken,
    customerId,
    loginCustomerId: cleanCustomerId(conn.login_customer_id) || null,
    currencyCode: conn.currency_code ?? null,
    timeZone: conn.time_zone ?? null,
    conversionActionId: conn.conversion_action_id ?? null,
  };
}

export function isAdsAuth(x: AdsAuthResult): x is AdsAuth {
  return (x as AdsAuth).accessToken !== undefined;
}
