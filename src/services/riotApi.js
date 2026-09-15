export class RiotApiError extends Error {
  constructor(message, status = 0, retryAfter = 0) { super(message); this.status = status; this.retryAfter = retryAfter; }
}
export function errorMessage(status, code, retryAfter) {
  if (status === 401 || status === 403) return 'Riot API 연결 권한이 없습니다. 잠시 후 다시 시도하세요.';
  if (status === 404) return '사용자 또는 경기를 찾을 수 없습니다. Riot ID, Tagline과 지역을 확인하세요.';
  if (status === 429) return `Riot API 요청 한도에 도달했습니다. ${retryAfter || 30}초 후 다시 시도하세요.`;
  if (code === 'UPSTREAM_TIMEOUT') return 'Riot 서버 응답 시간이 초과되었습니다. 잠시 후 다시 시도하세요.';
  if (code === 'UPSTREAM_NETWORK' || status === 0) return 'Backend 서버 연결을 확인하세요.';
  if (status >= 500) return 'Riot 서버에 일시적인 오류가 발생했습니다. 잠시 후 다시 시도하세요.';
  return '요청을 처리할 수 없습니다. 입력 정보와 지역을 확인하세요.';
}
async function request(path, params, { signal } = {}) {
  const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
  let response;
  try { response = await fetch(`${base}/api/riot/${path}?${new URLSearchParams(params)}`, { signal, headers: { Accept: 'application/json' } }); }
  catch (error) { if (error.name === 'AbortError') throw error; throw new RiotApiError(errorMessage(0)); }
  const body = await response.json().catch(() => null);
  if (!response.ok || body === null) {
    const retry = Number(body?.retryAfter) || 0;
    throw new RiotApiError(errorMessage(response.status, body?.error, retry), response.status, retry);
  }
  return body;
}
export const getAccountByRiotId = (gameName, tagLine, options = {}) => request('account', { gameName: gameName.trim(), tagLine: tagLine.trim(), region: options.region || 'asia' }, options);
export const getRecentTftMatchIds = (puuid, count = 10, options = {}) => request(`matches/${encodeURIComponent(puuid)}`, { count, region: options.region || 'asia' }, options);
export const getTftMatch = (matchId, options = {}) => request(`match/${encodeURIComponent(matchId)}`, { region: options.region || 'asia' }, options);
export async function getRecentTftMatches(puuid, options = {}) {
  const ids = await getRecentTftMatchIds(puuid, 10, options);
  if (!Array.isArray(ids)) throw new RiotApiError('경기 목록 응답 형식이 올바르지 않습니다.');
  const matches = [], warnings = [];
  // Sequential reads keep a single search below development-key burst limits.
  for (const id of ids.slice(0, 10)) {
    try { matches.push(await getTftMatch(id, options)); }
    catch (error) {
      if (error.name === 'AbortError') throw error;
      if ([401, 403, 429].includes(error.status)) throw error;
      warnings.push(`${id}: ${error.message}`);
    }
  }
  if (ids.length && !matches.length) throw new RiotApiError(warnings[0] || '경기를 불러올 수 없습니다.');
  return { matches, warnings };
}
