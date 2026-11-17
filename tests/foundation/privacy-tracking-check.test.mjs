// The privacy policy's Tracking Check section (src/pages/Privacy.tsx, section 4A) states limits,
// retention and capabilities of the tool. These tests fail when the code changes and the policy
// would then say something the code no longer does.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const privacy = readFileSync('src/pages/Privacy.tsx', 'utf8');
const start = readFileSync('supabase/functions/tracking-check-start/index.ts', 'utf8');
const section = privacy.slice(privacy.indexOf('4A. Tracking Check'), privacy.indexOf('{/* Visitor Analytics with Consent */}'));
// Visible text only: JSX comments hold the owner's TODOs and may mention things the page must not.
const visible = section.replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

const migrations = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql')).sort();
const latestDefining = (pattern) => {
  const f = [...migrations].reverse().find((m) => pattern.test(readFileSync(`supabase/migrations/${m}`, 'utf8')));
  assert.ok(f, `no migration matches ${pattern}`);
  return readFileSync(`supabase/migrations/${f}`, 'utf8');
};

test('the section exists and names Expandtalk as controller', () => {
  assert.ok(section.length > 0, 'section 4A missing');
  assert.match(visible, /Expandtalk Corporation AB is the <strong>controller<\/strong>/);
  assert.match(visible, /not the controller for our\s+processing/);
  assert.match(visible, /Art\. 6\(1\)\(b\)/);
  assert.match(visible, /Art\. 6\(1\)\(f\)/);
});

test('stated manual-run quota and schedule cap match tracking-check-start', () => {
  const runs = Number(start.match(/export const STANDARD = \{[^}]*runsPerDay: (\d+)/)[1]);
  const schedules = Number(start.match(/export const SCHEDULES = \{[^}]*standard: (\d+)/)[1]);
  assert.match(visible, new RegExp(`at most ${runs} per 24 hours`));
  assert.match(visible, new RegExp(`your active schedules \\(at most ${schedules}\\)`));
  assert.match(start, /\.eq\('trigger', 'manual'\)/, 'quota counts only manual runs, as the policy says');
});

test('stated raw-data retention matches the latest tracking_check_retention()', () => {
  const sql = latestDefining(/CREATE (OR REPLACE )?FUNCTION public\.tracking_check_retention\(/);
  const days = Number(sql.match(/tracking_check_observations WHERE created_at < now\(\) - interval '(\d+) days'/)[1]);
  assert.match(visible, new RegExp(`deleted after ${days} days`));
  assert.match(privacy, new RegExp(`Raw page data is deleted after ${days} days`), 'section 9 summary');
});

test('share-link expiry cap matches the share action', () => {
  const max = Number(start.match(/Math\.min\(body\.expiresInDays, (\d+)\)/)[1]);
  assert.match(visible, new RegExp(`at most ${max} days`));
});

test('"no login credentials" holds only while the start function refuses basic auth', () => {
  assert.match(visible, /does not accept login credentials/);
  assert.match(start, /if \(body\.basicAuth\?\.username\) throw new InputError/,
    'basic auth was re-enabled: describe credential storage and deletion in section 4A first');
});

test('"no screenshots" holds: the Tracking Check code takes none', () => {
  assert.match(visible, /does not take screenshots/);
  const dir = 'supabase/functions/_shared/tracking-check';
  const files = [
    ...readdirSync(dir).filter((f) => /\.(ts|js)$/.test(f)).map((f) => `${dir}/${f}`),
    'supabase/functions/tracking-check-start/index.ts', 'supabase/functions/tracking-check-worker/index.ts',
  ];
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /screenshot\(/i, f);
});

test('the policy does not claim the Hetzner browser, which is not live', () => {
  assert.doesNotMatch(visible, /Hetzner/);
  assert.match(visible, /Browserless/);
});
