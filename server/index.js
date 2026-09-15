import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startAppServer } from './appServer.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const server = await startAppServer({ root, port: Number(process.env.PORT) || 4173 });
console.log(`TFT Replay: http://127.0.0.1:${server.address().port}`);
