import { matches } from './matches.js';
// matches.js prepares mockGepData -> gepAdapter -> replayDiff -> UI rounds once.
// Independent demo recording. Never derive snapshots from a Riot final state.
export function getMockReplay(index = 0) {
  return { source: 'mock', recordingId: matches[index % matches.length].id, rounds: matches[index % matches.length].rounds };
}
export function getDemoRecords() {
  return matches.map((match, index) => {
    const { rounds, mockGepData, ...metadata } = match;
    const final = rounds.at(-1);
    return { match: { ...metadata, source: 'mock', level: final.level, goldLeft: final.gold, totalDamage: null, finalComposition: final.board, traits: final.traits }, replay: getMockReplay(index) };
  });
}
