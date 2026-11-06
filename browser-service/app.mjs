// Minimal self-hosted replacement for the two Browserless v2 endpoints CortIQ uses:
//   POST /function?token=…&timeout=…   body { code, context } → runs `export default async function ({ page, context })`
//   POST /screenshot?token=…&timeout=… body { url, options, viewport, gotoOptions, waitForTimeout } → image bytes
// The browser launcher is injected so the HTTP layer can be tested without Chromium.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';

const MAX_BODY = 2_000_000;
const MAX_TIMEOUT_MS = 120_000;

function tokenOk(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('Body too large'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

function httpUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return null; }
  return u.protocol === 'http:' || u.protocol === 'https:' ? u : null;
}

function withTimeout(promise, ms) {
  let t;
  const timer = new Promise((_, reject) => { t = setTimeout(() => reject(Object.assign(new Error('Timed out'), { status: 408 })), ms); });
  return Promise.race([promise, timer]).finally(() => clearTimeout(t));
}

// One browser per request: no state (cookies, cache, service workers) survives between checks.
// The timeout closes the browser, so a stuck task cannot outlive its concurrency slot.
async function withBrowser(launch, timeoutMs, fn) {
  const browser = await launch();
  try {
    const page = await browser.newPage();
    return await withTimeout(fn(page), timeoutMs);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runFunction(launch, body, timeoutMs) {
  if (typeof body.code !== 'string' || !body.code.includes('export default')) {
    throw Object.assign(new Error('code must be an ES module with a default export'), { status: 400 });
  }
  const mod = await import(`data:text/javascript,${encodeURIComponent(body.code)}`);
  const result = await withBrowser(launch, timeoutMs, (page) => mod.default({ page, context: body.context ?? {} }));
  // Browserless convention: { data, type } → respond with `data` as `type`.
  if (result && typeof result === 'object' && 'data' in result && typeof result.type === 'string') {
    const payload = typeof result.data === 'string' || Buffer.isBuffer(result.data) ? result.data : JSON.stringify(result.data);
    return { type: result.type, payload };
  }
  return { type: 'application/json', payload: JSON.stringify(result ?? null) };
}

async function runScreenshot(launch, body, timeoutMs) {
  const url = httpUrl(body.url);
  if (!url) throw Object.assign(new Error('url must be http(s)'), { status: 400 });
  const options = { fullPage: true, type: 'png', ...(body.options ?? {}) };
  if (!['png', 'jpeg', 'webp'].includes(options.type)) options.type = 'png';
  delete options.path;   // never write to the container filesystem
  const payload = await withBrowser(launch, timeoutMs, async (page) => {
    if (body.viewport) await page.setViewport(body.viewport);
    await page.goto(url.href, { waitUntil: 'networkidle2', timeout: 45_000, ...(body.gotoOptions ?? {}) });
    if (Number(body.waitForTimeout) > 0) await new Promise((r) => setTimeout(r, Math.min(Number(body.waitForTimeout), 10_000)));
    return Buffer.from(await page.screenshot(options));
  });
  return { type: `image/${options.type}`, payload };
}

export function createApp({ launch, token, maxConcurrent = 2, maxQueue = 8 }) {
  let active = 0;
  const queue = [];
  const acquire = () => new Promise((resolve, reject) => {
    if (active < maxConcurrent) { active++; resolve(); return; }
    if (queue.length >= maxQueue) { reject(Object.assign(new Error('Busy'), { status: 429 })); return; }
    queue.push(resolve);
  });
  const release = () => { const next = queue.shift(); if (next) next(); else active--; };

  return http.createServer(async (req, res) => {
    const send = (status, type, payload) => { res.writeHead(status, { 'Content-Type': type }); res.end(payload); };
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return send(200, 'text/plain', 'ok');
    const handler = { '/function': runFunction, '/screenshot': runScreenshot }[url.pathname];
    if (!handler || req.method !== 'POST') return send(404, 'text/plain', 'Not found');
    if (!tokenOk(url.searchParams.get('token'), token)) return send(401, 'text/plain', 'Unauthorized');

    const timeoutMs = Math.min(Number(url.searchParams.get('timeout')) || 60_000, MAX_TIMEOUT_MS);
    let acquired = false;
    try {
      const body = await readJson(req);
      await acquire(); acquired = true;
      const { type, payload } = await handler(launch, body, timeoutMs);
      send(200, type, payload);
    } catch (e) {
      const status = e?.status ?? 500;
      // Navigation errors quote the page address; logs keep only the error without it.
      if (status === 500) console.error(redactUrls(e?.stack ?? String(e)));
      send(status, 'text/plain', status === 500 ? 'Browser task failed' : e.message);
    } finally {
      if (acquired) release();
    }
  });
}

export const redactUrls = (text) => String(text).replace(/(?:https?|wss?|data|file):\S+/gi, '<url>');
