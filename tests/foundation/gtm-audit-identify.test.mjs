import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { identify, urlsInHtml, vendorForPattern } from '../../supabase/functions/_shared/gtm-audit/identify.ts';
import { galleryEntry, GALLERY } from '../../supabase/functions/_shared/gtm-audit/gallery-map.ts';
import { TRACKING_VENDORS } from '../../supabase/functions/_shared/tracking-vendors.ts';
import { tag, tpl, template, tplType, exportOf } from '../../scripts/gtm-audit/fixture.mjs';

const one = (t, templates = []) => {
  const c = parse(exportOf({ tags: [t], templates }));
  return identify(c.tags[0], c);
};

test('built-in types map to registry vendors; googtag by tagId prefix', () => {
  assert.equal(one(tag(1, 'GT', 'googtag', [tpl('tagId', 'G-SAMPLE')])).vendorId, 'ga4');
  assert.equal(one(tag(1, 'GT', 'googtag', [tpl('tagId', 'AW-123')])).vendorId, 'google-ads');
  assert.deepEqual(one(tag(1, 'Ev', 'gaawe')), { vendorId: 'ga4', source: 'builtin-type', templateOrigin: null, urls: [], covers: null });
  assert.equal(one(tag(1, 'UET', 'baut')).vendorId, 'microsoft-ads');
  assert.equal(one(tag(1, 'Weird', 'zzz_unknown')).source, 'none');
});

test('Custom HTML and image tags: URLs from src and quoted literals', () => {
  const li = one(tag(1, 'LI', 'html', [tpl('html', '<script>(function(){var s=document.createElement("script");s.src="https://snap.licdn.com/li.lms-analytics/insight.min.js";})();</script>')]));
  assert.deepEqual([li.vendorId, li.source], ['linkedin', 'custom-html-url']);
  assert.equal(one(tag(1, 'HJ', 'html', [tpl('html', "<script>h._hjSettings={};a.src='//static.hotjar.com/c/hotjar-1.js'</script>")])).vendorId, 'hotjar');
  assert.equal(one(tag(1, 'Img', 'img', [tpl('url', 'https://px.ads.linkedin.com/collect/?pid=1')])).vendorId, 'linkedin');
  const plain = one(tag(1, 'Inline', 'html', [tpl('html', '<script>window.dataLayer.push({a:1})</script>')]));
  assert.deepEqual([plain.vendorId, plain.source, plain.urls], [null, 'none', []]);
  assert.deepEqual(urlsInHtml('<img src="//cdn.example.com/a.gif"><a href=\'https://example.com/x?y=1\'>'), ['https://cdn.example.com/a.gif', 'https://example.com/x?y=1']);
});

test('template permissions identify the vendor, official only via the gallery map', () => {
  const meta = one(tag(1, 'Meta', tplType(20)), [template(20, 'Meta Pixel', {
    permissions: { inject_script: ['https://connect.facebook.net/en_US/fbevents.js'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'],
  })]);
  assert.deepEqual([meta.vendorId, meta.source, meta.templateOrigin], ['meta', 'template-permissions', 'official']);
  const unofficial = one(tag(1, 'Clay', tplType(24)), [template(24, 'Clay', {
    permissions: { inject_script: ['https://static.claydar.com/*'] }, gallery: ['Jude-Nwachukwu', 'gtm-clay-web-intent-tag'],
  })]);
  assert.deepEqual([unofficial.vendorId, unofficial.templateOrigin], ['claydar', 'community']);
  const noGallery = one(tag(1, 'Own', tplType(25)), [template(25, 'Own', { permissions: { inject_script: ['https://cdn.example-widgets.com/*'] } })]);
  assert.deepEqual([noGallery.vendorId, noGallery.source, noGallery.templateOrigin], [null, 'none', 'community']);
});

test('gallery reference is the fallback when permissions name no known host', () => {
  const tt = one(tag(1, 'TikTok', tplType(26)), [template(26, 'TikTok Pixel', { permissions: { send_pixel: [] }, gallery: ['tiktok', 'gtm-template-pixel'] })]);
  assert.deepEqual([tt.vendorId, tt.source, tt.templateOrigin], ['tiktok-pixel', 'gallery-reference', 'official']);
  const utm = one(tag(1, 'UTM', tplType(27)), [template(27, 'Persist', { permissions: { set_cookies: [] }, gallery: ['gtm-templates-simo-ahava', 'persist-campaign-data'] })]);
  assert.deepEqual([utm.vendorId, utm.covers, utm.templateOrigin], [null, 'utm', 'community']);
  assert.equal(galleryEntry({ owner: 'Jude-Nwachukwu', repository: 'something-else' }), null);
  assert.equal(galleryEntry(null), null);
});

// Review Focus 5: infrastructure + vendor URLs, and wildcard hosts.
test('skips infrastructure URLs and resolves wildcard hosts', () => {
  const cb = one(tag(1, 'CMP', tplType(22)), [template(22, 'CMP', {
    permissions: { inject_script: ['https://cdn.jsdelivr.net/npm/helper@1/*', 'https://*.cookiebot.com/*'], access_consent: [] },
  })]);
  assert.deepEqual([cb.vendorId, cb.source], ['cookiebot', 'template-permissions']);
  const li = one(tag(1, 'LI', tplType(21)), [template(21, 'LI', { permissions: { inject_script: ['https://snap.licdn.com/*'] } })]);
  assert.equal(li.vendorId, 'linkedin');
  const cdnOnly = one(tag(1, 'CDN', tplType(28)), [template(28, 'CDN', { permissions: { inject_script: ['https://cdn.jsdelivr.net/*'] } })]);
  assert.equal(cdnOnly.vendorId, null);
});

// I1: vendorForPattern's wildcard fallback must not match shared hosting/infra domains, bare TLDs, or
// unrelated Google products, but must still resolve a genuine vendor's own wildcarded domain, including
// protocol-relative patterns.
test('wildcard fallback rejects shared infra and bare TLDs, resolves real vendor domains', () => {
  const idOf = (pattern) => vendorForPattern(pattern)?.id ?? null;
  assert.equal(idOf('https://*.amazonaws.com/*'), null);
  assert.equal(idOf('https://*.cloudfront.net/*'), null);
  assert.equal(idOf('https://*.net/*'), null);
  assert.equal(idOf('https://*.google.com/*'), null);
  assert.equal(idOf('https://*.linkedin.com/*'), 'linkedin');
  assert.equal(idOf('//*.linkedin.com/*'), 'linkedin');
});

// T3b: every GALLERY entry must point at a vendor the registry actually knows, or the audit silently
// attributes tags to a vendor id that resolves to nothing everywhere else.
test('every gallery vendorId exists in TRACKING_VENDORS', () => {
  const ids = new Set(TRACKING_VENDORS.map((v) => v.id));
  for (const [key, entry] of Object.entries(GALLERY)) {
    if (entry.vendorId === null) continue;
    assert.ok(ids.has(entry.vendorId), `${key} -> ${entry.vendorId} not in TRACKING_VENDORS`);
  }
});
