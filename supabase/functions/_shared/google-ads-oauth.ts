// Crypto helpers for the per-site Google Ads OAuth connection.
//
// - Refresh tokens are sealed with AES-256-GCM under GOOGLE_ADS_TOKEN_KEY (32 bytes, base64)
//   before they are written to `google_ads_tokens`. That table is service-role only, so the
//   browser can never read a token, and a database dump alone does not reveal one.
// - The OAuth `state` is an HMAC-signed, short-lived payload (site, user, nonce, expiry). The
//   callback refuses a state that was tampered with, has expired, or belongs to another user, so
//   a code obtained by one account can never be attached to a site the caller does not own.
//
// No imports and no Deno-only APIs at module level, so foundation tests can import this file
// directly in Node.

const SEAL_PREFIX = 'v1:';
const SEAL_AAD = new TextEncoder().encode('cortiq-google-ads-refresh-token-v1');
const STATE_INFO = 'cortiq-google-ads-oauth-state-v1';
export const STATE_TTL_SECONDS = 10 * 60;

const toB64 = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
};
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64Url = (bytes: Uint8Array) => toB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64Url = (s: string) => {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  return fromB64(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
};

export function tokenKeyFromEnv(): string {
  // deno-lint-ignore no-explicit-any
  const env = (globalThis as any).Deno?.env;
  return env?.get('GOOGLE_ADS_TOKEN_KEY') ?? '';
}

function rawKey(keyB64: string): Uint8Array<ArrayBuffer> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = fromB64(keyB64);
  } catch {
    raw = new Uint8Array(0);
  }
  if (raw.length !== 32) throw new Error('GOOGLE_ADS_TOKEN_KEY must be 32 bytes, base64-encoded');
  return raw;
}

export async function sealToken(plain: string, keyB64: string = tokenKeyFromEnv()): Promise<string> {
  if (!plain) throw new Error('nothing to seal');
  const key = await crypto.subtle.importKey('raw', rawKey(keyB64), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: SEAL_AAD }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return SEAL_PREFIX + toB64(out);
}

export async function openToken(sealed: string, keyB64: string = tokenKeyFromEnv()): Promise<string> {
  if (typeof sealed !== 'string' || !sealed.startsWith(SEAL_PREFIX)) throw new Error('unknown token format');
  const key = await crypto.subtle.importKey('raw', rawKey(keyB64), 'AES-GCM', false, ['decrypt']);
  const buf = fromB64(sealed.slice(SEAL_PREFIX.length));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: buf.slice(0, 12), additionalData: SEAL_AAD }, key, buf.slice(12));
  return new TextDecoder().decode(pt);
}

// The state key is derived from the token key (HMAC with a fixed label), so one secret serves
// both purposes without the same key bytes ever being used for two algorithms.
async function stateKey(keyB64: string): Promise<CryptoKey> {
  const master = await crypto.subtle.importKey('raw', rawKey(keyB64), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const derived = new Uint8Array(await crypto.subtle.sign('HMAC', master, new TextEncoder().encode(STATE_INFO)));
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export interface OAuthState {
  siteId: string;
  userId: string;
  nonce: string;
  /** Unix seconds. */
  exp: number;
}

export async function signState(
  input: { siteId: string; userId: string },
  keyB64: string = tokenKeyFromEnv(),
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload = {
    s: input.siteId,
    u: input.userId,
    n: toB64Url(crypto.getRandomValues(new Uint8Array(16))),
    e: nowSeconds + STATE_TTL_SECONDS,
  };
  const body = toB64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await stateKey(keyB64), new TextEncoder().encode(body)));
  return `${body}.${toB64Url(sig)}`;
}

export type StateCheck = { ok: true; state: OAuthState } | { ok: false; reason: 'malformed' | 'signature' | 'expired' | 'user' };

/** Verify signature and expiry, and that the state was issued to `userId`. Never throws on bad input. */
export async function verifyState(
  state: unknown,
  userId: string,
  keyB64: string = tokenKeyFromEnv(),
  nowSeconds = Math.floor(Date.now() / 1000),
): Promise<StateCheck> {
  if (typeof state !== 'string' || state.length > 2048) return { ok: false, reason: 'malformed' };
  const parts = state.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false, reason: 'malformed' };
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = fromB64Url(parts[1]);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const valid = await crypto.subtle.verify('HMAC', await stateKey(keyB64), sig, new TextEncoder().encode(parts[0]));
  if (!valid) return { ok: false, reason: 'signature' };
  let p: { s?: unknown; u?: unknown; n?: unknown; e?: unknown };
  try {
    p = JSON.parse(new TextDecoder().decode(fromB64Url(parts[0])));
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (typeof p.s !== 'string' || typeof p.u !== 'string' || typeof p.n !== 'string' || typeof p.e !== 'number') {
    return { ok: false, reason: 'malformed' };
  }
  if (p.e < nowSeconds) return { ok: false, reason: 'expired' };
  if (p.u !== userId) return { ok: false, reason: 'user' };
  return { ok: true, state: { siteId: p.s, userId: p.u, nonce: p.n, exp: p.e } };
}

export const GOOGLE_ADS_SCOPE = 'https://www.googleapis.com/auth/adwords';

/** Google's consent URL: adwords scope, offline access and forced consent so a refresh token is always issued. */
export function buildAuthorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_ADS_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'false',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}
