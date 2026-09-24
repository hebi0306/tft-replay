import { useState } from 'react';
import { useTftMatches } from '../hooks/useTftMatches.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

export default function PlayerSearch() {
  const { mode, setMode, account, region, search, loading, error, configured } = useTftMatches();
  const { t } = useLanguage();
  const [name, setName] = useState(account?.gameName || '');
  const [tag, setTag] = useState(account?.tagLine || '');
  const [routing, setRouting] = useState(region);
  return <section className="panel search-panel" id="player-search">
    <div className="search-heading"><div><div className="eyebrow">{t('yourRiotId')}</div><h2>{t('findTftMatches')}</h2></div>
      <div className="mode-switch" aria-label={t('dataSource')}><button className={mode === 'riot' ? 'selected' : ''} onClick={() => setMode('riot')} aria-pressed={mode === 'riot'}>Riot API</button><button className={mode === 'mock' ? 'selected' : ''} onClick={() => setMode('mock')} aria-pressed={mode === 'mock'}>{t('demoData')}</button></div>
    </div>
    {mode === 'riot' ? <>
      <form className="search-form" onSubmit={event => { event.preventDefault(); search(name, tag, routing); }}>
        <label>{t('gameName')}<input value={name} onChange={event => setName(event.target.value)} placeholder="Hide on bush" required maxLength={100} disabled={loading} /></label>
        <label>{t('tagline')}<input value={tag} onChange={event => setTag(event.target.value.replace(/^#/, ''))} placeholder="KR1" required maxLength={30} disabled={loading} /></label>
        <label>{t('matchRegion')}<select value={routing} onChange={event => setRouting(event.target.value)} disabled={loading}><option value="asia">Asia · KR / JP</option><option value="americas">{t('americas')}</option><option value="europe">{t('europe')}</option><option value="sea">SEA / Oceania</option></select></label>
        <button className="button primary" type="submit" disabled={loading || !name.trim() || !tag.trim()}>{loading ? t('loadingMatches') : `${t('searchMatches')} →`}</button>
      </form>
      {configured === false && <p className="setup-note">{t('backendOffline')}</p>}
      {error && <div className="error-message" role="alert">{t(error.key, { seconds: error.retryAfter || 30 })}</div>}
    </> : <p className="source-note">{t('demoModeHint')}</p>}
  </section>;
}
