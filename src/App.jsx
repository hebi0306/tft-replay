import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import MatchDetailPage from './pages/MatchDetailPage.jsx';
import ReplayPage from './pages/ReplayPage.jsx';
import { useTftMatches } from './hooks/useTftMatches.jsx';
import DataSources from './components/DataSources.jsx';
export function NotFound() { return <div className="empty panel"><h1>Match not loaded</h1><p>홈에서 Riot ID를 검색하거나 Demo data 모드에서 경기를 선택해 주세요.</p><Link className="button primary" to="/">Back to Home</Link></div>; }
export default function App() {
  const location = useLocation();
  const { mode } = useTftMatches();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <><header className="app-header"><Link className="brand" to="/"><span className="brand-icon">◈</span>TFT <b>Replay</b></Link><nav><NavLink to="/" end>Match library</NavLink><span className="nav-context">{location.pathname.startsWith('/replay') ? 'Round replay' : location.pathname.startsWith('/match') ? 'Match overview' : 'Post-game review'}</span></nav><div className="demo-badge"><i /> {mode === 'riot' ? 'RIOT API MODE' : 'DEMO DATA'}</div><DataSources /><div className="profile">R</div></header><main><Routes><Route path="/" element={<HomePage />} /><Route path="/match/:id" element={<MatchDetailPage />} /><Route path="/replay/:id" element={<ReplayPage key={location.pathname} />} /><Route path="*" element={<NotFound />} /></Routes></main><footer><span>© 2026 TFT Replay · Independent prototype</span><span>Final results: {mode === 'riot' ? 'Riot API' : 'Mock'} · Round replay: Mock · Not affiliated with Riot Games</span></footer></>;
}
