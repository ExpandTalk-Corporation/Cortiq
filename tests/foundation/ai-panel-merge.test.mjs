// "Ask AI" and "Generate insights" are one surface: the header AI panel. The Overview only links
// to it, insights run for the dashboard period, and every insight keeps its verify path
// (the "verify against the sources" note and the agent_runs record behind it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

const src = (p) => new URL(`../../src/${p}`, import.meta.url);
const read = (p) => readFileSync(src(p), 'utf8');

test('the Overview widget is gone; Overview opens the panel with the insights action', () => {
  assert.equal(existsSync(src('components/dashboard/AIInsightsWidget.tsx')), false);
  const tab = read('components/dashboard/tabs/OverviewTab.tsx');
  assert.doesNotMatch(tab, /AIInsightsWidget/);
  assert.match(tab, /openPanel\('insights'\)/);
  assert.match(tab, /Generate insights for this period/);
});

test('the header owns the panel state through the shared context', () => {
  const header = read('components/dashboard/DashboardHeader.tsx');
  assert.match(header, /useAIAssistantPanel\(\)/);
  assert.match(header, /<AIAssistantPanel[^>]*open=\{aiPanel\.open\}/);
  assert.match(read('pages/Dashboard.tsx'), /<AIAssistantProvider>/);
});

test('the panel offers the starter action and runs a pending one', () => {
  const panel = read('components/dashboard/AIAssistantPanel.tsx');
  assert.match(panel, /Generate insights for this period/);
  assert.match(panel, /pendingAction === 'insights'/);
  assert.match(panel, /consumeAction\(\)/);
  assert.match(panel, /useDashboardFilters\(\)/);
  assert.match(panel, /<InsightCard/);
});

test('insights are generated for the dashboard period by generate-dashboard-insights', () => {
  const hook = read('hooks/useAIAssistant.ts');
  assert.match(hook, /functions\.invoke\('generate-dashboard-insights'/);
  assert.match(hook, /body:\s*\{\s*siteId,\s*from:\s*range\.from,\s*to:\s*range\.to\s*\}/);
  // The chat history carries a text summary so follow-up questions can refer to the suggestions.
  assert.match(hook, /content:\s*insightsSummary\(/);
});

test('each insight card keeps the verify path', () => {
  const card = read('components/dashboard/ai/InsightCard.tsx');
  assert.match(card, /verify against the sources/);
  assert.match(card, /from\('agent_runs'\)/);
  assert.match(card, /queries_run/);
});
