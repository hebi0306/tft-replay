import { createContext, useContext, useEffect, useState } from 'react';
import { translate } from './translations.js';

const LanguageContext = createContext(null);
const STORAGE_KEY = 'tft-replay-language';

function savedLanguage() {
  try { return localStorage.getItem(STORAGE_KEY) === 'ko' ? 'ko' : 'en'; }
  catch { return 'en'; }
}

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(savedLanguage);
  useEffect(() => {
    document.documentElement.lang = language;
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* Storage may be disabled. */ }
  }, [language]);
  return <LanguageContext.Provider value={{ language, setLanguage, t: (key, values) => translate(language, key, values) }}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
