// Fills the Content-Security-Policy in dist/**/.htaccess with the hashes of the inline scripts the
// build produced. The self-measurement snippet changes with every tracker version and the theme
// script with next-themes, so the hashes cannot be kept by hand. Each .htaccess that contains
// __CSP_SCRIPT_HASHES__ gets the hashes of the HTML pages it serves: its own directory and below,
// minus subdirectories that have their own .htaccess with a policy.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const PLACEHOLDER = '__CSP_SCRIPT_HASHES__';

/** Bodies of inline scripts the browser executes: no src, and not a JSON data block. */
export function inlineScripts(html) {
  const out = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1];
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const type = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i)?.[1]?.toLowerCase();
    if (type && !['text/javascript', 'module', 'application/javascript'].includes(type)) continue;
    out.push(m[2]);
  }
  return out;
}

export const scriptHash = (body) => `'sha256-${crypto.createHash('sha256').update(body, 'utf8').digest('base64')}'`;

/** Inline event handler attributes (onclick=…): a hash-based policy does not allow them. */
export const inlineHandlers = (html) => [...html.matchAll(/<[a-z][^>]*\son[a-z]+\s*=/gi)].map((m) => m[0].slice(0, 80));

function htmlFiles(dir, stopAt) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!stopAt(p)) out.push(...htmlFiles(p, stopAt));
    } else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

export function fillCsp(dist) {
  const ownsPolicy = (dir) => {
    const f = path.join(dir, '.htaccess');
    return fs.existsSync(f) && fs.readFileSync(f, 'utf8').includes(PLACEHOLDER);
  };
  // dist/server holds the SSR bundle, which is not uploaded.
  const server = path.join(dist, 'server');
  const dirs = [...new Set([dist, ...htmlFiles(dist, (sub) => sub === server).map(path.dirname)])].filter(ownsPolicy);
  if (!dirs.includes(dist)) throw new Error(`dist/.htaccess has no ${PLACEHOLDER}`);
  const report = [];
  for (const dir of dirs) {
    const files = htmlFiles(dir, (sub) => sub === server || ownsPolicy(sub));
    const hashes = new Set();
    for (const file of files) {
      const html = fs.readFileSync(file, 'utf8');
      const handlers = inlineHandlers(html);
      if (handlers.length) throw new Error(`Inline event handler in ${path.relative(dist, file)}: ${handlers[0]} — the CSP would block it`);
      for (const body of inlineScripts(html)) hashes.add(scriptHash(body));
    }
    const htaccess = path.join(dir, '.htaccess');
    fs.writeFileSync(htaccess, fs.readFileSync(htaccess, 'utf8').replaceAll(PLACEHOLDER, [...hashes].sort().join(' ')));
    report.push(`${path.relative(dist, dir) || '.'}: ${files.length} pages, ${hashes.size} inline script hashes`);
  }
  return report;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
  for (const line of fillCsp(dist)) console.log(`CSP ${line}`);
}
