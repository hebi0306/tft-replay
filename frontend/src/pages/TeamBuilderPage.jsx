import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AssetIcon from '../components/AssetIcon.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import useTftCatalog from '../hooks/useTftCatalog.jsx';
import { getCompositionById, saveComposition, updateComposition, placeChampion, equipItem, normalizeSearch } from '../services/teamCompositionService.js';
import { CatalogStatus, TeamTraits } from './TeamCompositionsPage.jsx';
import './teamCompositions.css';

const DRAG_TYPE = 'application/x-tft-builder';
export default function TeamBuilderPage() {
  const { id } = useParams(), navigate = useNavigate(), { t } = useLanguage(), state = useTftCatalog();
  const [initial] = useState(() => {
    try { const row = id ? getCompositionById(id) : { name: '', champions: [] }; return row ? { row } : { error: 'compositionMissing' }; }
    catch (error) { return { error: error.message }; }
  });
  const [name, setName] = useState(initial.row?.name || ''), [units, setUnits] = useState(initial.row?.champions || []);
  const [selected, setSelected] = useState(null), [replaceSlot, setReplaceSlot] = useState(null), [error, setError] = useState('');
  const [championQuery, setChampionQuery] = useState(''), [itemQuery, setItemQuery] = useState(''), [cost, setCost] = useState('all'), [type, setType] = useState('normal');
  const catalog = state.catalog, dirty = name !== (initial.row?.name || '') || JSON.stringify(units) !== JSON.stringify(initial.row?.champions || []);
  useEffect(() => {
    if (!dirty) return;
    const unload = event => { event.preventDefault(); event.returnValue = ''; };
    const leave = event => {
      const link = event.target.closest('a[href]');
      if (link && link.target !== '_blank' && new URL(link.href).pathname !== location.pathname && !window.confirm(t('leaveTeam'))) { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', unload); document.addEventListener('click', leave, true);
    return () => { window.removeEventListener('beforeunload', unload); document.removeEventListener('click', leave, true); };
  }, [dirty, t]);
  const champion = value => catalog?.champions.find(c => c.id === value);
  const item = value => catalog?.items.find(c => c.id === value);
  const currentChampions = (catalog?.champions.filter(c => c.set === catalog.currentSet) || []).sort((a, b) => (a.cost ?? Infinity) - (b.cost ?? Infinity) || a.name.localeCompare(b.name));
  const currentItems = catalog?.items.filter(c => c.set === catalog.currentSet) || [];
  const visibleChampions = currentChampions.filter(c => (cost === 'all' || String(c.cost) === cost) && normalizeSearch(c.name).includes(normalizeSearch(championQuery)));
  const visibleItems = currentItems.filter(c => (type === 'all' || (c.type || 'unknown') === type) && normalizeSearch(c.name).includes(normalizeSearch(itemQuery)));
  const selectedUnit = units.find(unit => unit.championId === selected);
  function select(value) { setSelected(value); setReplaceSlot(null); setError(''); }
  function removeChampion(championId) {
    setUnits(previous => previous.filter(unit => unit.championId !== championId));
    if (selected === championId) select(null);
    else setError('');
  }
  function add(championId, cell) {
    if (!champion(championId)) return;
    if (units.some(unit => unit.championId === championId)) { select(championId); setError('duplicateUnit'); return; }
    const target = cell ?? Array.from({ length: 28 }, (_, i) => i).find(i => !units.some(unit => unit.position.row * 7 + unit.position.column === i));
    if (target === undefined) { setError('boardFull'); return; }
    if (units.some(unit => unit.position.row * 7 + unit.position.column === target)) { setError('occupiedHex'); return; }
    setUnits(placeChampion(units, championId, target)); select(championId);
  }
  function equip(itemId, championId = selected) {
    const unit = units.find(unit => unit.championId === championId);
    if (!unit) { setError('selectUnit'); return; }
    if (!item(itemId)) return;
    const slot = championId === selected ? replaceSlot : null;
    if (unit.items.length >= 3 && slot === null) { select(championId); setError('itemLimit'); return; }
    setUnits(equipItem(units, championId, itemId, slot)); select(championId);
  }
  function drag(event, kind, value) { event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind, value })); event.dataTransfer.effectAllowed = 'copyMove'; }
  function drop(event, cell, target) {
    event.preventDefault();
    try {
      const data = JSON.parse(event.dataTransfer.getData(DRAG_TYPE));
      if (data.kind === 'item' && target) equip(data.value, target.championId);
      else if (data.kind === 'move' && units.some(unit => unit.championId === data.value)) { setUnits(placeChampion(units, data.value, cell)); select(data.value); }
      else if (data.kind === 'champion') add(data.value, cell);
    } catch { /* Ignore unrelated external drops. */ }
  }
  function save(event) {
    event.preventDefault();
    try { const value = { name, champions: units }; id ? updateComposition(id, value) : saveComposition(value); navigate('/compositions'); }
    catch (error) { setError(error.message); }
  }
  if (initial.error) return <div className="team-empty panel"><h2>{t(initial.error)}</h2><Link to="/compositions" className="button secondary">{t('backTeams')}</Link></div>;
  return <div className="builder-page">
    <Link className="back-link" to="/compositions">← {t('backTeams')}</Link>
    <div className="page-heading"><div><div className="eyebrow">{t('teams')}</div><h1>{t(id ? 'editBuilder' : 'builder')}</h1></div><span className="team-badge">{t('myTeam')}</span></div>
    <form className="team-toolbar panel" onSubmit={save}><label>{t('teamName')}<input value={name} maxLength={100} required onChange={event => setName(event.target.value)} placeholder={t('teamNameHint')} /></label><button className="button secondary" type="button" onClick={() => { if (units.length && window.confirm(t('resetTeamConfirm'))) { setUnits([]); select(null); } }}>{t('resetTeam')}</button><button className="button primary" type="submit">{t('saveTeam')}</button></form>
    <CatalogStatus state={state} />
    {error && <p className="error-message" role="alert">{t(error)}</p>}
    <p className="team-notice">{t('builderHint')}</p>
    <div className="builder-layout"><section className="panel builder-board-panel"><div className="panel-heading"><h3>{t('teamCount', { count: units.length })}</h3><span className="micro">4 × 7</span></div><div className="builder-board"><div className="builder-hexes">{[0, 1, 2, 3].map(row => <div className="builder-hex-row" key={row}>{Array.from({ length: 7 }, (_, column) => {
      const cell = row * 7 + column, unit = units.find(unit => unit.position.row === row && unit.position.column === column), info = unit && champion(unit.championId), title = info?.name || (unit ? t('unavailableAsset') : '');
      return <button type="button" key={column} className={`builder-hex ${unit ? 'occupied' : ''} ${unit?.championId === selected ? 'selected' : ''}`} aria-label={unit ? t('unitHex', { name: title, row: row + 1, column: column + 1 }) : t('emptyHex', { row: row + 1, column: column + 1 })} aria-pressed={!!unit && unit.championId === selected} draggable={!!unit} onDragStart={event => unit && drag(event, 'move', unit.championId)} onDragOver={event => event.preventDefault()} onDrop={event => drop(event, cell, unit)} onContextMenu={event => { if (unit) { event.preventDefault(); removeChampion(unit.championId); } }} onClick={() => { if (unit) select(unit.championId); else if (selectedUnit) setUnits(placeChampion(units, selected, cell)); }}>
        {unit ? <><span className="builder-unit-image"><span className="unit-stars" aria-label={t('starLevel', { count: unit.stars ?? 1 })}>{'★'.repeat(unit.stars ?? 1)}</span><AssetIcon src={info?.image} name={title} /></span><span className="builder-unit-name">{title}</span><span className="builder-equipped">{unit.items.map((id, i) => <span title={item(id)?.name || id} key={i}><AssetIcon src={item(id)?.image} name={item(id)?.name || id} /></span>)}</span></> : <span className="hex-plus">＋</span>}
      </button>;
    })}</div>)}</div></div></section>
      <aside className="builder-sidebar"><section className="panel selected-unit"><h3>{t('selectedUnit')}</h3>{selectedUnit ? <><div className="selected-unit-heading"><span><AssetIcon src={champion(selected)?.image} name={champion(selected)?.name || selected} /></span><b>{champion(selected)?.name || t('unavailableAsset')}</b></div><div className="mode-switch star-controls" role="group" aria-label={t('starRank')}>{[1, 2, 3].map(stars => <button type="button" key={stars} className={(selectedUnit.stars ?? 1) === stars ? 'selected' : ''} aria-pressed={(selectedUnit.stars ?? 1) === stars} aria-label={t('starLevel', { count: stars })} onClick={() => setUnits(units.map(unit => unit === selectedUnit ? { ...unit, stars } : unit))}>{'★'.repeat(stars)}</button>)}</div><div className="selected-items">{[0, 1, 2].map(slot => { const value = selectedUnit.items[slot], info = item(value); return <div key={slot}><button type="button" className={replaceSlot === slot ? 'selected' : ''} title={value ? `${t('replaceItem')}: ${info?.name || value}` : t('itemSlot', { slot: slot + 1 })} aria-label={value ? `${t('replaceItem')}: ${info?.name || value}` : t('itemSlot', { slot: slot + 1 })} aria-pressed={replaceSlot === slot} disabled={!value} onClick={() => setReplaceSlot(replaceSlot === slot ? null : slot)}>{value ? <AssetIcon src={info?.image} name={info?.name || value} /> : '＋'}</button>{value && <button className="remove-item" aria-label={t('removeItem', { name: info?.name || value })} onClick={() => { setUnits(units.map(unit => unit === selectedUnit ? { ...unit, items: unit.items.filter((_, i) => i !== slot) } : unit)); setReplaceSlot(null); }}>×</button>}</div>; })}</div>{replaceSlot !== null && <p className="team-notice">{t('replaceHint', { slot: replaceSlot + 1 })} <button className="button ghost" onClick={() => setReplaceSlot(null)}>{t('cancelReplace')}</button></p>}<button className="button ghost danger" onClick={() => removeChampion(selected)}>{t('removeUnit')}</button></> : <p className="team-notice">{t('selectUnit')}</p>}</section>
      <section className="panel builder-traits" tabIndex={0} role="region" aria-label={t('traits')}><h3>{t('traits')}</h3><TeamTraits units={units} catalog={catalog} />{catalog && <details><summary>{t('traitCatalog')}</summary><div className="trait-reference">{catalog.traits.filter(trait => trait.set === catalog.currentSet).map(trait => <span key={trait.id}><AssetIcon src={trait.image} name={trait.name} />{trait.name}</span>)}</div></details>}</section></aside>
    </div>
    <div className="builder-palettes"><section className="panel palette"><div className="palette-heading"><h2>{t('champions')}</h2><span>{visibleChampions.length}</span></div><div className="palette-search"><input type="search" aria-label={t('championSearch')} placeholder={t('championSearch')} value={championQuery} onChange={event => setChampionQuery(event.target.value)} /><select aria-label={t('cost')} value={cost} onChange={event => setCost(event.target.value)}><option value="all">{t('allCosts')}</option>{[...new Set(currentChampions.map(c => c.cost).filter(Number.isFinite))].sort((a, b) => a - b).map(value => <option value={value} key={value}>{value} ●</option>)}</select></div><div className="asset-palette">{visibleChampions.map(c => <button className={`palette-asset cost-${c.cost} ${units.some(unit => unit.championId === c.id) ? 'on-board' : ''}`} key={c.id} title={`${c.name} · ${c.cost ?? '—'} ${t('cost')}`} draggable onDragStart={event => drag(event, 'champion', c.id)} onClick={() => add(c.id)}><span className="palette-image"><AssetIcon src={c.image} name={c.name} /><small>{c.cost ?? '—'}</small></span><span>{c.name}</span></button>)}</div>{catalog && !visibleChampions.length && <p className="team-notice">{t('noCatalogResults')}</p>}</section>
    <section className="panel palette"><div className="palette-heading"><h2>{t('items')}</h2><span>{visibleItems.length}</span></div><p className="team-notice">{t('itemHint')}</p><div className="palette-search"><input type="search" aria-label={t('itemSearch')} placeholder={t('itemSearch')} value={itemQuery} onChange={event => setItemQuery(event.target.value)} /></div><div className="mode-switch item-type-tabs" aria-label={t('itemType')}>{['all', 'normal', 'emblem', 'artifact', 'radiant', 'other'].map(value => <button type="button" key={value} className={type === value ? 'selected' : ''} aria-pressed={type === value} onClick={() => setType(value)}>{t(value === 'all' ? 'filterAll' : 'itemCategory_' + value)}</button>)}</div><div className="asset-palette item-palette">{visibleItems.map(value => <button className="palette-asset" key={value.id} title={`${value.name}\n${value.description || t('infoNotProvided')}`} draggable onDragStart={event => drag(event, 'item', value.id)} onClick={() => equip(value.id)}><span className="palette-image"><AssetIcon src={value.image} name={value.name} /></span><span>{value.name}</span></button>)}</div>{catalog && !visibleItems.length && <p className="team-notice">{t('noCatalogResults')}</p>}<p className="team-notice">{t('itemDataMissing')}</p></section></div>
  </div>;
}
