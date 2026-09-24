import { useRef } from 'react';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

export default function Settings() {
  const dialog = useRef(null);
  const { language, setLanguage, t } = useLanguage();
  return <>
    <button className="profile" type="button" onClick={() => dialog.current.showModal()} aria-label={t('settings')} title={t('settings')} aria-haspopup="dialog">⚙</button>
    <dialog ref={dialog} className="sources-dialog" aria-labelledby="settings-title" onClick={event => { if (event.target === event.currentTarget) dialog.current.close(); }}>
      <div className="sources-body">
        <div className="sources-heading"><h2 id="settings-title">{t('settings')}</h2><form method="dialog"><button className="button secondary" autoFocus>{t('close')}</button></form></div>
        <h3>{t('language')}</h3>
        <div className="mode-switch" aria-label={t('language')}>
          <button type="button" className={language === 'en' ? 'selected' : ''} aria-pressed={language === 'en'} onClick={() => setLanguage('en')}>{t('english')}</button>
          <button type="button" className={language === 'ko' ? 'selected' : ''} aria-pressed={language === 'ko'} onClick={() => setLanguage('ko')}>{t('korean')}</button>
        </div>
      </div>
    </dialog>
  </>;
}
