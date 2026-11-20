import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jurisdictionDb, asUser, OWNER, OTHER, ADMIN, S1, S2 } from './jurisdiction-db-fixture.mjs';

const save = (pg, site, est, markets, answers) => pg.query(
  'SELECT public.save_site_legal_profile($1, $2, $3, $4::jsonb)', [site, est, markets, JSON.stringify(answers)]);

test('profile: owner saves through the RPC, each save is logged, others are refused', async () => {
  const pg = await jurisdictionDb();
  try {
    await asUser(pg, OWNER, () => save(pg, S1, 'se', ['eu', 'us_ca'], { us_ccpa: 'dont_know' }));
    await asUser(pg, OWNER, () => save(pg, S1, 'SE', ['eu'], {}));
    const row = (await pg.query(`SELECT establishment_country, markets, answers FROM site_legal_profiles WHERE site_id = '${S1}'`)).rows[0];
    assert.deepEqual(row, { establishment_country: 'SE', markets: ['eu'], answers: {} });
    assert.equal(Number((await pg.query(`SELECT count(*) n FROM site_legal_profile_log WHERE site_id = '${S1}'`)).rows[0].n), 2);
    await assert.rejects(asUser(pg, OTHER, () => save(pg, S1, 'SE', ['eu'], {})), /not_owner/);
    await assert.rejects(asUser(pg, OWNER, () => save(pg, S1, 'SE', ['mars'], {})), /check/i);
    await assert.rejects(asUser(pg, OWNER, () => save(pg, S1, 'SE', ['eu'], { us_ccpa: 'maybe' })), /invalid_answers/);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO site_legal_profiles (site_id) VALUES ('${S1}')`)), /policy|permission/i);
    const seen = await asUser(pg, OTHER, () => pg.query('SELECT * FROM site_legal_profiles'));
    assert.equal(seen.rows.length, 0, 'RLS hides other owners');
  } finally { await pg.close(); }
});

test('tightening: owner can set opt_in/off only, never a relaxing value; RLS per owner', async () => {
  const pg = await jurisdictionDb();
  try {
    await asUser(pg, OWNER, () => pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'statistics', 'opt_in')`));
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'conversion', 'allowed')`)), /check/i);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S2}', 'statistics', 'off')`)), /policy/i);
    const rows = await asUser(pg, OWNER, () => pg.query('SELECT set_by FROM site_jurisdiction_tighten'));
    assert.deepEqual(rows.rows, [{ set_by: OWNER }]);
  } finally { await pg.close(); }
});

test('exceptions: no customer write path, at most 12 months; test sites admin-only', async () => {
  const pg = await jurisdictionDb();
  try {
    const ins = (months) => pg.query(`INSERT INTO jurisdiction_exceptions (site_id, rule_id, jurisdiction, purpose, legal_basis, assessment_ref, approved_by, approved_at, expires_at)
      VALUES ('${S1}', 'eu.attribution.li@1', 'eu', 'attribution', 'legitimate_interest', 'LIA-1', '${ADMIN}', '2026-11-01', '2026-11-01'::timestamptz + interval '${months} months')`);
    await assert.rejects(asUser(pg, OWNER, () => ins(6)), /policy/i);
    await assert.rejects(ins(13), /check/i);
    await ins(12);
    await assert.rejects(asUser(pg, OWNER, () => pg.query(`INSERT INTO jurisdiction_test_sites (site_id) VALUES ('${S1}')`)), /policy/i);
    await asUser(pg, ADMIN, () => pg.query(`INSERT INTO jurisdiction_test_sites (site_id) VALUES ('${S1}')`));
    assert.equal((await asUser(pg, OWNER, () => pg.query('SELECT * FROM jurisdiction_test_sites'))).rows.length, 0);
  } finally { await pg.close(); }
});

test('get_site_jurisdiction: service role only, unexpired exceptions only, null profile when unanswered', async () => {
  const pg = await jurisdictionDb();
  try {
    const empty = (await pg.query(`SELECT public.get_site_jurisdiction('${S2}') j`)).rows[0].j;
    assert.deepEqual(empty, { profile: null, tighten: {}, exceptions: [], testSite: false });
    await asUser(pg, OWNER, () => save(pg, S1, 'SE', ['eu'], { us_ccpa: 'no' }));
    await pg.exec(`INSERT INTO site_jurisdiction_tighten (site_id, purpose, setting) VALUES ('${S1}', 'statistics', 'off');
      INSERT INTO jurisdiction_test_sites (site_id) VALUES ('${S1}');
      INSERT INTO jurisdiction_exceptions (site_id, rule_id, jurisdiction, purpose, legal_basis, assessment_ref, approved_by, approved_at, expires_at) VALUES
        ('${S1}', 'eu.a@1', 'eu', 'attribution', 'lb', 'A', '${ADMIN}', now() - interval '1 day', now() + interval '30 days'),
        ('${S1}', 'eu.b@1', 'eu', 'attribution', 'lb', 'B', '${ADMIN}', now() - interval '60 days', now() - interval '1 day');`);
    const j = (await pg.query(`SELECT public.get_site_jurisdiction('${S1}') j`)).rows[0].j;
    assert.deepEqual(j.profile, { establishment_country: 'SE', markets: ['eu'], answers: { us_ccpa: 'no' } });
    assert.deepEqual(j.tighten, { statistics: 'off' });
    assert.deepEqual(j.exceptions.map((e) => [e.ruleId, e.jurisdiction, e.purpose, e.legalBasis]), [['eu.a@1', 'eu', 'attribution', 'lb']]);
    assert.equal(j.testSite, true);
    for (const role of ['anon', 'authenticated']) {
      const g = (await pg.query(`SELECT has_function_privilege('${role}', 'public.get_site_jurisdiction(uuid)', 'EXECUTE') a`)).rows[0].a;
      assert.equal(g, false, role);
    }
  } finally { await pg.close(); }
});
