import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../../supabase/functions/_shared/gtm-audit/parse.ts';
import { tagInfos } from '../../supabase/functions/_shared/gtm-audit/info.ts';
import { destinationsOf, normalizeId, HTML_ID_PATTERNS } from '../../supabase/functions/_shared/gtm-audit/destinations.ts';
import { tag, tpl, variable, lookup, template, tplType, exportOf } from '../../scripts/gtm-audit/fixture.mjs';
import { runRules } from '../../supabase/functions/_shared/gtm-audit/rules/index.ts';
import { audit } from '../../supabase/functions/_shared/gtm-audit/audit.ts';

const metaTpl = template(20, 'Meta Pixel', { permissions: { inject_script: ['https://connect.facebook.net/*'] }, gallery: ['facebookarchive', 'GoogleTagManager-WebTemplate-For-FacebookPixel'] });
const dests = (tags, variables = []) => {
  const c = parse(exportOf({ tags, variables, templates: [metaTpl] }));
  return Object.fromEntries(tagInfos(c).map((i) => [i.tag.name, destinationsOf(i, c)]));
};
const html = (s) => tpl('html', s);

const rule = (tags, variables = []) => {
  const c = parse(exportOf({ tags, variables, templates: [metaTpl] }));
  return runRules(c, tagInfos(c)).find((f) => f.checkKey === 'gtm.multiple_destinations');
};

test('literal, constant, lookup (nested variable and default) and unresolved IDs', () => {
  const d = dests([
    tag(1, 'Literal', tplType(20), [tpl('pixelId', '1234567890')]),
    tag(2, 'Constant', 'gaawe', [tpl('measurementIdOverride', '{{GA4 ID}}')]),
    tag(3, 'Lookup', tplType(20), [tpl('pixelId', '{{Pixel by host}}')]),
    tag(4, 'Unresolved', tplType(20), [tpl('pixelId', '{{DLV pixel}}')]),
    tag(5, 'Partial', tplType(20), [tpl('pixelId', 'x{{GA4 ID}}')]),
    tag(6, 'Several', tplType(20), [tpl('pixelIds', '111111111, 222222222')]),
  ], [
    variable(1, 'GA4 ID', 'c', [tpl('value', ' g-abc1234 ')]),
    variable(2, 'Other pixel', 'c', [tpl('value', '333333333')]),
    lookup(3, 'Pixel by host', '{{Page Hostname}}', [['a.example', '444444444'], ['b.example', '{{Other pixel}}'], ['c.example', '']], '555555555'),
    variable(4, 'DLV pixel', 'v', [tpl('name', 'pixel')]),
  ]);
  assert.deepEqual(d.Literal, [{ vendorId: 'meta', id: '1234567890', raw: '1234567890', resolved: 'literal' }]);
  assert.deepEqual(d.Constant, [{ vendorId: 'ga4', id: 'G-ABC1234', raw: '{{GA4 ID}}', resolved: 'constant_variable' }]);
  assert.deepEqual(d.Lookup.map((x) => [x.id, x.resolved]), [['444444444', 'lookup'], ['333333333', 'lookup'], ['555555555', 'lookup']]);
  assert.deepEqual(d.Unresolved, [{ vendorId: 'meta', id: null, raw: '{{DLV pixel}}', resolved: 'unresolved' }]);
  assert.deepEqual(d.Partial.map((x) => x.resolved), ['unresolved']);
  assert.deepEqual(d.Several.map((x) => x.id), ['111111111', '222222222']);
});

test('a lookup default counts only when "Set default value" is on', () => {
  const d = dests([tag(1, 'L', tplType(20), [tpl('pixelId', '{{T}}')])], [
    { variableId: '9', name: 'T', type: 'smm', parameter: [tpl('input', '{{Page Hostname}}'), tpl('defaultValue', '999999999')] },
  ]);
  assert.deepEqual(d.L.map((x) => x.resolved), ['unresolved']);
});

test('Custom HTML patterns, one per vendor', () => {
  const d = dests([
    tag(1, 'Meta', 'html', [html("<script>fbq('init', '1234567890');fbq('track','PageView')</script>")]),
    tag(2, 'Gtag', 'html', [html('<script async src="https://www.googletagmanager.com/gtag/js?id=G-HTML1234"></script><script>gtag("config", "AW-12345678/abcDEF");</script>')]),
    tag(3, 'LinkedIn', 'html', [html('<script>_linkedin_partner_id = "1234567";</script>')]),
    tag(4, 'TikTok', 'html', [html("<script>ttq.load('CABCDEFGH12345');</script>")]),
    tag(5, 'UET', 'html', [html('<script>(function(w,d,t,r,u){var o={ti:"98765432"};})(window,document,"script","//bat.bing.com/bat.js","uetq");</script>')]),
    tag(6, 'Pinterest', 'html', [html("<script>pintrk('load', '2612345678901');</script>")]),
    tag(7, 'Snap', 'html', [html("<script>snaptr('init', '1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f');</script>")]),
    tag(8, 'Hotjar', 'html', [html('<script>(function(h,o,t,j,a,r){h._hjSettings={hjid:1234567,hjsv:6};})(window,document)</script>')]),
    tag(9, 'Clarity', 'html', [html('<script>(function(c,l,a,r,i,t,y){})(window, document, "clarity", "script", "abc123xyz");</script>')]),
    tag(10, 'Clarity src', 'html', [html('<script src="https://www.clarity.ms/tag/sample123"></script>')]),
    tag(11, 'No bing', 'html', [html('<script>var o={ti:"98765432"};</script>')]),
  ]);
  const ids = (n) => d[n].map((x) => `${x.vendorId}:${x.id}`);
  assert.deepEqual(ids('Meta'), ['meta:1234567890']);
  assert.deepEqual(ids('Gtag').sort(), ['ga4:G-HTML1234', 'google-ads:AW-12345678']);
  assert.deepEqual(ids('LinkedIn'), ['linkedin:1234567']);
  assert.deepEqual(ids('TikTok'), ['tiktok-pixel:CABCDEFGH12345']);
  assert.deepEqual(ids('UET'), ['microsoft-ads:98765432']);
  assert.deepEqual(ids('Pinterest'), ['pinterest-pixel:2612345678901']);
  assert.deepEqual(ids('Snap'), ['snap-pixel:1a2b3c4d-1a2b-1a2b-1a2b-1a2b3c4d5e6f']);
  assert.deepEqual(ids('Hotjar'), ['hotjar:1234567']);
  assert.deepEqual(ids('Clarity'), ['clarity:abc123xyz']);
  assert.deepEqual(ids('Clarity src'), ['clarity:sample123']);
  assert.deepEqual(ids('No bing'), []);
});

test('a variable inside a Custom HTML pattern resolves like a field', () => {
  const d = dests([tag(1, 'Meta', 'html', [html("<script>fbq('init', '{{Meta ID}}');</script>")])], [variable(1, 'Meta ID', 'c', [tpl('value', '7777777777')])]);
  assert.deepEqual(d.Meta, [{ vendorId: 'meta', id: '7777777777', raw: '{{Meta ID}}', resolved: 'constant_variable' }]);
});

test('Google: AW label dropped, bare conversion ID gets AW-, UA and GT skipped', () => {
  const d = dests([
    tag(1, 'Conv', 'awct', [tpl('conversionId', '000000000'), tpl('conversionLabel', 'abc')]),
    tag(2, 'Google tag AW', 'googtag', [tpl('tagId', 'AW-111111111')]),
    tag(3, 'UA', 'ua', [tpl('trackingId', 'UA-000000-1')]),
    tag(4, 'GT', 'googtag', [tpl('tagId', 'GT-ABCDEF')]),
  ]);
  assert.deepEqual(d.Conv.map((x) => `${x.vendorId}:${x.id}`), ['google-ads:AW-000000000']);
  assert.deepEqual(d['Google tag AW'].map((x) => `${x.vendorId}:${x.id}`), ['google-ads:AW-111111111']);
  assert.deepEqual(d.UA, []);
  assert.deepEqual(d.GT, []);
});

test('normalizeId', () => {
  assert.equal(normalizeId(' g-abc123 '), 'G-ABC123');
  assert.equal(normalizeId('aw-123456789/Label_X'), 'AW-123456789');
  assert.equal(normalizeId('dc-1234567'), 'DC-1234567');
  assert.equal(normalizeId('123456789', 'google-ads'), 'AW-123456789');
  assert.equal(normalizeId('123456789', 'meta'), '123456789');
  assert.equal(normalizeId('CabcDEF123'), 'CabcDEF123');
});

test('every Custom HTML pattern is linear on 5 MB', () => {
  const N = 5 * 1024 * 1024;
  const fill = (s) => s.repeat(Math.ceil(N / s.length)).slice(0, N);
  const inputs = ["fbq('init','", "gtag('config','G-", '{{', 'ti:"{{aaaa', '{{' + 'a'.repeat(199), "_linkedin_partner_id='", "ttq.load('", ' '.repeat(10)];
  for (const p of HTML_ID_PATTERNS) {
    for (const input of inputs) {
      const s = fill(input);
      const t = performance.now();
      [...s.matchAll(p.re)];
      const ms = performance.now() - t;
      assert.ok(ms < 1000, `${p.vendorId} ${p.re.source.slice(0, 30)} took ${ms} ms on ${JSON.stringify(input.slice(0, 20))}`);
    }
  }
});

test('gtm.multiple_destinations: two Meta IDs, newest change per ID, unresolved listed last', () => {
  const f = rule([
    tag(1, 'Meta A', tplType(20), [tpl('pixelId', '1234567890')], { modified: Date.UTC(2025, 2, 2) }),
    tag(2, 'Meta A2', tplType(20), [tpl('pixelId', '{{Meta ID}}')], { modified: Date.UTC(2024, 0, 1) }),
    tag(3, 'Meta old', tplType(20), [tpl('pixelId', '9876543210')], { modified: Date.UTC(2021, 5, 10) }),
    tag(4, 'Meta paused', tplType(20), [tpl('pixelId', '5555555555')], { paused: true }),
    tag(5, 'Meta DLV', tplType(20), [tpl('pixelId', '{{DLV}}')]),
  ], [variable(1, 'Meta ID', 'c', [tpl('value', '1234567890')])]);
  assert.equal(f.status, 'manual');
  assert.equal(f.priority, 'high');
  assert.equal(f.typicalOwner, 'marketing');
  assert.equal(f.title, '1 vendor sends data to more than one account');
  assert.deepEqual(f.evidence.details.slice(1), [
    'Meta Pixel: 2 IDs — 1234567890 (2 tags, last changed 2025-03-02), 9876543210 (1 tag, last changed 2021-06-10)',
    '1 tag with an ID the audit could not resolve',
  ]);
  assert.equal(f.explanation, 'Each ID is a separate account at the vendor. Check who owns each one. An ID nobody recognises often belongs to an old account or a former agency, and data sent to it is outside your control.');
  assert.equal(f.fix, 'Keep the IDs your organisation owns and has access to. Remove or pause tags that send to the others.');
});

test('gtm.multiple_destinations: GA4 + Ads, several AW labels, and UA next to G- pass', () => {
  const f = rule([
    tag(1, 'GA4', 'gaawe', [tpl('measurementIdOverride', 'G-AAAA1111')]),
    tag(2, 'Ads 1', 'awct', [tpl('conversionId', '111111111'), tpl('conversionLabel', 'a')]),
    tag(3, 'Ads 2', 'awct', [tpl('conversionId', 'AW-111111111/b')]),
    tag(4, 'UA', 'ua', [tpl('trackingId', 'UA-1-1')]),
  ]);
  assert.equal(f.status, 'pass');
  assert.equal(f.title, 'Each vendor sends to one account');
  assert.deepEqual(f.evidence.details.slice(1), []);
});

test('TagRow.sendsTo lists IDs and unresolved references', () => {
  const r = audit(exportOf({
    tags: [tag(1, 'Meta', tplType(20), [tpl('pixelId', '1234567890')]), tag(2, 'Meta DLV', tplType(20), [tpl('pixelId', '{{DLV}}')]), tag(3, 'Inline', 'html', [tpl('html', '<p>')])],
    templates: [metaTpl],
  }));
  assert.deepEqual(r.tags.map((t) => t.sendsTo), [['1234567890'], ['Unresolved ({{DLV}})'], []]);
});
