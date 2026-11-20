// Signed edge geo (spec 2026-11-18 phase 2). The CortIQ Worker (workers/geo-edge) signs the
// visitor's Cloudflare country, US/CA region and IP; Edge Functions verify it. Plain JS so the
// Worker bundle, Deno and Node tests share one implementation.
// Format: v1.<base64url(JSON {c, r, ip, ts})>.<base64url(HMAC-SHA256(key, "v1.<payload>"))>
export const GEO_HEADER = 'x-cortiq-geo';
const MAX_AGE_SEC = 60;
const MAX_SKEW_SEC = 5;
const MIN_KEY = 32;
const REGION_COUNTRIES = new Set(['US', 'CA']);
const enc = new TextEncoder();

const b64url = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (ch) => ch.charCodeAt(0));

function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

export function normalizeGeoClaims(claims) {
  const c = typeof claims.c === 'string' && /^[A-Z]{2}$/.test(claims.c) && claims.c !== 'XX' && claims.c !== 'T1' ? claims.c : null;
  const r = c && REGION_COUNTRIES.has(c) && typeof claims.r === 'string' && /^[A-Z0-9]{1,3}$/.test(claims.r) ? claims.r : null;
  const ip = typeof claims.ip === 'string' && claims.ip.length <= 45 && /^[0-9a-fA-F.:]+$/.test(claims.ip) ? claims.ip : null;
  return { c, r, ip };
}

export async function signGeo({ country, region, ip }, secret, nowSec) {
  if (typeof secret !== 'string' || secret.length < MIN_KEY) return null;
  const claims = normalizeGeoClaims({ c: country ? String(country).toUpperCase() : null, r: region ? String(region).toUpperCase() : null, ip });
  const payload = b64url(enc.encode(JSON.stringify({ ...claims, ts: Math.floor(nowSec) })));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), enc.encode(`v1.${payload}`));
  return `v1.${payload}.${b64url(new Uint8Array(sig))}`;
}

export async function verifyGeo(token, secret, nowSec) {
  try {
    if (typeof secret !== 'string' || secret.length < MIN_KEY) return null;
    if (typeof token !== 'string' || token.length > 1024) return null;
    const m = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token);
    if (!m) return null;
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), fromB64url(m[2]), enc.encode(`v1.${m[1]}`));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(fromB64url(m[1])));
    const ts = Number(claims?.ts);
    if (!Number.isFinite(ts) || ts < nowSec - MAX_AGE_SEC || ts > nowSec + MAX_SKEW_SEC) return null;
    return { ...normalizeGeoClaims(claims), ts };
  } catch {
    return null;
  }
}
