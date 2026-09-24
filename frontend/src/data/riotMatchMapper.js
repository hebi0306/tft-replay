import { resolveStatic } from '../services/tftStaticData.js';
import { translate } from '../i18n/translations.js';
const number = value => typeof value === 'number' && Number.isFinite(value) ? value : null;
export const formatDuration = seconds => number(seconds) === null || seconds < 0 ? '—' : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
export const lastRoundLabel = (match, language = 'en') => match.finalStage ? `${translate(language, 'stage')} ${match.finalStage}` : match.lastRound != null ? `${translate(language, 'round')} ${match.lastRound}` : translate(language, 'roundUnavailable');
export function matchDate(match, language = 'en') {
  if (match.source === 'riot') return Number.isFinite(match.timestamp)
    ? new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(match.timestamp))
    : translate(language, 'dateUnavailable');
  if (language === 'ko') {
    const parts = match.date?.match(/^(\w{3}) (\d{1,2}), (\d{4}) · (\d{2}:\d{2})$/);
    if (parts) {
      const month = 'Jan Feb Mar Apr May Jun Jul Aug Sep Oct Nov Dec'.split(' ').indexOf(parts[1]) + 1;
      if (month) return `${parts[3]}. ${month}. ${Number(parts[2])}. · ${parts[4]}`;
    }
  }
  return match.date;
}
export function mapRiotParticipantToFinalComposition(participant, catalog) {
  return (Array.isArray(participant?.units) ? participant.units : []).map((unit, index) => ({
    ...resolveStatic(catalog, 'champion', unit.character_id),
    id: `${unit.character_id || 'unknown'}-${index}`,
    star: Number.isInteger(unit.tier) && unit.tier >= 1 && unit.tier <= 4 ? unit.tier : null,
    // No position property: Riot does not report final-board coordinates.
    items: (Array.isArray(unit.itemNames) && unit.itemNames.length ? unit.itemNames : Array.isArray(unit.items) ? unit.items : []).map(id => resolveStatic(catalog, 'item', id)),
  }));
}
export function mapRiotMatchToMatchCard(raw, puuid, catalog) {
  const info = raw?.info;
  const participant = info?.participants?.find(player => player.puuid === puuid);
  if (!participant) throw new Error('경기 응답에서 검색한 사용자를 찾을 수 없습니다.');
  const timestamp = number(info.gameCreation) ?? number(info.game_datetime);
  const date = timestamp !== null && !Number.isNaN(new Date(timestamp).getTime()) ? new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(timestamp)) : 'Date unavailable';
  const traits = (Array.isArray(participant.traits) ? participant.traits : []).map(trait => ({
    ...resolveStatic(catalog, 'trait', trait.name), id: trait.name,
    count: number(trait.num_units), style: number(trait.style), tier: number(trait.tier_current),
    active: typeof trait.tier_current === 'number' ? trait.tier_current > 0 : typeof trait.style === 'number' ? trait.style > 0 : null,
  })).sort((a, b) => Number(b.active) - Number(a.active) || (b.style || 0) - (a.style || 0));
  const finalComposition = mapRiotParticipantToFinalComposition(participant, catalog);
  const unresolved = [...finalComposition, ...finalComposition.flatMap(unit => unit.items), ...traits].some(item => !item.resolved);
  return {
    source: 'riot', id: raw.metadata?.match_id || null, puuid,
    placement: number(participant.placement), level: number(participant.level), lastRound: number(participant.last_round),
    goldLeft: number(participant.gold_left), totalDamage: number(participant.total_damage_to_players),
    playerFinishSeconds: number(participant.time_eliminated), duration: formatDuration(info.game_length),
    gameLengthSeconds: number(info.game_length), date, timestamp, timestampLabel: number(info.gameCreation) !== null ? 'Game creation' : 'Riot match timestamp',
    timestampLabelKey: number(info.gameCreation) !== null ? 'gameCreation' : 'riotMatchTimestamp',
    gameDatetime: number(info.game_datetime), gameVersion: info.game_version || null,
    queueId: number(info.queue_id) ?? number(info.queueId), mode: info.tft_game_type || 'TFT',
    finalStage: null, finalComposition, traits,
    theme: traits.filter(trait => trait.active && trait.resolved).slice(0, 2).map(trait => trait.name).join(' · ') || 'Final composition',
    staticVersion: catalog?.version || null,
    staticWarning: [catalog?.warning, unresolved ? '일부 정적 이름/이미지를 찾지 못했습니다. 알 수 없는 항목의 식별자는 내부 데이터에 보존됩니다.' : null].filter(Boolean).join(' '),
    staticWarningCodes: [catalog?.warningCode, unresolved ? 'staticUnresolved' : null].filter(Boolean),
  };
}
