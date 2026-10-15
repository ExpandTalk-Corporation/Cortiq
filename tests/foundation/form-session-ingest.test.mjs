// tests/foundation/form-session-ingest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('PostgreSQL: record_form_session stores sessions and keeps form_analytics in step', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.form_sessions (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL,
        session_id text NOT NULL, form_id text NOT NULL, form_type text NOT NULL, started_at timestamptz NOT NULL,
        completed_at timestamptz, abandoned_at timestamptz, completion_time int, fields_completed int,
        total_fields int, error_count int, device_type text, user_agent text, ip_address text,
        created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.form_analytics (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), site_id uuid NOT NULL,
        form_id text NOT NULL, form_name text, form_type text NOT NULL, total_starts int DEFAULT 0,
        total_completions int DEFAULT 0, total_abandons int DEFAULT 0, avg_completion_time int,
        conversion_rate numeric, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
    `);
    await db.exec(read('../../supabase/migrations/20261015120000_form_session_ingest.sql'));
    const site = '11111111-1111-4111-8111-111111111111';
    const call = (form, status, dur, type = 'contact_form_7') => db.query(
      `SELECT public.record_form_session($1,'s1',$2,'Contact',$3,$4,$5,3,5,1,'mobile')`, [site, form, type, status, dur]);
    await call('cf7_1', 'completed', 40);
    await call('cf7_1', 'abandoned', 10);
    await call('cf7_1', 'completed', 20);
    await call('cf7_1', 'bogus', 5);                       // ignored
    await call('', 'completed', 5);                        // ignored
    await call('sentrisk_abc', 'completed', 0, 'sentrisk');

    const { rows } = await db.query(`SELECT form_id, form_type, total_starts, total_completions, total_abandons,
      avg_completion_time, conversion_rate::float AS cr FROM form_analytics ORDER BY form_id`);
    assert.equal(rows.length, 2, 'one analytics row per form');
    assert.deepEqual(rows[0], { form_id: 'cf7_1', form_type: 'contact_form_7', total_starts: 3, total_completions: 2,
      total_abandons: 1, avg_completion_time: 30, cr: 66.67 });
    assert.equal(rows[1].form_type, 'sentrisk');
    const { rows: s } = await db.query(`SELECT count(*)::int AS n FROM form_sessions`);
    assert.equal(s[0].n, 4);
  } finally {
    await db.close();
  }
});

test('track-event routes form_session events and SentriSK submits to record_form_session', () => {
  const src = read('../../supabase/functions/track-event/index.ts');
  assert.match(src, /'form_session'/);
  assert.match(src, /rpc\('record_form_session'/);
  assert.match(src, /form_provider === 'sentrisk'/);
});
