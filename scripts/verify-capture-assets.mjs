import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve, relative, isAbsolute } from 'node:path';

const json = path => JSON.parse(readFileSync(path, 'utf8'));
const models = json('capture/models/release-sha256.json');
for (const name of ['unit.onnx', 'champion-identity.onnx']) {
  const hash = createHash('sha256').update(readFileSync('capture/models/' + name)).digest('hex');
  if (hash !== models[name]) throw new Error('Capture model checksum mismatch: ' + name);
}
json('capture/models/champion-identity.json');
const data = resolve('capture/data');
const references = json(resolve(data, 'references.json'));
const catalog = json(resolve(data, 'catalog.json'));
if (!catalog.champions?.length || !references.champions?.length || !references.items?.length) {
  throw new Error('Capture catalog or reference data is incomplete');
}
const hudRoot = resolve(data, 'unit-hud');
const files = [
  ...Object.values(references).flat(),
  ...['items.json', 'references.json'].flatMap(name => json(resolve(hudRoot, name)))
    .map(entry => ({ ...entry, file: 'unit-hud/' + entry.file })),
];
for (const entry of files) {
  const file = resolve(data, entry.file);
  const rel = relative(data, file);
  if (!rel || rel.startsWith('..') || isAbsolute(rel) || !statSync(file).isFile()) {
    throw new Error('Invalid capture reference: ' + entry.file);
  }
}
console.log('Capture models, catalog and reference images verified.');
