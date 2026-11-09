import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRACKING_VENDORS, vendorForUrl, vendorForName, cookieCategory, extractVendorIds, isGoogleHost, isGoogleDomain } from '../../supabase/functions/_shared/tracking-vendors.ts';

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
    'https://region1.analytics.google.com/g/collect?v=2&tid=G-1': 'ga4',
    'https://stats.g.doubleclick.net/g/collect?v=2&tid=G-1': 'ga4',
    'https://www.google.nl/ads/ga-audiences?v=1&t=sr': 'google-ads',
    'https://www.google.se/pagead/1p-user-list/123/': 'google-ads',
    'https://www.google.nl/search?q=x': null,
    'https://www.google.com/recaptcha/api.js': 'recaptcha',
    'https://connect.facebook.net/en_US/fbevents.js': 'meta',
    'https://cdn-cookieyes.com/client_data/abc/script.js': 'cookieyes',
    'https://www.pretec.se/Admin/Public/CookieOptInLevelConfig': 'dynamicweb',
    'https://js.hsadspixel.net/fb.js': 'hubspot-ads',
    'https://pagead2.googlesyndication.com/ccm/collect?en=page_view': 'google-ads',
    'https://sc.lfeeder.com/lftracker_v1_ywVkO4X6MV18Z6Bj.js': 'leadfeeder',
    'https://js.zi-scripts.com/zi-tag.js': 'zoominfo',
    'https://ws.zoominfo.com/pixel/abc': 'zoominfo',
    'https://static.claydar.com/init.v1.js?id=cxOZuQoVl3': 'claydar',
    'https://tags.inzynk.io/bpedxeoi/iztag.js': 'inzynk',
    'https://js.chilipiper.com/marketing.js': 'chilipiper',
    'https://launcher.1mind.com/deployment-n8bthh9zt8': '1mind',
    'https://example.com/app.js': null,
  };
  for (const [url, id] of Object.entries(cases)) assert.equal(vendorForUrl(url)?.id ?? null, id, url);
});

test('attributes cookies and storage keys and falls back to the cookie-scanner list', () => {
  assert.equal(vendorForName('__hstc')?.id, 'hubspot');
  assert.equal(vendorForName('_ga_6J9DFZLXNL')?.id, 'ga4');
  assert.equal(vendorForName('Dynamicweb.CookieOptInLevel')?.id, 'dynamicweb');
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

test('vendor kinds: CMPs and infrastructure are marked in the registry', () => {
  for (const v of TRACKING_VENDORS) assert.ok([undefined, 'tag', 'cmp', 'infrastructure'].includes(v.kind), v.id);
  const ids = (kind) => TRACKING_VENDORS.filter((v) => v.kind === kind).map((v) => v.id).sort();
  assert.deepEqual(ids('cmp'), ['complianz', 'cookiebot', 'cookieyes', 'dynamicweb', 'onetrust']);
  assert.deepEqual(ids('infrastructure'), ['akamai', 'cloudflare', 'google-fonts', 'public-cdn', 'recaptcha']);
});

test('Cloudflare Turnstile on a challenges subdomain is infrastructure, not an unknown third party', () => {
  assert.equal(vendorForUrl('https://brunhild.challenges.cloudflare.com/cdn-cgi/challenge-platform/h/b/turnstile/if/ov2/av0/rcv/x')?.id, 'cloudflare');
  assert.equal(vendorForUrl('https://challenges.cloudflare.com/turnstile/v0/api.js')?.id, 'cloudflare');
  assert.equal(vendorForUrl('https://evilchallenges.cloudflare.com/x')?.id ?? null, null);
});

test('YouTube: both embed modes, thumbnails and video are one vendor', () => {
  for (const url of ['https://www.youtube.com/embed/x', 'https://www.youtube-nocookie.com/embed/x', 'https://i.ytimg.com/vi/x/hqdefault.jpg', 'https://rr1---sn-abc.googlevideo.com/videoplayback']) {
    assert.equal(vendorForUrl(url)?.id, 'youtube', url);
  }
  assert.equal(vendorForName('VISITOR_INFO1_LIVE')?.id, 'youtube');
});

test('social and media embeds are verify vendors; Meta Pixel and the LinkedIn Insight Tag stay separate', () => {
  const cases = {
    'https://connect.facebook.net/sv_SE/sdk.js': 'facebook-embed',
    'https://www.facebook.com/plugins/post.php?href=x': 'facebook-embed',
    'https://connect.facebook.net/en_US/fbevents.js': 'meta',
    'https://www.facebook.com/tr?id=123&ev=PageView': 'meta',
    'https://platform.twitter.com/widgets.js': 'x-embed',
    'https://cdn.syndication.twimg.com/tweet-result?id=1': 'x-embed',
    'https://www.instagram.com/embed.js': 'instagram-embed',
    'https://www.linkedin.com/embed/feed/update/urn:li:share:1': 'linkedin-embed',
    'https://px.ads.linkedin.com/collect?pid=1': 'linkedin',
    'https://www.tiktok.com/embed.js': 'tiktok-embed',
    'https://assets.pinterest.com/js/pinit.js': 'pinterest-embed',
    'https://player.vimeo.com/video/76979871': 'vimeo',
    'https://open.spotify.com/embed/episode/abc': 'spotify-embed',
    'https://w.soundcloud.com/player/?url=x': 'soundcloud-embed',
    'https://www.google.com/maps/embed?pb=x': 'google-maps',
    'https://maps.googleapis.com/maps/api/js?key=x': 'google-maps',
  };
  for (const [url, id] of Object.entries(cases)) assert.equal(vendorForUrl(url)?.id ?? null, id, url);
  for (const id of ['facebook-embed', 'x-embed', 'instagram-embed', 'linkedin-embed', 'tiktok-embed', 'pinterest-embed', 'vimeo', 'spotify-embed', 'soundcloud-embed', 'google-maps']) {
    const v = TRACKING_VENDORS.find((x) => x.id === id);
    assert.equal(v.category, 'preferences', id);
    assert.match(v.verify, /click-to-load preview loads nothing until the visitor asks/, id);
  }
});

test('GA4 hits through server-side tagging on the site\'s own domain are GA4', () => {
  assert.equal(vendorForUrl('https://analytics.paligo.net/g/collect?v=2&tid=G-ABC123&gcs=G100')?.id, 'ga4');
  assert.equal(vendorForUrl('https://sgtm.example.com/g/collect?tid=G-1&en=page_view')?.id, 'ga4');
  // Only the GA4 collect endpoint with a measurement ID counts, not any /g/collect path.
  assert.equal(vendorForUrl('https://example.com/g/collect?v=2')?.id ?? null, null);
  assert.equal(vendorForUrl('https://example.com/blog/g/collect?tid=G-1')?.id ?? null, null);
  assert.ok(isGoogleHost('https://analytics.paligo.net/g/collect?v=2&tid=G-ABC123'));
  for (const name of ['FPID', 'FPLC', 'FPGSID']) assert.equal(vendorForName(name)?.id, 'ga4', name);
  assert.ok(!isGoogleDomain('analytics.paligo.net'));
  assert.ok(isGoogleDomain('region1.google-analytics.com'));
});

test('IP lookup services are their own verify vendor', () => {
  for (const url of ['https://api.ipify.org/?format=json', 'https://api64.ipify.org', 'https://ipapi.co/json/', 'https://ipinfo.io/json', 'http://ip-api.com/json', 'https://ipwho.is/']) {
    const v = vendorForUrl(url);
    assert.equal(v?.id, 'ip-lookup', url);
    assert.ok(v.verify, url);
  }
  assert.equal(vendorForUrl('https://notipify.org/x')?.id ?? null, null);
});

test('LinkedIn guest cookie li_gc belongs to the Insight Tag', () => {
  assert.equal(vendorForName('li_gc')?.id, 'linkedin');
});

// Observed on www.pwc.se 2026-11-09.
test('requests made by the YouTube player are YouTube, not Google Ads or unknown', () => {
  for (const url of [
    'https://googleads.g.doubleclick.net/pagead/id',
    'https://googleads.g.doubleclick.net/pagead/id?slf_rd=1',
    'https://static.doubleclick.net/instream/ad_status.js',
    'https://www.google.com/js/th/vDHXfwLklOGBA29eJTGPChyKGuyg0c4xxy4REdrgFBs.js',
    'https://jnn-pa.googleapis.com/$rpc/google.internal.waa.v1.Waa/GenerateIT',
  ]) assert.equal(vendorForUrl(url)?.id, 'youtube', url);
  assert.equal(vendorForUrl('https://googleads.g.doubleclick.net/pagead/viewthroughconversion/123/?random=1')?.id, 'google-ads');
  assert.equal(vendorForName('__Secure-YNID')?.id, 'youtube');
});

test('MUID alone is not Microsoft Advertising: Clarity sets it too', () => {
  assert.notEqual(vendorForName('MUID')?.id, 'microsoft-ads');
  assert.equal(vendorForName('_uetsid')?.id, 'microsoft-ads');
  assert.equal(vendorForName('ANONCHK')?.id, 'clarity');
});

test('Adobe Experience Cloud is split by product', () => {
  const urls = {
    'https://assets.adobedtm.com/a1b2/launch-EN123.min.js': 'adobe-tags',
    'https://pwcglsc.tt.omtrdc.net/rest/v1/delivery?client=pwcglsc': 'adobe-target',
    'https://pwc.sc.omtrdc.net/b/ss/pwcglobal/1/JS-2.22.0/s123': 'adobe-analytics',
    'https://pwcglsc.data.adobedc.net/ee/v1/interact?configId=x': 'adobe-edge',
    'https://dpm.demdex.net/id?d_visid_ver=5': 'adobe-ecid',
    'https://dpm.demdex.net/ibs:dpid=411&dpuuid=x': 'adobe-audience-manager',
  };
  for (const [url, id] of Object.entries(urls)) assert.equal(vendorForUrl(url)?.id, id, url);
  const cookies = {
    s_cc: 'adobe-analytics', gpv: 'adobe-analytics', s_ppv: 'adobe-analytics', s_ppvl: 'adobe-analytics', s_nr: 'adobe-analytics',
    mbox: 'adobe-target', at_check: 'adobe-target',
    'AMCV_6E281E28623307580A495F87%40AdobeOrg': 'adobe-ecid', 'AMCVS_6E281E28623307580A495F87%40AdobeOrg': 'adobe-ecid',
    demdex: 'adobe-audience-manager', dpm: 'adobe-audience-manager',
  };
  for (const [name, id] of Object.entries(cookies)) assert.equal(vendorForName(name)?.id, id, name);
  assert.equal(vendorForUrl('https://assets.adobedtm.com/x.js').category, 'necessary');
  assert.equal(vendorForName('mbox').category, 'marketing');
  assert.equal(vendorForName('AMCV_1%40AdobeOrg').category, 'analytics');
});

test('Contentsquare, Hotjar, Salesforce CloudPages and Google Hosted Libraries are recognised', () => {
  assert.equal(vendorForName('_cs_id')?.id, 'contentsquare');
  assert.equal(vendorForUrl('https://t.contentsquare.net/uxa/abc.js')?.id, 'contentsquare');
  assert.equal(vendorForName('_hjHasCachedUserAttributes')?.id, 'hotjar');
  assert.equal(vendorForUrl('https://static.hotjar.com/c/hotjar-1.js?sv=6')?.id, 'hotjar');
  assert.equal(vendorForUrl('https://cloudpages.mc-content.com/CloudPages/lib/x.js')?.id, 'salesforce-cloudpages');
  assert.equal(vendorForUrl('https://www.fuelcdn.com/x/images/logo.png')?.id, 'salesforce-cloudpages');
  assert.equal(vendorForUrl('https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js')?.id, 'public-cdn');
  assert.equal(isGoogleHost('https://ajax.googleapis.com/ajax/libs/jquery/3.7.1/jquery.min.js'), false);
});

// Observed on paligo.net 2026-11-09.
test('HubSpot CTAs, collected forms and regional form hosts are HubSpot', () => {
  for (const url of ['https://js.hubspot.com/web-interactives-embed.js', 'https://cta-service-cms2.hubspot.com/web-interactives/public/v1/embed',
    'https://forms.hscollectedforms.net/collected-forms/v1/config/json', 'https://api.hubapi.com/hs-script-loader-public/v2/config'])
    assert.equal(vendorForUrl(url)?.id, 'hubspot', url);
  for (const url of ['https://forms-na1.hsforms.com/embed/v3/counters.gif', 'https://perf-na1.hsforms.com/embed/v3/counters.gif'])
    assert.equal(vendorForUrl(url)?.id, 'hubspot-forms', url);
  assert.equal(vendorForUrl('https://api.hubapi.com/crm/v3/objects'), null);
});
