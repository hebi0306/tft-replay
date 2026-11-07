import { Link, useParams } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { matchDate } from '../data/riotMatchMapper.js';
import Board, { Bench, FinalComposition } from '../components/Board.jsx';
import { PlayerStatus, TraitList } from '../components/ReplayPanels.jsx';
import { NotFound } from '../App.jsx';
export default function MatchDetailPage(){
 const {id}=useParams(),{getRecord,loading,error,riotMatches}=useTftMatches(),{t,language}=useLanguage();
 const official = riotMatches?.find(match => match.id === id);
 if (official) return <RiotMatchDetail match={official} />;
 const record=getRecord(id);
 if(loading)return <p role="status">{t('captureLoading')}</p>;
 if(error)return <p className="error-message">{t(error)}</p>;
 if(!record)return <NotFound/>;
 const {match,replay}=record,last=replay.rounds.at(-1);
 return <div><Link className="back-link" to="/matches">← {t('backMatchLibrary')}</Link><div className="page-heading"><div><div className="eyebrow">{t('matchOverviewEyebrow')} · {t('captureLocal')}</div><h1>{t('gameWorthRevisiting')}</h1><p>{matchDate(match,language)} · {t('recordedDuration')} {match.duration}</p></div></div>
 <div className="detail-layout"><section className="panel board-panel"><div className="panel-heading"><h3>{t('lastRecordedBoard')}</h3><span className="micro">{match.finalStage}</span></div><p className="local-replay-note">{t('localPositionNote')}</p>{last?.analyzed ? <><Board units={last.board}/><Bench units={last.bench} showItems/></>:<p className="local-replay-note">{t('localNoAnalysis')}</p>}</section><aside className="detail-sidebar">{last&&<PlayerStatus round={last}/>}<section className="panel replay-invite"><span className="replay-symbol">↺</span><h2>{t('exploreRoundReplay')}</h2><p>{t('localReplayNotice')}</p><Link className="button primary" to={`/replay/${match.id}`}>▶ {t('openRecordedReplay')}</Link></section><Link className="back-link" to={`/local-replay/${match.id}`}>{t('localScreenshotLink')} ↗</Link></aside></div></div>;
}

function RiotMatchDetail({ match }) {
  const { t, language } = useLanguage();
  return <div>
    <Link className="back-link" to="/matches">← {t('backMatchLibrary')}</Link>
    <div className="page-heading"><div><div className="eyebrow">{t('matchOverviewEyebrow')} · Riot API</div><h1>{t('gameWorthRevisiting')}</h1>
      <p>{matchDate(match, language)} · {match.duration}</p>
    </div></div>
    <div className="detail-layout">
      <section className="panel board-panel">
        <div className="panel-heading"><h3>{t('finalComposition')}</h3></div>
        <p className="local-replay-note">{t('finalCompositionCaption')}</p>
        <FinalComposition units={match.finalComposition} />
      </section>
      <aside className="detail-sidebar">
        <section className="panel player-status">
          <div className="panel-heading"><h3>{t('playerStatus')}</h3></div>
          <div className="stat-grid">
            <div><span>{t('finalPlacement')}</span><b>{match.placement ?? '—'}</b></div>
            <div><span>{t('level')}</span><b>{match.level ?? '—'}</b></div>
            <div><span>{t('stage')}</span><b>{match.finalStage ?? '—'}</b></div>
            {!match.finalStage && match.lastRound != null && <div><span>{t('round')}</span><b>{match.lastRound}</b></div>}
          </div>
          <div className="subheading">{t('activeTraits')}</div>
          <TraitList traits={match.traits.filter(trait => trait.active === true)} />
        </section>
        <section className="panel replay-invite">
          <h2>{t('exploreRoundReplay')}</h2>
          {match.localReplayId
            ? <Link className="button primary" to={`/replay/${encodeURIComponent(match.localReplayId)}`}>▶ {t('openRecordedReplay')}</Link>
            : <p>{t('riotReplayUnavailable')}</p>}
        </section>
      </aside>
    </div>
  </div>;
}
