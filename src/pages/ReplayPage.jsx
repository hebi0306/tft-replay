import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { roundLabel } from '../data/matches.js';
import Board, { Bench, FinalComposition } from '../components/Board.jsx';
import { ChangesPanel, PlayerStatus, ReplayTimeline, RoundList, TraitList } from '../components/ReplayPanels.jsx';
import { NotFound } from '../App.jsx';
export default function ReplayPage() {
  const record = useTftMatches().getRecord(useParams().id);
  const [selected, setSelected] = useState(0), [playing, setPlaying] = useState(false);
  const count = record?.replay.rounds.length ?? 0;
  useEffect(() => {
    if (!playing || selected >= count - 1) return;
    const timer = setTimeout(() => { setSelected(selected + 1); if (selected + 1 === count - 1) setPlaying(false); }, 1500);
    return () => clearTimeout(timer);
  }, [playing, selected, count]);
  if (!record) return <NotFound />;
  const { match, replay } = record, real = match.source === 'riot';
  const round = replay.rounds[selected], finished = selected === count - 1;
  function select(index) { setPlaying(false); setSelected(Math.max(0, Math.min(count - 1, index))); }
  function toggle() { if (finished) setSelected(0); setPlaying(value => !value); }
  return <div className="replay-page"><Link className="back-link" to={`/match/${match.id}`}>← Match overview</Link><div className="page-heading replay-heading"><div><div className="eyebrow">ROUND-BY-ROUND DEMO</div><h1>Explore round replay.</h1><p>{match.date} <span className="divider">/</span> {match.theme}</p></div><span className="recording-label"><i /> MOCK ROUND SNAPSHOTS</span></div>{real && <section className="panel real-match-summary"><div className="panel-heading"><h3>Riot final result · #{match.placement ?? '—'} · Level {match.level ?? '—'} · {match.duration}</h3><span className="micro">{match.id}</span></div><FinalComposition units={match.finalComposition} /><TraitList traits={match.traits} /><p className="source-note">Final composition only. Unit positions are not available.</p></section>}<p className="mock-banner">MOCK REPLAY · {real ? '아래 라운드·보드·대기석·체력·골드·승패·변화 기록은 이 실제 경기와 무관한 독립 데모입니다.' : '모든 라운드 상태는 가상의 데모 데이터입니다.'}</p><div className="replay-layout"><RoundList rounds={replay.rounds} selected={selected} onSelect={select} /><div className="replay-center"><section className="panel board-panel"><div className="panel-heading"><div className="board-title"><h3>Round {roundLabel(round)}</h3><span className={`result-pill ${round.result.toLowerCase()}`}>{round.result}</span></div><span className="micro">MOCK BOARD · LEVEL {round.level}</span></div><Board units={round.board} /><Bench units={round.bench} /></section>{finished ? <section className="finished" aria-live="polite"><div><div className="eyebrow">MOCK REPLAY FINISHED</div><h2>{real ? 'Riot final result' : 'Demo final result'}: #{match.placement ?? '—'}</h2><p>Final Level: {match.level ?? '—'} · Game Duration: {match.duration}</p><p>{real ? 'Actual final composition is shown in the Riot result section above.' : 'Final demo board shown above.'}</p></div><div><Link className="button secondary" to={`/match/${match.id}`}>Back to Match</Link><Link className="button primary" to="/">Back to Home</Link></div></section> : <div className="review-note"><span>◈</span><div><b>A moment to reflect.</b><p>Select a round to explore the mock recording.</p></div><span className="micro">POST-GAME ONLY</span></div>}</div><aside className="replay-sidebar"><PlayerStatus round={round} /><ChangesPanel changes={round.changes} /></aside></div><ReplayTimeline rounds={replay.rounds} selected={selected} playing={playing} onSelect={select} onToggle={toggle} /></div>;
}
