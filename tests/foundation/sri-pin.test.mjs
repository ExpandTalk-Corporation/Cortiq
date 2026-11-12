import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { renderTrackingSnippet } from '../../src/lib/snippetTemplate.ts';
import { compareVersions, pinnedScripts, pinStatus } from '../../src/lib/sriPin.ts';

// Pinned installs (Subresource Integrity): the snippet loads /v/<version>/ files with an integrity hash,
// so a pinned file that changes after release blocks tracking on every site pinned to it.

const url = rel => new URL(`../../${rel}`, import.meta.url);
const read = rel => readFileSync(url(rel));
const manifest = JSON.parse(read('src/lib/sri-manifest.json'));
const sri = buf => `sha384-${createHash('sha384').update(buf).digest('base64')}`;
const loader = read('src/lib/consent-loader.js').toString();
const beacon = read('src/lib/aggregate-beacon.js').toString();
const opts = { apiUrl: 'https://api.test/functions/v1', siteId: 'site-1', trackingKey: 'tk_key' };

test('every pinned file still matches the hash in the manifest', () => {
  for (const [v, { files }] of Object.entries(manifest.versions)) {
    for (const [name, hash] of Object.entries(files)) {
      assert.ok(existsSync(url(`public/v/${v}/${name}`)), `public/v/${v}/${name} missing`);
      assert.equal(sri(read(`public/v/${v}/${name}`)), hash, `public/v/${v}/${name} changed after it was pinned`);
    }
  }
});

test('the current version is pinned, and is the served tracker and banner', () => {
  const version = read('src/lib/plugin-version.ts').toString().match(/PLUGIN_VERSION = '([\d.]+)'/)[1];
  assert.equal(manifest.latest, version, 'run node scripts/pin-tracker.mjs (part of npm run build)');
  for (const name of ['cortiq.js', 'consent-banner.js']) {
    assert.ok(read(`public/${name}`).equals(read(`public/v/${version}/${name}`)),
      `public/${name} differs from the pinned copy: bump the shared version`);
  }
});

test('pinned files are byte-exact in git and served with CORS', () => {
  assert.match(read('.gitattributes').toString(), /^public\/v\/\*\* binary$/m);
  const htaccess = read('public/v/.htaccess').toString();
  assert.match(htaccess, /Access-Control-Allow-Origin "\*"/);
});

test('pinned snippet: loader sets integrity and crossOrigin on the tracker it injects', () => {
  const pin = pinnedScripts('https://cortiq.se', manifest);
  assert.equal(pin.scriptSrc, `https://cortiq.se/v/${manifest.latest}/cortiq.js`);
  const html = renderTrackingSnippet({ ...opts, ...pin }, { loader, beacon });
  const inline = html.match(/<script>\n([\s\S]*?)<\/script>/)[1];
  const appended = [];
  const window = { addEventListener() {}, dataLayer: [] };
  const document = { createElement: () => ({}), head: { appendChild: el => appended.push(el) }, querySelector: () => null };
  const localStorage = { getItem: () => JSON.stringify({ analytics: true, expiresAt: Date.now() + 1e6 }) };
  runInNewContext(inline, { window, document, localStorage, Date, JSON, Array, setInterval: () => 1, clearInterval() {} });
  assert.equal(appended.length, 1);
  assert.equal(appended[0].src, pin.scriptSrc);
  assert.equal(appended[0].integrity, pin.scriptIntegrity);
  assert.equal(appended[0].crossOrigin, 'anonymous');
});

test('pinned banner tag carries integrity and crossorigin', () => {
  const pin = pinnedScripts('https://cortiq.se', manifest);
  const html = renderTrackingSnippet({ ...opts, ...pin, consentSetup: 'cortiq-banner', company: 'Example AB',
    policyUrl: 'https://example.com/privacy' }, { loader, beacon });
  const tag = html.match(/<script src="[^"]*consent-banner\.js"[\s\S]*?><\/script>/)[0];
  assert.ok(tag.includes(`integrity="${pin.bannerIntegrity}" crossorigin="anonymous"`), tag);
});

test('unpinned snippet has no integrity; a malformed hash is refused', () => {
  const html = renderTrackingSnippet({ ...opts, scriptSrc: 'https://cortiq.se/cortiq.js' }, { loader, beacon });
  assert.equal(/integrity|crossOrigin/.test(html), false);
  assert.throws(() => renderTrackingSnippet({ ...opts, scriptSrc: 'x', scriptIntegrity: "sha384-a'b" }, { loader, beacon }), /Invalid SRI/);
});

test('pin status: auto snippet, up to date, behind, behind a security fix', () => {
  const m = { latest: '5.6.0', versions: {
    '5.5.13': { securityFix: false, files: {} },
    '5.5.14': { securityFix: true, files: {} },
    '5.6.0': { securityFix: false, files: {} },
  } };
  assert.equal(pinStatus(null, m), null);
  assert.deepEqual(pinStatus('5.6.0', m), { latest: '5.6.0', behind: false, securityFixes: [] });
  assert.deepEqual(pinStatus('5.5.14', m), { latest: '5.6.0', behind: true, securityFixes: [] });
  assert.deepEqual(pinStatus('5.5.13', m), { latest: '5.6.0', behind: true, securityFixes: ['5.5.14'] });
  assert.equal(compareVersions('5.5.10', '5.5.9'), 1);
});

// The public page at /security/sri/ makes claims about this code; keep them true.
test('/security/sri/ shows the latest pinned version and hashes, and its claims match the code', async () => {
  const { SECURITY_SRI } = await import('../../src/content/company.ts');
  const text = JSON.stringify(SECURITY_SRI);
  const { files } = manifest.versions[manifest.latest];
  assert.ok(text.includes(`https://cortiq.se/v/${manifest.latest}/cortiq.js`));
  for (const hash of Object.values(files)) assert.ok(text.includes(hash), `page is missing ${hash}`);
  // "Pin version … with Subresource Integrity (SRI)" and "Install tracking" are the dashboard labels.
  assert.match(readFileSync(url('src/components/dashboard/TrackingSnippetSetup.tsx'), 'utf8'), /Pin version \{pin\.version\} with Subresource Integrity \(SRI\)/);
  assert.match(readFileSync(url('src/pages/Installation.tsx'), 'utf8'), />Install tracking</);
  // "The WordPress plugin … no longer falls back to cortiq.se"
  assert.equal(/https?:\/\/cortiq\.se\/[^'"]*\.js/.test(readFileSync(url('wordpress-plugin/cortiq-analytics.php'), 'utf8')), false);
});
