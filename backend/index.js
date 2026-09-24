import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRiotProxy } from './riotProxy.js';
const root = dirname(fileURLToPath(import.meta.url));
if (existsSync(resolve(root, '.env'))) process.loadEnvFile(resolve(root, '.env'));
const origins = new Set((process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',').map(value => value.trim()).filter(Boolean));
const isAllowedOrigin = origin => !origin || origins.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
const riot = createRiotProxy({ apiKey: process.env.RIOT_API_KEY, corsOrigins: origins, originAllowed: isAllowedOrigin });
createServer((req, res) => {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return res.writeHead(403, { 'Content-Type': 'application/json' }).end('{"error":"ORIGIN_DENIED"}');
  if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  if (req.url === '/health') return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"status":"ok"}');
  const url = new URL(req.url, 'http://backend');
  const matches = url.pathname.match(/^\/api\/riot\/matches\/([\w-]+)$/);
  if (matches) { url.pathname = '/api/riot/matches'; url.searchParams.set('puuid', matches[1]); }
  req.url = `${url.pathname}${url.search}`;
  riot(req, res);
}).listen(Number(process.env.PORT) || 8080, () => console.log('TFT Replay backend listening'));
