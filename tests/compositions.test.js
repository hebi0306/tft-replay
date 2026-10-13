import test from 'node:test';
import assert from 'node:assert/strict';
import { saveComposition, updateComposition, getCompositions, getCompositionById, deleteComposition, searchCompositions, placeChampion, equipItem, validateComposition, calculateTraits } from '../frontend/src/services/teamCompositionService.js';
import { normalizeTftData, mergeTraitData, classifyItem } from '../frontend/src/services/tftDataService.js';
const storage = () => { let value = null; return { getItem: () => value, setItem: (_, next) => { value = next; } }; };
const unit = (id, cell = 0, items = []) => ({ championId: id, position: { row: Math.floor(cell / 7), column: cell % 7 }, items });

test('item categories distinguish equipment from radiant consumables and special items', () => {
  for (const [id, category] of [
    ['DA_Component_BFSword', 'normal'], ['DA_SpearOfShojin', 'normal'],
    ['DA_18_EmblemBlossom', 'emblem'], ['DA_Artifact_Manazane', 'artifact'],
    ['DA_Item_Artifact_TalismanOfAscension', 'artifact'], ['DA_SpearOfShojinRadiant', 'radiant'],
    ['DA_AdaptiveHelm_Radiant', 'radiant'], ['DA_BlastPotion18_Radiant', 'other'],
    ['DA_RadiantLuckyItemChest', 'other'], ['DA_Consumable_ItemRemover', 'other'],
    ['DA_MasterworkUpgrade', 'other'], ['unknown', 'other'],
  ]) assert.equal(classifyItem(id), category, id);
});

test('trait supplement preserves official art and counts unique champions across activation thresholds', () => {
  const base = { currentSet: 18, champions: [{ id: 'a', apiId: 'A', set: 18, name: '공식 이름', image: 'official.png' }, { id: 'b', apiId: 'B', set: 18 }], traits: [{ id: 'trait', apiId: 'T', name: '공식 특성', image: 'trait.png' }] };
  const data = { setData: [{ number: 18, champions: [{ apiName: 'A', traits: ['Localized trait'] }, { apiName: 'B', traits: ['Localized trait'] }], traits: [{ apiName: 'T', name: 'Localized trait', effects: [{ minUnits: 2 }, { minUnits: 4 }] }] }] };
  const catalog = mergeTraitData(base, data);
  assert.equal(catalog.champions[0].image, 'official.png');
  assert.equal(catalog.champions[0].name, '공식 이름');
  assert.equal(catalog.traitDataIncomplete, false);
  let result = calculateTraits([unit('a'), unit('a')], catalog)[0];
  assert.equal(result.count, 1); assert.equal(result.active, false); assert.equal(result.next, 2);
  result = calculateTraits([unit('a'), unit('b')], catalog)[0];
  assert.equal(result.count, 2); assert.equal(result.active, true); assert.equal(result.tier, 1); assert.equal(result.next, 4);
  assert.throws(() => mergeTraitData(base, { setData: [] }), /Missing trait set/);
});

test('composition create, edit, reload and delete preserve identity and store only IDs and positions', () => {
  const store = storage();
  const first = saveComposition({ name: ' My team ', champions: [{ ...unit('ahri'), image: 'do-not-store', name: 'Ahri' }] }, store);
  assert.equal(first.name, 'My team');
  assert.deepEqual(Object.keys(first.champions[0]).sort(), ['championId', 'items', 'position', 'stars']);
  const updated = updateComposition(first.id, { name: 'Renamed', champions: [unit('ahri', 23, ['shojin'])] }, store);
  assert.equal(updated.id, first.id); assert.equal(updated.createdAt, first.createdAt);
  assert.equal(getCompositions(store).length, 1);
  assert.deepEqual(getCompositionById(first.id, store).champions, [{ ...unit('ahri', 23, ['shojin']), stars: 1 }]);
  deleteComposition(first.id, store); assert.deepEqual(getCompositions(store), []);
  assert.throws(() => updateComposition(first.id, first, store), /compositionMissing/);
});
test('invalid or inaccessible storage is not overwritten', () => {
  let writes = 0;
  const broken = { getItem: () => '{broken', setItem: () => writes++ };
  assert.throws(() => saveComposition({ name: 'Team', champions: [unit('a')] }, broken), /compositionReadError/);
  assert.equal(writes, 0);
  assert.throws(() => saveComposition({ name: 'Team', champions: [unit('a')] }, { getItem: () => null, setItem: () => { throw new Error('quota'); } }), /compositionWriteError/);
});
test('board moves and swaps without duplicates; item limits and replacement hold', () => {
  let units = placeChampion([], 'ahri', 0);
  units = placeChampion(units, 'ornn', 1);
  assert.deepEqual(placeChampion(units, 'new', 1), units);
  const swapped = placeChampion(units, 'ahri', 1);
  assert.equal(swapped.length, 2); assert.deepEqual(swapped[1].position, { row: 0, column: 0 });
  assert.deepEqual(units[0].position, { row: 0, column: 0 });
  for (const id of ['a', 'b', 'c', 'd']) units = equipItem(units, 'ahri', id);
  assert.deepEqual(units[0].items, ['a', 'b', 'c']);
  units = equipItem(units, 'ahri', 'replacement', 1);
  assert.deepEqual(units[0].items, ['a', 'replacement', 'c']);
  for (const champions of [[unit('a'), unit('a', 1)], [unit('a'), unit('b')], [unit('a', 28)], [unit('a', 0, ['a','b','c','d'])], []]) assert.throws(() => validateComposition({ name: 'Team', champions }), /compositionInvalid/);
});
test('composition search matches localized names, partial text, case and whitespace with filters', () => {
  const catalog = { champions: [{ id: 'ahri', name: '아리' }], items: [{ id: 'shojin', name: '쇼진의 창' }] };
  const rows = [{ name: 'My Team', updatedAt: '2026-09-30', champions: [unit('ahri', 0, ['shojin'])] }];
  assert.equal(searchCompositions(rows, ' my  TEAM ', 'all', catalog).length, 1);
  assert.equal(searchCompositions(rows, ' 아 ', 'champions', catalog).length, 1);
  assert.equal(searchCompositions(rows, '쇼 진', 'items', catalog).length, 1);
  assert.equal(searchCompositions(rows, '아리', 'items', catalog).length, 0);
  assert.equal(searchCompositions(rows, '없는', 'all', catalog).length, 0);
});
test('official metadata chooses its newest set dynamically and never invents missing trait data', () => {
  const catalog = normalizeTftData({ version: 'test', champion: { data: { 'Maps/TFTSet18/Shop/A': { id: 'a', name: 'A', tier: 2, image: { full: 'a.png' } }, 'Maps/TFTSet19/Shop/B': { id: 'b', name: 'B', cost: 3 } } }, item: { data: { 'TFTSet19/Item/X': { name: 'X' } } }, trait: { data: { DA_19_Test: { name: 'Test' } } } });
  assert.equal(catalog.currentSet, 19); assert.equal(catalog.champions[0].cost, 2);
  assert.match(catalog.champions[0].image, /ddragon.leagueoflegends.com/);
  assert.equal(catalog.traitDetailsAvailable, false); assert.deepEqual(calculateTraits([unit('Maps/TFTSet19/Shop/B')], catalog), []);
});

 test('star levels persist and legacy teams default to one star', () => {
  const store = storage();
  const row = saveComposition({ name: 'Stars', champions: [{ ...unit('a'), stars: 3 }] }, store);
  assert.equal(getCompositionById(row.id, store).champions[0].stars, 3);
  assert.equal(validateComposition({ name: 'Legacy', champions: [unit('a')] }).champions[0].stars, 1);
  for (const stars of [0, 4, 1.5, '2', null]) assert.throws(() => validateComposition({ name: 'Invalid', champions: [{ ...unit('a'), stars }] }));
  assert.equal(placeChampion(row.champions, 'a', 5)[0].stars, 3);
 });
 test('emblems map by metadata ID and count once per holder through equip, replace and remove', () => {
  const catalog = normalizeTftData({ version: 'test', champion: { data: { 'Maps/TFTSet18/Shop/A': { id: 'A', traits: ['DA_18_Blossom'] }, 'Maps/TFTSet18/Shop/B': { id: 'B' } } }, item: { data: { 'TFTSet18/Item/E': { id: 'DA_18_EmblemBlossom' }, 'TFTSet18/Item/U': { id: 'DA_18_EmblemUnknown' } } }, trait: { data: { DA_18_Blossom: { id: 'DA_18_Blossom', effects: [{ minUnits: 2 }] } } } });
  const [a,b] = catalog.champions.map(c => c.id), [e,u] = catalog.items.map(i => i.id);
  assert.equal(catalog.items[0].traitId, 'DA_18_Blossom'); assert.equal(catalog.items[1].traitId, null);
  let units = [unit(a, 0, [e,e]), unit(b, 1)];
  assert.equal(calculateTraits(units, catalog)[0].count, 1);
  units = equipItem(units, b, e);
  assert.equal(calculateTraits(units, catalog)[0].count, 2); assert.equal(calculateTraits(units, catalog)[0].active, true);
  units = equipItem(units, b, u, 0);
  assert.equal(calculateTraits(units, catalog)[0].count, 1);
  assert.equal(calculateTraits([unit(b)], catalog).length, 0);
 });
