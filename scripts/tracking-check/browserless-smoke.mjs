// Verifies the Browserless /function contract Tracking Check relies on.
// Usage: BROWSERLESS_API_KEY=... [BROWSERLESS_URL=...] node scripts/tracking-check/browserless-smoke.mjs
const token = process.env.BROWSERLESS_API_KEY;
const base = process.env.BROWSERLESS_URL ?? 'https://production-sfo.browserless.io';
if (!token) { console.error('Set BROWSERLESS_API_KEY'); process.exit(1); }

const code = `
export default async function ({ page, context }) {
  const browser = page.browser();
  const create = browser.createBrowserContext ? 'createBrowserContext' : 'createIncognitoBrowserContext';
  const ctx = await browser[create]();
  const p = await ctx.newPage();
  const requests = [];
  p.on('request', r => requests.push(r.url()));
  await p.evaluateOnNewDocument(() => { window.__probe = true; });
  const res = await p.goto(context.url, { waitUntil: 'load', timeout: 30000 });
  await p.waitForNetworkIdle({ idleTime: 1000, timeout: 10000 }).catch(() => {});
  const cdp = await p.createCDPSession();
  const { cookies } = await cdp.send('Network.getAllCookies');
  const flag = await p.evaluate(() => window.__probe === true);
  await ctx.close();
  return { data: { status: res && res.status(), create, requests: requests.length, cookies: cookies.length, evaluateOnNewDocument: flag, puppeteerHasAuthenticate: typeof p.authenticate === 'function' }, type: 'application/json' };
}`;

const res = await fetch(`${base}/function?token=${encodeURIComponent(token)}&timeout=60000`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ code, context: { url: 'https://example.com/' } }),
});
console.log('HTTP', res.status, res.headers.get('content-type'));
console.log(await res.text());
