/**
 * Downloads othmanus/algeria-cities (French ASCII commune names) and builds
 * backend/data/communes-by-wilaya.json — one array per wilaya code (1–58).
 * Run: node scripts/build-communes-data.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'communes-by-wilaya.json');
const URL =
  'https://raw.githubusercontent.com/othmanus/algeria-cities/master/json/algeria_cities.json';

async function main() {
  const res = await fetch(URL);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const rows = await res.json();
  /** @type {Record<string, string[]>} */
  const by = {};
  for (let w = 1; w <= 58; w++) {
    by[String(w)] = [];
  }
  for (const r of rows) {
    const code = String(parseInt(String(r.wilaya_code), 10));
    if (!by[code]) continue;
    const name = String(r.commune_name_ascii || '').trim();
    if (name) by[code].push(name);
  }
  for (const k of Object.keys(by)) {
    by[k].sort((a, b) => a.localeCompare(b, 'fr'));
  }
  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(by), 'utf8');
  console.log('Wrote', OUT);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
