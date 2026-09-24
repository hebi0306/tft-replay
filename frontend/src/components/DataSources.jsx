import { useRef } from 'react';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
import './dataSources.css';

export default function DataSources() {
  const dialog = useRef(null);
  const { t } = useLanguage();
  return <>
    <button className="button secondary sources-button" onClick={() => dialog.current.showModal()} aria-haspopup="dialog">{t('dataSources')}</button>
    <dialog ref={dialog} className="sources-dialog" aria-labelledby="data-sources-title" onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="sources-body">
        <div className="sources-heading"><div><div className="eyebrow">{t('aboutPrototype')}</div><h2 id="data-sources-title">{t('prototypeTitle')}</h2></div><form method="dialog"><button className="button secondary" autoFocus>{t('close')}</button></form></div>
        <h3>{t('currentDataSources')}</h3>
        <div className="sources-grid">
          <section><span className="source-tag">RIOT API</span><h4>{t('riotGamesApi')}</h4><ul><li>{t('riotIdPuuid')}</li><li>{t('matchHistory')}</li><li>{t('placementFinalLevel')}</li><li>{t('finalUnitsItems')}</li><li>{t('finalTraits')}</li><li>{t('matchMetadata')}</li></ul><p>{t('riotSourceExplanation')}</p></section>
          <section><span className="source-tag prototype">{t('mockReplay')}</span><h4>{t('prototypeReplayData')}</h4><ul><li>{t('roundBoardPositions')}</li><li>{t('bench')}</li><li>{t('goldHp')}</li><li>{t('level')}</li><li>{t('roundResultsStreaks')}</li><li>{t('simulatedChanges')}</li></ul><p>{t('mockSourceExplanation')}</p></section>
        </div>
        <section className="production-plan"><h3>{t('productionPlan')}</h3><p>{t('productionExplanation')}</p><p>{t('plannedCapture')}</p></section>
        <div className="postgame-note"><span className="source-tag">{t('postGameOnly')}</span><p>{t('postGameExplanation')}</p></div>
      </div>
    </dialog>
  </>;
}
