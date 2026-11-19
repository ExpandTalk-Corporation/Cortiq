// Wiring checks for the Measurement health tab (rendering is checked by hand against the dev server).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

test('the alerts tab keeps its id and is labelled Measurement health', () => {
  assert.match(read('src/components/dashboard/nav/navSections.ts'), /\{ value: 'alerts', label: 'Measurement health' \}/);
});

test('tab order: summary, open alerts, signals, behavioural alerts', () => {
  const tabs = read('src/components/dashboard/DashboardTabs.tsx');
  const block = tabs.slice(tabs.indexOf('<TabsContent value="alerts"'), tabs.indexOf('</TabsContent>', tabs.indexOf('<TabsContent value="alerts"')));
  const order = ['<HealthSummary', '<PipelineAlerts', '<SignalTable', '<BehavioralAlertsTab'].map((t) => block.indexOf(t));
  assert.ok(order.every((i) => i > 0), 'all four are present');
  assert.deepEqual([...order].sort((a, b) => a - b), order);
});

test('the hook is keyed on the site id (no site-switch race, #159)', () => {
  const hook = read('src/hooks/useMeasurementHealth.ts');
  assert.match(hook, /queryKey: \['measurement-health', siteId\]/);
  assert.match(hook, /rpc\('get_measurement_health', \{ p_site_id: siteId \}\)/);
});

test('PipelineAlerts reads open conversion alerts for the site', () => {
  const src = read('src/components/dashboard/overview/PipelineAlerts.tsx');
  assert.match(src, /from\('conversion_alerts'\)/);
  assert.match(src, /conversionAlertSentence/);
});

test('the all-clear only renders when the pipeline, uptime and conversion alert queries all succeeded', () => {
  const src = read('src/components/dashboard/overview/PipelineAlerts.tsx');
  assert.match(src, /if \(!showAllClear \|\| !isSuccess \|\| !uptimeSuccess \|\| !conversionsSuccess\) return null;/);
});

test('the Fix button does not crash on a check key missing from CHECKS', () => {
  const src = read('src/components/dashboard/health/MeasurementHealth.tsx');
  assert.match(src, /const fixTab = CHECKS\[c\.key\]\?\.fixTab;/);
  assert.doesNotMatch(src, /onNavigate\(CHECKS\[c\.key\]\.fixTab\)/);
});
