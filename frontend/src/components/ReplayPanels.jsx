import { roundLabel } from '../data/matches.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import AssetIcon from './AssetIcon.jsx';

function translateChange(change, t) {
  if (change === 'Replay started') return t('replayStarted');
  if (change === 'No significant changes.') return t('noSignificantChanges');
  let parts = change.match(/^(.+) added to board$/);
  if (parts) return t('addedToBoard', { champion: parts[1] });
  parts = change.match(/^(.+) upgraded to (★+)$/);
  if (parts) return t('upgradedTo', { champion: parts[1], stars: parts[2] });
  parts = change.match(/^(.+) equipped to (.+)$/);
  if (parts) return t('equippedTo', { item: parts[1], champion: parts[2] });
  parts = change.match(/^(.+) removed from board$/);
  if (parts) return t('removedFromBoard', { champion: parts[1] });
  parts = change.match(/^Player reached Level (\d+)$/);
  if (parts) return t('reachedLevel', { level: parts[1] });
  parts = change.match(/^HP (\d+) → (\d+)$/);
  return parts ? t('hpChange', { before: parts[1], after: parts[2] }) : change;
}

export function TraitList({ traits }) {
  const { t } = useLanguage();
  return <div className="trait-list">{traits.length ? traits.map((trait, index) => <div className={`trait ${trait.active === false ? 'inactive' : ''}`} key={trait.id || `${trait.name}-${index}`} title={t('tierStyle', { tier: trait.tier ?? '—', style: trait.style ?? '—' })}><span className="trait-icon"><AssetIcon src={trait.image} name={trait.name} /></span><span>{trait.name}{trait.active === false && <small>{t('inactive')}</small>}{trait.active === null && <small>{t('statusUnavailable')}</small>}</span><b>{trait.count ?? '—'}</b></div>) : <span className="muted">{t('noTraitData')}</span>}</div>;
}
export function PlayerStatus({ round }) {
  const { t } = useLanguage();
  const won = round.result === 'WIN';
  return <section className="panel player-status"><div className="panel-heading"><h3>{t('playerStatus')}</h3><span className="micro">{roundLabel(round)}</span></div><div className="stat-grid"><div><span>{t('level').toUpperCase()}</span><b>{round.level}<small> / 10</small></b></div><div><span>{t('health')}</span><b className="coral">♥ {round.hp}</b></div><div><span>{t('gold')}</span><b className="gold-text">● {round.gold}</b></div><div><span>{t('result')}</span><b className={won ? 'mint-text' : 'coral'}>{won ? t('win') : t('loss')}</b></div></div><div className="streak">{won ? '↗' : '↘'} <span>{t('streak', { count: round.streak, result: won ? t('win') : t('loss') })}</span></div><div className="subheading">{t('activeTraits')}</div><TraitList traits={round.traits} /></section>;
}
export function ChangesPanel({ changes }) {
  const { t } = useLanguage();
  return <section className="panel changes" aria-live="polite"><div className="panel-heading"><h3>{t('roundChanges')}</h3><span className="micro">{changes.length}</span></div>{changes.length ? <ul>{changes.map((change, i) => <li key={i}><span>{change.includes('removed') || change.startsWith('HP ') ? '−' : '+'}</span>{translateChange(change, t)}</li>)}</ul> : <p className="changes-empty">{t('noSignificantChanges')}</p>}</section>;
}
export function RoundList({ rounds, selected, onSelect }) {
  const { t } = useLanguage();
  return <aside className="panel round-list"><div className="panel-heading"><h3>{t('rounds')}</h3><span className="micro">{rounds.length}</span></div>{[2, 3, 4, 5, 6].map(stage => <div className="stage-group" key={stage}><div className="subheading">{t('stage').toUpperCase()} {stage}</div>{rounds.map((round, i) => round.stage === stage && <button key={i} className={`round-button ${selected === i ? 'selected' : ''}`} onClick={() => onSelect(i)} aria-current={selected === i ? 'step' : undefined}><span>{roundLabel(round)}</span><span className={`result-dot ${round.result.toLowerCase()}`} />{selected === i && <span className="round-arrow">◀</span>}</button>)}</div>)}</aside>;
}
export function ReplayTimeline({ rounds, selected, playing, onSelect, onToggle }) {
  const { t } = useLanguage();
  return <section className="panel timeline"><div className="timeline-heading"><div><h3>{t('replayTimeline')}</h3><span className="muted">{t('timelineHint')}</span></div><span className="micro">{selected + 1} / {rounds.length} {t('roundCount')}</span></div><div className="timeline-rounds">{rounds.map((round, i) => <button key={i} aria-label={t('goToRound', { round: roundLabel(round) })} aria-current={selected === i ? 'step' : undefined} className={`${selected === i ? 'active' : ''} ${i < selected ? 'visited' : ''}`} onClick={() => onSelect(i)}><span className={`timeline-node ${round.result.toLowerCase()}`} /><span>{roundLabel(round)}</span></button>)}</div><div className="playback"><span className="micro">{t('snapshotPlayback')}</span><div className="playback-buttons"><button className="button ghost" disabled={selected === 0} onClick={() => onSelect(selected - 1)}>← {t('previousRound')}</button><button className="button primary play-button" onClick={onToggle}>{playing ? `Ⅱ ${t('pause')}` : selected === rounds.length - 1 ? `↺ ${t('playAgain')}` : `▶ ${t('play')}`}</button><button className="button ghost" disabled={selected === rounds.length - 1} onClick={() => onSelect(selected + 1)}>{t('nextRound')} →</button></div><span className="legend"><i className="result-dot win" /> {t('win')} <i className="result-dot loss" /> {t('loss')}</span></div></section>;
}
