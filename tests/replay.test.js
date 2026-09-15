import test from 'node:test';
import assert from 'node:assert/strict';
import { mapGepDataToReplayRound, adaptGepRecording } from '../src/services/gepAdapter.js';
import { compareReplaySnapshots } from '../src/utils/replayDiff.js';
import { matches } from '../src/data/matches.js';

const unit = (id, name, row, col, starLevel = 1, items = []) => ({ id, name, starLevel, position: { row, col }, items });
const raw = () => ({ source: 'mock', stage: '3-2', round: 2, level: 6, hp: 82, gold: 0, result: 'WIN', streak: 2, board: [unit('ashe-1', 'Ashe', 2, 4)], bench: [{ id: 'jax-1', name: 'Jax', starLevel: 1, benchPosition: 7, items: [] }], traits: [{ name: 'Bastion', count: 2 }] });
test('capture adapter maps coordinates and sparse bench slots without mutating input', () => {
  const input = raw(), before = structuredClone(input);
  const snapshot = mapGepDataToReplayRound(input);
  assert.equal(snapshot.stage, 3); assert.equal(snapshot.round, 2);
  assert.equal(snapshot.board[0].position, 18); assert.equal(snapshot.board[0].star, 1);
  assert.equal(snapshot.bench[0].benchPosition, 7);
  assert.equal(snapshot.gold, 0); assert.equal(snapshot.source, 'mock');
  assert.deepEqual(snapshot.changes, ['Replay started']);
  snapshot.board[0].items.push('Test item'); snapshot.traits[0].count = 9;
  assert.deepEqual(input, before);
});
test('adapter rejects mismatched rounds, invalid coordinates and duplicate unit positions/IDs', () => {
  assert.throws(() => mapGepDataToReplayRound({ ...raw(), round: 3 }), /mismatch/);
  assert.throws(() => mapGepDataToReplayRound({ ...raw(), source: undefined }), /source/);
  assert.throws(() => mapGepDataToReplayRound({ ...raw(), board: [unit('a', 'Ashe', 4, 0)] }), /row/);
  assert.throws(() => mapGepDataToReplayRound({ ...raw(), board: [unit('a', 'Ashe', 0, 0), unit('b', 'Ashe', 0, 0)] }), /position/);
  assert.throws(() => mapGepDataToReplayRound({ ...raw(), board: [unit('a', 'Ashe', 0, 0), unit('a', 'Ashe', 0, 1)] }), /unique/);
});
test('diff detects duplicate-champion instance removal, upgrades, repeated items, level and HP', () => {
  const input = raw();
  input.board = [unit('ashe-1', 'Ashe', 2, 4, 1, ['Giant Slayer']), unit('ashe-2', 'Ashe', 2, 5)];
  const previous = mapGepDataToReplayRound(input);
  const currentInput = { ...raw(), stage: '3-3', round: 3, level: 7, hp: 74, board: [unit('ashe-1', 'Ashe', 2, 4, 2, ['Giant Slayer', 'Giant Slayer']), unit('ornn-1', 'Ornn', 0, 0)] };
  const current = mapGepDataToReplayRound(currentInput, previous);
  assert.deepEqual(current.changes, ['Ashe upgraded to ★★', 'Giant Slayer equipped to Ashe', 'Ornn added to board', 'Ashe removed from board', 'Player reached Level 7', 'HP 82 → 74']);
  assert.deepEqual(compareReplaySnapshots(current, structuredClone(current)), []);
  assert.deepEqual(compareReplaySnapshots(null, current), ['Replay started']);
});
test('object items compare by stable identifiers and ignore display order or cosmetic names', () => {
  const before = mapGepDataToReplayRound(raw());
  before.board[0].items = [{ apiId: 'item-a', name: 'Old label' }, { apiId: 'item-b', name: 'B' }];
  const after = structuredClone(before);
  after.board[0].items = [{ apiId: 'item-b', name: 'B' }, { apiId: 'item-a', name: 'New label' }];
  assert.deepEqual(compareReplaySnapshots(before, after), []);
});
test('all demo replays flow through the adapter and diff against chronological predecessors', () => {
  for (const match of matches) {
    assert.ok(match.mockGepData.every(snapshot => !('changes' in snapshot) && snapshot.board.every(unit => typeof unit.position === 'object' && 'starLevel' in unit)));
    assert.deepEqual(adaptGepRecording(match.mockGepData), match.rounds);
    for (let i = 0; i < match.rounds.length; i++) assert.deepEqual(match.rounds[i].changes, compareReplaySnapshots(match.rounds[i - 1], match.rounds[i]));
    assert.notDeepEqual(match.rounds[0].bench, match.rounds[1].bench);
  }
});
