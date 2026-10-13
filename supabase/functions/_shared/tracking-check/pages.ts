// Page suggestions for a new run, from the site's sitemap.
import { safeGet, type ProbeOptions } from './fetch-probe.ts';

export interface SuggestedPage { path: string; reason: 'home' | 'form' | 'sitemap'; selected: boolean }

const FORM_HINT = /(contact|kontakt|demo|get-started|trial|signup|sign-up|register|quote|offert|pricing|price|priser|book|boka|request)/i;
const CANDIDATES = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];

export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

export async function fetchSitemapUrls(origin: string, opts: ProbeOptions = {}): Promise<string[]> {
  const get = async (url: string) => {
    try {
      const res = await safeGet(url, opts);
      return res.status === 200 ? res.body : null;
    } catch { return null; }
  };
  for (const candidate of CANDIDATES) {
    const xml = await get(new URL(candidate, origin).toString());
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    const first = parseSitemap(xml);
    const urls = [...first.pages];
    for (const child of first.sitemaps.slice(0, 5)) {
      const childXml = await get(child);
      if (childXml) urls.push(...parseSitemap(childXml).pages);
      if (urls.length >= 5000) break;
    }
    return urls.slice(0, 5000);
  }
  return [];
}

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, '');
const depth = (p: string) => p.split('/').filter(Boolean).length;
const byDepthThenLength = (a: string, b: string) => depth(a) - depth(b) || a.length - b.length || a.localeCompare(b);

export function suggestPages(urls: string[], origin: string, limit = 12): SuggestedPage[] {
  const host = bareHost(new URL(origin).hostname);
  const paths = new Set<string>();
  for (const raw of urls) {
    try {
      const u = new URL(raw);
      if (bareHost(u.hostname) === host && u.pathname !== '/') paths.add(u.pathname);
    } catch { /* skip malformed entries */ }
  }
  const all = [...paths];
  const ordered = [
    ...all.filter((p) => FORM_HINT.test(p)).sort(byDepthThenLength).map((path) => ({ path, reason: 'form' as const })),
    ...all.filter((p) => !FORM_HINT.test(p)).sort(byDepthThenLength).map((path) => ({ path, reason: 'sitemap' as const })),
  ];
  return [{ path: '/', reason: 'home' as const }, ...ordered]
    .slice(0, 200)
    .map((p, i) => ({ ...p, selected: i < limit }));
}
