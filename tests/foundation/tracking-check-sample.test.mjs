import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSample, render } from '../../scripts/tracking-check/sample-report.mjs';

test('the landing page sample report is the current assess() output', () => {
  const committed = readFileSync(new URL('../../src/data/trackingCheckSample.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(committed, render(buildSample()), 'run: node scripts/tracking-check/sample-report.mjs');
});

test('the sample shows each kind of finding, and the email finding does not echo the address', () => {
  const { findings } = buildSample();
  for (const status of ['fail', 'manual', 'pass']) assert.ok(findings.some((f) => f.status === status), status);
  const email = findings.find((f) => f.checkKey === 'privacy.email_in_url');
  assert.equal(email?.status, 'fail');
  assert.doesNotMatch(JSON.stringify(email), /test@|test%40/);
});
