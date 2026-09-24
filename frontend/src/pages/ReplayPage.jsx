import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { roundLabel } from '../data/matches.js';
import { matchDate } from '../data/riotMatchMapper.js';
import { loadTftStaticData } from '../services/tftStaticData.js';
import Board, { Bench, FinalComposition } from '../components/Board.jsx';
import { ChangesPanel, PlayerStatus, ReplayTimeline, RoundList, TraitList } from '../components/ReplayPanels.jsx';
import { NotFound } from '../App.jsx';

export default function ReplayPage() {
  const record = useTftMatches().getRecord(useParams().id);
  const { language, t } = useLanguage();
  const [selected, setSelected] = useState(0), [playing, setPlaying] = useState(false);
  const [mockChampions, setMockChampions] = useState({});
  const count = record?.replay.rounds.length ?? 0;
  useEffect(() => {
    let active = true;
    loadTftStaticData().then(catalog => {
      if (!active) return;
      const set18 = Object.entries(catalog.champion).filter(([id]) => id.includes('/tftset18/shop/'));
      setMockChampions(Object.fromEntries(set18.map(([, champion]) => [champion.name.toLowerCase(), champion])));
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!playing || selected >= count - 1) return;
    const timer = setTimeout(() => { setSelected(selected + 1); if (selected + 1 === count - 1) setPlaying(false); }, 1500);
    return () => clearTimeout(timer);
  }, [playing, selected, count]);
  if (!record) return <NotFound />;
  const { match, replay } = record, real = match.source === 'riot';
  const round = replay.rounds[selected], finished = selected === count - 1;
  const withChampionImages = units => units.map(unit => ({ ...unit, image: mockChampions[unit.name.toLowerCase()]?.image || unit.image || null }));
  function select(index) { setPlaying(false); setSelected(Math.max(0, Math.min(count - 1, index))); }
  function toggle() { if (finished) setSelected(0); setPlaying(value => !value); }
  return <div className="replay-page"><Link className="back-link" to={`/match/${match.id}`}>← {t('backMatch')}</Link>
    <div className="page-heading replay-heading"><div><div className="eyebrow">{t('replayEyebrow')}</div><h1>{t('exploreRoundReplay')}</h1><p>{matchDate(match, language)} <span className="divider">/</span> {match.theme === 'Final composition' ? t('finalComposition') : match.theme}</p></div><span className="recording-label"><i /> {t('mockSnapshots')}</span></div>
    {real && <section className="panel real-match-summary"><div className="panel-heading"><h3>{t('riotFinalResult')} · #{match.placement ?? '—'} · {t('level')} {match.level ?? '—'} · {match.duration}</h3><span className="micro">{match.id}</span></div><FinalComposition units={match.finalComposition} /><TraitList traits={match.traits} /><p className="source-note">{t('riotFinalOnly')}</p></section>}
    <p className="mock-banner">{t('mockReplay')} · {real ? t('realMockBanner') : t('demoMockBanner')}</p>
    <div className="replay-layout"><RoundList rounds={replay.rounds} selected={selected} onSelect={select} /><div className="replay-center"><section className="panel board-panel"><div className="panel-heading"><div className="board-title"><h3>{t('round')} {roundLabel(round)}</h3><span className={`result-pill ${round.result.toLowerCase()}`}>{round.result === 'WIN' ? t('win') : t('loss')}</span></div><span className="micro">{t('mockBoard')} · {t('level').toUpperCase()} {round.level}</span></div><Board units={withChampionImages(round.board)} /><Bench units={withChampionImages(round.bench)} /></section>
      {finished ? <section className="finished" aria-live="polite"><div><div className="eyebrow">{t('mockReplayFinished')}</div><h2>{real ? t('riotFinalResult') : t('demoFinalResult')}: #{match.placement ?? '—'}</h2><p>{t('finalLevel')}: {match.level ?? '—'} · {t('gameDuration')}: {match.duration}</p><p>{real ? t('actualFinalCompositionAbove') : t('finalDemoBoard')}</p></div><div><Link className="button secondary" to={`/match/${match.id}`}>{t('backToMatch')}</Link><Link className="button primary" to="/">{t('backHome')}</Link></div></section> : <div className="review-note"><span>◈</span><div><b>{t('momentToReflect')}</b><p>{t('selectRoundHint')}</p></div><span className="micro">{t('postGameOnly')}</span></div>}
    </div><aside className="replay-sidebar"><PlayerStatus round={round} /><ChangesPanel changes={round.changes} /></aside></div>
    <ReplayTimeline rounds={replay.rounds} selected={selected} playing={playing} onSelect={select} onToggle={toggle} />
  </div>;
}
