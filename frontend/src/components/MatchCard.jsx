import { TraitList } from './ReplayPanels.jsx';
import { Link } from 'react-router-dom';
import { placementLabel } from '../data/matches.js';
import { lastRoundLabel, matchDate } from '../data/riotMatchMapper.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import { BoardUnit } from './Board.jsx';
export default function MatchCard({ match }) {
  const { language, t } = useLanguage();
  const unavailable = '—';
  const official = match.source === 'riot';
  const units = official ? match.finalComposition : match.finalComposition.slice(0, 5);
  const placement = match.placement ? (language === 'ko' ? `${match.placement}위` : placementLabel(match.placement)) : unavailable;
  return <article className={official ? "match-card riot-match-card" : "match-card"}>
    <div className={`placement ${match.placement === 1 ? 'gold' : ''}`}>{placement}</div>
    <div className="match-meta">
      <h3>{match.theme === 'Final composition' ? t('finalComposition') : match.theme} <span>{match.mode}</span></h3>
      <p>{matchDate(match, language)} · {t('level')} {match.level ?? unavailable}</p>
      {match.id && <p className="match-id">{match.id}</p>}
    </div>
    <div className="mini-team">{units.map(unit => <BoardUnit key={unit.id} unit={unit} compact={!official} />)}
    </div>
    <div className="match-stage">{lastRoundLabel(match, language)}{official && !match.finalStage && <span>{t('stage')} —</span>}<span>{match.duration}</span></div>
    <Link className="button secondary" to={`/match/${encodeURIComponent(match.id)}`}>{t('matchDetail')} <span>↗</span></Link>
    {official && <div className="riot-card-traits"><span className="micro">{t('activeTraits')}</span><TraitList traits={match.traits.filter(trait => trait.active === true)} /></div>}
  </article>;
}
