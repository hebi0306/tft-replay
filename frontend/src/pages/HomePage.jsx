import { Link } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import MatchCard from '../components/MatchCard.jsx';
import LocalRecordings from '../components/LocalRecordings.jsx';
export default function HomePage(){
 const {records,loading,error}=useTftMatches(),{t}=useLanguage();
 const matches = records.slice(0, 10).map(record => record.match);
 const latest = matches[0];
 const placements = matches.map(match => match.placement).filter(Number.isInteger);
 const averagePlacement = placements.length
   ? (placements.reduce((total, placement) => total + placement, 0) / placements.length).toFixed(1)
   : '—';
 const top4Rate = placements.length
   ? `${Math.round(100 * placements.filter(placement => placement <= 4).length / placements.length)}%`
   : '—';
 return <div className="home-page">
  <section className="hero"><div className="hero-copy"><h1>{t('heroTitle')}<br/><em>{t('heroAccent')}</em></h1><p>{t('heroSubtitle')}</p>{latest && <Link className="button primary" to={`/match/${latest.id}`}>{t('reviewLatest')} ↗</Link>}</div></section>
  <LocalRecordings/>
  <section className="summary-bar"><div><span>{t('matchesInLibrary')}</span><b>{matches.length}<small>{t('localLibrary')}</small></b></div><div><span>{t('avgPlacement')}</span><b>{averagePlacement}</b></div><div><span>{t('top4Rate')}</span><b>{top4Rate}</b></div></section>
  <section className="library"><div className="section-heading"><div><div className="eyebrow">{t('yourMatchLibrary')}</div><h2>{t('recentMatches')} <span>{matches.length}</span></h2></div><span className="library-label"><i/>{t('captureLocal')} · {t('newestFirst')}</span></div>
   {loading && <p className="panel loading-state" role="status">{t('captureLoading')}</p>}{error && <p className="error-message" role="alert">{t(error)}</p>}{!loading&&!error&&!matches.length&&<p className="panel empty-state">{t('localLibraryEmpty')}</p>}
   <div className="match-list">{matches.map(match=><MatchCard key={match.id} match={match}/>)}</div>
  </section>
 </div>;
}
