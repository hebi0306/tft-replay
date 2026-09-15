import { Link } from 'react-router-dom';
import { placementLabel } from '../data/matches.js';
import { lastRoundLabel } from '../data/riotMatchMapper.js';
import { BoardUnit } from './Board.jsx';
export default function MatchCard({ match }) {
  return <article className="match-card"><div className={`placement ${match.placement === 1 ? 'gold' : ''}`}>{match.placement ? placementLabel(match.placement) : '—'}</div><div className="match-meta"><h3>{match.theme} <span>{match.mode}</span></h3><p>{match.date} · Level {match.level ?? '—'}</p><p className="match-id">{match.id}</p></div><div className="mini-team">{match.finalComposition.slice(0, 5).map(unit => <BoardUnit key={unit.id} unit={unit} compact />)}</div><div className="match-stage">{lastRoundLabel(match)}<span>{match.duration}</span></div><Link className="button secondary" to={`/match/${match.id}`}>Match Detail <span>↗</span></Link></article>;
}
