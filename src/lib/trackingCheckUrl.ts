/** The address typed on the landing page (?url=), reduced to its origin; anything else is ignored. */
export function siteFromQuery(search: string): string | undefined {
  const raw = new URLSearchParams(search).get('url')?.trim();
  // Another scheme (ftp:, javascript:) is not a website; a bare domain gets https://.
  if (!raw || (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(raw) && !/^https?:\/\//i.test(raw))) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.includes('.') ? url.origin : undefined;
  } catch {
    return undefined;
  }
}
