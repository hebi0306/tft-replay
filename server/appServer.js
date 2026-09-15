import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

export function startAppServer({ root, port = 4173 } = {}) {
  const dist = resolve(root, 'dist');
  const server = createServer((req, res) => {
    if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { return res.writeHead(400).end(); }
    const file = resolve(dist, `.${pathname}`);
    if (file !== dist && !file.startsWith(dist + sep)) return res.writeHead(403).end();
    const target = existsSync(file) && statSync(file).isFile() ? file : !extname(pathname) ? resolve(dist, 'index.html') : null;
    if (!target || !existsSync(target)) return res.writeHead(404).end('Build the app with npm run build first.');
    res.writeHead(200, { 'Content-Type': mime[extname(target)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') res.end();
    else createReadStream(target).on('error', () => res.destroy()).pipe(res);
  });
  return new Promise((resolveServer, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => resolveServer(server));
  });
}
