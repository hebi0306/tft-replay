export function linkRiotRecordings(matches, recordings) {
  const exact = matches.map(match => recordings.filter(record =>
    record.game_id === match.id || record.id === match.id));
  const reserved = new Set(exact.flat());
  const candidates = matches.map((match, index) => {
    if (exact[index].length) return exact[index];
    const duration = match.playerFinishSeconds > 0 ? match.playerFinishSeconds : match.gameLengthSeconds;
    if (!Number.isFinite(match.timestamp) || !(duration > 0)) return [];
    const end = match.timestamp + duration * 1000;
    // An overlap alone is insufficient: both boundaries must agree.
    return recordings.filter(record => !reserved.has(record) && !record.game_id
      && Math.abs(Date.parse(record.started_at) - match.timestamp) <= 180000
      && Math.abs(Date.parse(record.ended_at) - end) <= 300000);
  });
  return matches.map((match, index) => {
    const [record] = candidates[index];
    return { ...match, localReplayId: candidates[index].length === 1
      && candidates.filter(list => list.includes(record)).length === 1 ? record.id : null };
  });
}
