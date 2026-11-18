// Country/region and GPC for the consent ledger (spec 2026-11-18 phase 1 AC5/AC6, phase 2 AC1).
// Phase 2: geo comes from resolveGeo (signed edge IP country, else the browser time zone).
import type { Geo } from './geo.ts';

export type ConsentGeo = { geo_country: string | null; geo_region: string | null; geo_source: Geo['source'] };

/** Consent ledger geo from the resolved request geo (signed edge IP country, else time zone). */
export function consentGeo(geo: Geo): ConsentGeo {
  return { geo_country: geo.country, geo_region: geo.region, geo_source: geo.source };
}

/** Global Privacy Control: the banner's flag or the browser's Sec-GPC request header. */
export function gpcRequested(body: { gpc_signal?: unknown }, headers: Headers): boolean {
  return body.gpc_signal === true || headers.get('sec-gpc')?.trim() === '1';
}
