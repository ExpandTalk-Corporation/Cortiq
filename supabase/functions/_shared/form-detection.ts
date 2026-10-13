// Form discovery from HTML, shared by form-detector and Tracking Check.
import type { FormHit } from './tracking-check/types.ts';

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
