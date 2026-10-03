// Local-only manual browser fixture. APIs below are mocks; no production traffic.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

const html = `<!doctype html><html lang="sv"><meta charset="utf-8"><title>CortIQ consent smoke test</title>
<body><h1>CortIQ consent smoke test</h1><p>Local scripts, mocked APIs. No production data.</p>
<button id="probe">Prova spårning</button><pre id="state" aria-live="polite"></pre>
<script>
const counters = { identification: 0, tracking: 0, consent: 0 };
const originalFetch = window.fetch;
window.fetch = (url, options) => {
  if (url.endsWith('/visitor-identification')) counters.identification++;
  if (url.endsWith('/track-event') || url.endsWith('/record-conversion') || url.endsWith('/link-click-counter')) counters.tracking++;
  if (url.endsWith('/store-consent')) counters.consent++;
  return originalFetch(url, options);
};
window.cortiqConfig = { siteId: '11111111-1111-4111-8111-111111111111', apiKey: 'test', apiUrl: location.origin + '/api' };
document.querySelector('#probe').onclick = () => window.CortIQ.trackClick('smoke-test');
setInterval(() => {
  document.querySelector('#state').textContent = JSON.stringify({ ...counters,
    sessionStored: sessionStorage.getItem('cortiq_session_id') !== null,
    visitor: window.CortIQ?.getVisitorId() ?? null,
    choice: JSON.parse(localStorage.getItem('site_cookie_consent') || 'null')
  }, null, 2);
}, 100);
</script>
<script src="/spa-tracking.js"></script>
<script src="/consent-banner.js" data-site-id="11111111-1111-4111-8111-111111111111" data-api-url="/api" data-lang="sv"></script>
</body></html>`;

const server = createServer((req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(html); return; }
  if (['/spa-tracking.js', '/consent-banner.js'].includes(path)) {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.end(readFileSync(new URL(`../../public${path}`, import.meta.url))); return;
  }
  if (path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ success: true, consent_id: 'test-consent', event_id: 'test-event', visitor: { visitorId: 'test-visitor', visitorType: 'human' } })); return;
  }
  res.writeHead(404); res.end();
});
server.listen(8097, '127.0.0.1', () => console.log('Consent smoke fixture: http://127.0.0.1:8097'));
