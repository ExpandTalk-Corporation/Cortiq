// Guards the crawlability conventions of the public site: every marketing URL is the
// trailing-slash form Apache serves as 200, internal links use exactly those URLs,
// and retired paths are 301'd by .htaccess.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { MARKETING_ROUTES, MARKETING_REDIRECTS } from '../../src/marketing-routes.ts';
import { DOCS_PAGES } from '../../src/content/docs.ts';
import { COMPANY_PAGES } from '../../src/content/company.ts';
import { TERMS } from '../../src/content/legal.ts';

const CONTENT_PAGES = [...DOCS_PAGES, ...COMPANY_PAGES, TERMS];

const root = new URL('../../', import.meta.url);
const read = (p) => readFileSync(new URL(p, root), 'utf8');
const paths = new Set(MARKETING_ROUTES.map((r) => r.path));

test('registry paths are unique, slash-terminated and point at existing page files', () => {
  assert.equal(paths.size, MARKETING_ROUTES.length);
  for (const r of MARKETING_ROUTES) {
    assert.ok(r.path.startsWith('/') && r.path.endsWith('/'), r.path);
    assert.ok(existsSync(new URL(r.source, root)), r.source);
  }
});

test('entry-server renders every registered route', () => {
  const entry = read('src/entry-server.tsx');
  const contentPaths = new Set(CONTENT_PAGES.map((c) => c.path));
  for (const p of paths) assert.ok(entry.includes(`'${p}':`) || contentPaths.has(p), `entry-server PAGES is missing ${p}`);
  for (const p of contentPaths) assert.ok(paths.has(p), `content page ${p} is not in the route registry`);
});

test('internal links to marketing pages use the registered slash form', () => {
  const dirs = ['src/pages/', 'src/components/', 'src/content/'];
  const bad = [];
  const firstSegments = new Set([...paths].map((p) => p.split('/')[1]).filter(Boolean));
  for (const dir of dirs) {
    for (const f of readdirSync(new URL(dir, root), { recursive: true })) {
      if (!/\.tsx?$/.test(f)) continue;
      const text = read(dir + f.replaceAll('\\', '/'));
      const targets = [
        ...[...text.matchAll(/(?:to=|to: |path: |window\.open\()["'](\/[^"'#?]*)[#?"']/g)].map((m) => m[1]),
        // Markdown-style links in src/content: [label](/path/#anchor)
        ...[...text.matchAll(/\]\((\/[^)#?]*)[)#?]/g)].map((m) => m[1]),
      ];
      for (const target of targets) {
        const seg = target.split('/')[1];
        if ((firstSegments.has(seg) || target in MARKETING_REDIRECTS) && !paths.has(target)) bad.push(`${dir}${f}: ${target}`);
      }
    }
  }
  assert.deepEqual(bad, [], 'Link to the exact registry path (with trailing slash)');
});

test('.htaccess 301s every retired path to its registered target', () => {
  const htaccess = read('public/.htaccess');
  for (const [from, to] of Object.entries(MARKETING_REDIRECTS)) {
    assert.ok(paths.has(to), `redirect target ${to} is not a registered route`);
    assert.ok(htaccess.includes(`RewriteRule ^${from.slice(1)}/?$ https://%{HTTP_HOST}${to} [L,R=301]`), `missing 301 for ${from}`);
  }
});
