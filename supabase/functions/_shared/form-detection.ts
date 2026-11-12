// Form discovery from HTML, shared by form-detector and Tracking Check.
import type { FormHit, HubSpotFormEmbed } from './tracking-check/types.ts';

const GUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export function detectForms(html: string): FormHit[] {
  const hits = new Map<string, FormHit>();
  const add = (hit: FormHit) => { const key = `${hit.provider}:${hit.formId}`; if (!hits.has(key)) hits.set(key, hit); };

  for (const m of html.matchAll(/name=["']hs_context["'][^>]*value=["']([^"']+)["']/gi)) {
    try {
      const ctx = JSON.parse(decodeURIComponent(m[1]));
      if (typeof ctx.formGuid === 'string') add({ provider: 'hubspot', formId: ctx.formGuid.toLowerCase(), method: 'hs_context' });
    } catch { /* not JSON */ }
  }
  for (const m of html.matchAll(new RegExp(`data-form-id=["'](${GUID})["']`, 'gi'))) {
    add({ provider: 'hubspot', formId: m[1].toLowerCase(), method: 'data_form_id' });
  }
  for (const m of html.matchAll(new RegExp(`formId["']?\\s*:\\s*["'](${GUID})["']`, 'gi'))) {
    add({ provider: 'hubspot', formId: m[1].toLowerCase(), method: 'embed_script' });
  }
  for (const m of html.matchAll(/class=["'][^"']*gform_wrapper[^"']*["'][^>]*id=["'][^"']*gform_wrapper_(\d+)/gi)) {
    add({ provider: 'gravity_forms', formId: m[1], method: 'gravity_class' });
  }
  return [...hits.values()];
}

/**
 * How HubSpot forms are embedded in the rendered page. `legacy`: hbspt.forms.create (embed/v2.js);
 * `v4`: the new forms embed (<div class="hs-form-frame">); `framed`: the form renders in an iframe,
 * so tags on the page (GA4 Enhanced measurement, Google Ads user-provided data) cannot see it.
 */
export function detectHubSpotFormEmbed(html: string): HubSpotFormEmbed | null {
  const legacy = /hbspt\.forms\.create|hsforms\.net\/forms\/(embed\/)?v2(-legacy)?\.js|class=["'][^"']*\bhbspt-form\b/i.test(html);
  const v4 = /class=["'][^"']*\bhs-form-frame\b/i.test(html);
  const framed = v4
    || /<iframe[^>]*(class|id)=["'][^"']*\bhs-form-iframe/i.test(html)
    || /<iframe[^>]*src=["'][^"']*(hsforms\.(com|net)|forms(-eu1)?\.hubspot\.com)/i.test(html);
  return legacy || v4 || framed ? { legacy, v4, framed } : null;
}
