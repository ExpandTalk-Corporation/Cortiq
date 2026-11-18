// Country and GPC for the consent ledger (spec 2026-11-18 phase 1 AC5/AC6).
// Phase 1 uses the browser time zone; phase 2 replaces this with signed edge geo (source 'ip').
import { countryFromTimeZone } from './tz-country.js';

export type ConsentGeo = { geo_country: string | null; geo_source: 'timezone' | 'unknown' };

export function consentGeo(timeZone: unknown): ConsentGeo {
  const country = typeof timeZone === 'string' ? countryFromTimeZone(timeZone.slice(0, 64)) : null;
  return country ? { geo_country: country, geo_source: 'timezone' } : { geo_country: null, geo_source: 'unknown' };
}

/** Global Privacy Control: the banner's flag or the browser's Sec-GPC request header. */
export function gpcRequested(body: { gpc_signal?: unknown }, headers: Headers): boolean {
  return body.gpc_signal === true || headers.get('sec-gpc')?.trim() === '1';
}
