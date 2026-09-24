import { matches } from './matches.js';
// matches.js prepares mockGepData -> gepAdapter -> replayDiff -> UI rounds once.
// Independent demo recording. Never derive snapshots from a Riot final state.
export function getMockReplay(index = 0) {
  return { source: 'mock', recordingId: matches[index % matches.length].id, rounds: matches[index % matches.length].rounds };
}
export function getDemoRecords(catalog) {
  const set18 = new Map(Object.entries(catalog?.champion || {})
    .filter(([id]) => id.includes('/tftset18/shop/'))
    .map(([, champion]) => [champion.name, champion.image]));
  const withImage = unit => ({ ...unit, image: set18.get(unit.name) || null });
  return matches.map((match, index) => {
    const { rounds, mockGepData, ...metadata } = match;
    const replay = { ...getMockReplay(index), rounds: rounds.map(round => ({
      ...round, board: round.board.map(withImage), bench: round.bench.map(withImage),
    })) };
    const final = replay.rounds.at(-1);
    return { match: { ...metadata, source: 'mock', level: final.level, goldLeft: final.gold, totalDamage: null, finalComposition: final.board, traits: final.traits }, replay };
  });
}
