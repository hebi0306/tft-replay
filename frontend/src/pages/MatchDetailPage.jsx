import { Link, useParams } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { placementLabel } from '../data/matches.js';
import { formatDuration, lastRoundLabel, matchDate } from '../data/riotMatchMapper.js';
import Board, { Bench, FinalComposition } from '../components/Board.jsx';
import { TraitList } from '../components/ReplayPanels.jsx';
import { NotFound } from '../App.jsx';

export default function MatchDetailPage() {
  const record = useTftMatches().getRecord(useParams().id);
  const { language, t } = useLanguage();
  if (!record) return <NotFound />;
  const { match, replay } = record, real = match.source === 'riot';
  const finalDemo = replay.rounds.at(-1);
  const placement = match.placement ? language === 'ko' ? `${match.placement}위` : placementLabel(match.placement) : '—';
  return <div><Link className="back-link" to="/">← {t('backMatchLibrary')}</Link>
    <div className="page-heading"><div><div className="eyebrow">{t('matchOverviewEyebrow')} · {real ? 'RIOT API' : t('mockData')}</div><h1>{t('gameWorthRevisiting')}</h1><p>{matchDate(match, language)} <span className="divider">/</span> {match.mode}</p><p className="match-id">{match.id}</p></div><div className="detail-placement"><b>{placement}</b><span>{t('finalPlacement')}</span></div></div>
    <div className="detail-layout"><section className="panel board-panel"><div className="panel-heading"><h3>{real ? t('finalComposition') : t('finalBoardDemo')}</h3><span className="micro">{lastRoundLabel(match, language)} · {match.finalComposition.length} {t('units')}</span></div>
      {real ? <><p className="composition-caption">{t('finalCompositionCaption')}</p><FinalComposition units={match.finalComposition} />{(match.staticWarningCodes?.length || match.staticWarning) && <p className="source-note">{match.staticWarningCodes?.map(code => t(code)).join(' ') || t('staticUnavailable')}</p>}</> : <><Board units={finalDemo.board} /><Bench units={finalDemo.bench} /></>}
    </section><aside className="detail-sidebar"><section className="panel"><div className="panel-heading"><h3>{t('matchSummary')}</h3><span>◇</span></div><dl className="summary-list">
      <div><dt>{t('gameDuration')}</dt><dd>{match.duration}</dd></div><div><dt>{t('lastRound')}</dt><dd>{lastRoundLabel(match, language)}</dd></div><div><dt>{t('finalLevel')}</dt><dd>{match.level ?? '—'}</dd></div><div><dt>{t('goldLeft')}</dt><dd>{match.goldLeft ?? '—'}</dd></div><div><dt>{t('damageToPlayers')}</dt><dd>{match.totalDamage ?? '—'}</dd></div>
      {real ? <><div><dt>{t('playerFinishTime')}</dt><dd>{formatDuration(match.playerFinishSeconds)}</dd></div><div><dt>{t(match.timestampLabelKey || (match.timestampLabel === 'Game creation' ? 'gameCreation' : 'riotMatchTimestamp'))}</dt><dd>{matchDate(match, language)}</dd></div><div><dt>{t('staticDataVersion')}</dt><dd>{match.staticVersion || t('unavailable')}</dd></div></> : <div><dt>{t('remainingHp')}</dt><dd className="coral">♥ {finalDemo.hp}</dd></div>}
    </dl><div className="subheading">{t('finalTraits')}</div><TraitList traits={match.traits} /></section>
    <section className="panel replay-invite"><span className="replay-symbol">↺</span><h2>{t('exploreReplayDemo')}</h2><p>{real ? t('realReplayInvite') : t('mockReplayInvite')}</p><Link className="button primary" to={`/replay/${match.id}`}>▶ {t('startMockReplay')}</Link></section></aside></div>
  </div>;
}
