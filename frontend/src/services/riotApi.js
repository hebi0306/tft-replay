import { translate } from '../i18n/translations.js';
export class RiotApiError extends Error {
  constructor(message, status = 0, retryAfter = 0, key = 'requestError') { super(message); this.status = status; this.retryAfter = retryAfter; this.key = key; }
}
export function errorKey(status, code) {
  if (status === 401 || status === 403) return 'riotNoPermission';
  if (status === 404) return 'riotNotFound';
  if (status === 429) return 'riotRateLimit';
  if (code === 'UPSTREAM_TIMEOUT') return 'riotTimeout';
  if (code === 'UPSTREAM_NETWORK' || status === 0) return 'backendConnection';
  if (status >= 500) return 'riotServerError';
  return 'requestError';
}
export function errorMessage(status, code, retryAfter, language = 'en') {
  return translate(language, errorKey(status, code), { seconds: retryAfter || 30 });
}
async function request(path, params, { signal, language = 'en' } = {}) {
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
  let response;
  try { response = await fetch(`${base}/api/riot/${path}?${new URLSearchParams(params)}`, { signal, headers: { Accept: 'application/json' } }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new RiotApiError(errorMessage(0, null, 0, language), 0, 0, errorKey(0)); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    const retry = Number(body?.retryAfter) || 0;
    throw new RiotApiError(errorMessage(response.status, body?.error, retry, language), response.status, retry, errorKey(response.status, body?.error));
  }
  return body;
}
export const getAccountByRiotId = (gameName, tagLine, options = {}) => request('account', { gameName: gameName.trim(), tagLine: tagLine.trim(), region: options.region || 'asia' }, options);
export const getRecentTftMatchIds = (puuid, count = 10, options = {}) => request(`matches/${encodeURIComponent(puuid)}`, { count, region: options.region || 'asia' }, options);
export const getTftMatch = (matchId, options = {}) => request(`match/${encodeURIComponent(matchId)}`, { region: options.region || 'asia' }, options);
export async function getRecentTftMatches(puuid, options = {}) {
  const ids = await getRecentTftMatchIds(puuid, 10, options);
  if (!Array.isArray(ids)) throw new RiotApiError(translate(options.language || 'en', 'invalidMatchList'), 0, 0, 'invalidMatchList');
  const matches = [], warnings = [];
  // Sequential reads keep a single search below development-key burst limits.
  for (const id of ids.slice(0, 10)) {
    try { matches.push(await getTftMatch(id, options)); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      if ([401, 403, 429].includes(error.status)) throw error;
      warnings.push({ id, key: error.key || 'requestError', retryAfter: error.retryAfter });
    }
  }
  if (ids.length && !matches.length) throw new RiotApiError(translate(options.language || 'en', 'matchesUnavailable'), 0, 0, 'matchesUnavailable');
  return { matches, warnings };
}
