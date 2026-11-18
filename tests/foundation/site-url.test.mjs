import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { bareHost, siteHomeUrl, isOnSite } from '../../src/lib/siteUrl.ts';

test('siteHomeUrl and bareHost normalise stored domains', () => {
  assert.equal(siteHomeUrl('cortiq.se'), 'https://cortiq.se/');
  assert.equal(siteHomeUrl('https://ekonom.biz'), 'https://ekonom.biz/');
  assert.equal(siteHomeUrl(''), '');
  assert.equal(bareHost('https://WWW.Expandtalk.se/x?y=1'), 'expandtalk.se');
});

test('isOnSite matches the domain and subdomains only', () => {
  assert.equal(isOnSite('https://EXPANDTALK.SE', 'expandtalk.se'), true);
  assert.equal(isOnSite('https://blog.cortiq.se/a', 'https://cortiq.se'), true);
  assert.equal(isOnSite('https://paligo.net/', 'cortiq.se'), false);
  assert.equal(isOnSite('https://notcortiq.se/', 'cortiq.se'), false);
});

test('AI Visibility takes the selected site from the dashboard, not its own useSites()', () => {
  const tab = readFileSync(new URL('../../src/components/dashboard/tabs/AIVisibilityTab.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(tab, /useSites/);
  assert.match(tab, /siteHomeUrl\(siteDomain\)/);
  const tabs = readFileSync(new URL('../../src/components/dashboard/DashboardTabs.tsx', import.meta.url), 'utf8');
  assert.match(tabs, /<AIVisibilityTab siteId=\{selectedSite\.id\} siteDomain=\{selectedSite\.domain\}/);
});
