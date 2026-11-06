import { useEffect,useState } from 'react';
import { Link,useParams } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { matchDate } from '../data/riotMatchMapper.js';
import Board,{Bench,FinalComposition} from '../components/Board.jsx';
import {PlayerStatus,ReplayTimeline,RoundList} from '../components/ReplayPanels.jsx';
import {NotFound} from '../App.jsx';
import '../components/localReplay.css';
export default function ReplayPage(){
 const {id}=useParams(),{getRecord,loading,error}=useTftMatches(),{t,language}=useLanguage();
 const [selected,setSelected]=useState(0),[playing,setPlaying]=useState(false);
 const record=getRecord(id),rounds=record?.replay.rounds || [],round=rounds[selected];
 useEffect(()=>{if(!playing||selected>=rounds.length-1)return;const timer=setTimeout(()=>{setSelected(i=>i+1);if(selected+1===rounds.length-1)setPlaying(false);},1500);return()=>clearTimeout(timer);},[playing,selected,rounds.length]);
 function select(i){setPlaying(false);setSelected(Math.max(0,Math.min(rounds.length-1,i)));}
 function toggle(){if(selected===rounds.length-1)setSelected(0);if(rounds.length>1)setPlaying(v=>!v);}
 if(loading)return <p role="status">{t('captureLoading')}</p>;
 if(error)return <p className="error-message">{t(error)}</p>;
 if(!record||!round)return <NotFound/>;
 const changes=['hp','gold','level'].filter(k=>selected>0&&round[k]!=null&&rounds[selected-1][k]!=null&&round[k]!==rounds[selected-1][k]);
 return <div className="replay-page local-reconstruction"><Link className="back-link" to={`/match/${id}`}>← {t('backMatch')}</Link><div className="page-heading replay-heading"><div><div className="eyebrow">{t('captureLocal')}</div><h1>{t('exploreRoundReplay')}</h1><p>{matchDate(record.match,language)}</p></div><span className="recording-label"><i/>{t('captureLocal')}</span></div><p className="team-notice">{t('localReplayNotice')}</p>
 <div className="replay-layout"><RoundList rounds={rounds} selected={selected} onSelect={select}/><div className="replay-center"><section className="panel board-panel"><div className="panel-heading"><h3>{t('round')} {round.stage}-{round.round}</h3><span className="micro">{t('localBoard')}</span></div><p className="local-replay-note">{t('localPositionNote')}</p>{round.analyzed ? <><Board units={round.board}/><Bench units={round.bench} showItems/></>:<p className="local-replay-note">{t('localNoAnalysis')}</p>}</section>
 {!!round.unresolved.length&&<section className="panel local-detected-units"><div className="panel-heading"><h3>{t('localUnassigned')}</h3></div><FinalComposition units={round.unresolved}/></section>}
 {!!round.observations.length&&<section className="panel local-detected-units"><div className="panel-heading"><h3>{t('localObservations')}</h3></div><p className="local-replay-note">{t('localObservationNote')}</p><FinalComposition units={round.observations}/></section>}
 <Link className="back-link" to={`/local-replay/${id}`}>{t('localScreenshotLink')} ↗</Link>
 </div><aside className="replay-sidebar"><PlayerStatus round={round}/><p className="local-replay-note">{t('captureStatsNote')}{!round.traitsComplete&&` ${t('localTraitsNote')}`}</p><section className="panel changes"><div className="panel-heading"><h3>{t('localStatsChanges')}</h3></div>{changes.length?<ul>{changes.map(k=><li key={k}>{t(k==='hp'?'health':k)} {rounds[selected-1][k]} → {round[k]}</li>)}</ul>:<p className="changes-empty">{t('localNoChanges')}</p>}</section></aside></div>
 <ReplayTimeline rounds={rounds} selected={selected} playing={playing} onSelect={select} onToggle={toggle}/></div>;
}
