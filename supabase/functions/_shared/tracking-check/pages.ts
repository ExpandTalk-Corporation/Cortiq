// Page suggestions for a new run: the XML sitemap, else an HTML sitemap, else links on the homepage.
// Sites behind bot protection (Akamai, Cloudflare) answer plain requests with 403; a browser can then read the links.
import { safeGet, type ProbeOptions } from './fetch-probe.ts';

export interface SuggestedPage { path: string; reason: 'home' | 'form' | 'sitemap'; selected: boolean }

// Hint words must start a word, so "lookbook" is not a booking page; "demo" must not run on ("democratisation").
const FORM_HINT = /(^|[/._-])(contact|kontakt|demos?(?![a-z])|get-started|trial|signup|sign-up|register|quote|offert|pricing|price|priser|book|boka|request)/i;
const CANDIDATES = ['/sitemap.xml', '/sitemap_index.xml', '/wp-sitemap.xml'];

export function parseSitemap(xml: string): { pages: string[]; sitemaps: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, '&'));
  return /<sitemapindex/i.test(xml) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] };
}

export type PageSource = 'sitemap' | 'html-sitemap' | 'links';
export interface Discovery {
  urls: string[];
  source: PageSource | null;
  /** Path the pages were read from, e.g. "/sitemap.html". */
  from: string | null;
  /** HTTP status when the sitemap requests were refused (401/403/429/503), else null. */
  blockedStatus: number | null;
  viaBrowser: boolean;
}
export interface LinkPage { url: string; status: number; links: string[] }
/** Opens each URL in a real browser, in order, and returns the links on it; stops once a page has enough. */
export type BrowserLinks = (urls: string[], enough: number) => Promise<LinkPage[]>;

const BLOCKED = new Set([401, 403, 429, 503]);
const HTML_CANDIDATES = ['/sitemap.html', '/sitemap/', '/sitemap'];
const NOT_A_PAGE = /\.(pdf|jpe?g|png|gif|svg|webp|ico|zip|docx?|xlsx?|pptx?|mp[34]|xml|css|js|json|txt)$/i;
/** An HTML sitemap or homepage needs this many same-site links to be worth suggesting from. */
const ENOUGH_LINKS = 5;

export function parseRobotsSitemaps(txt: string): string[] {
  return [...txt.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
}

/** Same-site page links in `hrefs`, resolved against `base`; files and other sites are dropped. */
export function pageLinks(hrefs: string[], base: string): string[] {
  const host = bareHost(new URL(base).hostname);
  const out = new Set<string>();
  for (const href of hrefs) {
    try {
      const u = new URL(href.replace(/&amp;/g, '&'), base);
      if (!/^https?:$/.test(u.protocol) || bareHost(u.hostname) !== host || NOT_A_PAGE.test(u.pathname)) continue;
      out.add(`${u.origin}${u.pathname}`);
    } catch { /* skip malformed links */ }
  }
  return [...out];
}

export function parseLinks(html: string, base: string): string[] {
  return pageLinks([...html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#]+)/gi)].map((m) => m[1]), base);
}

export async function discoverPages(origin: string, opts: ProbeOptions & { browserLinks?: BrowserLinks } = {}): Promise<Discovery> {
  let blockedStatus: number | null = null;
  const get = async (url: string, sitemap = true) => {
    try {
      const res = await safeGet(url, opts);
      if (sitemap && blockedStatus === null && BLOCKED.has(res.status)) blockedStatus = res.status;
      return res.status === 200 ? res : null;
    } catch { return null; }
  };
  const done = (urls: string[], source: PageSource, from: string, viaBrowser = false): Discovery =>
    ({ urls, source, from, blockedStatus, viaBrowser });

  // 1. XML sitemaps: the ones robots.txt names first, then the usual locations.
  const robots = await get(new URL('/robots.txt', origin).toString());
  const named = robots ? parseRobotsSitemaps(robots.body).slice(0, 3) : [];
  const xmlCandidates = [...new Set([...named, ...CANDIDATES.map((c) => new URL(c, origin).toString())])];
  for (const candidate of xmlCandidates) {
    const xml = (await get(candidate))?.body;
    if (!xml || !/<(urlset|sitemapindex)/i.test(xml)) continue;
    const first = parseSitemap(xml);
    const urls = [...first.pages];
    for (const child of first.sitemaps.slice(0, 5)) {
      const childXml = (await get(child))?.body;
      if (childXml) urls.push(...parseSitemap(childXml).pages);
      if (urls.length >= 5000) break;
    }
    if (urls.length) return done(urls.slice(0, 5000), 'sitemap', new URL(candidate).pathname);
  }

  // 2. An HTML sitemap page. A redirect away from it (often to the homepage) does not count.
  for (const candidate of HTML_CANDIDATES) {
    const res = await get(new URL(candidate, origin).toString());
    if (!res || !/sitemap/i.test(new URL(res.finalUrl).pathname)) continue;
    const urls = parseLinks(res.body, res.finalUrl);
    if (urls.length >= ENOUGH_LINKS) return done(urls, 'html-sitemap', candidate);
  }

  // 3. Links on the homepage.
  const home = await get(new URL('/', origin).toString(), false);
  const homeLinks = home ? parseLinks(home.body, home.finalUrl) : [];
  if (homeLinks.length) return done(homeLinks, 'links', '/');

  // 4. Blocked or rendered by JavaScript: read the same pages in a browser.
  if (opts.browserLinks) {
    try {
      const pages = await opts.browserLinks([new URL('/sitemap.html', origin).toString(), new URL('/', origin).toString()], ENOUGH_LINKS);
      for (const page of pages) {
        if (page.status >= 400) continue;
        const path = new URL(page.url).pathname;
        const urls = pageLinks(page.links, page.url);
        if (path === '/' ? urls.length : urls.length >= ENOUGH_LINKS) return done(urls, path === '/' ? 'links' : 'html-sitemap', path, true);
      }
    } catch (e) { console.error('tracking-check page discovery (browser)', e); }
  }
  return { urls: [], source: null, from: null, blockedStatus, viaBrowser: false };
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
  // A directory full of hint matches (a staff list under /contacts/) is one kind of page: suggest two of it as forms.
  const perParent = new Map<string, number>();
  const formLike = (p: string) => {
    if (!FORM_HINT.test(p)) return false;
    // Group by the folder whose name matched (/sv/contacts/ for /sv/contacts/m/name.html), else by the parent folder.
    const segments = p.split('/').filter(Boolean);
    const hit = segments.findIndex((seg) => FORM_HINT.test(`/${seg}`));
    const group = hit >= 0 && hit < segments.length - 1 ? segments.slice(0, hit + 1).join('/') : p.replace(/[^/]+\/?$/, '');
    perParent.set(group, (perParent.get(group) ?? 0) + 1);
    return perParent.get(group)! <= 2;
  };
  const forms = new Set(all.sort(byDepthThenLength).filter(formLike));
  const ordered = [
    ...[...forms].map((path) => ({ path, reason: 'form' as const })),
    ...all.filter((p) => !forms.has(p)).map((path) => ({ path, reason: 'sitemap' as const })),
  ];
  return [{ path: '/', reason: 'home' as const }, ...ordered]
    .slice(0, 200)
    .map((p, i) => ({ ...p, selected: i < limit }));
}
