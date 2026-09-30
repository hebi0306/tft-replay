import { indexStaticData, loadTftDataFiles } from './tftStaticData.js';

const cache = new Map();
const setNumber = id => Number(String(id).match(/(?:TFTSet|TFT|DA_)(\d+)(?:\/|_)/i)?.[1]) || null;
export function normalizeTftData(files) {
  const currentSet = Math.max(0, ...Object.keys(files.champion.data).map(id => setNumber(id) || 0));
  const read = kind => {
    const images = indexStaticData(files[kind], files.version, kind);
    return Object.entries(files[kind].data).map(([id, entry]) => ({
      id, apiId: entry.id, ...images[id.toLowerCase()], set: setNumber(id),
      cost: Number.isFinite(entry.cost ?? entry.tier) ? entry.cost ?? entry.tier : null,
      traits: Array.isArray(entry.traits) ? entry.traits : [],
      description: entry.description || entry.desc || null, type: entry.type || null,
      effects: Array.isArray(entry.effects) ? entry.effects : [],
    }));
  };
  const champions = read('champion'), items = read('item'), traits = read('trait');
  return { version: files.version, currentSet, champions, items, traits,
    traitDetailsAvailable: champions.some(c => c.set === currentSet && c.traits.length) && traits.some(t => t.set === currentSet && t.effects.length),
  };
}
export function getTftData(language = 'en') {
  const locale = language === 'ko' ? 'ko_KR' : 'en_US';
  if (!cache.has(locale)) cache.set(locale, loadTftDataFiles(locale).then(normalizeTftData).catch(error => { cache.delete(locale); throw error; }));
  return cache.get(locale);
}
export const getChampions = async language => (await getTftData(language)).champions;
export const getItems = async language => (await getTftData(language)).items;
export const getTraits = async language => (await getTftData(language)).traits;
