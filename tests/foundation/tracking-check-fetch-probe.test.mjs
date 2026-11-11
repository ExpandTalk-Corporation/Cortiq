import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchProbe, safeGet, parseCsp, cspAllows, metaCsp } from '../../supabase/functions/_shared/tracking-check/fetch-probe.ts';

const resolve = async () => ['93.184.215.14'];
// Fake fetch: routes maps "pathname" -> (url, init) => Response
function fakeFetch(routes, seen = []) {
  return async (url, init) => {
    const u = new URL(url);
    seen.push({ url, auth: init.headers.Authorization ?? null });
    const route = routes[u.origin + u.pathname] ?? routes[u.pathname];
    if (!route) return new Response('not found', { status: 404 });
    return route(u);
  };
}
const redirect = (location, status = 301) => () => new Response(null, { status, headers: { location } });
const ok = (body = '<html></html>', headers = {}) => () => new Response(body, { status: 200, headers });

test('parameters survive a redirect chain that keeps the query string', async () => {
  const obs = await fetchProbe('https://new.example/product/', { resolve, fetchImpl: fakeFetch({
    '/product/': (u) => new Response(null, { status: 301, headers: { location: '/products/' + u.search } }),
    '/products/': ok(),
  }) });
  assert.equal(obs.error, null);
  assert.deepEqual(obs.paramsLost, []);
  assert.deepEqual(obs.hops.map((h) => h.status), [301, 200]);
  assert.equal(obs.finalStatus, 200);
});

test('a 307 trailing-slash redirect that keeps the query still passes', async () => {
  const obs = await fetchProbe('https://new.example/glossary', { resolve, fetchImpl: fakeFetch({
    '/glossary': (u) => new Response(null, { status: 307, headers: { location: '/glossary/' + u.search } }),
    '/glossary/': ok(),
  }) });
  assert.deepEqual(obs.paramsLost, []);
});

test('a redirect that drops the query loses every tracking parameter', async () => {
  const obs = await fetchProbe('https://new.example/old', { resolve, fetchImpl: fakeFetch({ '/old': redirect('/new'), '/new': ok() }) });
  assert.ok(obs.paramsLost.includes('gclid'));
  assert.ok(obs.paramsLost.includes('utm_source'));
});

test('a redirect into private address space is blocked', async () => {
  const obs = await fetchProbe('https://new.example/x', { resolve, fetchImpl: fakeFetch({ '/x': redirect('http://169.254.169.254/latest') }) });
  assert.match(obs.error, /Blocked host/);
});

test('basic auth is only sent to the starting origin', async () => {
  const seen = [];
  await fetchProbe('https://staging.example/a', { resolve, basicAuth: { username: 'u', password: 'p' }, fetchImpl: fakeFetch({
    'https://staging.example/a': redirect('https://cdn.example/b'),
    'https://cdn.example/b': ok(),
  }, seen) });
  assert.match(seen[0].auth, /^Basic /);
  assert.equal(seen[1].auth, null);
});

test('detects bot-protection challenges and redirect loops', async () => {
  const challenge = await fetchProbe('https://new.example/', { resolve, fetchImpl: fakeFetch({ '/': () => new Response('<title>Just a moment...</title>', { status: 403 }) }) });
  assert.equal(challenge.challenge, true);
  const loop = await fetchProbe('https://new.example/a', { resolve, fetchImpl: fakeFetch({ '/a': redirect('/b'), '/b': redirect('/a') }) });
  assert.match(loop.error, /Too many redirects/);
});

test('safeGet returns the body without test parameters', async () => {
  const res = await safeGet('https://new.example/sitemap.xml', { resolve, fetchImpl: fakeFetch({ '/sitemap.xml': ok('<urlset/>') }) });
  assert.equal(res.body, '<urlset/>');
  assert.equal(new URL(res.finalUrl).search, '');
});

test('parses CSP headers and evaluates sources', () => {
  const csp = parseCsp("default-src 'self'; script-src 'self' js.hsforms.net *.googletagmanager.com; connect-src https:");
  assert.deepEqual(csp['script-src'], ["'self'", 'js.hsforms.net', '*.googletagmanager.com']);
  assert.equal(cspAllows(csp, 'script-src', 'js.hsforms.net'), true);
  assert.equal(cspAllows(csp, 'script-src', 'js.hs-scripts.com'), false);
  assert.equal(cspAllows(csp, 'script-src', 'www.googletagmanager.com'), true);
  assert.equal(cspAllows(csp, 'script-src', '*.googletagmanager.com'), true);
  assert.equal(cspAllows(csp, 'connect-src', 'track.hubspot.com'), true);   // https: allows any https host
  assert.equal(cspAllows(csp, 'img-src', 'track.hubspot.com'), false);      // falls back to default-src 'self'
  assert.equal(parseCsp(null), null);
});

test('report-only header is kept apart from the enforced policy', async () => {
  const obs = await fetchProbe('https://new.example/', { resolve, fetchImpl: fakeFetch({
    '/': ok('<html></html>', { 'content-security-policy-report-only': "script-src 'self'" }),
  }) });
  assert.equal(obs.csp, null);
  assert.deepEqual(obs.cspReportOnly['script-src'], ["'self'"]);
});

test('a <meta http-equiv> policy is used when there is no header; the header wins', async () => {
  const meta = `<html><head><meta content="script-src 'self' cdn.example" http-equiv="Content-Security-Policy"></head></html>`;
  const fromMeta = await fetchProbe('https://new.example/', { resolve, fetchImpl: fakeFetch({ '/': ok(meta) }) });
  assert.deepEqual(fromMeta.csp['script-src'], ["'self'", 'cdn.example']);
  const fromHeader = await fetchProbe('https://new.example/', { resolve, fetchImpl: fakeFetch({ '/': ok(meta, { 'content-security-policy': "script-src 'none'" }) }) });
  assert.deepEqual(fromHeader.csp['script-src'], ["'none'"]);
});

test('metaCsp ignores other meta tags and decodes entities', () => {
  assert.equal(metaCsp('<meta name="description" content="script-src *">'), null);
  assert.equal(metaCsp("<meta http-equiv='content-security-policy' content='script-src &#39;self&#39;'>"), "script-src 'self'");
  assert.equal(metaCsp('<meta http-equiv="Content-Security-Policy-Report-Only" content="x">'), null);
});
