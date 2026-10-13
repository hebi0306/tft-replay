const STORAGE_KEY = 'tft-replay-compositions-v1';
export const normalizeSearch = value => String(value ?? '').normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, '');

export function validateComposition(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 100 || !Array.isArray(value.champions) || !value.champions.length || value.champions.length > 28) throw new Error('compositionInvalid');
  const ids = new Set(), cells = new Set();
  for (const unit of value.champions) {
    const { row, column } = unit.position || {};
    if (typeof unit.championId !== 'string' || !unit.championId || ids.has(unit.championId) || !Number.isInteger(row) || row < 0 || row > 3 || !Number.isInteger(column) || column < 0 || column > 6 || cells.has(row * 7 + column) || !Array.isArray(unit.items) || unit.items.length > 3 || unit.items.some(id => typeof id !== 'string' || !id)) throw new Error('compositionInvalid');
    if (unit.stars !== undefined && ![1, 2, 3].includes(unit.stars)) throw new Error('compositionInvalid');
    ids.add(unit.championId); cells.add(row * 7 + column);
  }
  return { name: value.name.trim(), champions: value.champions.map(unit => ({ championId: unit.championId, stars: unit.stars ?? 1, position: { row: unit.position.row, column: unit.position.column }, items: [...unit.items] })) };
}
export function getCompositions(storage = localStorage) {
  try {
    const rows = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
    if (!Array.isArray(rows)) throw new Error();
    const ids = new Set();
    rows.forEach(row => {
      validateComposition(row);
      if (typeof row.id !== 'string' || !row.id || ids.has(row.id) || !Number.isFinite(Date.parse(row.createdAt)) || !Number.isFinite(Date.parse(row.updatedAt))) throw new Error();
      ids.add(row.id);
    });
    return rows;
  } catch { throw new Error('compositionReadError'); }
}
export const getCompositionById = (id, storage) => getCompositions(storage).find(row => row.id === id);
function write(rows, storage) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(rows)); }
  catch { throw new Error('compositionWriteError'); }
}
export function saveComposition(value, storage = localStorage) {
  const data = validateComposition(value), rows = getCompositions(storage), now = new Date().toISOString();
  const row = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now };
  write([row, ...rows], storage); return row;
}
export function updateComposition(id, value, storage = localStorage) {
  const data = validateComposition(value), rows = getCompositions(storage), index = rows.findIndex(row => row.id === id);
  if (index < 0) throw new Error('compositionMissing');
  rows[index] = { ...rows[index], ...data, updatedAt: new Date().toISOString() };
  write(rows, storage); return rows[index];
}
export function deleteComposition(id, storage = localStorage) { write(getCompositions(storage).filter(row => row.id !== id), storage); }
export function searchCompositions(rows, query, filter, catalog) {
  const q = normalizeSearch(query);
  const matches = text => normalizeSearch(text).includes(q);
  return rows.filter(row => !q || ((filter === 'all' || filter === 'mine') && matches(row.name)) || row.champions.some(unit =>
    (filter !== 'items' && matches(catalog.champions.find(c => c.id === unit.championId)?.name || unit.championId)) ||
    (filter !== 'champions' && unit.items.some(id => matches(catalog.items.find(item => item.id === id)?.name || id)))
  )).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export function placeChampion(units, championId, cell) {
  if (!Number.isInteger(cell) || cell < 0 || cell >= 28) return units;
  const existing = units.find(unit => unit.championId === championId);
  const target = units.find(unit => unit.position.row * 7 + unit.position.column === cell);
  if (target && !existing) return units;
  const position = { row: Math.floor(cell / 7), column: cell % 7 };
  return existing ? units.map(unit => unit === existing ? { ...unit, position } : unit === target ? { ...unit, position: { ...existing.position } } : unit)
    : [...units, { championId, position, stars: 1, items: [] }];
}
export function equipItem(units, championId, itemId, slot = null) {
  return units.map(unit => {
    if (unit.championId !== championId) return unit;
    const items = [...unit.items];
    if (slot !== null && slot >= 0 && slot < items.length) items[slot] = itemId;
    else if (items.length < 3) items.push(itemId);
    return { ...unit, items };
  });
}
export function calculateTraits(units, catalog) {
  const counts = new Map();
  for (const id of new Set(units.map(unit => unit.championId))) {
    const champion = catalog.champions.find(c => c.id === id);
    const traits = new Set(champion?.traits || []);
    for (const unit of units.filter(unit => unit.championId === id)) {
      for (const itemId of unit.items) {
        const emblem = catalog.items?.find(item => item.id === itemId && item.type === 'emblem');
        if (emblem?.traitId) traits.add(emblem.traitId);
      }
    }
    for (const trait of traits) counts.set(trait, (counts.get(trait) || 0) + 1);
  }
  return [...counts].map(([id, count]) => {
    const trait = catalog.traits.find(t => t.id === id);
    const thresholds = (trait?.effects || []).map(effect => effect.minUnits).filter(Number.isFinite).sort((a, b) => a - b);
    return { ...trait, id, name: trait?.name || id, count, thresholds, tier: thresholds.filter(n => count >= n).length, active: thresholds.some(n => count >= n), next: thresholds.find(n => n > count) ?? thresholds.at(-1) ?? null };
  }).sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count);
}
