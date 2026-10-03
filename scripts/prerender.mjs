/**
 * Static pre-render script.
 * Run after `vite build` and `vite build --ssr`.
 * Generates dist/[route]/index.html for each marketing page.
 */

import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';

// Polyfill browser globals required by next-themes and other browser-first packages
const noop = () => {};
const noopStorage = {
  getItem: () => null, setItem: noop, removeItem: noop, clear: noop, length: 0, key: () => null,
};
globalThis.localStorage = noopStorage;
globalThis.sessionStorage = noopStorage;
globalThis.window = globalThis;
globalThis.document = {
  documentElement: { classList: { add: noop, remove: noop, contains: () => false }, getAttribute: () => null },
  addEventListener: noop,
  removeEventListener: noop,
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const resolve = (p) => path.resolve(__dirname, '..', p);

// Import server bundle built by `vite build --ssr`
const serverBundle = resolve('dist/server/entry-server.js');
if (!fs.existsSync(serverBundle)) {
  console.error('Server bundle not found. Run `vite build --ssr src/entry-server.tsx --outDir dist/server` first.');
  process.exit(1);
}

// The route registry (src/marketing-routes.ts) is re-exported by the SSR bundle, so
// prerendered pages, meta tags and the sitemap all come from one list.
const { render, MARKETING_ROUTES, SITE_ORIGIN } = await import(pathToFileURL(serverBundle).href);

// HTML template from the normal client build
const template = fs.readFileSync(resolve('dist/index.html'), 'utf-8');

function injectSEO(html, { title, description, canonical }) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return html
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/(<meta\s+name="description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+property="og:title"\s+content=")[^"]*(")/i, `$1${esc(title)}$2`)
    .replace(/(<meta\s+property="og:description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<meta\s+property="og:url"\s+content=")[^"]*(")/i, `$1${esc(canonical)}$2`)
    .replace(/(<meta\s+name="twitter:title"\s+content=")[^"]*(")/i, `$1${esc(title)}$2`)
    .replace(/(<meta\s+name="twitter:description"\s+content=")[^"]*(")/i, `$1${esc(description)}$2`)
    .replace(/(<link\s+rel="canonical"\s+href=")[^"]*(")/i, `$1${esc(canonical)}$2`);
}

let rendered = 0;
let errors = 0;

for (const route of MARKETING_ROUTES) {
  const url = route.path;
  try {
    const appHtml = render(url);
    let html = template.replace('<!--app-html-->', appHtml);
    html = injectSEO(html, { title: route.title, description: route.description, canonical: SITE_ORIGIN + url });

    const outPath = resolve(`dist${url}index.html`);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, html, 'utf-8');
    console.log(`  ✓ ${url}`);
    rendered++;
  } catch (err) {
    console.error(`  ✗ ${url}: ${err.message}`);
    errors++;
  }
}

// sitemap.xml — lastmod is the last commit touching the page component, so it only
// moves when the page actually changed (falls back to today outside a git checkout).
const today = new Date().toISOString().slice(0, 10);
const lastmod = (file) => {
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', file], { cwd: resolve('.'), encoding: 'utf-8' }).trim() || today;
  } catch {
    return today;
  }
};
const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...MARKETING_ROUTES.map((r) => [
    '  <url>',
    `    <loc>${SITE_ORIGIN}${r.path}</loc>`,
    `    <lastmod>${lastmod(r.source)}</lastmod>`,
    `    <changefreq>${r.changefreq}</changefreq>`,
    `    <priority>${r.priority.toFixed(1)}</priority>`,
    '  </url>',
  ].join('\n')),
  '</urlset>',
  '',
].join('\n');
fs.writeFileSync(resolve('dist/sitemap.xml'), sitemap, 'utf-8');
console.log(`  ✓ sitemap.xml (${MARKETING_ROUTES.length} URLs)`);

console.log(`\nPre-rendered ${rendered} pages${errors ? `, ${errors} errors` : ''}.`);
// Rendering the marketing pages leaves open handles (polyfilled browser globals,
// next-themes, react-query) that keep Node alive, so exit explicitly instead of
// waiting for a natural exit that never comes.
process.exit(errors > 0 ? 1 : 0);
