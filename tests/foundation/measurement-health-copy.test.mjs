import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS, SIGNALS, checkSentence, compareVersions, trackerVersionStatus } from '../../supabase/functions/_shared/measurement-health.ts';
import { CONVERSION_ALERT_KINDS } from '../../supabase/functions/_shared/conversion-alerts.ts';

const EVIDENCE = {
  uptime: { open: [], checked_at: '2026-11-19T11:00:00Z', snippet_version: null, snippet_seen_at: null },
  pipelines: { open: [{ pipeline: 'page_views' }] },
  goals_configured: { goals: 0 },
  goal_health: { sessions_30d: 10, primary_goals: 2, goals: [{ id: 'g1', name: 'signup', hits_30d: 0, issue: 'silent' }, { id: 'g2', name: 'engaged', hits_30d: 4, issue: 'fires_too_often' }] },
  consent_rate: { choices_7d: 30, choices_prior_28d: 40, rate_7d: 63.3, rate_prior_28d: 80 },
  conversions: { open: [{ kind: 'goal_silent' }] },
};

test('every check key has a label, a fix tab and a sentence for every status', () => {
  for (const key of Object.keys(CHECKS)) {
    for (const status of ['ok', 'warning', 'broken', 'unknown']) {
      const s = checkSentence({ key, status, evidence: EVIDENCE[key] });
      assert.ok(s.length > 10 && !s.includes('undefined') && !s.includes('NaN'), `${key}/${status}: ${s}`);
    }
  }
  assert.deepEqual(Object.keys(CHECKS), ['uptime', 'pipelines', 'goals_configured', 'goal_health', 'consent_rate', 'conversions']);
  assert.equal(Object.keys(SIGNALS).length, 10);
  assert.equal(Object.keys(CONVERSION_ALERT_KINDS).length, 3);
});

test('sentences carry their evidence', () => {
  assert.equal(checkSentence({ key: 'goal_health', status: 'warning', evidence: EVIDENCE.goal_health }),
    'No conversions in 30 days: signup. Fires on more than 30% of sessions: engaged. More than one primary goal (2).');
  assert.equal(checkSentence({ key: 'consent_rate', status: 'warning', evidence: EVIDENCE.consent_rate }),
    'Analytics acceptance fell to 63.3% in the last 7 days from 80% in the 28 days before. Check the banner and its texts.');
  assert.equal(checkSentence({ key: 'consent_rate', status: 'unknown', evidence: { choices_7d: 3, choices_prior_28d: 12, rate_7d: 100, rate_prior_28d: 50 } }),
    'Too few consent choices to compare (3 in the last 7 days, 12 in the 28 days before; 30 needed in each).');
});

const MANIFEST = { latest: '5.5.16', versions: { '5.5.13': { securityFix: false }, '5.5.14': { securityFix: true }, '5.5.15': { securityFix: false }, '5.5.16': { securityFix: false } } };

test('tracker version: latest, older, missed security fix, unknown', () => {
  assert.ok(compareVersions('5.5.9', '5.5.13') < 0 && compareVersions('5.10.0', '5.9.9') > 0 && compareVersions('5.5.16', '5.5.16') === 0);
  assert.equal(trackerVersionStatus(null, MANIFEST), null);
  assert.equal(trackerVersionStatus('5.5.16', MANIFEST).status, 'ok');
  assert.deepEqual(trackerVersionStatus('5.5.15', MANIFEST), { status: 'warning', message: 'Tracker 5.5.15 on the home page; the latest is 5.5.16.' });
  assert.deepEqual(trackerVersionStatus('5.5.13', MANIFEST), { status: 'broken', message: 'Tracker 5.5.13 on the home page misses the security fix in 5.5.14; the latest is 5.5.16. Update the plugin or the pinned snippet.' });
  assert.equal(trackerVersionStatus('5.5.9', MANIFEST).status, 'broken', 'older than any manifest entry still sees the fix');
});
