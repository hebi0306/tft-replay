import AssetIcon from './AssetIcon.jsx';
const colors = ['#98adbf', '#ab95dd', '#caac71', '#78b7ae', '#bd83ab'];
export function BoardUnit({ unit, compact = false }) {
  const color = colors[unit.name.charCodeAt(0) % colors.length];
  const items = (unit.items || []).map(item => typeof item === 'string' ? { name: item } : item);
  return <div className={`unit ${compact ? 'compact' : ''}`} style={{ '--unit-color': color }} title={`${unit.name} · ${unit.star ?? 'Unknown'} stars${items.length ? ` · ${items.map(item => item.name).join(', ')}` : ' · No items'}`}>
    <span className="unit-stars">{unit.star ? '★'.repeat(unit.star) : '☆'}</span><span className="unit-sigil"><AssetIcon src={unit.image} name={unit.name} fallback={unit.name.slice(0, 2).toUpperCase()} /></span><span className="unit-name">{unit.name}</span>
    {!compact && <span className="unit-items">{items.map((item, index) => <span key={index} title={item.name} aria-label={item.name}><AssetIcon src={item.image} name={item.name} fallback={item.name.split(' ').map(word => word[0]).join('')} /></span>)}</span>}
  </div>;
}
export function FinalComposition({ units }) {
  return <div className="final-composition" aria-label="Final composition, no position data">{units.length ? units.map(unit => <div className="composition-slot" key={unit.id}><BoardUnit unit={unit} /></div>) : <p className="muted">No unit data available.</p>}</div>;
}
export default function Board({ units }) {
  return <div className="board" aria-label="Player board, 4 rows and 7 columns">
    <div className="board-mark">TFT REPLAY <span>◆</span> ROUND SNAPSHOT</div>
    <div className="hex-board">{Array.from({ length: 4 }, (_, row) => <div className={`hex-row row-${row}`} key={row}>{Array.from({ length: 7 }, (_, column) => {
      const position = row * 7 + column, unit = units.find(unit => unit.position === position);
      return <div className={`hex-cell ${unit ? 'occupied' : ''}`} key={column} aria-label={`Row ${row + 1}, column ${column + 1}${unit ? `: ${unit.name}` : ': empty'}`}>{unit && <BoardUnit unit={unit} />}</div>;
    })}</div>)}</div>
    <div className="board-caption"><span>YOUR SIDE</span><span>{units.length} units deployed</span></div>
  </div>;
}
export function Bench({ units }) {
  return <div className="bench"><div className="bench-label">BENCH<span>{units.length} / 9</span></div><div className="bench-slots">{Array.from({ length: 9 }, (_, i) => {
    const unit = units.find((unit, index) => (unit.benchPosition ?? index) === i);
    return <div className="bench-slot" key={i} aria-label={`Bench slot ${i + 1}: ${unit?.name || 'empty'}`}>{unit && <BoardUnit unit={unit} compact />}</div>;
  })}</div></div>;
}
