import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, 'dist');
const server = path.join(dist, 'server');

for (const file of ['index.html', '.htaccess', 'cortiq.js', 'consent-banner.min.js', 'assets']) {
  if (!fs.existsSync(path.join(dist, file))) throw new Error(`Missing FTP artifact: ${file}`);
}
// Only remove the generated SSR bundle after prerendering succeeds.
if (path.dirname(server) !== dist || fs.lstatSync(dist).isSymbolicLink() ||
    (fs.existsSync(server) && fs.lstatSync(server).isSymbolicLink())) {
  throw new Error('Refusing to clean an unexpected build path');
}
fs.rmSync(server, { recursive: true, force: true });
console.log('FTP ready: upload the contents of dist, including .htaccess, to the domain web root.');
