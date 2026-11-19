// Serves dist/ with the Content-Security-Policy from dist/.htaccess, so CSP behaviour
// (e.g. scripts in sandboxed iframes) can be checked locally. Run after `npm run build`:
//   node tests/foundation/csp-preview-server.mjs   → http://127.0.0.1:8099/
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = fileURLToPath(new URL('../../dist/', import.meta.url));
const csp = /Content-Security-Policy "([^"]+)"/.exec(readFileSync(join(dist, '.htaccess'), 'utf8'))?.[1]
  ?.replace(/;\s*report-(uri|to)[^;]*/g, '');
if (!csp) throw new Error('No Content-Security-Policy in dist/.htaccess');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.avif': 'image/avif', '.webp': 'image/webp',
  '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain',
};

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  let file = normalize(join(dist, path));
  if (!file.startsWith(normalize(dist))) { res.writeHead(403).end(); return; }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream', 'Content-Security-Policy': csp });
  res.end(readFileSync(file));
}).listen(8099, '127.0.0.1', () => console.log('http://127.0.0.1:8099/'));
