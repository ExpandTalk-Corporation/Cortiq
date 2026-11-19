// Spec 2026-11-19 §3: facts are computed on the server; the model may only cite them as {{mN}}.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildFacts, bareNumbers, factLine, formatFact, splitTokens, validateInsight } from '../../supabase/functions/_shared/insight-facts.ts';

const INPUT = {
  period: { from: '2026-11-12', to: '2026-11-18' },
  previous: { from: '2026-11-05', to: '2026-11-11' },
  summary: { total_page_views: 1200, total_sessions: 400, top_pages: [{ path: '/pricing', views: 300 }], device_breakdown: { desktop: 250 } },
  previousSummary: { total_page_views: 1000, total_sessions: 380 },
  heatmapCount: 90,
  formSessions: [
    { form_id: 'contact', completed_at: '2026-11-13T10:00:00Z', abandoned_at: null },
    { form_id: 'contact', completed_at: null, abandoned_at: '2026-11-14T10:00:00Z' },
    { form_id: 'contact', completed_at: null, abandoned_at: '2026-11-15T10:00:00Z' },
  ],
  lifetimeForms: [{ form_name: 'Newsletter {{m1}}', total_starts: 50, total_completions: 20 }],
  conversionEvents: [{ event_name: 'signup' }, { event_name: 'signup' }],
  healthChecks: [{ key: 'uptime', status: 'ok' }, { key: 'pipelines', status: 'warning' }],
};

test('buildFacts: stable ids, formulas, previous period as separate facts, row counts', () => {
  const facts = buildFacts(INPUT);
  assert.deepEqual(facts.map((f) => f.id), facts.map((_, i) => `m${i + 1}`));
  const by = (label) => facts.find((f) => f.label === label);
  assert.equal(by('Page views').value, 1200);
  assert.deepEqual(by('Page views (previous period)').period, INPUT.previous);
  assert.equal(by('Page views: change from previous period').value, 200);
  assert.equal(by('Page views: change from previous period').formula, 'current - previous');
  assert.equal(by('Pages per session').value, 3);
  assert.equal(by("Page '/pricing': views").value, 300);
  const abandon = by("Form 'contact': abandon rate");
  assert.deepEqual([abandon.value, abandon.unit, abandon.formula, abandon.rows], [66.7, 'percent', 'abandoned / (completed + abandoned)', 3]);
  assert.equal(by("Form 'contact': starts").formula, 'completed + abandoned');
  assert.equal(by("Conversion events 'signup'").value, 2);
  assert.equal(by('Measurement checks not ok').value, 1);
  const lifetime = facts.find((f) => f.label.startsWith("Form 'Newsletter"));
  assert.ok(lifetime.label.includes('LIFETIME') && !lifetime.label.includes('{{'), 'labels cannot smuggle tokens');
  assert.equal(factLine(abandon), `${abandon.id} | Form 'contact': abandon rate | 66.7 percent | 2026-11-12..2026-11-18`);
});

test('buildFacts: no previous summary and zero sessions produce no division or delta facts', () => {
  const facts = buildFacts({ ...INPUT, previousSummary: null, summary: { total_page_views: 0, total_sessions: 0 }, formSessions: [], lifetimeForms: [], conversionEvents: [], healthChecks: [] });
  assert.deepEqual(facts.map((f) => f.label), ['Page views', 'Sessions', 'Heatmap interactions']);
});

test('bareNumbers: catches digits outside tokens, allows names and URL paths', () => {
  assert.deepEqual(bareNumbers('Views rose to {{m1}} ({{m2}} more) on /blog/2026/ and GA4, H1 and utm_content2 look fine'), []);
  assert.deepEqual(bareNumbers('41% of visitors'), ['41%']);
  assert.deepEqual(bareNumbers('about 3.5 times, 1,200 views, 5x more, the 3rd page'), ['3.5', '1,200', '5x', '3rd']);
  assert.deepEqual(bareNumbers('see {{m1} and {m2}}'), ['{{m1}', '{m2}}'], 'broken braces are never allowed');
  assert.deepEqual(bareNumbers('(/pricing-2) works'), []);
});

test('validateInsight: accepts tokenised text, rejects bare digits, unknown ids and no tokens', () => {
  const facts = buildFacts(INPUT);
  const abandonId = facts.find((f) => f.label === "Form 'contact': abandon rate").id;
  const ok = validateInsight({ title: 'Contact form loses visitors', description: `{{${abandonId}}} of starts are abandoned`, actionItems: ['Shorten the form'] }, facts);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.factIds, [abandonId]);
  const bare = validateInsight({ title: 'Form', description: '67% abandon {{m1}}', actionItems: [] }, facts);
  assert.deepEqual(bare.errors, ['number "67%" written without a fact token']);
  const unknown = validateInsight({ title: 'X', description: 'see {{m99}}', actionItems: [] }, facts);
  assert.deepEqual(unknown.errors, ['unknown fact {{m99}}', 'no fact token: every insight must cite at least one fact']);
  const none = validateInsight({ title: 'Improve SEO', description: 'Write better titles', actionItems: ['Do it'] }, facts);
  assert.equal(none.ok, false);
  const inAction = validateInsight({ title: 'T', description: 'D {{m1}}', actionItems: ['Fix the top 3 pages'] }, facts);
  assert.equal(inAction.ok, false, 'action items are checked too');
});

test('formatFact and splitTokens', () => {
  const f = (unit, value) => ({ id: 'm1', label: 'x', value, unit, source: 's', period: INPUT.period, formula: 'f', rows: 1 });
  assert.equal(formatFact(f('count', 12345)), '12,345');
  assert.equal(formatFact(f('count', -200)), '-200');
  assert.equal(formatFact(f('percent', 41.23)), '41.2 %');
  assert.equal(formatFact(f('seconds', 72)), '1 m 12 s');
  assert.equal(formatFact(f('seconds', 9)), '9 s');
  assert.equal(formatFact(f('ratio', 3)), '3.00');
  assert.deepEqual(splitTokens('A {{m1}} b {{ m22 }}.'), ['A ', { id: 'm1' }, ' b ', { id: 'm22' }, '.']);
  assert.deepEqual(splitTokens('Legacy text with 12 views'), ['Legacy text with 12 views']);
});
