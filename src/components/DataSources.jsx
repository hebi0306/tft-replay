import { useRef } from 'react';
import './dataSources.css';

export default function DataSources() {
  const dialog = useRef(null);
  return <>
    <button className="button secondary sources-button" onClick={() => dialog.current.showModal()} aria-haspopup="dialog">Data Sources</button>
    <dialog ref={dialog} className="sources-dialog" aria-labelledby="data-sources-title" onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="sources-body">
        <div className="sources-heading"><div><div className="eyebrow">ABOUT THIS PROTOTYPE</div><h2 id="data-sources-title">TFT Replay Prototype</h2></div><form method="dialog"><button className="button secondary" autoFocus>Close</button></form></div>
        <h3>Current Data Sources</h3>
        <div className="sources-grid">
          <section><span className="source-tag">RIOT API</span><h4>Riot Games API</h4><ul><li>Riot ID / PUUID</li><li>Match History</li><li>Placement and Final Level</li><li>Final Units and Final Items</li><li>Final Traits</li><li>Match metadata</li></ul><p>Names and images are resolved through Riot Data Dragon when available. Demo data mode uses fictional matches instead.</p></section>
          <section><span className="source-tag prototype">MOCK REPLAY</span><h4>Prototype Replay Data</h4><ul><li>Round-by-round board and unit positions</li><li>Bench</li><li>Gold and HP</li><li>Level</li><li>Round results and streaks</li><li>Changes derived from simulated rounds</li></ul><p>These snapshots are simulated placeholders, not a recording of the selected Riot match.</p></section>
        </div>
        <section className="production-plan"><h3>Production Plan</h3><p>Round-by-round replay data shown in this prototype is simulated placeholder data. In the production version, supported gameplay data will be captured through the Overwolf Game Events Provider (GEP) and used only for post-game replay and analysis.</p><p>Planned capture, where supported: round transitions, board state, unit positions, bench state, items, HP, gold, and level. Actual GEP collection is not connected in this prototype.</p></section>
        <div className="postgame-note"><span className="source-tag">POST-GAME ONLY</span><p>This application does not provide real-time recommendations or gameplay decision assistance.</p></div>
      </div>
    </dialog>
  </>;
}
