// tests/foundation/nav-sections.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NAV_SECTIONS, SETTINGS_ITEMS, numberedLabel } from '../../src/components/dashboard/nav/navSections.ts';

// Every tab value that DashboardTabs renders must be reachable from the menu exactly once.
const tabsSource = readFileSync(new URL('../../src/components/dashboard/DashboardTabs.tsx', import.meta.url), 'utf8');
const rendered = new Set([...tabsSource.matchAll(/TabsContent\s+value="([^"]+)"/g)].map((m) => m[1]));

test('menu covers every rendered tab exactly once', () => {
  const all = [...NAV_SECTIONS.flatMap((s) => s.items), ...SETTINGS_ITEMS].map((i) => i.value);
  assert.equal(new Set(all).size, all.length, 'duplicate menu entry');
  for (const v of rendered) assert.ok(all.includes(v), `tab "${v}" missing from menu`);
  for (const v of all) assert.ok(rendered.has(v), `menu entry "${v}" has no TabsContent`);
});

test('sections are numbered 1..n and items get n.m labels', () => {
  NAV_SECTIONS.forEach((s, i) => assert.equal(s.number, i + 1));
  assert.equal(numberedLabel(1, 0), '1.1');
  assert.equal(numberedLabel(4, 2), '4.3');
});

test('overview is the first item', () => {
  assert.equal(NAV_SECTIONS[0].items[0].value, 'overview');
});

test('sidebar opens the section of the active tab whenever the tab changes', () => {
  const sidebar = readFileSync(new URL('../../src/components/dashboard/nav/DashboardSidebar.tsx', import.meta.url), 'utf8');
  assert.match(sidebar, /useEffect\(\(\) => \{[\s\S]*owning[\s\S]*\}, \[owning\]\)/);
});

test('hidden tabs are out of the menu and not rendered, but explain themselves', async () => {
  const { HIDDEN_TABS } = await import('../../src/components/dashboard/nav/navSections.ts');
  const all = [...NAV_SECTIONS.flatMap((s) => s.items), ...SETTINGS_ITEMS].map((i) => i.value);
  for (const v of ['session-recording', 'abtesting', 'advanced-features']) {
    assert.ok(HIDDEN_TABS[v], `${v} has a message`);
    assert.ok(!all.includes(v), `${v} not in menu`);
    assert.ok(!rendered.has(v), `${v} not rendered`);
  }
});

test('settings and live tabs show no filter-scope notice', () => {
  const set = tabsSource.match(/NO_FILTER_NOTICE = new Set\(\[([\s\S]*?)\]\)/)[1];
  for (const v of ['setup', 'integrations', 'realtime', 'alerts', 'gdpr']) assert.match(set, new RegExp(`'${v}'`));
});
