// CortIQ geo edge (spec 2026-11-18 phase 2). Sits in front of the public ingest Edge Functions,
// signs the visitor's Cloudflare country (+ US/CA region) and IP, and proxies the request.
// Supabase Edge does not forward CF-IPCountry and sees this Worker's IP, so the signed header is
// the only way geo and the client IP reach the functions. The IP is never stored raw there.
import { GEO_HEADER, signGeo } from '../../../supabase/functions/_shared/geo-token.js';

export const ALLOWED_FUNCTIONS = new Set([
  'track-event', 'visitor-identification', 'record-conversion', 'link-click-counter', 'ecommerce-tracking',
  'ai-search-tracker', 'ai-bot-tracker', 'canary-tracker', 'store-consent', 'aggregate-hit', 'geo-check',
]);

const proxyError = () => new Response('Upstream unavailable', {
  status: 502,
  headers: {
    'access-control-allow-origin': '*',
    'access-control-expose-headers': 'x-cortiq-geo-proxy',
    'x-cortiq-geo-proxy': 'error',
    'cache-control': 'no-store',
  },
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/+/, '');
    const fn = path.split('/')[0];
    if (!ALLOWED_FUNCTIONS.has(fn) || path.includes('..')) return new Response('Not found', { status: 404 });

    const headers = new Headers(request.headers);
    headers.delete(GEO_HEADER);
    const cf = request.cf || {};
    const token = await signGeo(
      { country: cf.country ?? null, region: cf.regionCode ?? null, ip: request.headers.get('cf-connecting-ip') },
      env.GEO_SIGNING_KEY, Math.floor(Date.now() / 1000));
    if (token) headers.set(GEO_HEADER, token);

    const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
    try {
      return await fetch(new Request(`${env.SUPABASE_URL}/functions/v1/${path}${url.search}`, {
        method: request.method, headers, body: hasBody ? request.body : undefined, redirect: 'manual',
        ...(hasBody ? { duplex: 'half' } : {}),
      }));
    } catch {
      return proxyError();
    }
  },
};
