import { useState } from 'react';
import { Link } from 'react-router-dom';
import AssetIcon from '../components/AssetIcon.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import useTftCatalog from '../hooks/useTftCatalog.jsx';
import { getCompositions, deleteComposition, searchCompositions, normalizeSearch, calculateTraits } from '../services/teamCompositionService.js';
import './teamCompositions.css';

export function CatalogStatus({ state }) {
  const { t } = useLanguage();
  return state.loading ? <p className="team-notice" role="status">{t('dataLoading')}</p> : state.error ? <div className="error-message" role="alert">{t('dataLoadError')} <button className="button secondary" onClick={state.retry}>{t('retry')}</button></div> : <p className="team-source">{t('sourceData', { version: state.catalog.version, set: state.catalog.currentSet })}</p>;
}
export function TeamTraits({ units, catalog }) {
  const { t } = useLanguage();
  const traits = catalog ? calculateTraits(units, catalog) : [];
  const unknownEmblems = [...new Set(units.flatMap(unit => unit.items))].map(id => catalog?.items.find(item => item.id === id)).filter(item => item?.type === 'emblem' && !item.traitId);
  return <>{!catalog?.traitDetailsAvailable ? <p className="team-notice">{t('traitDataMissing')}</p> : traits.length ? <div className="team-traits">{traits.map(trait => <span className={trait.active ? 'active' : ''} key={trait.id} title={t('traitBreakpoints', { steps: trait.thresholds.join(' / '), tier: trait.tier })}><AssetIcon src={trait.image} name={trait.name} />{trait.name} <b>{trait.count} / {trait.next ?? '—'}</b><small>{trait.thresholds.join(' · ')}</small></span>)}</div> : <p className="team-notice">{t('noActiveTraits')}</p>}{unknownEmblems.length > 0 && <p className="team-notice">{t('unknownEmblems', { names: unknownEmblems.map(item => item.name).join(', ') })}</p>}{catalog?.traitDetailsAvailable && <p className="team-notice">{t('traitSourceNote')}{catalog.traitDataIncomplete && ` ${t('traitPartial')}`}</p>}</>;
}
const emptyCatalog = { champions: [], items: [], traits: [] };
export default function TeamCompositionsPage() {
  const { t, language } = useLanguage(), state = useTftCatalog(), catalog = state.catalog || emptyCatalog;
  const [initial] = useState(() => { try { return { rows: getCompositions() }; } catch (error) { return { rows: [], error: error.message }; } });
  const [rows, setRows] = useState(initial.rows), [error, setError] = useState(initial.error || '');
  const [query, setQuery] = useState(''), [filter, setFilter] = useState('all');
  const results = searchCompositions(rows, query, filter, catalog), q = normalizeSearch(query);
  const hit = (name, kind) => q && (filter === 'all' || filter === 'mine' || filter === kind) && normalizeSearch(name).includes(q);
  function remove(row) {
    if (!window.confirm(t('deleteTeamConfirm', { name: row.name }))) return;
    try { deleteComposition(row.id); setRows(getCompositions()); setError(''); } catch (error) { setError(error.message); }
  }
  return <div className="teams-page">
    <div className="page-heading"><div><div className="eyebrow">TFT REPLAY</div><h1>{t('teams')}</h1><p>{t('teamsIntro')}</p></div><Link className="button primary" to="/compositions/new">＋ {t('addTeam')}</Link></div>
    <div className="team-toolbar panel"><label>{t('teamSearch')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('teamSearchHint')} /></label><div className="mode-switch" aria-label={t('searchFilter')}>{[['all', 'filterAll'], ['champions', 'filterChampions'], ['items', 'filterItems'], ['mine', 'filterMine']].map(([value, label]) => <button type="button" key={value} className={value === filter ? 'selected' : ''} aria-pressed={value === filter} onClick={() => setFilter(value)}>{t(label)}</button>)}</div></div>
    <CatalogStatus state={state} />
    {error && <p role="alert" className="error-message">{t(error)}</p>}
    {!error && !rows.length ? <div className="panel team-empty"><span aria-hidden="true">⬡</span><h2>{t('noTeams')}</h2><p>{t('noTeamsHint')}</p><Link className="button primary" to="/compositions/new">＋ {t('addTeam')}</Link></div> : !error && !results.length && !state.loading ? <div className="panel team-empty"><h2>{t('noTeamResults')}</h2><button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); }}>{t('clearSearch')}</button></div> : <div className="team-cards">{results.map(row => <article className="panel team-card" key={row.id}>
      <div className="team-card-heading"><div><span className="team-badge">{t('myTeam')}</span><h2 className={hit(row.name, 'name') ? 'search-hit-text' : ''}>{row.name}</h2><p>{t('updatedTeam', { date: new Intl.DateTimeFormat(language === 'ko' ? 'ko-KR' : 'en-US', { dateStyle: 'medium' }).format(new Date(row.updatedAt)) })}</p></div><div className="team-actions"><Link className="button secondary" to={`/compositions/${encodeURIComponent(row.id)}/edit`}>{t('editTeam')}</Link><button className="button ghost" onClick={() => remove(row)}>{t('deleteTeam')}</button></div></div>
      <div className="team-roster">{row.champions.map(unit => {
        const champion = catalog.champions.find(c => c.id === unit.championId), name = champion?.name || t(state.loading ? 'dataLoading' : 'unavailableAsset');
        return <div className="roster-unit" key={unit.championId}><div className={`roster-portrait ${hit(name, 'champions') ? 'search-hit' : ''}`} title={name}><AssetIcon src={champion?.image} name={name} /><span className="unit-stars" aria-label={t('starLevel', { count: unit.stars ?? 1 })}>{'★'.repeat(unit.stars ?? 1)}</span></div><span title={name}>{name}</span><div className="roster-items">{unit.items.map((id, index) => { const item = catalog.items.find(item => item.id === id), name = item?.name || t(state.loading ? 'dataLoading' : 'unavailableAsset'); return <span className={hit(name, 'items') ? 'search-hit' : ''} title={name} key={`${id}-${index}`}><AssetIcon src={item?.image} name={name} /></span>; })}</div></div>;
      })}</div><TeamTraits units={row.champions} catalog={state.catalog} />
    </article>)}</div>}
    <p className="team-source">{t('localTeams')}</p>
  </div>;
}
