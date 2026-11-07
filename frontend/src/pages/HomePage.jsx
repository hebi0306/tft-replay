import { Link } from 'react-router-dom';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import LocalRecordings from '../components/LocalRecordings.jsx';

export default function HomePage(){
 const {records}=useTftMatches(),{t}=useLanguage();
 const latest = records[0]?.match;
 return <div className="home-page">
  <section className="hero"><div className="hero-copy"><h1>{t('heroTitle')}<br/><em>{t('heroAccent')}</em></h1><p>{t('heroSubtitle')}</p>{latest && <Link className="button primary" to={`/match/${latest.id}`}>{t('reviewLatest')} ↗</Link>}</div></section>
  <LocalRecordings/>
 </div>;
}
