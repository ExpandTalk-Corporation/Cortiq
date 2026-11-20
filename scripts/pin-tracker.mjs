/**
 * Pins the tracker and the consent banner for Subresource Integrity (SRI).
 * Runs after minify-tracker.mjs in `npm run build`.
 *
 * Pinned installs load https://<origin>/v/<version>/cortiq.js with an integrity hash, so a pinned file
 * must never change: the first build of a version copies public/cortiq.js and public/consent-banner.js
 * into public/v/<version>/ and records their sha384 in src/lib/sri-manifest.json. Both are committed.
 * Later builds of the same version only verify. A tracker or banner change without a version bump fails
 * the build, since sites pinned to that version would otherwise be told one thing and served another.
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bannerLanguages } from './banner-languages.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = join(root, 'src', 'lib', 'sri-manifest.json');
// Published name → source in public/. The names match the unpinned URLs the snippet uses.
// consent-banner.min.js and consent-banner.<lang>.js are pinned from 5.5.17; older versions only have the first two.
const bannerSource = readFileSync(join(root, 'public', 'consent-banner.js'), 'utf8');
const FILES = Object.fromEntries(
  ['cortiq.js', 'consent-banner.js', 'consent-banner.min.js', ...bannerLanguages(bannerSource).map(l => `consent-banner.${l}.js`)]
    .map(name => [name, name]),
);

const sri = buf => `sha384-${createHash('sha384').update(buf).digest('base64')}`;
const version = readFileSync(join(root, 'public', 'spa-tracking.js'), 'utf8').match(/const CORTIQ_VERSION = '([\d.]+)'/)?.[1];
if (!version) throw new Error('CORTIQ_VERSION not found in public/spa-tracking.js');

const manifest = existsSync(manifestPath)
  ? JSON.parse(readFileSync(manifestPath, 'utf8'))
  : { latest: null, versions: {} };

// Every pinned file still matches the hash sites were given.
for (const [v, entry] of Object.entries(manifest.versions)) {
  for (const [name, hash] of Object.entries(entry.files)) {
    const file = join(root, 'public', 'v', v, name);
    if (!existsSync(file)) throw new Error(`Pinned file missing: public/v/${v}/${name}`);
    if (sri(readFileSync(file)) !== hash) throw new Error(`Pinned file changed: public/v/${v}/${name} no longer matches its SRI hash`);
  }
}

const dir = join(root, 'public', 'v', version);
const entry = manifest.versions[version];
if (entry) {
  for (const [name, src] of Object.entries(FILES)) {
    if (!readFileSync(join(root, 'public', src)).equals(readFileSync(join(dir, name)))) {
      throw new Error(`public/${src} differs from pinned public/v/${version}/${name}. ` +
        'Bump the shared version (see src/lib/plugin-version.ts) so pinned sites keep the file they were given.');
    }
  }
  console.log(`✓ SRI pin ${version} verified`);
} else {
  mkdirSync(dir, { recursive: true });
  const files = {};
  for (const [name, src] of Object.entries(FILES)) {
    const buf = readFileSync(join(root, 'public', src));
    writeFileSync(join(dir, name), buf);
    files[name] = sri(buf);
  }
  // securityFix is set by hand on a release that fixes a vulnerability in the tracker or banner;
  // the dashboard then warns sites pinned to an older version.
  manifest.versions[version] = { securityFix: false, files };
  manifest.latest = version;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  console.log(`✓ SRI pin ${version} created — commit public/v/${version}/ and src/lib/sri-manifest.json`);
}
