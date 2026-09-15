import test from 'node:test';
import assert from 'node:assert/strict';
import { getMatch, getMatches } from '../src/data/matchRepository.js';
test('all demo recordings have valid, evolving snapshots and consistent final results', () => {
  const matches = getMatches();
  assert.equal(matches.length, 5);
  assert.equal(getMatch('missing'), undefined);
  for (const match of matches) {
    assert.equal(getMatch(match.id), match);
    assert.equal(match.rounds.length, 25);
    assert.deepEqual([...new Set(match.rounds.map(round => round.stage))], [2, 3, 4, 5, 6]);
    for (const round of match.rounds) {
      assert.equal(new Set(round.board.map(unit => unit.position)).size, round.board.length);
      assert.equal(new Set(round.board.map(unit => unit.id)).size, round.board.length);
      assert.ok(round.board.length <= round.level);
      assert.ok(round.bench.length <= 9);
      for (const unit of [...round.board, ...round.bench]) {
        assert.ok(unit.star >= 1 && unit.star <= 3);
        assert.ok(unit.items.length <= 3);
      }
      assert.ok(round.board.every(unit => unit.position >= 0 && unit.position < 28));
      assert.ok(Array.isArray(round.changes));
    }
    assert.notDeepEqual(match.rounds[0].board, match.rounds[6].board);
    assert.notDeepEqual(match.rounds[0].bench, match.rounds[1].bench);
    assert.equal(match.rounds.at(-1).result, match.placement === 1 ? 'WIN' : 'LOSS');
    assert.equal(match.rounds.at(-1).hp === 0, match.placement !== 1);
  }
});
