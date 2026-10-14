/**
 * Packages wordpress-plugin/ into public/cortiq-wordpress-plugin.zip
 * Runs automatically as part of `npm run build` (see package.json "build").
 */

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, relative, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import JSZip from 'jszip';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root       = resolve(__dirname, '..');
const pluginDir  = join(root, 'wordpress-plugin');
const outputDir  = join(root, 'public');
const outputPath = join(outputDir, 'cortiq-wordpress-plugin.zip');


// WordPress expects all plugin files inside a top-level folder.
// That folder name MUST match the plugin slug (cortiq-analytics).
const PLUGIN_FOLDER = 'cortiq-analytics';
const zip = new JSZip();

function addDirPrefixed(zip, dir, baseDir, prefix) {
  for (const entry of readdirSync(dir)) {
    // Don't bundle build artifacts (e.g. a previously-committed plugin .zip) or
    // VCS/OS cruft into the plugin package.
    if (entry.endsWith('.zip') || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      addDirPrefixed(zip, full, baseDir, prefix);
    } else {
      const rel     = relative(baseDir, full).replace(/\\/g, '/');
      const zipPath = `${prefix}/${rel}`;
      zip.file(zipPath, readFileSync(full));
    }
  }
}

addDirPrefixed(zip, pluginDir, pluginDir, PLUGIN_FOLDER);

// The plugin serves the tracker from the customer's own site, so the browser makes no request to
// cortiq.se (and sends it no IP address) when the page loads. public/cortiq.js is the minified
// tracker built by scripts/minify-tracker.mjs, which runs before this script in `npm run build`.
zip.file(`${PLUGIN_FOLDER}/assets/cortiq.js`, readFileSync(join(outputDir, 'cortiq.js')));

const buf = await zip.generateAsync({
  type: 'nodebuffer',
  compression: 'DEFLATE',
  compressionOptions: { level: 9 },
});

if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
writeFileSync(outputPath, buf);

const fileCount = Object.keys(zip.files).filter(f => !zip.files[f].dir).length;
console.log(`✓ cortiq-wordpress-plugin.zip — ${fileCount} files, ${(buf.length / 1024).toFixed(1)} KB`);
