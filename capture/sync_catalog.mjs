// Reuse the app's metadata IDs, image URLs and trait supplementation.
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { getTftData } from '../frontend/src/services/tftDataService.js';

const root = join(dirname(fileURLToPath(import.meta.url)), 'data');
const catalog = await getTftData('en');
await mkdir(root, { recursive: true });
await writeFile(join(root, 'catalog.json'), JSON.stringify(catalog, null, 2));
if (process.argv.includes('--images')) {
  let refs = {};
  try { refs = JSON.parse(await readFile(join(root, 'references.json'), 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const items = [...(refs.items || [])];
  const jobs = [...catalog.items.map(value => ({ ...value, kind: 'items' })),
    ...catalog.champions.filter(c => c.set === catalog.currentSet).map(value => ({ ...value, kind: 'portraits' }))];
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (jobs.length) {
      const value = jobs.pop();
      if (!value.image) continue;
      const url = new URL(value.image);
      if (url.origin !== 'https://ddragon.leagueoflegends.com') throw new Error('Unexpected reference image origin');
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error(`Image HTTP ${response.status}: ${value.id}`);
      const name = createHash('sha256').update(value.id).digest('hex').slice(0, 24) + '.png';
      const file = `${value.kind}/${name}`;
      await mkdir(join(root, value.kind), { recursive: true });
      await writeFile(join(root, file), Buffer.from(await response.arrayBuffer()));
      if (value.kind === 'items' && !items.some(v => v.id === value.id && v.file === file)) items.push({ id: value.id, file });
    }
  }));
  await writeFile(join(root, 'references.json'), JSON.stringify({ ...refs, items }, null, 2));
}
console.log(JSON.stringify({ version: catalog.version, set: catalog.currentSet,
  champions: catalog.champions.filter(c => c.set === catalog.currentSet).length,
  traitsAvailable: catalog.traitDetailsAvailable, images: process.argv.includes('--images') }));
