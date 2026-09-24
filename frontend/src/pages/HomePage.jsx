import { Link } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import MatchCard from '../components/MatchCard.jsx';
import PlayerSearch from '../components/PlayerSearch.jsx';

export default function HomePage() {
  const { records, mode, account, loading, error, warnings, searched } = useTftMatches();
  const { t } = useLanguage();
  const matches = records.map(record => record.match);
  const placements = matches.filter(match => match.placement != null);
  const average = placements.length ? (placements.reduce((sum, match) => sum + match.placement, 0) / placements.length).toFixed(1) : '—';
  const top4 = placements.length ? Math.round(placements.filter(match => match.placement <= 4).length / placements.length * 100) : '—';
  return <div className="home-page">
    <section className="hero"><div className="hero-copy">
      <div className="eyebrow"><span /> {t('heroEyebrow')}</div>
      <h1>{t('heroTitle')}<br /><em>{t('heroAccent')}</em></h1>
      <p>{t('heroSubtitle')}</p><p className="hero-description">{t('heroDescription')}</p>
      {matches[0] ? <Link className="button primary" to={`/match/${matches[0].id}`}>{t('reviewLatest')} <span>↗</span></Link> : <a className="button primary" href="#player-search">{t('findMatches')} ↓</a>}
    </div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="art-caption">{t('heroArtCaption')}</div><div className="art-tile tile-back"><span>★ ★</span>ORNN</div><div className="art-tile tile-mid"><span>★ ★</span>VOLIBEAR</div><div className="art-tile tile-front"><span>★ ★ ★</span><b>A</b>ASHE</div><div className="art-round"><span className="result-dot win" /> {t('illustration')} <b>{t('demoBoard')}</b></div></div></section>
    <PlayerSearch />
    <section className="summary-bar"><div><span>{t('matchesInLibrary')}</span><b>{matches.length} <small>{mode === 'riot' ? t('riotMatches') : t('demoMatches')}</small></b></div><div><span>{t('avgPlacement')}</span><b>{average} <small>{t('loadedMatches')}</small></b></div><div><span>{t('top4Rate')}</span><b>{top4}<small>%</small></b></div><div className="summary-note"><span className="record-icon">◉</span><p>{mode === 'riot' ? t('officialFinalResults') : t('localFictionalData')}<br /><span>{t('replayRemainsMock')}</span></p></div></section>
    <section className="library"><div className="section-heading"><div><div className="eyebrow">{mode === 'riot' && account ? `${account.gameName || t('player')} #${account.tagLine || ''}` : t('yourMatchLibrary')}</div><h2>{t('recentMatches')} <span>{matches.length}</span></h2></div><span className="library-label"><i /> {mode === 'riot' ? 'Riot API' : t('demoData')} · {t('newestFirst')}</span></div>
      {loading && <div className="panel loading-state" role="status">{t('loadingMatches')} <span>{t('loadingDetail')}</span></div>}
      {!loading && !error && !matches.length && <div className="panel empty-state">{searched ? t('noRecentMatches') : t('searchPrompt')}</div>}
      {warnings.length > 0 && <div className="error-message" role="status">{t('partialMatches')} {warnings.map(warning => `${warning.id ? `${warning.id}: ` : ''}${t(warning.key, { seconds: warning.retryAfter || 30 })}`).join(' ')}</div>}
      <div className="match-list">{matches.map(match => <MatchCard key={match.id} match={match} />)}</div>
      <p className="library-footnote">{mode === 'riot' ? t('realMatchesFootnote') : t('demoMatchesFootnote')}</p>
    </section>
  </div>;
}
