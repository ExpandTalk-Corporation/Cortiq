// HTTP client for a Browserless-compatible /function API — in production the self-hosted
// browser-service/ (Hetzner, Germany). No default endpoint: a missing BROWSERLESS_URL must fail,
// never fall back to a third-party host.
import { buildProbeSource } from './browser-probe.js';
import { assertSafeUrl } from '../safe-url.ts';
import type { BasicAuth, BrowserObservation, ConsentState } from './types.ts';

export type BrowserProbeResult = Omit<BrowserObservation, 'forms'> & { html: string };

export async function runBrowserProbe(opts: {
  endpoint: string; token: string; url: string; states: ConsentState[]; basicAuth: BasicAuth | null; fetchImpl?: typeof fetch;
}): Promise<BrowserProbeResult> {
  if (!opts.endpoint || !opts.token) throw new Error('Browser service not configured (BROWSERLESS_URL / BROWSERLESS_API_KEY)');
  await assertSafeUrl(opts.url);
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.endpoint.replace(/\/$/, '')}/function?token=${encodeURIComponent(opts.token)}&timeout=90000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: buildProbeSource(), context: { url: opts.url, states: opts.states, basicAuth: opts.basicAuth } }),
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) throw new Error(`Browser service ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const data = body && body.type === 'application/json' && body.data ? body.data : body;
  if (!data || !Array.isArray(data.states)) throw new Error('Browser service returned no observation');
  return data as BrowserProbeResult;
}
