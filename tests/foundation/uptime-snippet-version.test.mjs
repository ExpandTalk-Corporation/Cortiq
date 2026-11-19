// Spec 2026-11-19 §1.2: the uptime check reads the tracker version from the home page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { classify, snippetVersion } from '../../supabase/functions/_shared/uptime.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const S1 = '11111111-1111-4111-8111-111111111111';

test('snippetVersion: pinned SRI path, WP ?ver=, auto snippet and junk', () => {
  assert.equal(snippetVersion('<script src="https://cortiq.se/v/5.5.16/cortiq.js" integrity="sha384-x"></script>'), '5.5.16');
  assert.equal(snippetVersion('<script id="cortiq-tracking-js" defer src="https://example.test/wp-content/plugins/cortiq-analytics/assets/cortiq.js?ver=5.5.13"></script>'), '5.5.13');
  assert.equal(snippetVersion('<script src="https://example.test/cortiq.min.js?a=1&ver=5.4.0"></script>'), '5.4.0');
  assert.equal(snippetVersion('<script src="https://cortiq.se/cortiq.js"></script><script>window.cortiqConfig={}</script>'), null);
  assert.equal(snippetVersion('<script src="/other.js?ver=1.2.3"></script>'), null, 'another plugin\'s ?ver= is not ours');
  assert.equal(snippetVersion('<script src="/v/latest/cortiq.js"></script>'), null);
  assert.equal(snippetVersion(''), null);
});

test('classify returns the version only for a page that loaded', () => {
  assert.equal(classify(200, '<script src="/v/5.5.16/cortiq.js"></script>').snippetVersion, '5.5.16');
  assert.equal(classify(503, '<script src="/v/5.5.16/cortiq.js"></script>').snippetVersion, null);
});

async function db() {
  const pg = new PGlite();
  await pg.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE TABLE public.sites (id uuid PRIMARY KEY, user_id uuid NOT NULL, domain text, is_active boolean DEFAULT true);
    INSERT INTO public.sites (id, user_id, domain) VALUES ('${S1}', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'example.test');
  `);
  await pg.exec(read('../../supabase/migrations/20261130000001_site_uptime.sql'));
  await pg.exec(read('../../supabase/migrations/20261204000001_uptime_snippet_version.sql'));
  return pg;
}
const record = (pg, problem, found, version, minute) => pg.query(
  `SELECT public.record_uptime_check($1, $2, $3, $4, $5, $6, $7)`,
  [S1, problem, problem ? 503 : 200, problem ? 'HTTP 503' : null, found, `2026-11-19T12:${String(minute).padStart(2, '0')}:00Z`, version]);
const version = async (pg) => (await pg.query(`SELECT snippet_version FROM public.site_uptime WHERE site_id = $1`, [S1])).rows[0]?.snippet_version;

test('PostgreSQL: version survives a down check and a page without a version; a new version replaces it', async () => {
  const pg = await db();
  try {
    await record(pg, null, true, '5.5.13', 0);
    assert.equal(await version(pg), '5.5.13');
    await record(pg, 'down', null, null, 5);
    assert.equal(await version(pg), '5.5.13', 'a failed fetch does not clear it');
    await record(pg, null, true, null, 10);
    assert.equal(await version(pg), '5.5.13', 'a page where no version was read does not clear it');
    await record(pg, null, true, '5.5.16', 15);
    assert.equal(await version(pg), '5.5.16');
    await record(pg, null, true, 'not-a-version', 20);
    assert.equal(await version(pg), '5.5.16', 'only x.y.z is stored');
  } finally { await pg.close(); }
});

test('PostgreSQL: the old 6-argument call still works and the new signature is service_role only', async () => {
  const pg = await db();
  try {
    await pg.query(`SELECT public.record_uptime_check($1, NULL, 200, NULL, true, '2026-11-19T12:00:00Z')`, [S1]);
    assert.equal(await version(pg), null);
    const grants = (await pg.query(`
      SELECT grantee FROM information_schema.routine_privileges
       WHERE routine_name = 'record_uptime_check' AND privilege_type = 'EXECUTE' ORDER BY grantee`)).rows.map((r) => r.grantee);
    assert.ok(grants.includes('service_role'));
    assert.ok(!grants.includes('authenticated') && !grants.includes('anon') && !grants.includes('PUBLIC'));
  } finally { await pg.close(); }
});
