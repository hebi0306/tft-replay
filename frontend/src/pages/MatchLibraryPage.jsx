import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import MatchCard from '../components/MatchCard.jsx';

export default function MatchLibraryPage(){
 const {records,loading,error}=useTftMatches(),{t}=useLanguage();
 const matches = records.slice(0, 10).map(record => record.match);
 const placements = matches.map(match => match.placement).filter(Number.isInteger);
 const averagePlacement = placements.length
   ? (placements.reduce((total, placement) => total + placement, 0) / placements.length).toFixed(1)
   : '—';
 const top4Rate = placements.length
   ? `${Math.round(100 * placements.filter(placement => placement <= 4).length / placements.length)}%`
   : '—';
 return <div className="match-library-page">
  <section className="summary-bar"><div><span>{t('matchesInLibrary')}</span><b>{matches.length}<small>{t('localLibrary')}</small></b></div><div><span>{t('avgPlacement')}</span><b>{averagePlacement}</b></div><div><span>{t('top4Rate')}</span><b>{top4Rate}</b></div></section>
  <section className="library"><div className="section-heading"><div><div className="eyebrow">{t('yourMatchLibrary')}</div><h2>{t('recentMatches')} <span>{matches.length}</span></h2></div><span className="library-label"><i/>{t('captureLocal')} · {t('newestFirst')}</span></div>
   {loading && <p className="panel loading-state" role="status">{t('captureLoading')}</p>}{error && <p className="error-message" role="alert">{t(error)}</p>}{!loading && !error && !matches.length &&<p className="panel empty-state">{t('localLibraryEmpty')}</p>}
   <div className="match-list">{matches.map((match, index)=><MatchCard key={match.id ?? index} match={match}/>)}</div>
  </section>
 </div>;
}
