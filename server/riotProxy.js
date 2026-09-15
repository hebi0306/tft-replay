const regions = new Set(['asia', 'americas', 'europe', 'sea']);
const allowedHost = /^(localhost|127\.0\.0\.1)(:\d+)?$/;

function send(res, status, data, retryAfter) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (retryAfter) res.setHeader('Retry-After', String(retryAfter));
  res.statusCode = status;
  res.end(JSON.stringify(data));
}

export function createRiotProxy({ apiKey, fetchImpl = fetch, timeoutMs = 12000, corsOrigins } = {}) {
  let blockedUntil = 0;
  return async function riotProxy(req, res, next = () => send(res, 404, { error: 'NOT_FOUND' })) {
    if (!req.url?.startsWith('/api/')) return next();
    const origin = req.headers.origin;
    if (corsOrigins) {
      if (origin && !corsOrigins.has(origin)) return send(res, 403, { error: 'ORIGIN_DENIED' });
      if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      if (req.method === 'OPTIONS') return res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, OPTIONS' }).end();
    }
    // Local app server only: reject cross-origin websites and DNS rebinding requests.
    const host = req.headers.host || '';
    if (!corsOrigins && (!allowedHost.test(host) || (origin && origin !== `http://${host}`))) {
      return send(res, 403, { error: 'ORIGIN_DENIED' });
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/api/health') return send(res, 200, { configured: Boolean(apiKey?.trim()) });
    const region = url.searchParams.get('region') || 'asia';
    if (!regions.has(region)) return send(res, 400, { error: 'INVALID_REGION' });
    let path;
    const query = url.searchParams;
    if (url.pathname === '/api/riot/account') {
      const name = query.get('gameName')?.trim(), tag = query.get('tagLine')?.trim();
      if (!name || !tag || name.length > 100 || tag.length > 30) return send(res, 400, { error: 'INVALID_RIOT_ID' });
      path = `/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`;
    } else if (url.pathname === '/api/riot/matches') {
      const puuid = query.get('puuid') || '';
      const count = Number(query.get('count') || 10);
      if (!/^[\w-]{8,128}$/.test(puuid) || !Number.isInteger(count) || count < 1 || count > 10) return send(res, 400, { error: 'INVALID_QUERY' });
      path = `/tft/match/v1/matches/by-puuid/${encodeURIComponent(puuid)}/ids?start=0&count=${count}`;
    } else if (url.pathname.startsWith('/api/riot/match/')) {
      const id = url.pathname.slice('/api/riot/match/'.length);
      if (!/^[A-Z0-9]+_\d+$/.test(id)) return send(res, 400, { error: 'INVALID_MATCH_ID' });
      path = `/tft/match/v1/matches/${id}`;
    } else return send(res, 404, { error: 'NOT_FOUND' });
    if (!apiKey?.trim()) return send(res, 503, { error: 'KEY_NOT_CONFIGURED' });
    const retry = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (retry > 0) return send(res, 429, { error: 'RATE_LIMIT', retryAfter: retry }, retry);
    // Account routing uses the Asia cluster for SEA; match history uses SEA.
    const routing = url.pathname === '/api/riot/account' && region === 'sea' ? 'asia' : region;
    try {
      const response = await fetchImpl(`https://${routing}.api.riotgames.com${path}`, {
        headers: { 'X-Riot-Token': apiKey.trim(), Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs), redirect: 'error',
      });
      if (!response.ok) {
        const retryAfter = Math.max(1, Number(response.headers.get('Retry-After')) || 30);
        if (response.status === 429) blockedUntil = Date.now() + retryAfter * 1000;
        // Do not forward upstream bodies, headers, or credentials to the browser.
        return send(res, response.status, { error: response.status === 429 ? 'RATE_LIMITED' : 'RIOT_ERROR', ...(response.status === 429 ? { message: 'Riot API rate limit exceeded.', retryAfter } : {}) }, response.status === 429 ? retryAfter : undefined);
      }
      const data = await response.json();
      return send(res, 200, data);
    } catch (error) {
      const timeout = error.name === 'TimeoutError' || error.name === 'AbortError';
      return send(res, timeout ? 504 : 502, { error: timeout ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK' });
    }
  };
}
