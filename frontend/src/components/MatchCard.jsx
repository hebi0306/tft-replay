import { Link } from 'react-router-dom';
import { placementLabel } from '../data/matches.js';
import { lastRoundLabel, matchDate } from '../data/riotMatchMapper.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { BoardUnit } from './Board.jsx';
export default function MatchCard({ match }) {
  const { language, t } = useLanguage();
  return <article className="match-card"><div className={`placement ${match.placement === 1 ? 'gold' : ''}`}>{match.placement ? language === 'ko' ? `${match.placement}위` : placementLabel(match.placement) : '—'}</div><div className="match-meta"><h3>{match.theme === 'Final composition' ? t('finalComposition') : match.theme} <span>{match.mode}</span></h3><p>{matchDate(match, language)} · {t('level')} {match.level ?? '—'}</p><p className="match-id">{match.id}</p></div><div className="mini-team">{match.finalComposition.slice(0, 5).map(unit => <BoardUnit key={unit.id} unit={unit} compact />)}</div><div className="match-stage">{lastRoundLabel(match, language)}<span>{match.duration}</span></div><Link className="button secondary" to={`/match/${match.id}`}>{t('matchDetail')} <span>↗</span></Link></article>;
}
