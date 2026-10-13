import { indexStaticData, loadTftDataFiles } from './tftStaticData.js';

const cache = new Map();
export function classifyItem(id = '') {
  // ponytail: infer categories from Riot IDs; update these rules if its naming schema changes.
  if (/consumable|potion|booster|chest|reforger|masterwork|support/i.test(id)) return 'other';
  if (/emblem/i.test(id)) return 'emblem';
  if (/artifact/i.test(id)) return 'artifact';
  if (/radiant/i.test(id)) return 'radiant';
  return /^DA_|^TFT_Item_/i.test(id) ? 'normal' : 'other';
}
export function mergeTraitData(catalog, data) {
  const set = data.setData?.find(set => set.number === catalog.currentSet);
  if (!set?.champions?.length || !set?.traits?.length) throw new Error('Missing trait set');
  const traitIds = new Map();
  const traits = catalog.traits.map(trait => {
    const extra = set.traits.find(value => value.apiName === trait.apiId);
    if (!extra) return trait;
    traitIds.set(extra.name, trait.id);
    traitIds.set(extra.apiName, trait.id);
    return { ...trait, effects: extra.effects.filter(effect => Number.isFinite(effect.minUnits) && effect.minUnits > 0) };
  });
  let incomplete = false;
  const champions = catalog.champions.map(champion => {
    if (champion.set !== catalog.currentSet) return champion;
    const extra = set.champions.find(value => value.apiName === champion.apiId)
      || set.champions.find(value => value.name === champion.name);
    if (!extra || extra.traits.some(name => !traitIds.has(name))) incomplete = true;
    return { ...champion, traits: (extra?.traits || []).map(name => traitIds.get(name)).filter(Boolean) };
  });
  return { ...catalog, champions, traits, traitDetailsAvailable: true, traitDataIncomplete: incomplete };
}
async function withTraits(catalog, locale) {
  try {
    const patch = catalog.version.split('.').slice(0, 2).join('.');
    const response = await fetch(`https://raw.communitydragon.org/${patch}/cdragon/tft/${locale.toLowerCase()}.json`, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error('Trait data unavailable');
    return mergeTraitData(catalog, await response.json());
  } catch { return { ...catalog, traitDetailsAvailable: false }; }
}
const setNumber = id => Number(String(id).match(/(?:TFTSet|TFT|DA_)(\d+)(?:\/|_)/i)?.[1]) || null;
export function normalizeTftData(files) {
  const currentSet = Math.max(0, ...Object.keys(files.champion.data).map(id => setNumber(id) || 0));
  const read = kind => {
    const images = indexStaticData(files[kind], files.version, kind);
    return Object.entries(files[kind].data).map(([id, entry]) => ({
      id, apiId: entry.id, ...images[id.toLowerCase()], set: setNumber(id),
      cost: Number.isFinite(entry.cost ?? entry.tier) ? entry.cost ?? entry.tier : null,
      traits: Array.isArray(entry.traits) ? entry.traits : [],
      description: entry.description || entry.desc || null, type: kind === 'item' ? classifyItem(entry.id || id) : entry.type || null,
      effects: Array.isArray(entry.effects) ? entry.effects : [],
    }));
  };
  const champions = read('champion'), items = read('item'), traits = read('trait');
  for (const item of items.filter(item => item.type === 'emblem')) {
    // ponytail: match Riot's exact Emblem ID convention; unknown IDs stay unmapped until metadata supports them.
    const traitApiId = item.apiId?.replace(/_Emblem/, '_');
    item.traitId = traits.find(trait => trait.set === item.set && trait.apiId === traitApiId)?.id || null;
  }
  return { version: files.version, currentSet, champions, items, traits,
    traitDetailsAvailable: champions.some(c => c.set === currentSet && c.traits.length) && traits.some(t => t.set === currentSet && t.effects.length),
  };
}
export function getTftData(language = 'en') {
  const locale = language === 'ko' ? 'ko_KR' : 'en_US';
  if (!cache.has(locale)) cache.set(locale, loadTftDataFiles(locale).then(normalizeTftData).then(catalog => withTraits(catalog, locale)).then(catalog => {
    if (!catalog.traitDetailsAvailable) cache.delete(locale);
    return catalog;
  }).catch(error => { cache.delete(locale); throw error; }));
  return cache.get(locale);
}
export const getChampions = async language => (await getTftData(language)).champions;
export const getItems = async language => (await getTftData(language)).items;
export const getTraits = async language => (await getTftData(language)).traits;
