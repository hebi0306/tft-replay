import AssetIcon from './AssetIcon.jsx';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
const colors = ['#98adbf', '#ab95dd', '#caac71', '#78b7ae', '#bd83ab'];
export function BoardUnit({ unit, compact = false }) {
  const { t } = useLanguage();
  const color = colors[unit.name.charCodeAt(0) % colors.length];
  const items = (unit.items || []).map(item => typeof item === 'string' ? { name: item } : item);
  return <div className={`unit ${compact ? 'compact' : ''}`} style={{ '--unit-color': color }} title={`${unit.name} · ${unit.star ? t('stars', { count: unit.star }) : t('unknown')}${items.length ? ` · ${items.map(item => item.name).join(', ')}` : ` · ${t('noItems')}`}`}>
    <span className="unit-stars">{unit.star ? '★'.repeat(unit.star) : '☆'}</span><span className="unit-sigil"><AssetIcon src={unit.image} name={unit.name} fallback={unit.name.slice(0, 2).toUpperCase()} /></span><span className="unit-name">{unit.name}</span>
    {!compact && <span className="unit-items">{items.map((item, index) => <span key={index} title={item.name} aria-label={item.name}><AssetIcon src={item.image} name={item.name} fallback={item.name.split(' ').map(word => word[0]).join('')} /></span>)}</span>}
  </div>;
}
export function FinalComposition({ units }) {
  const { t } = useLanguage();
  return <div className="final-composition" aria-label={t('finalCompositionNoPosition')}>{units.length ? units.map(unit => <div className="composition-slot" key={unit.id}><BoardUnit unit={unit} /></div>) : <p className="muted">{t('noUnitData')}</p>}</div>;
}
export default function Board({ units }) {
  const { t } = useLanguage();
  return <div className="board" aria-label={t('boardLabel')}>
    <div className="board-mark">TFT REPLAY <span>◆</span> {t('roundSnapshot')}</div>
    <div className="hex-board">{Array.from({ length: 4 }, (_, row) => <div className={`hex-row row-${row}`} key={row}>{Array.from({ length: 7 }, (_, column) => {
      const position = row * 7 + column, unit = units.find(unit => unit.position === position);
      return <div className={`hex-cell ${unit ? 'occupied' : ''}`} key={column} aria-label={`${t('rowColumn', { row: row + 1, column: column + 1 })}: ${unit?.name || t('empty')}`}>{unit && <BoardUnit unit={unit} />}</div>;
    })}</div>)}</div>
    <div className="board-caption"><span>{t('yourSide')}</span><span>{t('unitsDeployed', { count: units.length })}</span></div>
  </div>;
}
export function Bench({ units }) {
  const { t } = useLanguage();
  return <div className="bench"><div className="bench-label">{t('bench').toUpperCase()}<span>{units.length} / 9</span></div><div className="bench-slots">{Array.from({ length: 9 }, (_, i) => {
    const unit = units.find((unit, index) => (unit.benchPosition ?? index) === i);
    return <div className="bench-slot" key={i} aria-label={`${t('benchSlot', { slot: i + 1 })}: ${unit?.name || t('empty')}`}>{unit && <BoardUnit unit={unit} compact />}</div>;
  })}</div></div>;
}
