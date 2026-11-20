// tests/foundation/content-media-access.test.mjs
// content-tracking and media-analytics had GET endpoints that returned any site's data by site_id without
// auth, and their POST collectors wrote whatever site_id the body named. The GETs are gone (405) and every
// POST resolves the site through _shared/resolve-site.ts: an unknown or inactive site is rejected unwritten.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEdge, mockDatabase } from './edge-harness.mjs';

const SITE = '11111111-1111-4111-8111-111111111111';
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222';

function setup(name, { site = { id: SITE, is_active: true }, domainSite = null } = {}) {
  const rpcs = [];
  const d = mockDatabase((op) => {
    if (op.table === 'sites') {
      const id = op.filters.find(([k]) => k === 'id')?.[1];
      if (id === SITE) return { data: site, error: null };
      if (domainSite && id === domainSite.id) return { data: domainSite, error: null };
      return { data: null, error: null };
    }
    return { data: op.type === 'select' ? null : { id: 'row-1' }, error: null };
  }, async (fn, args) => {
    rpcs.push(fn);
    if (fn === 'resolve_site_by_domain') return { data: domainSite?.id ?? null, error: null };
    if (fn === 'get_site_jurisdiction') return { data: null, error: null };
    return { data: true, error: null };
  });
  const handler = loadEdge(name, d.client, { flushWaitUntil: true });
  const writes = () => d.calls.filter((c) => c.type !== 'select');
  return { handler, d, rpcs, writes };
}

const req = (path, method, body, headers = {}) => new Request(`https://fn.test/${path}`, {
  method, headers: { 'content-type': 'application/json', origin: 'https://shop.test', ...headers },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const GETS = {
  'content-tracking': ['performance', 'forms', 'heatmap'],
  'media-analytics': ['engagement', 'timeline', 'quality'],
};

const POSTS = {
  'content-tracking': [
    ['content-tracking/element', (siteId) => ({ site_id: siteId, element: { element_id: 'e-1', element_type: 'a', element_selector: '#a', page_url: '/' } })],
    ['content-tracking/interaction', (siteId) => ({ site_id: siteId, session_id: 's-1', interaction: { element_id: 'e-1', page_url: '/', interaction_type: 'click', mouse_x: 1, mouse_y: 2 } })],
    ['content-tracking/scroll', (siteId) => ({ site_id: siteId, session_id: 's-1', page_url: '/', scroll_depth: 50 })],
  ],
  'media-analytics': [
    ['media-analytics/event', (siteId) => ({ site_id: siteId, session_id: 's-1', event: { media_id: 'm-1', media_type: 'video', event_type: 'play' } })],
  ],
};

for (const [name, paths] of Object.entries(GETS)) {
  test(`${name}: the GET read endpoints answer 405 and read nothing`, async () => {
    for (const path of paths) {
      const { handler, d } = setup(name);
      const res = await handler(req(`${name}/${path}?site_id=${SITE}&page_url=/&media_id=m-1&date=2026-11-20`, 'GET'));
      assert.equal(res.status, 405, path);
      assert.equal(res.headers.get('allow'), 'POST, OPTIONS', path);
      assert.equal(d.calls.length, 0, path);
    }
  });

  test(`${name}: OPTIONS no longer advertises GET`, async () => {
    const { handler } = setup(name);
    const res = await handler(req(name, 'OPTIONS'));
    assert.equal(res.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  });
}

for (const [name, posts] of Object.entries(POSTS)) {
  test(`${name}: POST for an unknown site is rejected with no write and no jurisdiction log`, async () => {
    for (const [path, body] of posts) {
      const { handler, rpcs, writes } = setup(name);
      const res = await handler(req(path, 'POST', body('99999999-9999-4999-8999-999999999999')));
      assert.equal(res.status, 403, path);
      assert.deepEqual(await res.json(), { error: 'Invalid or inactive site' }, path);
      assert.equal(writes().length, 0, path);
      assert.deepEqual(rpcs.filter((r) => r !== 'resolve_site_by_domain'), [], path);
    }
  });

  test(`${name}: POST for an inactive site is rejected with no write`, async () => {
    for (const [path, body] of posts) {
      const { handler, writes } = setup(name, { site: { id: SITE, is_active: false } });
      const res = await handler(req(path, 'POST', body(SITE)));
      assert.equal(res.status, 403, path);
      assert.equal(writes().length, 0, path);
    }
  });

  test(`${name}: POST with a non-string site_id is rejected`, async () => {
    for (const [path, body] of posts) {
      const { handler, writes } = setup(name);
      const res = await handler(req(path, 'POST', body({ id: SITE })));
      assert.ok([400, 403].includes(res.status), `${path}: ${res.status}`);
      assert.equal(writes().length, 0, path);
    }
  });

  test(`${name}: an account id is accepted only for that account's site on the request Origin`, async () => {
    for (const [path, body] of posts) {
      const owned = setup(name, { domainSite: { id: '33333333-3333-4333-8333-333333333333', is_active: true, user_id: OTHER_ACCOUNT } });
      const ok = await owned.handler(req(path, 'POST', body(OTHER_ACCOUNT)));
      assert.equal(ok.status, 200, path);
      assert.ok(owned.writes().length > 0, path);
      assert.ok(owned.writes().every((w) => [w.payload].flat().every((p) => p.site_id === undefined || p.site_id === '33333333-3333-4333-8333-333333333333')), path);

      const foreign = setup(name, { domainSite: { id: '33333333-3333-4333-8333-333333333333', is_active: true, user_id: 'someone-else' } });
      const no = await foreign.handler(req(path, 'POST', body(OTHER_ACCOUNT)));
      assert.equal(no.status, 403, path);
      assert.equal(foreign.writes().length, 0, path);
    }
  });

  test(`${name}: POST for an active site is stored under the resolved site id`, async () => {
    for (const [path, body] of posts) {
      const { handler, writes } = setup(name);
      const res = await handler(req(path, 'POST', body(SITE)));
      assert.equal(res.status, 200, path);
      assert.ok(writes().length > 0, path);
    }
  });
}
