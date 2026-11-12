// tests/foundation/policy-confirmations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { policyChecklist } from '../../src/lib/policyChecklist.ts';

test('PostgreSQL: policy confirmations are append-only and isolated per site owner', async () => {
  const db = new PGlite();
  const fixture = readFileSync(new URL('./policy-confirmations-rls.sql', import.meta.url), 'utf8');
  const migration = readFileSync(new URL('../../supabase/migrations/20261105000001_policy_confirmations.sql', import.meta.url), 'utf8');
  try {
    await assert.doesNotReject(db.exec(fixture.replace(/^\\ir .*$/m, () => migration)));
  } finally {
    await db.close();
  }
});

test('policy checklist follows the tracking mode and marketing choice', () => {
  const cookieless = policyChecklist({ trackingMode: 'cookieless', marketing: false }).join('\n');
  assert.match(cookieless, /Expandtalk Corporation AB/);
  assert.match(cookieless, /heatmaps/);
  assert.match(cookieless, /sessionStorage until the tab is closed/);
  assert.match(cookieless, /memory only/);
  assert.match(cookieless, /Bot checks/);
  assert.equal(/Device details|click IDs/.test(cookieless), false);

  const full = policyChecklist({ trackingMode: 'full', marketing: false }).join('\n');
  assert.match(full, /sessionStorage/);
  assert.match(full, /Device details/);
  assert.equal(/memory only/.test(full), false);
  assert.equal(/click IDs|Google Ads/.test(full), false);

  const fullMarketing = policyChecklist({ trackingMode: 'full', marketing: true }).join('\n');
  assert.match(fullMarketing, /click IDs/);
  assert.match(fullMarketing, /SHA-256/);
  assert.match(fullMarketing, /Google Ads/);

  // Marketing is impossible in cookieless mode, so it never reaches the checklist.
  assert.equal(policyChecklist({ trackingMode: 'cookieless', marketing: true }).join('\n'), cookieless);
});
