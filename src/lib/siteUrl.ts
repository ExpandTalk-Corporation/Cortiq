// A site's stored domain ("cortiq.se", "https://www.ekonom.biz") as a URL and a bare host.
// No '@/' imports so the foundation tests can import it directly.

/** "https://www.Example.se/x" → "example.se" (no scheme, path or leading www). */
export function bareHost(urlOrDomain: string): string {
  return urlOrDomain.trim().replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').replace(/^www\./i, '').toLowerCase();
}

/** The site's home page as an https URL, or '' when the site has no domain. */
export function siteHomeUrl(domain: string | null | undefined): string {
  const host = domain ? domain.trim().replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '') : '';
  return host ? `https://${host}/` : '';
}

/** True when the URL is on the site's own domain or one of its subdomains. */
export function isOnSite(url: string, domain: string | null | undefined): boolean {
  if (!domain) return false;
  const site = bareHost(domain);
  const host = bareHost(url);
  return host === site || host.endsWith(`.${site}`);
}
