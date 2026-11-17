// CSP violation report parsing (csp-report). Plain JS so Deno and the Node foundation tests share
// one implementation. Browsers send two formats: the legacy report-uri body
// ({ "csp-report": { "document-uri": … } }, application/csp-report) and the Reporting API
// (application/reports+json: [{ type: "csp-violation", url, body: { documentURL, … } }]).
// Only the page path, the directive and where the blocked thing came from are kept: no query
// strings, no script samples (they can contain page data), no IP or User-Agent.
import { cleanPath } from './aggregate.js';

export const MAX_REPORTS = 20;
export const REPORT_HOSTS = ['cortiq.se', 'www.cortiq.se'];

// Values browsers use instead of a URL for blocked-uri / blockedURL.
const KEYWORDS = new Set(['inline', 'eval', 'wasm-eval', 'self', 'data', 'blob', 'trusted-types-policy', 'trusted-types-sink']);

/** URL → origin + path (no query, no fragment), keyword → keyword, anything else → ''. */
export function cleanSource(value) {
  if (typeof value !== 'string' || !value) return '';
  if (KEYWORDS.has(value)) return value;
  let url;
  try { url = new URL(value); } catch { return ''; }
  // Other schemes (data:, blob:, chrome-extension: …) are kept as the scheme only.
  if (!['https:', 'http:', 'wss:'].includes(url.protocol)) return url.protocol.slice(0, -1).slice(0, 40);
  return (url.origin + url.pathname).slice(0, 300);
}

/** One raw report (either format) → a row for ingest_csp_report, or null when it is not ours. */
export function normalizeReport(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const legacy = raw['csp-report'];
  const r = legacy && typeof legacy === 'object' ? legacy : raw.type === 'csp-violation' ? raw.body : null;
  if (!r || typeof r !== 'object') return null;
  const pick = (...keys) => keys.map((k) => r[k]).find((v) => typeof v === 'string' && v) ?? '';

  let doc;
  try { doc = new URL(pick('documentURL', 'document-uri') || String(raw.url ?? '')); } catch { return null; }
  if (doc.protocol !== 'https:' || !REPORT_HOSTS.includes(doc.hostname.toLowerCase())) return null;

  const directive = pick('effectiveDirective', 'effective-directive', 'violated-directive').split(' ')[0].slice(0, 40);
  if (!/^[a-z-]+$/.test(directive)) return null;
  const disposition = pick('disposition') === 'report' ? 'report' : 'enforce';
  return {
    document_path: cleanPath(doc),
    directive,
    blocked: cleanSource(pick('blockedURL', 'blocked-uri')),
    source: cleanSource(pick('sourceFile', 'source-file')),
    disposition,
  };
}

/** Request body text → normalized rows, deduplicated, at most MAX_REPORTS. */
export function parseCspReports(text) {
  let data;
  try { data = JSON.parse(text); } catch { return []; }
  const list = Array.isArray(data) ? data : [data];
  const seen = new Set();
  const out = [];
  for (const raw of list.slice(0, MAX_REPORTS)) {
    const row = normalizeReport(raw);
    if (!row) continue;
    const key = JSON.stringify(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}
