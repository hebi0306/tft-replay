import { useEffect, useState } from 'react';
import { getTftData } from '../services/tftDataService.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';

export default function useTftCatalog() {
  const { language } = useLanguage();
  const [state, setState] = useState({ catalog: null, loading: true, error: false });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setState({ catalog: null, loading: true, error: false });
    getTftData(language).then(catalog => { if (active) setState({ catalog, loading: false, error: false }); })
      .catch(() => { if (active) setState({ catalog: null, loading: false, error: true }); });
    return () => { active = false; };
  }, [language, attempt]);
  return { ...state, retry: () => setAttempt(value => value + 1) };
}
