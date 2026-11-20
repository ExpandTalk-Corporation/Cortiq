// tests/foundation/reported-channel-ui.test.mjs
// Attribution layer 1.5 dashboard: aggregate parsing, "fewer than 5", n next to every percentage,
// and the copy rules from the jurist review 2026-11-20 (spec 2026-11-12-attribution-models-and-ai-influence.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  parseReportedChannel, formatCount, formatShare, percent, mismatches, mismatchLabel,
  rowsToMap, mapToRows, noticeTemplate, NOTICE_ADAPT_NOTE, FORM_FIELD_PATTERN, HUBSPOT_PROPERTY_PATTERN,
  REPORTED_CHANNELS, rangeDays, MIN_RANGE_DAYS,
} from '../../src/lib/reportedChannel.ts';

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');
const UI = [
  '../../src/components/dashboard/ReportedChannelCard.tsx',
  '../../src/components/dashboard/ReportedChannelSettings.tsx',
  '../../src/lib/reportedChannel.ts',
];

test('parse: hidden counts stay hidden, never become a number', () => {
  const s = parseReportedChannel({
    conversions: { n: 40, lt5: false },
    answered: { n: 12, lt5: false },
    matched: { n: null, lt5: true },
    reported: [{ channel: 'ai_assistant', n: 7, lt5: false }, { channel: 'podcast', n: null, lt5: true }],
    cells: [
      { reported: 'ai_assistant', observed: 'direct', n: 6, lt5: false },
      { reported: 'podcast', observed: 'podcast', n: null, lt5: true },
      { reported: 'event', observed: 'unknown', n: null, lt5: true },
    ],
  });
  assert.equal(formatCount(s.matched), 'fewer than 5');
  assert.equal(s.reported[1].n, null);
  assert.equal(formatShare(s.answered, s.conversions), '12 of 40 (30 %)');
  assert.equal(formatShare(s.reported[1], s.answered), 'fewer than 5 of 12');
  assert.equal(percent(s.matched, s.answered), null);
  assert.deepEqual(mismatches(s).map(mismatchLabel), [
    'said AI assistant, arrived direct',
    'said Event, no tracked visit',
  ]);
  const empty = parseReportedChannel(null);
  assert.deepEqual(empty.conversions, { n: 0, lt5: false });
  assert.equal(formatShare(empty.answered, empty.conversions), '0 of 0');
});

test('parse: complementary-hidden counts and rounded totals', () => {
  const s = parseReportedChannel({
    conversions: { n: 20, lt5: false, rounded: true },
    answered: { n: 15, lt5: false, rounded: true },
    matched: { n: 0, lt5: false },
    reported: [{ channel: 'colleague_or_friend', n: null, lt5: false, hidden: true }, { channel: 'podcast', n: null, lt5: true }],
    cells: [{ reported: 'colleague_or_friend', observed: 'unknown', n: 5, lt5: false, hidden: true }],
  });
  assert.equal(s.cells[0].n, null, 'a hidden count never carries a number');
  assert.equal(formatCount(s.reported[0]), 'hidden');
  assert.equal(formatCount(s.answered), 'about 15');
  assert.equal(formatShare(s.reported[0], s.answered), 'hidden of about 15');
  assert.equal(percent(s.reported[0], s.answered), null);
  assert.equal(formatShare(s.answered, s.conversions), 'about 15 of about 20 (75 %)');
});

test('date range: at least 7 whole days, in the database and in the card', () => {
  assert.equal(rangeDays('2026-11-14', '2026-11-20'), 7, 'the "Last 7 days" preset qualifies');
  assert.equal(rangeDays('2026-11-15', '2026-11-20'), 6);
  assert.equal(rangeDays('2026-11-20', '2026-11-19'), 0);
  assert.equal(MIN_RANGE_DAYS, 7);
  const hook = read('../../src/hooks/useReportedChannel.ts');
  assert.match(hook, /enabled: !!siteId && !tooShort/, 'a short range is never sent');
  const card = read(UI[0]);
  assert.match(card, /tooShort/);
  assert.match(card, /at least \{MIN_RANGE_DAYS\} days/);
  assert.match(card, /Counts are suppressed or rounded/);
  assert.match(card, /totals are rounded to the nearest 5/);
  const sql = read('../../supabase/migrations/20261210000001_reported_channel.sql');
  assert.match(sql, /p_to - p_from < 6 THEN\s+RAISE EXCEPTION 'range must be at least 7 days'/);
});

test('settings: value map and field validation match the database constraint', () => {
  const { map, errors } = rowsToMap([
    { answer: '  ChatGPT ', channel: 'ai_assistant' },
    { answer: 'chatgpt', channel: 'other' },
    { answer: '', channel: '' },
    { answer: 'Podcast', channel: '' },
  ]);
  assert.deepEqual(map, { chatgpt: 'ai_assistant' });
  assert.equal(errors.length, 1);
  assert.deepEqual(mapToRows({ chatgpt: 'ai_assistant', x: 'not_a_category' }), [{ answer: 'chatgpt', channel: 'ai_assistant' }]);
  assert.ok(FORM_FIELD_PATTERN.test('how_did_you_hear'));
  assert.ok(FORM_FIELD_PATTERN.test('fields[source]'));
  assert.ok(!FORM_FIELD_PATTERN.test('#source select'));
  assert.ok(!FORM_FIELD_PATTERN.test('input[name="x"]'));
  assert.ok(HUBSPOT_PROPERTY_PATTERN.test('how_did_you_hear'));
  assert.ok(!HUBSPOT_PROPERTY_PATTERN.test('how did you hear'));
  // Migration and frontend agree on the patterns.
  const sql = read('../../supabase/migrations/20261210000001_reported_channel.sql');
  assert.match(sql, /reported_channel_form_field ~ '\^\[A-Za-z0-9_\.:\\\[\\\]-\]\{1,100\}\$'/);
  assert.match(sql, /reported_channel_hubspot_property ~ '\^\[A-Za-z0-9_\]\{1,100\}\$'/);
  assert.equal(REPORTED_CHANNELS.length, 13);
});

test('notice templates name the consent and the category, not a promise of compliance', () => {
  for (const path of ['form', 'hubspot']) {
    const t = noticeTemplate(path, 'Acme');
    assert.match(t, /Acme/);
    assert.match(t, /category/);
    assert.match(t, /withdraw your consent/);
    assert.match(t, /\(optional\)/);
  }
  assert.match(noticeTemplate('form', ''), /the Statistics category in our cookie settings/);
  assert.match(noticeTemplate('hubspot', ''), /the Marketing category in our cookie settings/);
  assert.match(read(UI[1]), /NOTICE_ADAPT_NOTE/);
  assert.match(NOTICE_ADAPT_NOTE, /[Tt]ranslate/);
});

test('policy-version gate: no prefill from the banner, a new version and a confirmation to switch on', () => {
  const settings = read(UI[1]);
  assert.doesNotMatch(settings, /config\.bannerPolicyVersion \?\?/, 'never prefilled from the banner version');
  assert.match(settings, /pv === config\.bannerPolicyVersion/);
  assert.match(settings, /type="checkbox"/);
  assert.match(settings, /I have updated the banner and privacy texts/);
  assert.match(settings, /built-in banner never qualifies/);
  assert.match(settings, /same visit where the visitor made the banner choice/);
  assert.match(settings, /fill in the property themselves/);
  assert.match(settings, /workflow webhook that includes the contact&apos;s email/);
  const sql = read('../../supabase/migrations/20261210000001_reported_channel.sql');
  assert.match(sql, /coalesce\(c\.updated_at, c\.created_at\) >= s\.reported_channel_enabled_at/);
  assert.match(sql, /s\.reported_channel_enabled_at IS NOT NULL/);
});

test('copy: allowed wording present, never-list absent', () => {
  const card = read(UI[0]);
  const settings = read(UI[1]);
  assert.match(card, /Self-reported source/);
  assert.match(card, /recall, not fact/);
  assert.match(card, /[Aa]nswer rate/);
  assert.match(card, /[Ww]hat buyers say/);
  assert.match(card, /formatShare\(data\.answered, data\.conversions\)/, 'answer rate is always shown with n');
  assert.match(settings, /sensitive/i);
  assert.match(settings, /noticeTemplate\(/);
  for (const f of UI) {
    const src = read(f);
    for (const never of [/true source/i, /true attribution/i, /dark funnel revealed/i, /\banonymous/i,
      /no consent needed/i, /GDPR-compliant/i, /AI assistants? drove/i]) {
      assert.doesNotMatch(src, never, `${f}: ${never}`);
    }
    // Never a percentage without its count next to it.
    assert.doesNotMatch(src, /\{percent\(/, `${f}: percent() rendered without n`);
  }
});

test('Attribution tab shows the card in every state; settings sit under Integrations', () => {
  const tab = read('../../src/components/dashboard/tabs/AttributionTab.tsx');
  assert.equal((tab.match(/<ReportedChannelCard /g) ?? []).length, 3);
  const integrations = read('../../src/components/dashboard/tabs/ExternalIntegrationsTab.tsx');
  assert.match(integrations, /<ReportedChannelSettings /);
  const wizard = read('../../src/components/dashboard/HubSpotIntegrationWizard.tsx');
  assert.match(wizard, /how did you hear about us/i);
});
