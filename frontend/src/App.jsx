import { useEffect } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import MatchLibraryPage from './pages/MatchLibraryPage.jsx';
import MatchDetailPage from './pages/MatchDetailPage.jsx';
import LocalReplayPage from './pages/LocalReplayPage.jsx';
import ReplayPage from './pages/ReplayPage.jsx';
import TeamCompositionsPage from './pages/TeamCompositionsPage.jsx';
import TeamBuilderPage from './pages/TeamBuilderPage.jsx';
import Settings from './components/Settings.jsx';
import { useLanguage } from './i18n/LanguageProvider.jsx';
export function NotFound() { const { t } = useLanguage(); return <div className="empty panel"><h1>{t('matchNotLoaded')}</h1><p>{t('matchNotLoadedHint')}</p><Link className="button primary" to="/">{t('backHome')}</Link></div>; }
export default function App() {
  const location = useLocation();
  const { t } = useLanguage();
  useEffect(() => { window.scrollTo(0, 0); }, [location.pathname]);
  return <><header className="app-header"><Link className="brand" to="/"><span className="brand-icon">◈</span>TFT <b>Replay</b></Link><nav><NavLink to="/matches">{t('matchLibrary')}</NavLink><NavLink to="/compositions">{t('teams')}</NavLink></nav><Settings /></header><main><Routes><Route path="/" element={<HomePage />} /><Route path="/matches" element={<MatchLibraryPage />} /><Route path="/local-replay/:id" element={<LocalReplayPage key={location.pathname} />} /><Route path="/match/:id" element={<MatchDetailPage />} /><Route path="/replay/:id" element={<ReplayPage key={location.pathname} />} /><Route path="/compositions" element={<TeamCompositionsPage />} /><Route path="/compositions/new" element={<TeamBuilderPage key="new" />} /><Route path="/compositions/:id/edit" element={<TeamBuilderPage key={location.pathname} />} /><Route path="*" element={<NotFound />} /></Routes></main><footer><span>© 2026 TFT Replay · {t('independentPrototype')}</span></footer></>;
}
