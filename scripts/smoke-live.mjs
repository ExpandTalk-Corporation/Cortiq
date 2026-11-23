// Checks that the live site serves the build in dist/. Run after an upload: node scripts/smoke-live.mjs https://cortiq.se
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const site = (process.argv[2] ?? 'https://cortiq.se').replace(/\/$/, '');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const bust = (url) => `${url}${url.includes('?') ? '&' : '?'}smoke=${Date.now()}`;

/** The entry script Vite writes into index.html, e.g. /assets/index-AbC123.js. */
export function entryScript(html) {
  return html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/)?.[1] ?? null;
}

async function get(url, init = {}) {
  const res = await fetch(bust(url), { redirect: 'manual', headers: { 'cache-control': 'no-cache' }, ...init });
  return { status: res.status, location: res.headers.get('location'), body: Buffer.from(await res.arrayBuffer()) };
}

async function checks() {
  const failures = [];
  const expect = (ok, message) => { if (!ok) failures.push(message); };

  const entry = entryScript(fs.readFileSync(path.join(dist, 'index.html'), 'utf8'));
  const home = await get(`${site}/`);
  expect(home.status === 200, `/ answered ${home.status}`);
  expect(!!entry && home.body.toString().includes(entry), `/ does not reference the new entry script ${entry}`);
  if (entry) {
    const asset = await get(`${site}${entry}`);
    expect(asset.status === 200, `${entry} answered ${asset.status}`);
  }

  const tracker = await get(`${site}/cortiq.js`);
  expect(tracker.status === 200 && sha(tracker.body) === sha(fs.readFileSync(path.join(dist, 'cortiq.js'))), '/cortiq.js differs from dist/cortiq.js');

  const page = await get(`${site}/features/analytics/`);
  expect(page.status === 200 && /<h1[\s>]/.test(page.body.toString()), `/features/analytics/ answered ${page.status} or is not prerendered`);

  const app = await get(`${site}/dashboard`);
  expect(app.status === 200, `/dashboard (SPA fallback) answered ${app.status}`);

  const http = await get(`${site.replace(/^https:/, 'http:')}/`);
  expect([301, 308].includes(http.status) && http.location?.replace(/\?.*$/, '') === `${site}/`, `http:// redirects ${http.status} to ${http.location}, expected one hop to ${site}/`);
  return failures;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let failures = [];
  for (let attempt = 1; attempt <= Number(process.env.SMOKE_ATTEMPTS ?? 5); attempt++) {
    failures = await checks().catch((e) => [`request failed: ${e.message}`]);
    if (!failures.length) break;
    console.log(`attempt ${attempt}: ${failures.join('; ')}`);
    if (attempt < Number(process.env.SMOKE_ATTEMPTS ?? 5)) await new Promise((r) => setTimeout(r, 10_000));
  }
  if (failures.length) {
    console.error(`Live site check failed:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`Live site ${site} serves this build.`);
}
