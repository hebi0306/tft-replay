const CDN = 'https://ddragon.leagueoflegends.com';
const catalogs = new Map();
let versionsPromise;
async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Data Dragon HTTP ${response.status}`);
  return response.json();
}
export function indexStaticData(data, version, kind) {
  const index = Object.create(null);
  for (const [key, entry] of Object.entries(data?.data || {})) {
    const value = { name: entry.name || null, image: entry.image?.full ? `${CDN}/cdn/${version}/img/tft-${kind}/${encodeURIComponent(entry.image.full)}` : null };
    for (const id of [key, entry.id, key.split('/').at(-1)]) if (id != null) index[String(id).toLowerCase()] = value;
  }
  return index;
}
export async function loadTftStaticData(gameVersion) {
  try {
    versionsPromise ||= json(`${CDN}/api/versions.json`).catch(error => { versionsPromise = undefined; throw error; });
    const versions = await versionsPromise;
    const patch = gameVersion?.match(/(?:Version\s+)?(\d+\.\d+)\./i)?.[1];
    const matched = patch && versions.find(version => version.startsWith(`${patch}.`));
    const version = matched || versions[0];
    if (!version) throw new Error('No Data Dragon version');
    if (!catalogs.has(version)) catalogs.set(version, Promise.all(['champion', 'item', 'trait'].map(async kind => [kind, indexStaticData(await json(`${CDN}/cdn/${version}/data/en_US/tft-${kind}.json`), version, kind)]))
      .then(entries => Object.fromEntries(entries)).catch(error => { catalogs.delete(version); throw error; }));
    return { ...await catalogs.get(version), version, warning: !matched ? '경기 패치의 정적 데이터를 찾지 못해 최신 Data Dragon을 사용했습니다.' : null, warningCode: !matched ? 'staticFallback' : null };
  } catch {
    return { champion: {}, item: {}, trait: {}, version: null, warning: 'Data Dragon을 불러오지 못했습니다. 경기 정보는 표시하며, 이름/이미지를 찾지 못한 항목은 Unknown으로 표시합니다.', warningCode: 'staticUnavailable' };
  }
}
// Swap/extend this lookup for older sets or CommunityDragon without changing UI.
export function resolveStatic(catalog, kind, id) {
  const entry = catalog?.[kind]?.[String(id ?? '').toLowerCase()];
  return { apiId: id ?? null, name: entry?.name || `Unknown ${kind}`, image: entry?.image || null, resolved: Boolean(entry?.name) };
}
