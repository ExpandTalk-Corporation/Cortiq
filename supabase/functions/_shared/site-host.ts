// Host matching shared by public ingest endpoints that authenticate with a site's public key.

/** Hostname as the browser sees it: lowercase, punycode, no www., no port/path/scheme. */
export function normHost(value: string): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`).hostname.toLowerCase();
    return host.replace(/^www\./, '').replace(/\.$/, '') || null;
  } catch { return null; }
}

/** True when host is the site's own host or a subdomain of it. */
export function ownsHost(siteHost: string, host: string): boolean {
  return host === siteHost || host.endsWith('.' + siteHost);
}
