// HTTP client for a Browserless-compatible /function API — in production the self-hosted
// browser-service/ (Hetzner, Germany). No default endpoint: a missing BROWSERLESS_URL must fail,
// never fall back to a third-party host.
import { buildProbeSource } from './browser-probe.js';
import { assertSafeUrl } from '../safe-url.ts';
import { TRACKING_CHECK_UA_TOKEN } from '../tracking-check-ua.ts';
import type { LinkPage } from './pages.ts';
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
    body: JSON.stringify({ code: buildProbeSource(), context: { url: opts.url, states: opts.states, basicAuth: opts.basicAuth, uaToken: TRACKING_CHECK_UA_TOKEN } }),
    signal: AbortSignal.timeout(100_000),
  });
  if (!res.ok) throw new Error(`Browser service ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const data = body && body.type === 'application/json' && body.data ? body.data : body;
  if (!data || !Array.isArray(data.states)) throw new Error('Browser service returned no observation');
  return data as BrowserProbeResult;
}

// Page discovery for sites that refuse plain requests: open each URL in turn and read its links.
const LINK_PROBE_SOURCE = `export default async function ({ page, context }) {
  if (context.uaToken) await page.setUserAgent(\`\${await page.browser().userAgent()} \${context.uaToken}\`);
  const pages = [];
  for (const url of context.urls) {
    try {
      const res = await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      const status = res ? res.status() : 0;
      const links = status >= 400 ? [] : await page.evaluate(() => Array.from(document.querySelectorAll('a[href]'), (a) => a.href).slice(0, 5000));
      pages.push({ url: page.url(), status, links });
      if (links.length >= context.enough) break;
    } catch (e) {
      pages.push({ url, status: 0, links: [] });
    }
  }
  return { data: { pages }, type: 'application/json' };
}`;

export async function runLinkProbe(opts: {
  endpoint: string; token: string; urls: string[]; enough: number; fetchImpl?: typeof fetch;
}): Promise<LinkPage[]> {
  if (!opts.endpoint || !opts.token) throw new Error('Browser service not configured (BROWSERLESS_URL / BROWSERLESS_API_KEY)');
  for (const url of opts.urls) await assertSafeUrl(url);
  const doFetch = opts.fetchImpl ?? fetch;
  const res = await doFetch(`${opts.endpoint.replace(/\/$/, '')}/function?token=${encodeURIComponent(opts.token)}&timeout=45000`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: LINK_PROBE_SOURCE, context: { urls: opts.urls, enough: opts.enough, uaToken: TRACKING_CHECK_UA_TOKEN } }),
    signal: AbortSignal.timeout(50_000),
  });
  if (!res.ok) throw new Error(`Browser service ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = await res.json();
  const data = body && body.type === 'application/json' && body.data ? body.data : body;
  return Array.isArray(data?.pages) ? data.pages : [];
}
