import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { migrate, migrationContext, MIGRATION_LABEL } from '../../supabase/functions/_shared/gtm-audit/migrate.ts';
import { MIGRATION_CLASSES } from '../../supabase/functions/_shared/gtm-audit/types.ts';
import { tag, tpl, trigger, customEvent, template, tplType, exportOf, ALL_PAGES } from '../../scripts/gtm-audit/fixture.mjs';

const html = (src) => tpl('html', `<script src="${src}"></script>`);
const triggers = [
  customEvent(10, 'CE - marketing consent', 'cookie_consent_marketing'),
  customEvent(15, 'CE - lead', 'generate_lead'),
  trigger(12, 'Form submit - contact', 'FORM_SUBMISSION'),
];
const templates = [
  template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] }),
  template(22, 'Cookiebot CMP', { permissions: { inject_script: ['https://*.cookiebot.com/*'], access_consent: [] }, gallery: ['cybotcorp', 'gtm-templates'] }),
  template(25, 'Mystery template', { gallery: ['example-dev', 'mystery'] }),
];
const classes = (tags) => {
  const c = parse(exportOf({ tags, triggers, templates }));
  const infos = tagInfos(c);
  const ctx = migrationContext(c, infos);
  return Object.fromEntries(infos.map((i) => [i.tag.name, migrate(i, ctx)]));
};

test('every class has a label', () => {
  assert.deepEqual(Object.keys(MIGRATION_LABEL).sort(), [...MIGRATION_CLASSES].sort());
});

test('remove: paused, no trigger, duplicates after the first, Universal Analytics', () => {
  const ga = (id) => tag(id, `GA4 lead ${id}`, 'gaawe', [tpl('eventName', 'generate_lead'), tpl('measurementIdOverride', 'G-SAMPLE')], { fire: [15] });
  const m = classes([
    tag(1, 'Paused', 'html', [html('https://snap.licdn.com/li.lms-analytics/insight.min.js')], { paused: true }),
    tag(2, 'No trigger', 'html', [], { fire: [] }),
    ga(3), ga(4),
    tag(5, 'UA pageview', 'ua'),
  ]);
  assert.equal(m.Paused.migration, 'remove');
  assert.equal(m['No trigger'].migration, 'remove');
  assert.equal(m['GA4 lead 3'].migration, 'keep_google');
  assert.equal(m['GA4 lead 4'].migration, 'remove');
  assert.match(m['GA4 lead 4'].reason, /Duplicate of GA4 lead 3/);
  assert.equal(m['UA pageview'].migration, 'remove');
  assert.match(m['UA pageview'].reason, /no longer processes data/);
});

test('consent_tool and covered', () => {
  const m = classes([
    tag(1, 'Cookiebot', tplType(22), [], { fire: ['2147479572'] }),
    tag(2, 'UTM saver', 'html', [tpl('html', "<script>var p=new URLSearchParams(location.search);if(p.get('utm_source'))sessionStorage.setItem('utm',p.toString())</script>")]),
    tag(3, 'Clarity', 'html', [html('https://www.clarity.ms/tag/abc123')]),
    tag(4, 'HubSpot listener', 'html', [tpl('html', "<script>window.addEventListener('message',function(e){if(e.data.eventName==='onFormSubmitted'){dataLayer.push({event:'hs_submit'})}})</script>")]),
  ]);
  assert.equal(m.Cookiebot.migration, 'consent_tool');
  for (const name of ['UTM saver', 'Clarity', 'HubSpot listener']) assert.equal(m[name].migration, 'covered', name);
  assert.match(m.Clarity.reason, /Session replay/);
});

test('conversion vs pixel for Google Ads and pixel vendors', () => {
  const m = classes([
    tag(1, 'Ads conversion', 'awct'),
    tag(2, 'Ads remarketing', 'sp'),
    tag(3, 'Meta PageView', tplType(20), [tpl('eventName', 'standard'), tpl('standardEventName', 'PageView')], { fire: [10] }),
    tag(4, 'Meta Lead', tplType(20), [tpl('eventName', 'standard'), tpl('standardEventName', 'Lead')], { fire: [12] }),
    tag(5, 'LinkedIn insight', 'html', [html('https://snap.licdn.com/li.lms-analytics/insight.min.js')]),
    tag(6, 'LinkedIn on lead event', 'html', [tpl('html', '<img src="https://px.ads.linkedin.com/collect/?pid=1234&fmt=gif">')], { fire: [15] }),
    tag(7, 'Reddit custom', 'html', [tpl('html', "<script src=\"https://www.redditstatic.com/ads/pixel.js\"></script><script>rdt('track', 'SignUp')</script>")]),
  ]);
  assert.equal(m['Ads conversion'].migration, 'conversion');
  assert.equal(m['Ads remarketing'].migration, 'pixel');
  assert.equal(m['Meta PageView'].migration, 'pixel');
  assert.equal(m['Meta Lead'].migration, 'conversion');
  assert.equal(m['LinkedIn insight'].migration, 'pixel');
  assert.equal(m['LinkedIn on lead event'].migration, 'conversion');
  assert.equal(m['Reddit custom'].migration, 'conversion');
});

test('keep_google, third_party and review', () => {
  const m = classes([
    tag(1, 'Google tag', 'googtag', [tpl('tagId', 'G-SAMPLE')]),
    tag(2, 'Linker', 'gclidw'),
    tag(3, 'Clay', 'html', [html('https://static.claydar.com/t.js')]),
    tag(4, 'Chat', 'html', [html('https://cdn.example-chat.com/w.js')]),
    tag(5, 'Mystery', tplType(25)),
    tag(6, 'jsDelivr lib', 'html', [html('https://cdn.jsdelivr.net/npm/some-lib@1/x.js')]),
  ]);
  assert.equal(m['Google tag'].migration, 'keep_google');
  assert.equal(m.Linker.migration, 'keep_google');
  assert.equal(m.Clay.migration, 'third_party');
  assert.equal(m.Chat.migration, 'review');
  assert.equal(m.Mystery.migration, 'review');
  assert.equal(m['jsDelivr lib'].migration, 'review');
});
