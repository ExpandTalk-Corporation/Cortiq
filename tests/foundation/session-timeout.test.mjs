// tests/foundation/session-timeout.test.mjs
// GA4-style session timeout: the tracker rotates its session id after N minutes without
// activity (default 30, per site 5-240), stores the expiry under the same consent rules as the
// id, and the server splits visits with the same per-site timeout.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { webcrypto } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { normalizeSessionTimeout, DEFAULT_SESSION_TIMEOUT_MINUTES } from '../../supabase/functions/_shared/session-timeout.js';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const script = read('../../public/spa-tracking.js');
const settle = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
const MIN = 60_000;

// A browser with a controllable clock. trackEvent responses can carry session_timeout_minutes.
function browser({ config = {}, consent = null, timeoutResponse, start = Date.UTC(2026, 10, 20, 10, 0) } = {}) {
  const clock = { now: start };
  class FakeDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock.now])); }
    static now() { return clock.now; }
  }
  const calls = [];
  const storageWrites = [];
  const local = new Map(consent ? [['site_cookie_consent', JSON.stringify({ expiresAt: '2099-01-01T00:00:00Z', ...consent })]] : []);
  const session = new Map();
  const surface = () => {
    const listeners = new Map();
    return {
      addEventListener(name, handler) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(handler); },
      removeEventListener(name, handler) { listeners.get(name)?.delete(handler); },
      dispatchEvent(event) { for (const handler of [...(listeners.get(event.type) || [])]) handler(event); },
    };
  };
  const window = Object.assign(surface(), {
    cortiqConfig: { siteId: 'site-1', apiKey: 'tracking-key', ...config },
    location: { href: 'https://site.test/start', origin: 'https://site.test', pathname: '/start', search: '' },
    innerWidth: 1200, innerHeight: 800, scrollY: 0,
  });
  const document = Object.assign(surface(), {
    readyState: 'complete', referrer: '', title: 'Start', documentElement: { scrollHeight: 4000 },
    createElement() { return { getContext: () => null }; },
  });
  const history = {
    pushState(_state, _unused, path) { window.location.pathname = path; },
    replaceState(_state, _unused, path) { window.location.pathname = path; },
  };
  runInNewContext(script, {
    window, document, history, crypto: webcrypto, URL, URLSearchParams, TextEncoder, Date: FakeDate,
    screen: { width: 1200, height: 800 }, navigator: { userAgent: 'Test', language: 'sv', platform: 'test' },
    localStorage: { getItem: key => local.get(key) ?? null },
    sessionStorage: {
      getItem: key => session.get(key) ?? null,
      setItem: (key, value) => { storageWrites.push(key); session.set(key, value); },
      removeItem: key => session.delete(key),
    },
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, setInterval: () => 0, clearInterval() {}, requestAnimationFrame: fn => fn(),
    fetch: async (url, options) => {
      const body = JSON.parse(options.body);
      calls.push({ url, body });
      const extra = url.endsWith('/track-event') && body.event_type === 'view' && timeoutResponse !== undefined
        ? { session_timeout_minutes: timeoutResponse } : {};
      return { ok: true, json: async () => ({ success: true, visitor: { visitorId: 'visitor-1', visitorType: 'human' }, ...extra }) };
    },
  });
  const choose = (analytics, marketing = false) => window.dispatchEvent({ type: 'siteConsentUpdated', detail: { analytics, marketing } });
  const advance = (ms) => { clock.now += ms; };
  const sessionIds = () => calls.filter(c => c.url.endsWith('/track-event')).map(c => c.body.session_id);
  // One tracked activity (a custom click event), then the session id it was sent with.
  const act = async () => {
    window.CortIQ.trackClick('cta');
    await settle();
    return sessionIds().at(-1);
  };
  return { window, history, calls, storageWrites, session, clock, choose, advance, act, sessionIds };
}

test('full mode: a new session id after 30 minutes without activity, stored with its expiry', async () => {
  const b = browser();
  b.choose(true);
  await settle();
  const first = b.window.CortIQ.getSessionId();
  assert.match(first, /^sess_/);
  assert.equal(b.session.get('cortiq_session_id'), first);
  assert.equal(Number(b.session.get('cortiq_session_expires')), b.clock.now + 30 * MIN);

  b.advance(31 * MIN);
  const second = await b.act();
  assert.notEqual(second, first, 'rotated after the timeout');
  assert.equal(b.window.CortIQ.getSessionId(), second);
  assert.equal(b.session.get('cortiq_session_id'), second);
  assert.equal(Number(b.session.get('cortiq_session_expires')), b.clock.now + 30 * MIN);

  // An SPA page view after another long pause also gets a fresh id.
  b.advance(45 * MIN);
  b.history.pushState({}, '', '/next');
  await settle();
  const view = b.calls.filter(c => c.body.event_type === 'view').at(-1);
  assert.notEqual(view.body.session_id, second);
});

test('full mode: activity within the timeout keeps the session, each activity extends it', async () => {
  const b = browser();
  b.choose(true);
  await settle();
  const first = b.window.CortIQ.getSessionId();
  for (let i = 0; i < 6; i++) {       // every 25 minutes for 2.5 hours
    b.advance(25 * MIN);
    assert.equal(await b.act(), first);
  }
  b.advance(29 * MIN + 59_000);
  assert.equal(await b.act(), first, 'just under the timeout');
  assert.deepEqual([...new Set(b.sessionIds())], [first]);
});

test('inactivity only: no split at midnight or on a campaign change', async () => {
  const b = browser({ start: Date.UTC(2026, 10, 20, 23, 50) });
  b.choose(true);
  await settle();
  const first = b.window.CortIQ.getSessionId();
  b.advance(20 * MIN);                // 00:10 the next day
  b.window.location.search = '?utm_campaign=winter&utm_source=newsletter';
  b.history.pushState({}, '', '/campaign');
  await settle();
  assert.equal(b.calls.filter(c => c.body.event_type === 'view').at(-1).body.session_id, first);
});

test('a page load in the same tab reuses a live session and replaces an expired one', async () => {
  const live = browser();
  live.session.set('cortiq_session_id', 'sess_live');
  live.session.set('cortiq_session_expires', String(live.clock.now + 5 * MIN));
  live.choose(true);
  await settle();
  assert.equal(live.window.CortIQ.getSessionId(), 'sess_live');

  const expired = browser();
  expired.session.set('cortiq_session_id', 'sess_old');
  expired.session.set('cortiq_session_expires', String(expired.clock.now - 1));
  expired.choose(true);
  await settle();
  assert.notEqual(expired.window.CortIQ.getSessionId(), 'sess_old');
  assert.equal(expired.session.get('cortiq_session_id'), expired.window.CortIQ.getSessionId());

  // Written by a tracker before 5.5.12 or by the consent banner: no expiry yet, kept.
  const legacy = browser();
  legacy.session.set('cortiq_session_id', 'sess_legacy');
  legacy.choose(true);
  await settle();
  assert.equal(legacy.window.CortIQ.getSessionId(), 'sess_legacy');
  assert.equal(Number(legacy.session.get('cortiq_session_expires')), legacy.clock.now + 30 * MIN);
});

for (const config of [{}, { cookieless: true }]) {
  test(`no storage writes or requests without consent, however long the pause: ${JSON.stringify(config)}`, async () => {
    const b = browser({ config });
    b.window.CortIQ.trackClick('cta');
    b.advance(31 * MIN);
    b.window.CortIQ.trackClick('cta');
    b.history.pushState({}, '', '/next');
    await settle();
    assert.equal(b.calls.length, 0);
    assert.equal(b.storageWrites.length, 0);
    assert.equal(b.window.CortIQ.getSessionId(), null);
  });
}

test('revoking consent removes the id and its expiry; later activity writes nothing', async () => {
  const b = browser();
  b.choose(true);
  await settle();
  assert.ok(b.session.has('cortiq_session_expires'));
  b.choose(false);
  const writes = b.storageWrites.length;
  assert.equal(b.session.has('cortiq_session_id'), false);
  assert.equal(b.session.has('cortiq_session_expires'), false);
  b.advance(31 * MIN);
  b.window.CortIQ.trackClick('cta');
  await settle();
  assert.equal(b.storageWrites.length, writes);
});

test('cookieless mode: rotation happens in memory only, nothing is written', async () => {
  const b = browser({ config: { cookieless: true } });
  b.choose(true);
  await settle();
  const first = b.window.CortIQ.getSessionId();
  assert.match(first, /^sess_/);
  b.advance(10 * MIN);
  assert.equal(await b.act(), first);
  b.advance(31 * MIN);
  const second = await b.act();
  assert.notEqual(second, first);
  assert.equal(b.storageWrites.length, 0, `no sessionStorage writes: ${b.storageWrites}`);
  assert.equal(b.session.size, 0);
});

test('the site timeout from track-event is applied and re-dates the current session', async () => {
  const b = browser({ timeoutResponse: 60 });
  b.choose(true);
  await settle();
  const first = b.window.CortIQ.getSessionId();
  assert.equal(Number(b.session.get('cortiq_session_expires')), b.clock.now + 60 * MIN, 're-dated to 60 minutes');
  b.advance(45 * MIN);
  assert.equal(await b.act(), first, '45 minutes is within a 60-minute timeout');
  b.advance(61 * MIN);
  assert.notEqual(await b.act(), first);

  const short = browser({ timeoutResponse: 5 });
  short.choose(true);
  await settle();
  const id = short.window.CortIQ.getSessionId();
  short.advance(6 * MIN);
  assert.notEqual(await short.act(), id, 'rotated after the 5-minute site timeout');
});

for (const value of [null, '', 'abc', 0, 4, 241, 1000, 12.5, -30]) {
  test(`timeout delivery falls back to 30 minutes: server sends ${JSON.stringify(value)}`, async () => {
    const b = browser({ timeoutResponse: value });
    b.choose(true);
    await settle();
    const first = b.window.CortIQ.getSessionId();
    b.advance(29 * MIN);
    assert.equal(await b.act(), first);
    b.advance(31 * MIN);
    assert.notEqual(await b.act(), first);
  });
}

for (const sessionTimeout of [undefined, null, 'abc', 2, 500]) {
  test(`timeout delivery falls back to 30 minutes: config sessionTimeout ${JSON.stringify(sessionTimeout)}, no server value`, async () => {
    const b = browser({ config: sessionTimeout === undefined ? {} : { sessionTimeout } });
    b.choose(true);
    await settle();
    const first = b.window.CortIQ.getSessionId();
    assert.equal(Number(b.session.get('cortiq_session_expires')), b.clock.now + 30 * MIN);
    b.advance(31 * MIN);
    assert.notEqual(await b.act(), first);
  });
}

test('a valid sessionTimeout in cortiqConfig is used until the server says otherwise', async () => {
  const b = browser({ config: { sessionTimeout: 10 } });
  b.choose(true);
  await settle();
  const first = b.window.CortIQ.getSessionId();
  b.advance(11 * MIN);
  assert.notEqual(await b.act(), first);
});

test('shared normalizer: 5-240 whole minutes, otherwise 30', () => {
  assert.equal(DEFAULT_SESSION_TIMEOUT_MINUTES, 30);
  for (const [input, expected] of [[30, 30], [5, 5], [240, 240], ['45', 45], [4, 30], [241, 30], [null, 30],
    [undefined, 30], ['', 30], ['x', 30], [7.5, 30], [NaN, 30]]) {
    assert.equal(normalizeSessionTimeout(input), expected, String(input));
  }
});

test('track-event returns the site timeout from its own query and touches the session on other events', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /select\('session_timeout_minutes'\)/, 'separate query: goals keep working before the migration');
  assert.match(src, /normalizeSessionTimeout\(timeoutError \? null/, 'falls back to 30 on a query error');
  assert.match(src, /session_timeout_minutes: sessionTimeoutMinutes/);
  assert.match(src, /rpc\('touch_tracking_session'/);
  assert.doesNotMatch(src, /select\('conversion_goals, session_timeout_minutes'\)/);
});

test('consent banner does not reuse an expired session id', () => {
  const src = read('../../public/consent-banner.js');
  assert.match(src, /sessionStorage\.getItem\('cortiq_session_expires'\)/);
});

const SITE_A = '11111111-1111-4111-8111-111111111111';
const SITE_B = '22222222-2222-4222-8222-222222222222';

test('PostgreSQL: per-site timeout splits visits, events keep a visit alive, defaults to 30', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
        device_type text, referrer text, started_at timestamptz, last_activity timestamptz, page_views int,
        duration_seconds int, country_code text,
        utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
      CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
        viewed_at timestamptz, referrer text);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
      CREATE FUNCTION public._url_param(u text, k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT nullif(substring(u from '[?&]' || k || '=([^&#]*)'), '') $$;
      INSERT INTO sites VALUES ('${SITE_A}', '${SITE_A}', 'a.se'), ('${SITE_B}', '${SITE_B}', 'b.se');`);
    await db.exec(read('../../supabase/migrations/20261108000001_visit_inactivity_timeout.sql'));
    await db.exec(read('../../supabase/migrations/20261120000001_session_timeout.sql'));

    const { rows: defaults } = await db.query(`SELECT session_timeout_minutes AS m FROM sites ORDER BY id`);
    assert.deepEqual(defaults.map(r => r.m), [30, 30], 'existing sites get 30');
    await assert.rejects(db.query(`UPDATE sites SET session_timeout_minutes = 4 WHERE id = '${SITE_A}'`));
    await assert.rejects(db.query(`UPDATE sites SET session_timeout_minutes = 241 WHERE id = '${SITE_A}'`));
    await db.query(`UPDATE sites SET session_timeout_minutes = 60 WHERE id = '${SITE_B}'`);

    const view = (url, session, at) => db.query(
      `SELECT public.ingest_pageview($1, $2, 'desktop', null, $3::timestamptz, 'SE')`, [url, session, at]);
    const touch = (site, session, at) => db.query(
      `SELECT public.touch_tracking_session($1::uuid, $2, $3::timestamptz)`, [site, session, at]);

    // Site A (30 min): a 45-minute gap splits, unless events kept the visit alive.
    await view('https://a.se/', 'a1', '2025-11-20 10:00Z');
    await view('https://a.se/x', 'a1', '2025-11-20 10:45Z');
    await view('https://a.se/', 'a2', '2025-11-20 10:00Z');
    await touch(SITE_A, 'a2', '2025-11-20 10:20Z');
    await touch(SITE_A, 'a2', '2025-11-20 10:40Z');
    await view('https://a.se/x', 'a2', '2025-11-20 11:05Z');
    // A touch after the visit timed out does not revive it.
    await view('https://a.se/', 'a3', '2025-11-20 10:00Z');
    await touch(SITE_A, 'a3', '2025-11-20 10:31Z');
    await view('https://a.se/x', 'a3', '2025-11-20 10:32Z');
    // Touch for an unknown session or another site's session does nothing.
    await touch(SITE_B, 'a1', '2025-11-20 10:05Z');
    await touch(SITE_A, 'nope', '2025-11-20 10:05Z');
    // Site B (60 min): a 45-minute gap stays one visit, a 61-minute gap splits.
    await view('https://b.se/', 'b1', '2025-11-20 10:00Z');
    await view('https://b.se/x', 'b1', '2025-11-20 10:45Z');
    await view('https://b.se/y', 'b1', '2025-11-20 11:46Z');

    const { rows } = await db.query(`SELECT session_id, page_views, last_activity FROM tracking_sessions
      ORDER BY session_id, started_at`);
    assert.deepEqual(rows.map(r => [r.session_id, r.page_views]), [
      ['a1', 1], ['a1', 1],
      ['a2', 2],
      ['a3', 1], ['a3', 1],
      ['b1', 2], ['b1', 1],
    ], JSON.stringify(rows));
    assert.equal(rows.length, 7, 'touches never create sessions');
  } finally {
    await db.close();
  }
});

test('migration: range check, site timeout instead of a hardcoded 30 minutes, service_role only', () => {
  const sql = read('../../supabase/migrations/20261120000001_session_timeout.sql');
  assert.match(sql, /session_timeout_minutes integer NOT NULL DEFAULT 30/);
  assert.match(sql, /CHECK \(session_timeout_minutes BETWEEN 5 AND 240\)/);
  assert.match(sql, /make_interval\(mins => v_timeout\)/);
  assert.doesNotMatch(sql, /interval '30 minutes'/);
  assert.match(sql, /REVOKE EXECUTE ON FUNCTION public\.touch_tracking_session\(uuid, text, timestamptz\) FROM PUBLIC, anon, authenticated/);
  assert.match(sql, /GRANT {2}EXECUTE ON FUNCTION public\.touch_tracking_session\(uuid, text, timestamptz\) TO service_role/);
});
