import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKING_VENDORS, vendorForUrl, vendorForName, cookieCategory, extractVendorIds, isGoogleHost } from '../../supabase/functions/_shared/tracking-vendors.ts';

test('every vendor is complete and ids are unique', () => {
  const ids = new Set();
  for (const v of TRACKING_VENDORS) {
    assert.ok(!ids.has(v.id), `duplicate ${v.id}`); ids.add(v.id);
    assert.ok(['necessary', 'analytics', 'marketing', 'preferences'].includes(v.category), v.id);
    assert.ok(v.requests.length > 0, `${v.id} needs a request matcher`);
    assert.ok(v.impact.length > 10, `${v.id} needs an impact sentence`);
    if (v.category !== 'necessary') assert.ok(Object.keys(v.csp).length > 0, `${v.id} needs CSP domains`);
  }
});

test('classifies request URLs, including gtag by ID prefix', () => {
  const cases = {
    'https://js.hs-scripts.com/7117856.js': 'hubspot',
    'https://js-eu1.hs-analytics.net/analytics/1/7117856.js': 'hubspot',
    'https://forms.hsforms.com/submissions/v3': 'hubspot-forms',
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123': 'gtm',
    'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL': 'ga4',
    'https://www.googletagmanager.com/gtag/js?id=AW-18424645060': 'google-ads',
    'https://region1.google-analytics.com/g/collect?v=2&tid=G-6J9DFZLXNL': 'ga4',
    'https://www.google.com/pagead/1p-conversion/18424645060/': 'google-ads',
    'https://www.google.com/recaptcha/api.js': 'recaptcha',
    'https://connect.facebook.net/en_US/fbevents.js': 'meta',
    'https://cdn-cookieyes.com/client_data/abc/script.js': 'cookieyes',
    'https://example.com/app.js': null,
  };
  for (const [url, id] of Object.entries(cases)) assert.equal(vendorForUrl(url)?.id ?? null, id, url);
});

test('attributes cookies and storage keys and falls back to the cookie-scanner list', () => {
  assert.equal(vendorForName('__hstc')?.id, 'hubspot');
  assert.equal(vendorForName('_ga_6J9DFZLXNL')?.id, 'ga4');
  assert.equal(cookieCategory('_gcl_aw'), 'marketing');
  assert.equal(cookieCategory('wp-settings-1'), 'necessary');
  assert.equal(cookieCategory('totally_unknown'), null);
});

test('extracts account and container IDs', () => {
  const ids = extractVendorIds([
    'https://js.hs-scripts.com/7117856.js',
    'https://www.googletagmanager.com/gtm.js?id=GTM-ABC123',
    'https://www.googletagmanager.com/gtag/js?id=G-6J9DFZLXNL',
    'https://www.googletagmanager.com/gtag/js?id=AW-18424645060',
  ]);
  assert.deepEqual([...ids.get('hubspot')], ['7117856']);
  assert.deepEqual([...ids.get('gtm')], ['GTM-ABC123']);
  assert.deepEqual([...ids.get('ga4')], ['G-6J9DFZLXNL']);
  assert.deepEqual([...ids.get('google-ads')], ['AW-18424645060']);
});

test('isGoogleHost covers Google-owned endpoints and exempts Google Fonts and reCAPTCHA', () => {
  for (const url of ['https://stats.g.doubleclick.net/g/collect', 'https://www.google.se/pagead/1p-user-list/1/', 'https://www.google.co.uk/ads/ga-audiences',
    'https://adservice.google.com/ddm/fls/z', 'https://pagead2.googlesyndication.com/x', 'https://www.googleadservices.com/pagead/conversion.js',
    'https://region1.google-analytics.com/g/collect', 'https://analytics.google.com/g/collect', 'https://www.googletagmanager.com/gtm.js?id=GTM-1']) {
    assert.equal(isGoogleHost(url), true, url);
  }
  for (const url of ['https://fonts.googleapis.com/css2', 'https://fonts.gstatic.com/s/x.woff2', 'https://www.google.com/recaptcha/api.js',
    'https://notgoogle.com/x', 'https://google.example.com/x', 'not a url']) {
    assert.equal(isGoogleHost(url), false, url);
  }
});
