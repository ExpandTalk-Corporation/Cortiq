// supabase/functions/_shared/ip.ts
/** Anonymize an IPv4 or IPv6 address by zeroing the host portion. */
export function anonymizeIP(ip: string | null): string | null {
  if (!ip) return null;
  const first = ip.split(',')[0].trim();
  if (first.includes(':')) {
    // IPv6 — keep first 3 groups
    const parts = first.split(':');
    return parts.slice(0, 3).concat(['0', '0', '0', '0', '0']).join(':');
  }
  const octets = first.split('.');
  if (octets.length === 4) return `${octets[0]}.${octets[1]}.${octets[2]}.0`;
  return null;
}
