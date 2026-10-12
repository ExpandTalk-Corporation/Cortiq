// Runs the real browser probe against a URL and prints what each consent state saw.
// Usage: BROWSERLESS_API_KEY=... node scripts/tracking-check/probe-smoke.mjs https://example.com/ [none,reject,accept]
import { runBrowserProbe, DEFAULT_BROWSERLESS_URL } from '../../supabase/functions/_shared/tracking-check/browserless.ts';
import { vendorForUrl, vendorForName } from '../../supabase/functions/_shared/tracking-vendors.ts';

const [url, states = 'none,reject,accept'] = process.argv.slice(2);
if (!url || !process.env.BROWSERLESS_API_KEY) { console.error('Usage: BROWSERLESS_API_KEY=... node scripts/tracking-check/probe-smoke.mjs <url> [states]'); process.exit(1); }
const obs = await runBrowserProbe({ endpoint: process.env.BROWSERLESS_URL ?? DEFAULT_BROWSERLESS_URL, token: process.env.BROWSERLESS_API_KEY, url, states: states.split(','), basicAuth: null });
console.log(`CMP: ${obs.cmp ?? 'none detected'}`);
for (const s of obs.states) {
  const vendors = [...new Set(s.requests.map((r) => vendorForUrl(r.url)?.id).filter(Boolean))];
  console.log(`\n[${s.state}] method=${s.method}${s.error ? ` error=${s.error}` : ''}${s.challenge ? ' CHALLENGE' : ''}`);
  console.log(`  requests: ${s.requests.length}  vendors: ${vendors.join(', ') || '-'}`);
  console.log(`  new cookies: ${s.cookies.map((c) => `${c.name}${vendorForName(c.name) ? `(${vendorForName(c.name).id})` : ''}`).join(', ') || '-'}`);
  console.log(`  storage: ${s.storageKeys.join(', ') || '-'}  csp violations: ${s.cspViolations.length}  consent: ${JSON.stringify(s.consentCommands)}`);
}
