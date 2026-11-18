// One place that decides a request's country (spec 2026-11-18 phase 2 AC1). Ingest functions call
// resolveGeo instead of reading cf-ipcountry / x-forwarded-for themselves. The key is passed in
// (Deno.env.get('GEO_SIGNING_KEY') at the call site) so Node tests can import this file.
import { GEO_HEADER, verifyGeo } from './geo-token.js';
import { countryFromTimeZone } from './tz-country.js';
import { clientIp } from './aggregate.js';

export type GeoSource = 'ip' | 'timezone' | 'unknown';
export type Geo = { country: string | null; region: string | null; source: GeoSource; ip: string | null };

export async function resolveGeo(
  req: Request,
  opts: { key?: string | null; timeZone?: unknown; now?: number },
): Promise<Geo> {
  const header = req.headers.get(GEO_HEADER);
  const token = header && opts.key ? await verifyGeo(header, opts.key, Math.floor((opts.now ?? Date.now()) / 1000)) : null;
  if (token?.c) return { country: token.c, region: token.r, source: 'ip', ip: token.ip };
  const tz = countryFromTimeZone(typeof opts.timeZone === 'string' ? opts.timeZone.slice(0, 64) : null);
  // A request that carried a geo header came through a proxy: its forwarding headers name the
  // proxy, not the visitor, so they are no use as a rate-limit key or hash input.
  const ip = token ? token.ip : header ? null : (clientIp(req.headers) || null);
  return { country: tz, region: null, source: tz ? 'timezone' : 'unknown', ip };
}

export const geoKey = (): string | null => Deno.env.get('GEO_SIGNING_KEY') ?? null;
