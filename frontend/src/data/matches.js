import { adaptGepRecording } from '../services/gepAdapter.js';
// Fictional full-state capture payloads; not the official Overwolf event schema.
const champions = ['Ashe', 'Ornn', 'Ahri', 'Gnar', 'Morgana', 'Kennen', 'Rakan', 'Ivern', 'Zyra', 'Karma', 'Shen', 'Sejuani'];
const equipment = ['Giant Slayer', 'Guinsoo’s Rageblade', 'Warmog’s Armor'];
export const placementLabel = n => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`;
export const roundLabel = round => `${round.stage}-${round.round}`;
function makeMatch(variant, placement, duration, date, theme) {
  const mockGepData = [];
  let hp = 100, streak = 0, previousResult;
  for (let i = 0; i < 25; i++) {
    const stage = 2 + Math.floor(i / 5), round = i % 5 + 1;
    const level = Math.min(9, 3 + Math.floor(i / 3));
    const names = champions.slice(0, level).map((name, index) => champions[(champions.indexOf(name) + variant) % champions.length]);
    if (i >= 10) names[2] = champions[(9 + variant) % champions.length];
    const board = names.map((name, index) => {
      const slot = ([1, 23, 3, 5, 21, 8, 10, 26, 18][index] + (i % 5 === 2 ? 1 : 0)) % 28;
      return {
      id: `demo-${variant}-board-${name}`, name, starLevel: i >= 20 && index === 1 ? 3 : i >= 5 + index ? 2 : 1,
      position: { row: Math.floor(slot / 7), col: slot % 7 },
      items: equipment.slice(0, index === 1 ? Math.min(3, Math.floor(i / 5)) : index === 0 && i >= 12 ? 1 : 0),
    }; });
    const result = (i + variant) % 6 < 4 ? 'WIN' : 'LOSS';
    hp = Math.max(1, hp - (result === 'LOSS' ? 7 + variant : 0));
    if (i === 24 && placement > 1) hp = 0;
    streak = result === previousResult ? streak + 1 : 1;
    previousResult = result;
    const snapshot = { source: 'mock', stage: `${stage}-${round}`, round, level, hp, gold: i === 24 ? 3 + variant : 8 + ((i * 7 + variant * 3) % 49), result: i === 24 ? placement === 1 ? 'WIN' : 'LOSS' : result,
      streak, traits: [{ name: theme, count: Math.min(6, 2 + Math.floor(i / 5)) }, { name: 'Bastion', count: i < 8 ? 2 : 4 }, { name: 'Invoker', count: 2 }], board,
      bench: champions.slice(9 - i % 3, 12 - i % 3).map((name, index) => ({ id: `demo-${variant}-bench-${name}`, name, starLevel: i > 16 && index === 0 ? 2 : 1, benchPosition: index + i % 3, items: [] })),
    };
    if (i === 24 && snapshot.result !== result) snapshot.streak = 1;
    mockGepData.push(snapshot);
  }
  return { id: `demo-${variant + 1}`, date, placement, duration, finalStage: '6-5', mode: 'Ranked', theme, mockGepData, rounds: adaptGepRecording(mockGepData) };
}
export const matches = [
  makeMatch(0, 1, '34:21', 'Sep 15, 2026 · 10:42', 'Freljord'),
  makeMatch(1, 2, '32:08', 'Sep 14, 2026 · 21:16', 'Spirit'),
  makeMatch(2, 4, '31:45', 'Sep 14, 2026 · 20:38', 'Vanguard'),
  makeMatch(3, 3, '33:12', 'Sep 13, 2026 · 19:54', 'Arcanist'),
  makeMatch(4, 6, '30:06', 'Sep 13, 2026 · 19:12', 'Duelist'),
];
