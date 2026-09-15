const itemKey = item => typeof item === 'string' ? item : String(item.apiId ?? item.id ?? item.name);
const itemName = item => typeof item === 'string' ? item : item.name;

// Compare adjacent recorded rounds, not the last round the viewer clicked.
// IDs identify unit instances, so two copies of one champion remain distinct.
export function compareReplaySnapshots(previousRound, currentRound) {
  if (!previousRound) return ['Replay started'];
  const changes = [];
  const previous = new Map(previousRound.board.map(unit => [unit.id, unit]));
  const current = new Map(currentRound.board.map(unit => [unit.id, unit]));
  for (const unit of currentRound.board) {
    const old = previous.get(unit.id);
    if (!old) changes.push(`${unit.name} added to board`);
    else if (unit.star > old.star) changes.push(`${unit.name} upgraded to ${'★'.repeat(unit.star)}`);
    // Count item copies: a second identical item is still a new equip.
    const remaining = new Map();
    for (const item of old?.items || []) remaining.set(itemKey(item), (remaining.get(itemKey(item)) || 0) + 1);
    for (const item of unit.items) {
      const key = itemKey(item), count = remaining.get(key) || 0;
      if (count) remaining.set(key, count - 1);
      else changes.push(`${itemName(item)} equipped to ${unit.name}`);
    }
  }
  for (const unit of previousRound.board) if (!current.has(unit.id)) changes.push(`${unit.name} removed from board`);
  if (currentRound.level !== previousRound.level) changes.push(`Player reached Level ${currentRound.level}`);
  if (currentRound.hp < previousRound.hp) changes.push(`HP ${previousRound.hp} → ${currentRound.hp}`);
  return changes;
}
