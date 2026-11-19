// The SQL rule constants and the TypeScript copy used for UI text must never drift apart.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CONVERSION_ALERT_THRESHOLDS } from '../../supabase/functions/_shared/conversion-alerts.ts';

const sql = readFileSync(new URL('../../supabase/migrations/20261204000002_conversion_alerts.sql', import.meta.url), 'utf8');
const constant = (name) => {
  const m = sql.match(new RegExp(`${name}\\s+CONSTANT\\s+\\w+\\s*:=\\s*([0-9.]+)`));
  assert.ok(m, `${name} is declared in the migration`);
  return Number(m[1]);
};

test('SQL constants equal CONVERSION_ALERT_THRESHOLDS', () => {
  assert.deepEqual({
    goalMinPriorHits: constant('c_goal_min_prior_hits'),
    goalMinSiteViews: constant('c_goal_min_site_views'),
    formZeroMinStarts: constant('c_form_zero_min_starts'),
    spikeMinStarts: constant('c_spike_min_starts'),
    spikeOpenPp: constant('c_spike_open_pp'),
    spikeClosePp: constant('c_spike_close_pp'),
    retentionDays: constant('c_retention_days'),
  }, { ...CONVERSION_ALERT_THRESHOLDS });
});
