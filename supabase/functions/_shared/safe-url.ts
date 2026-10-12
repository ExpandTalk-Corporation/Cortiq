// SSRF guard for server-side fetches: blocks non-http(s) schemes and hosts that are, or
// resolve to, private / loopback / link-local / carrier-grade NAT / metadata addresses.
export type Resolver = (host: string, type: 'A' | 'AAAA') => Promise<string[]>;

const PRIVATE_V4 = /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/;
const PRIVATE_172 = /^172\.(1[6-9]|2\d|3[01])\./;
const CGNAT = /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./;
const PRIVATE_V6 = /^(::1?$|fe80:|fc|fd|::ffff:)/i;

export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal') || h.endsWith('.local')) return true;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return PRIVATE_V4.test(h) || PRIVATE_172.test(h) || CGNAT.test(h);
  // Only IPv6 literals contain ':' — prevents names like "fcbarcelona.com" matching the fc/fd prefixes.
  return h.includes(':') && PRIVATE_V6.test(h);
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
const denoResolver: Resolver | null = typeof deno?.resolveDns === 'function'
  ? (host, type) => deno.resolveDns(host, type)
  : null;

export async function assertSafeUrl(raw: string, resolve: Resolver | null = denoResolver): Promise<URL> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error('Invalid URL'); }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('Only http(s) URLs allowed');
  if (isPrivateAddress(url.hostname)) throw new Error('Blocked host');
  if (resolve) {
    let ips: string[] = [];
    for (const type of ['A', 'AAAA'] as const) {
      try { ips = ips.concat(await resolve(url.hostname, type)); } catch { /* no records or resolver unavailable */ }
    }
    if (ips.some(isPrivateAddress)) throw new Error('Blocked host (resolved to private IP)');
  }
  return url;
}
