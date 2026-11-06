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
        <h3>{t('captureLocal')}</h3><p>{t('localSources')}</p><p>{t('localPositionNote')}</p>
      </div>
    </dialog>
  </>;
}
