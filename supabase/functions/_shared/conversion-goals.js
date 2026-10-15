// Conversion goals (sites.conversion_goals, configured in the dashboard's Goals tab).
// Shared by track-event (Deno) and the foundation tests (Node).
//
// Goal shape: { id, name, type: 'form_submission' | 'element_click' | 'phone_click' | 'page_visit',
//               selector, value?, is_primary? }
// page_visit goals are matched on the server against the page URL; the others need the DOM, so
// track-event hands them to the tracker, which reports a hit with the goal id.

const CLIENT_TYPES = new Set(['form_submission', 'element_click', 'phone_click']);

/** @param {unknown} raw @returns {Array<{id:string,name:string,type:string,selector:string,value?:number}>} */
export function normalizeGoals(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string'
    && typeof g.type === 'string' && typeof g.selector === 'string' && g.selector.trim() && g.name.trim());
}

/** Goals the tracker evaluates in the browser: only what it needs, no values or names. */
export function clientGoals(goals) {
  return goals.filter((g) => CLIENT_TYPES.has(g.type))
    .map((g) => ({ id: g.id, type: g.type, selector: g.selector.slice(0, 500) }));
}

/**
 * page_visit goals whose pattern matches the URL. A pattern is a path ("/thank-you") or a full
 * URL; several can be comma-separated. "/thank-you" matches /thank-you, /thank-you/ and
 * /thank-you?x=1 but not /thank-you-old. A trailing "*" matches any continuation.
 * @param {ReturnType<typeof normalizeGoals>} goals @param {string} pageUrl
 */
export function matchPageVisitGoals(goals, pageUrl) {
  let path;
  try { path = new URL(pageUrl).pathname; } catch { return []; }
  const norm = (p) => (p.length > 1 ? p.replace(/\/+$/, '') : p).toLowerCase();
  const here = norm(path);
  return goals.filter((g) => g.type === 'page_visit' && g.selector.split(',').some((raw) => {
    let pattern = raw.trim();
    if (!pattern) return false;
    if (/^https?:\/\//i.test(pattern)) { try { pattern = new URL(pattern).pathname; } catch { return false; } }
    if (!pattern.startsWith('/')) pattern = '/' + pattern;
    if (pattern.endsWith('*')) return here.startsWith(norm(pattern.slice(0, -1)));
    return here === norm(pattern);
  }));
}
