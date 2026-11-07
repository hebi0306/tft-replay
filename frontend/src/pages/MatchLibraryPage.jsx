import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import MatchCard from '../components/MatchCard.jsx';

export default function MatchLibraryPage(){
 const {records,loading,error,riotMatches,riotSearch}=useTftMatches(),{t}=useLanguage();
 const matches = riotMatches ?? records.slice(0, 10).map(record => record.match);
 const placements = matches.map(match => match.placement).filter(Number.isInteger);
 const averagePlacement = placements.length
   ? (placements.reduce((total, placement) => total + placement, 0) / placements.length).toFixed(1)
   : '—';
 const top4Rate = placements.length
   ? `${Math.round(100 * placements.filter(placement => placement <= 4).length / placements.length)}%`
   : '—';
 return <div className="match-library-page">
  <section className="summary-bar"><div><span>{t('matchesInLibrary')}</span><b>{matches.length}<small>{riotMatches ? 'Riot API' : t('localLibrary')}</small></b></div><div><span>{t('avgPlacement')}</span><b>{averagePlacement}</b></div><div><span>{t('top4Rate')}</span><b>{top4Rate}</b></div></section>
  <section className="library"><div className="section-heading"><div><div className="eyebrow">{t('yourMatchLibrary')}</div><h2>{t('recentMatches')} <span>{matches.length}</span></h2></div><span className="library-label"><i/>{riotMatches ? 'Riot API' : t('captureLocal')} · {t('newestFirst')}</span></div>
   {riotSearch.loading && <p className="panel loading-state" role="status">{t('loadingMatches')}</p>}
   {riotSearch.error && <p className="error-message" role="alert">{t(riotSearch.error.key, { seconds: riotSearch.error.retryAfter || 30 })}</p>}
   {riotSearch.warnings?.length > 0 && <p className="setup-note" role="status">{t('partialMatches')}</p>}
   {!riotMatches && loading && <p className="panel loading-state" role="status">{t('captureLoading')}</p>}{!riotMatches && error && <p className="error-message" role="alert">{t(error)}</p>}{(riotMatches || (!loading && !error)) && !matches.length &&<p className="panel empty-state">{t(riotMatches ? 'noRecentMatches' : 'localLibraryEmpty')}</p>}
   <div className="match-list">{matches.map((match, index)=><MatchCard key={match.id ?? index} match={match}/>)}</div>
  </section>
 </div>;
}
