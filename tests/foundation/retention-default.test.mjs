// The default retention period is 365 days. Public copy (privacy page, docs, landing page)
// states it, so code, comments and the latest migrations must not drift to another value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();

function latestDefining(pattern) {
  const f = [...migrations].reverse().find((m) => pattern.test(readFileSync(`supabase/migrations/${m}`, 'utf8')));
  assert.ok(f, `no migration matches ${pattern}`);
  return readFileSync(`supabase/migrations/${f}`, 'utf8');
}

test('run_data_retention falls back to 365 days', () => {
  const sql = latestDefining(/CREATE OR REPLACE FUNCTION public\.run_data_retention\(/);
  assert.match(sql, /coalesce\(g\.data_retention_days, 365\)/);
});

test('companies.consent_settings default says 365 days', () => {
  const sql = latestDefining(/consent_settings[\s\S]*?"data_retention_days"/);
  assert.match(sql, /"data_retention_days": 365/);
});

test('no 730-day retention default in edge functions or dashboard code', () => {
  for (const f of ['supabase/functions/data-retention/index.ts', 'src/hooks/useGDPR.tsx', 'src/components/gdpr/GDPRSettings.tsx']) {
    // 730 is a valid choice in the settings menu ("2 years"); only a 730 default is wrong.
    assert.doesNotMatch(readFileSync(f, 'utf8'), /default 730|\|\| 730|data_retention_days: 730/, f);
  }
});

test('public copy states 365 days', () => {
  assert.match(readFileSync('src/pages/Privacy.tsx', 'utf8'), /default 365 days/);
});
