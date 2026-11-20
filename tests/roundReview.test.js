import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from '../capture/data/catalog.json' with { type: 'json' };
import { reviewRound } from '../frontend/src/services/roundReview.js';

const roster = catalog.champions.filter(c => c.set === catalog.currentSet && c.traits?.length);
const trait = catalog.traits.find(t => t.effects?.some(e => e.minUnits === 2) &&
  roster.filter(c => c.traits.includes(t.id)).length >= 2);
const [anchor, incoming] = roster.filter(c => c.traits.includes(trait.id));
const outgoing = roster.find(c => !c.traits.includes(trait.id));
const unit = (c, position, star = 2, items = []) => ({
  id: String(position), apiId: c.id, name: c.name, position, star, items,
});
function round(board, bench) {
  return { board, bench, unresolved: [], traits: [], traitsComplete: false,
    analysis: { source: 'precombat', set: catalog.currentSet, catalogVersion: catalog.version,
      status: { board: 'ready' } } };
}
const item = { apiId: 'known-item', name: 'Known item' };

test('a trait threshold never justifies a star downgrade', () => {
  const r = round([unit(anchor, 0), unit(outgoing, 1, 2)], [unit(incoming, 2, 1)]);
  assert.equal(reviewRound(r).alternative, null);
});
test('equipped holders stay on board even when the incoming unit has more items', () => {
  const r = round([unit(anchor, 0), unit(outgoing, 1, 1, [item])],
    [unit(incoming, 2, 3, [item, item, item])]);
  assert.equal(reviewRound(r).alternative, null);
});
test('same-champion star upgrade preserves slot and leaves the input untouched', () => {
  const r = round([unit(anchor, 0, 1)], [unit(anchor, 2, 2)]);
  const before = JSON.stringify(r);
  const a = reviewRound(r).alternative;
  assert(a);
  assert.equal(a.board[0].star, 2);
  assert.equal(a.board[0].position, 0);
  assert.equal(a.gains.length, 0);
  assert.equal(a.losses.length, 0);
  assert.equal(JSON.stringify(r), before);
});
test('same champion at equal stars does not produce a swap', () => {
  assert.equal(reviewRound(round([unit(anchor, 0)], [unit(anchor, 2)])).alternative, null);
});
test('trait candidates keep known stars and equipped units intact', () => {
  const protectedUnit = unit(outgoing, 1, 2, [item]);
  const r = round([unit(anchor, 0), protectedUnit, unit(outgoing, 3)], [unit(incoming, 2)]);
  const a = reviewRound(r).alternative;
  if (a) {
    assert(a.incoming.star >= a.outgoing.star);
    assert.equal(a.outgoing.items.length, 0);
    assert.equal(a.losses.length, 0);
    assert(a.board.includes(protectedUnit));
  }
});
