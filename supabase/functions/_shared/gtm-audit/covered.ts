/** Tags whose job CortIQ already does. Facts about what exists today — never promises. */
import type { TagInfo } from './types.ts';

const UTM_RE = /utm_|gclid/i;
const STORE_RE = /localStorage|sessionStorage|document\.cookie/i;
const HUBSPOT_RE = /hsFormCallback|onFormSubmitted|hs-form-event|onFormReady/;

const UTM = 'UTM and click ID persistence: CortIQ captures UTM parameters and click IDs (click IDs only with marketing consent).';

export function coveredReason(info: TagInfo): string | null {
  if (info.ident.covers === 'utm') return UTM;
  const html = info.tag.type === 'html' && typeof info.tag.params.html === 'string' ? info.tag.params.html : '';
  if (html && UTM_RE.test(html) && STORE_RE.test(html)) return UTM;
  if (info.vendor?.id === 'clarity' || info.vendor?.id === 'hotjar') return 'Session replay and heatmaps: CortIQ includes both.';
  if (html && HUBSPOT_RE.test(html)) return 'HubSpot form listener: CortIQ detects HubSpot forms and can count submissions as goals.';
  return null;
}
