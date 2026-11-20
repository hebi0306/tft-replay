import catalog from '../../../capture/data/catalog.json' with { type: 'json' };
import { calculateTraits } from './teamCompositionService.js';

const items = unit => (unit.items || []).filter(item => item.apiId && !item.unknown);
const toUnits = board => board.filter(identified).map(unit => ({ championId: unit.apiId, items: items(unit).map(item => item.apiId) }));
const starKnown = unit => [1, 2, 3].includes(unit.star);
const identified = unit => unit.apiId && !unit.unknown;
const champions = new Map(catalog.champions.map(unit => [unit.id, unit]));

export function reviewRound(round, previous) {
  const changes = [];
  if (previous) {
    for (const stat of ['hp', 'gold', 'level']) {
      if (Number.isFinite(previous[stat]) && Number.isFinite(round[stat]) && previous[stat] !== round[stat]) {
        changes.push({ kind: 'stat', stat, before: previous[stat], after: round[stat] });
      }
    }
    const comparable = previous.analysis?.status?.board === 'ready' && round.analysis?.status?.board === 'ready' &&
      previous.analysis.set === round.analysis.set && previous.analysis.catalogVersion === round.analysis.catalogVersion;
    if (comparable) {
      for (const current of round.board.filter(identified)) {
        const before = previous.board.filter(unit => unit.apiId === current.apiId && identified(unit));
        if (before.length !== 1 || round.board.filter(unit => unit.apiId === current.apiId).length !== 1) continue;
        const [prior] = before;
        if (starKnown(prior) && starKnown(current) && current.star > prior.star) {
          changes.push({ kind: 'star', champion: current.name, before: prior.star, after: current.star });
        }
        const oldItems = items(prior).map(item => item.apiId);
        for (const item of items(current)) {
          const index = oldItems.indexOf(item.apiId);
          if (index < 0) changes.push({ kind: 'item', champion: current.name, item: item.name });
          else oldItems.splice(index, 1);
        }
      }
      if (previous.traitsComplete && round.traitsComplete) {
        for (const trait of round.traits.filter(trait => trait.active === true && !trait.unknown)) {
          const before = previous.traits.find(value => value.id === trait.id);
          if (!before || (before.active === false) || (Number.isFinite(before.tier) && before.tier < trait.tier)) {
            changes.push({ kind: 'trait', trait: trait.name, count: trait.count });
          }
        }
      }
    }
  }

  const canReview = round.analysis?.source === 'precombat' && round.analysis.set === catalog.currentSet &&
    round.analysis.catalogVersion === catalog.version && round.analysis.status?.board === 'ready';
  if (!canReview) return { changes, alternative: null, reason: 'reviewInsufficient' };
  const eligible = unit => identified(unit) && starKnown(unit) && champions.get(unit.apiId)?.traits?.length;
  const bench = round.bench.filter(eligible);
  const outgoingUnits = round.board.filter(unit => eligible(unit) && Number.isInteger(unit.position));
  if (!bench.length || !outgoingUnits.length) return { changes, alternative: null, reason: 'reviewUnconfirmedUnits' };

  const baseline = new Map(calculateTraits(toUnits(round.board), catalog).map(trait => [trait.id, trait]));
  let alternative = null;
  for (const incoming of bench) {
    for (const outgoing of outgoingUnits) {
      const sameChampion = incoming.apiId === outgoing.apiId;
      // Keep equipped holders: equal item counts do not imply equal item value.
      if (incoming.star < outgoing.star || items(outgoing).length > 0) continue;
      if (sameChampion && incoming.star <= outgoing.star) continue;
      const board = round.board.map(unit => unit === outgoing ? { ...incoming, position: outgoing.position } : unit);
      const traits = calculateTraits(toUnits(board), catalog);
      const next = new Map(traits.map(trait => [trait.id, trait]));
      const gains = traits.filter(trait => trait.tier > (baseline.get(trait.id)?.tier ?? 0));
      const losses = [...baseline.values()].filter(trait => trait.tier > (next.get(trait.id)?.tier ?? 0));
      const starsGained = incoming.star - outgoing.star;
      if (losses.length || (!gains.length && !(sameChampion && starsGained > 0))) continue;
      const score = [Number(sameChampion), gains.length, starsGained, items(incoming).length];
      const firstDifference = alternative ? score.findIndex((value, i) => value !== alternative.score[i]) : -1;
      if (alternative && (firstDifference < 0 || score[firstDifference] < alternative.score[firstDifference])) continue;
      alternative = {
        incoming, outgoing, board, score, losses, partial: !round.traitsComplete || !!round.unresolved.length ||
          round.board.some(unit => !identified(unit) || !champions.get(unit.apiId)?.traits?.length) ||
          incoming.items.some(item => !item.apiId || item.unknown),
        gains: gains.map(trait => ({
          id: trait.id, name: round.traits.find(value => value.id === trait.id && !value.unknown)?.name || trait.name,
          before: baseline.get(trait.id)?.count ?? 0, after: trait.count, threshold: trait.thresholds[trait.tier - 1],
        })),
        removedItems: items(outgoing).map(item => item.name),
      };
    }
  }
  return { changes, alternative, reason: alternative ? null : 'reviewNoSafeAlternative' };
}
