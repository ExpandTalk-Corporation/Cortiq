// tests/foundation/jurisdiction-docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('CLAUDE.md and the runbook carry the operating rules', () => {
  const md = read('../../CLAUDE.md');
  const section = md.slice(md.indexOf('## Jurisdiction rule engine'));
  for (const s of ['_shared/jurisdiction/', 'JURISDICTION_ENFORCE', 'approved_internal', 'tighten', 'jurisdiction_decisions_daily', 'docs/runbooks/jurisdiction-enforcement.md', 'not legal advice'])
    assert.ok(section.includes(s), s);
  const rb = read('../../docs/runbooks/jurisdiction-enforcement.md');
  for (const s of ['shadow', 'coverage_by_country', 'jurist', 'roll back', 'db push']) assert.ok(rb.toLowerCase().includes(s.toLowerCase()), s);
  for (const bad of [/no consent needed/i, /GDPR-compliant without consent/i, /no banner needed/i]) {
    assert.doesNotMatch(section, bad);
    assert.doesNotMatch(rb, bad);
  }
});
