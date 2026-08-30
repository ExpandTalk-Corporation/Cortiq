export interface RawPayload {
  pagePath: unknown;
  linkKind: unknown;
  linkKey: unknown;
  linkLabel: unknown;
  deviceType: unknown;
}

export interface CleanPayload {
  pagePath: string;
  linkKind: 'link' | 'button';
  linkKey: string;
  linkLabel: string | null;
  deviceType: 'desktop' | 'mobile' | 'tablet';
}

const DEVICES = ['desktop', 'mobile', 'tablet'] as const;

// Remove anything from the first '?' or '#' onward, then trim/truncate.
function stripQueryHash(value: string): string {
  const cut = value.split(/[?#]/)[0];
  return cut.trim().slice(0, 200);
}

export function sanitize(raw: RawPayload): CleanPayload {
  const kind = String(raw.linkKind ?? '');
  if (kind !== 'link' && kind !== 'button') {
    throw new Error(`invalid link_kind: ${kind}`);
  }

  const pagePath = stripQueryHash(String(raw.pagePath ?? ''));
  if (!pagePath) throw new Error('empty pagePath');

  // Anchors carry a URL-shaped key (host+path) — strip query/hash. Buttons carry text.
  const rawKey = String(raw.linkKey ?? '');
  const linkKey = kind === 'link' ? stripQueryHash(rawKey) : rawKey.trim().slice(0, 200);
  if (!linkKey) throw new Error('empty linkKey');

  const label = String(raw.linkLabel ?? '').trim().slice(0, 200);
  const device = String(raw.deviceType ?? '');
  const deviceType = (DEVICES as readonly string[]).includes(device)
    ? (device as CleanPayload['deviceType'])
    : 'desktop';

  return { pagePath, linkKind: kind, linkKey, linkLabel: label || null, deviceType };
}
