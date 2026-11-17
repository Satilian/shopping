import { URL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';

const root = new URL('../dist/client/', import.meta.url);
const files = await readdir(new URL('static/', root), { recursive: true });
const assets = files
  .map((file) => file.replaceAll('\\', '/'))
  .filter((file) => /\.(css|js|webmanifest|png)$/.test(file))
  .sort()
  .map((file) => `/static/${file}`);
const worker = await readFile(new URL('../pwa/service-worker.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(JSON.stringify(assets)).update(worker);
for (const asset of assets) hash.update(await readFile(new URL(asset.slice(1), root)));
const settings = { cacheName: `shopping-list-${hash.digest('hex').slice(0, 16)}`, assets };
await writeFile(new URL('static/pwa/service-worker.js', root), `const settings = ${JSON.stringify(settings)};\n${worker}`);
