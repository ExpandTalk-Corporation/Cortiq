// tests/foundation/reporting-accuracy-d-f.test.mjs
// D: visits get browser and OS families from the User-Agent (they were always "unknown").
// F: the Overview says which days of the range have page views and warns about gaps.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { browserAndOs } from '../../supabase/functions/_shared/user-agent.js';
import { toDataCoverage, coverageLine, gapWarnings } from '../../src/lib/dataCoverage.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

const UA = {
  chromeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  edgeWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  safariIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
  chromeIphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1',
  iphoneWebview: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  safariMac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
  firefoxLinux: 'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:132.0) Gecko/20100101 Firefox/132.0',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/26.0 Chrome/122.0.0.0 Mobile Safari/537.36',
  operaWin: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 OPR/115.0.0.0',
  chromeAndroid: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  chromebook: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
};

test('D: browserAndOs reads browser and OS families, most specific token first', () => {
  const cases = [
    ['chromeWin', 'Chrome', 'Windows'], ['edgeWin', 'Edge', 'Windows'], ['safariIphone', 'Safari', 'iOS'],
    ['chromeIphone', 'Chrome', 'iOS'], ['iphoneWebview', 'Safari', 'iOS'], ['safariMac', 'Safari', 'macOS'],
    ['firefoxLinux', 'Firefox', 'Linux'], ['samsung', 'Samsung Internet', 'Android'], ['operaWin', 'Opera', 'Windows'],
    ['chromeAndroid', 'Chrome', 'Android'], ['chromebook', 'Chrome', 'ChromeOS'],
  ];
  for (const [k, browser, os] of cases) assert.deepEqual(browserAndOs(UA[k]), { browser, os }, k);
  assert.deepEqual(browserAndOs('curl/8.4.0'), { browser: 'Other', os: 'Other' });
  for (const empty of [null, undefined, '', '   ', 42]) assert.deepEqual(browserAndOs(empty), { browser: null, os: null });
});

test('D: track-event passes browser and OS from the User-Agent header to ingest_pageview', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /import \{ browserAndOs \} from '\.\.\/_shared\/user-agent\.js'/);
  assert.match(src, /browserAndOs\(req\.headers\.get\('user-agent'\)\)/);
  assert.match(src, /p_browser:\s*ua\.browser/);
  assert.match(src, /p_os:\s*ua\.os/);
});

test('D PostgreSQL: a visit keeps the browser and OS of its first page view; old overload is gone', async () => {
  const db = new PGlite();
  try {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text);
      CREATE TABLE public.tracking_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid, session_id text,
        device_type text, browser text, os text, referrer text, started_at timestamptz, last_activity timestamptz, page_views int,
        duration_seconds int, country_code text,
        utm_source text, utm_medium text, utm_campaign text, utm_term text, utm_content text);
      CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text,
        viewed_at timestamptz, referrer text);
      CREATE FUNCTION public._norm_host(u text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT regexp_replace(split_part(split_part(regexp_replace(lower(coalesce(u, '')), '^https?://', ''), '/', 1), ':', 1), '^www\\.', '') $$;
      CREATE FUNCTION public._url_param(u text, k text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
        SELECT nullif(substring(u from '[?&]' || k || '=([^&#]*)'), '') $$;
      INSERT INTO sites VALUES ('11111111-1111-1111-1111-111111111111', null, 'example.se');`);
    await db.exec(read('../../supabase/migrations/20261108000001_visit_inactivity_timeout.sql'));
    await db.exec(read('../../supabase/migrations/20261120000001_session_timeout.sql'));
    await db.exec(read('../../supabase/migrations/20261124000001_session_browser_os.sql'));

    const overloads = await db.query(`SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'ingest_pageview'`);
    assert.equal(overloads.rows[0].n, 1);

    const hit = (at, browser, os) => db.query(
      `SELECT public.ingest_pageview('https://example.se/a', 's1', 'mobile', null, $1::timestamptz, 'SE', $2, $3)`, [at, browser, os]);
    await hit('2026-11-10T10:00:00Z', 'Safari', 'iOS');
    await hit('2026-11-10T10:05:00Z', 'Chrome', 'Android');
    // Six-argument callers (older deploys of track-event) still work; browser and OS stay empty.
    await db.query(`SELECT public.ingest_pageview('https://example.se/b', 's2', 'desktop', null, '2026-11-10T11:00:00Z', 'SE')`);
    await hit('2026-11-10T12:00:00Z', '  ', '');

    const rows = (await db.query(`SELECT session_id, browser, os, page_views FROM tracking_sessions ORDER BY started_at`)).rows;
    assert.deepEqual(rows, [
      { session_id: 's1', browser: 'Safari', os: 'iOS', page_views: 2 },
      { session_id: 's2', browser: null, os: null, page_views: 1 },
      { session_id: 's1', browser: null, os: null, page_views: 1 },
    ]);
  } finally {
    await db.close();
  }
});

async function coverageDb() {
  const db = new PGlite();
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid, domain text);
    CREATE TABLE public.page_views (id uuid DEFAULT gen_random_uuid(), site_id uuid, session_id uuid, url text, viewed_at timestamptz, referrer text);
    INSERT INTO sites VALUES ('11111111-1111-1111-1111-111111111111', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'example.se');
    SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', false);`);
  await db.exec(read('../../supabase/migrations/20261124000002_data_coverage.sql'));
  const views = async (...days) => {
    for (const d of days) {
      await db.query(`INSERT INTO page_views (site_id, url, viewed_at) VALUES ('11111111-1111-1111-1111-111111111111', 'https://example.se/', $1::timestamptz)`, [`${d}T12:00:00Z`]);
    }
  };
  const coverage = async (from, to, minGap = 3) => toDataCoverage((await db.query(
    `SELECT public.get_data_coverage('11111111-1111-1111-1111-111111111111', $1::date, $2::date, $3) AS c`, [from, to, minGap])).rows[0].c);
  return { db, views, coverage };
}

test('F PostgreSQL: first/last day, days with data and an inner gap', async () => {
  const { db, views, coverage } = await coverageDb();
  try {
    await views('2026-11-01', '2026-11-02', '2026-11-07', '2026-11-08', '2026-11-08');
    const c = await coverage('2026-11-01', '2026-11-10');
    assert.equal(c.firstDay, '2026-11-01');
    assert.equal(c.lastDay, '2026-11-08');
    assert.equal(c.daysWithData, 4);
    assert.equal(c.daysInRange, 10);
    // 11-03..11-06 is a gap; 11-09..11-10 at the end with nothing after is not (pipeline alerts cover that).
    assert.deepEqual(c.gaps, [{ from: '2026-11-03', to: '2026-11-06', days: 4 }]);
    // Shorter than the minimum: no gap.
    assert.deepEqual((await coverage('2026-11-01', '2026-11-10', 5)).gaps, []);
  } finally {
    await db.close();
  }
});

test('F PostgreSQL: the expandtalk case — empty start of range with data before it', async () => {
  const { db, views, coverage } = await coverageDb();
  try {
    await views('2026-06-10', '2026-11-05', '2026-11-06');
    const c = await coverage('2026-10-01', '2026-11-06');
    assert.equal(c.firstDay, '2026-11-05');
    assert.equal(c.dataBefore, true);
    assert.deepEqual(c.gaps, [{ from: '2026-10-01', to: '2026-11-04', days: 35 }]);

    // Whole range empty with data on both sides is one gap; with data only before it, none.
    assert.deepEqual((await coverage('2026-07-01', '2026-07-31')).gaps, [{ from: '2026-07-01', to: '2026-07-31', days: 31 }]);
    const after = await coverage('2026-11-10', '2026-11-12');
    assert.equal(after.firstDay, null);
    assert.deepEqual(after.gaps, []);
  } finally {
    await db.close();
  }
});

test('F PostgreSQL: owner check and range check', async () => {
  const { db, coverage } = await coverageDb();
  try {
    await assert.rejects(coverage('2026-01-01', '2027-01-05'), /invalid range/);
    await assert.rejects(coverage('2026-11-05', '2026-11-01'), /invalid range/);
    await db.exec(`SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', false);`);
    await assert.rejects(coverage('2026-11-01', '2026-11-05'), /not authorised/);
    const grants = read('../../supabase/migrations/20261124000002_data_coverage.sql');
    assert.match(grants, /REVOKE EXECUTE ON FUNCTION public\.get_data_coverage\(uuid, date, date, int\) FROM PUBLIC, anon;/);
  } finally {
    await db.close();
  }
});

test('F: coverage line and gap warnings', () => {
  const c = toDataCoverage({ first_day: '2026-11-05', last_day: '2026-11-06', days_with_data: '2', days_in_range: 37,
    data_before: true, data_after: false, gaps: [{ from: '2026-10-01', to: '2026-11-04', days: 35 }] });
  assert.equal(coverageLine(c), 'Page views from 2026-11-05 to 2026-11-06, on 2 of 37 days.');
  assert.equal(gapWarnings(c).length, 1);
  assert.match(gapWarnings(c)[0], /^No page views 2026-10-01 to 2026-11-04 \(35 days\)/);
  assert.equal(coverageLine(toDataCoverage(null)), 'No page views in this range.');
  assert.deepEqual(gapWarnings(toDataCoverage(null)), []);
});

test('F: the Overview renders the coverage line unless only the aggregate beacon reports', () => {
  const src = read('../../src/components/dashboard/tabs/OverviewTab.tsx');
  assert.match(src, /\{!aggregateOnly && <DataCoverage siteId=\{selectedSite\.id\} from=\{filters\.from\} to=\{filters\.to\} \/>\}/);
  assert.match(read('../../src/hooks/useDataCoverage.ts'), /rpc\('get_data_coverage'/);
});
