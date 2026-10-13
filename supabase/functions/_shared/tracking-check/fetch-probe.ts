// Browser-less checks: follow redirects hop by hop (SSRF-checked), see whether tracking
// parameters survive, and read the Content-Security-Policy header.
import { assertSafeUrl, type Resolver } from '../safe-url.ts';
import { TRACKING_PARAMS, TRACKING_TEST_VALUES, type BasicAuth, type FetchObservation, type RedirectHop } from './types.ts';

export interface ProbeOptions {
  basicAuth?: BasicAuth | null;
  fetchImpl?: typeof fetch;
  resolve?: Resolver | null;
  maxHops?: number;
}

const USER_AGENT = 'Mozilla/5.0 (compatible; CortIQ-TrackingCheck/1.0)';
const MAX_BODY = 2_000_000;
const CHALLENGE = /cf-chl|challenges\.cloudflare\.com|Just a moment\.\.\.|Attention Required! \| Cloudflare|captcha-delivery\.com|verify you are human/i;

export function withTestParams(pageUrl: string): string {
  const u = new URL(pageUrl);
  for (const [k, v] of Object.entries(TRACKING_TEST_VALUES)) u.searchParams.set(k, v);
  return u.toString();
}

export async function safeGet(url: string, opts: ProbeOptions = {}) {
  const doFetch = opts.fetchImpl ?? fetch;
  const origin = new URL(url).origin;
  const authHeader = opts.basicAuth ? 'Basic ' + btoa(`${opts.basicAuth.username}:${opts.basicAuth.password}`) : null;
  const hops: RedirectHop[] = [];
  let current = url;
  for (let i = 0; i <= (opts.maxHops ?? 10); i++) {
    await assertSafeUrl(current, opts.resolve);
    const headers: Record<string, string> = { 'User-Agent': USER_AGENT };
    if (authHeader && new URL(current).origin === origin) headers.Authorization = authHeader;
    const res = await doFetch(current, { redirect: 'manual', headers, signal: AbortSignal.timeout(8000) });
    hops.push({ url: current, status: res.status });
    const location = res.headers.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      await res.body?.cancel();
      current = new URL(location, current).toString();
      continue;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    return { hops, finalUrl: current, status: res.status, headers: res.headers, body: new TextDecoder().decode(bytes.slice(0, MAX_BODY)) };
  }
  throw new Error('Too many redirects');
}

export async function fetchProbe(pageUrl: string, opts: ProbeOptions = {}): Promise<FetchObservation> {
  const requestedUrl = withTestParams(pageUrl);
  try {
    const res = await safeGet(requestedUrl, opts);
    const finalUrl = new URL(res.finalUrl);
    return {
      requestedUrl,
      hops: res.hops,
      finalUrl: res.finalUrl,
      finalStatus: res.status,
      paramsLost: TRACKING_PARAMS.filter((p) => !finalUrl.searchParams.has(p)),
      csp: parseCsp(res.headers.get('content-security-policy')),
      challenge: res.headers.get('cf-mitigated') === 'challenge' || ([403, 429, 503].includes(res.status) && CHALLENGE.test(res.body)),
      error: null,
    };
  } catch (e) {
    return { requestedUrl, hops: [], finalUrl: requestedUrl, finalStatus: 0, paramsLost: [], csp: null, challenge: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function parseCsp(header: string | null): Record<string, string[]> | null {
  if (!header) return null;
  const out: Record<string, string[]> = {};
  for (const part of header.split(';')) {
    const [name, ...sources] = part.trim().split(/\s+/);
    if (name && !(name.toLowerCase() in out)) out[name.toLowerCase()] = sources;
  }
  return out;
}

/** Does the policy allow `host` for `directive`? `host` may itself be a wildcard like "*.example.com". */
export function cspAllows(csp: Record<string, string[]>, directive: string, host: string): boolean {
  const sources = csp[directive] ?? csp['default-src'];
  if (!sources) return true;
  const want = host.toLowerCase();
  return sources.some((raw) => {
    const src = raw.toLowerCase();
    if (src === '*' || src === 'https:' || src === 'http:') return true;
    if (src.startsWith("'")) return false;
    const s = src.replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/:\d+$/, '');
    if (s === want) return true;
    if (s.startsWith('*.') && !want.startsWith('*.')) return want.endsWith(s.slice(1));
    return false;
  });
}
