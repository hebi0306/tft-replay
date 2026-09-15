import { compareReplaySnapshots } from '../utils/replayDiff.js';

// Application-owned full-state capture contract, NOT Overwolf's raw event schema.
// A future collector must accumulate supported player events into this shape.
// All current inputs are simulated; no Overwolf API is imported or called here.
function integer(value, min, max, field) {
  if (!Number.isInteger(value) || value < min || value > max) throw new TypeError(`Invalid replay ${field}`);
  return value;
}
function mapUnits(units, bench = false) {
  if (!Array.isArray(units)) throw new TypeError('Replay units must be an array');
  const ids = new Set(), occupied = new Set();
  return units.map(unit => {
    if (!unit || typeof unit.id !== 'string' || !unit.id || ids.has(unit.id) || typeof unit.name !== 'string' || !unit.name) throw new TypeError('Replay units need unique instance IDs and names');
    ids.add(unit.id);
    const position = bench ? integer(unit.benchPosition, 0, 8, 'benchPosition') : integer(unit.position?.row, 0, 3, 'row') * 7 + integer(unit.position?.col, 0, 6, 'col');
    if (occupied.has(position)) throw new TypeError('Duplicate replay unit position');
    occupied.add(position);
    if (!Array.isArray(unit.items) || unit.items.some(item => typeof item !== 'string' && (!item || typeof item.name !== 'string'))) throw new TypeError('Invalid replay items');
    return { id: unit.id, name: unit.name, star: integer(unit.starLevel, 1, 4, 'starLevel'),
      ...(bench ? { benchPosition: position } : { position }),
      items: unit.items.map(item => typeof item === 'string' ? item : { ...item }),
    };
  });
}
export function mapGepDataToReplayRound(data, previousRound = null) {
  if (!data || !['mock', 'gep'].includes(data.source)) throw new TypeError('Replay source must be explicit');
  const parts = typeof data.stage === 'string' ? data.stage.match(/^(\d+)-(\d+)$/) : null;
  const stage = integer(parts ? Number(parts[1]) : data.stage, 1, 99, 'stage');
  const round = integer(data.round, 1, 99, 'round');
  if (parts && Number(parts[2]) !== round) throw new TypeError('Replay stage/round mismatch');
  if (!['WIN', 'LOSS'].includes(data.result)) throw new TypeError('Invalid replay result');
  if (!Array.isArray(data.traits)) throw new TypeError('Invalid replay traits');
  const snapshot = {
    source: data.source, stage, round,
    level: integer(data.level, 1, 99, 'level'), hp: integer(data.hp, 0, 999, 'hp'),
    gold: integer(data.gold, 0, 9999, 'gold'), result: data.result,
    streak: integer(data.streak, 0, 999, 'streak'),
    board: mapUnits(data.board), bench: mapUnits(data.bench, true),
    traits: data.traits.map(trait => ({ ...trait })),
  };
  // Input changes are intentionally ignored: this is derived from snapshots.
  snapshot.changes = compareReplaySnapshots(previousRound, snapshot);
  return snapshot;
}
export function adaptGepRecording(snapshots) {
  const rounds = [];
  for (const snapshot of snapshots) rounds.push(mapGepDataToReplayRound(snapshot, rounds.at(-1)));
  return rounds;
}
