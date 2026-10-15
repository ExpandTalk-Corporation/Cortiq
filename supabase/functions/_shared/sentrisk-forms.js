// Detects SentriSK forms (formerly "Traffikboost") in page HTML. SentriSK forms render as a
// cross-origin iframe to sentrisk.se/embed/<uuid>; the WordPress shortcode is gone after
// rendering, so the iframe and the SDK/adapter markers are what identify them. Plain JS so the
// Deno edge function and the Node foundation tests share it.

const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';

const PATTERNS = [
  // WordPress plugin / pasted embed / SDK-injected iframe.
  { method: 'iframe_src', re: new RegExp(`https?://(?:www\\.)?sentrisk\\.se/(?:embed|form)/(${UUID})`, 'g') },
  // sentrisk-embed.js declarative embed and the site adapter's rendered output.
  { method: 'data_attribute', re: new RegExp(`data-sentrisk-form=["'](${UUID})["']`, 'g') },
  // Site adapter content marker.
  { method: 'adapter_marker', re: new RegExp(`<!--\\s*sentrisk:form\\s+id=["'](${UUID})["']\\s*-->`, 'g') },
  // Unrendered shortcode (plugin inactive or escaped by a page builder); both names are live.
  { method: 'shortcode', re: new RegExp(`\\[(?:sentrisk|traffikboost)_form\\b[^\\]]*?\\bid=["']?(${UUID})`, 'g') },
];

/**
 * @param {string} html
 * @returns {{ formId: string, method: string }[]} one entry per distinct form; formId is the
 *   SentriSK form UUID (lower case), or `slot:<name>` / `type:<name>` when no UUID is present.
 */
export function detectSentriskForms(html) {
  const found = new Map();
  const add = (formId, method) => { if (!found.has(formId)) found.set(formId, { formId, method }); };

  for (const { method, re } of PATTERNS) {
    for (const m of html.matchAll(re)) add(m[1].toLowerCase(), method);
  }
  // Slot embeds resolve their form server-side: identify them by slot name.
  for (const m of html.matchAll(/data-sentrisk-slot=["']([^"']{1,64})["']/g)) add(`slot:${m[1]}`, 'slot');
  // Legacy type-only shortcode: [traffikboost_form type="contact"] without an id.
  for (const m of html.matchAll(/\[(?:sentrisk|traffikboost)_form\b([^\]]*)\]/g)) {
    if (new RegExp(`\\bid=["']?${UUID}`).test(m[1])) continue;
    const type = m[1].match(/\btype=["']?([\w-]{1,32})/);
    if (type) add(`type:${type[1]}`, 'shortcode');
  }
  return [...found.values()];
}
