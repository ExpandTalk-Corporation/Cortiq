// A necessary-only choice is asked again after 180 days (accepted: 365); never on every visit.
// Withdrawing analytics consent also removes the bot-probe page counter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const banner = readFileSync('public/consent-banner.js', 'utf8');
const plugin = readFileSync('wordpress-plugin/cortiq-analytics.php', 'utf8');
const tracker = readFileSync('public/spa-tracking.js', 'utf8');

test('standalone banner: reject kept 180 days by default, accept 365, attribute clamped 1-400', () => {
  assert.match(banner, /rejectDays\s*:\s*clampDays\(attr\('data-reprompt-reject-days'\), 180\)/);
  assert.match(banner, /\? 365 : cfg\.rejectDays\)/);
  const clamp = banner.match(/function clampDays\(value, fallback\) \{[\s\S]*?\n  \}/)[0];
  const clampDays = new Function(`${clamp}; return clampDays;`)();
  assert.equal(clampDays(null, 180), 180);
  assert.equal(clampDays('0', 180), 180);
  assert.equal(clampDays('401', 180), 180);
  assert.equal(clampDays('90', 180), 90);
});

test('WP plugin: separate reject cooldown, default 180, used for save, freshness and backfill', () => {
  assert.match(plugin, /'reprompt_reject_days'\s*=> 180/);
  assert.match(plugin, /\$clean\['reprompt_reject_days'\]\s*= \( \$rd >= 1 && \$rd <= 400 \) \? \$rd : 180;/);
  assert.match(plugin, /expiresAt:new Date\(now\+\(pref\|\|anal\|\|mark \? MAX_AGE : MAX_AGE_REJECT\)\)/);
  assert.match(plugin, /< ageFor\(existing\)\)/);
  assert.match(plugin, /existing\.timestamp\+ageFor\(existing\)/);
});

test('tracker: withdrawal removes _ciq_adp with the session keys', () => {
  const block = tracker.slice(tracker.indexOf('function updateConsent('), tracker.indexOf('startAnalytics();', tracker.indexOf('function updateConsent(')));
  assert.match(block, /sessionStorage\.removeItem\('_ciq_adp'\)/);
});
