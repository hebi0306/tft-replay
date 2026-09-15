import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getAccountByRiotId, getRecentTftMatches } from '../services/riotApi.js';
import { loadTftStaticData } from '../services/tftStaticData.js';
import { mapRiotMatchToMatchCard } from '../data/riotMatchMapper.js';
import { getDemoRecords, getMockReplay } from '../data/mockReplay.js';
const MatchContext = createContext(null);
const STORAGE = 'tft-replay-search-v1';
function restored() {
  try {
    const saved = JSON.parse(sessionStorage.getItem(STORAGE));
    return saved?.account?.puuid && Array.isArray(saved.matches) && saved.matches.every(match => match.source === 'riot' && typeof match.id === 'string' && Array.isArray(match.finalComposition) && Array.isArray(match.traits)) ? saved : null;
  } catch { return null; }
}
export function TftMatchesProvider({ children }) {
  const [saved] = useState(restored);
  const [mode, setMode] = useState(import.meta.env.VITE_USE_MOCK_DATA === 'true' ? 'mock' : 'riot');
  const [records, setRecords] = useState(() => saved?.matches.map(match => ({ match, replay: getMockReplay() })) || []);
  const [account, setAccount] = useState(saved?.account || null);
  const [region, setRegion] = useState(saved?.region || import.meta.env.VITE_RIOT_REGION || 'asia');
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [warnings, setWarnings] = useState([]);
  const [searched, setSearched] = useState(Boolean(saved));
  const [configured, setConfigured] = useState(null);
  const controller = useRef(null);
  useEffect(() => {
    const base = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/$/, '');
    fetch(`${base}/health`).then(response => response.json()).then(data => setConfigured(data.status === 'ok')).catch(() => setConfigured(false));
    return () => controller.current?.abort();
  }, []);
  async function search(gameName, tagLine, nextRegion) {
    controller.current?.abort();
    const active = new AbortController(); controller.current = active;
    setLoading(true); setError(''); setWarnings([]); setRecords([]); setAccount(null); setRegion(nextRegion); setSearched(true);
    try { sessionStorage.removeItem(STORAGE); } catch { /* Storage may be disabled. */ }
    try {
      const options = { region: nextRegion, signal: active.signal };
      const user = await getAccountByRiotId(gameName, tagLine, options);
      if (!user?.puuid) throw new Error('계정 응답에 PUUID가 없습니다.');
      const result = await getRecentTftMatches(user.puuid, options);
      const mapped = [], notices = [...result.warnings];
      for (const raw of result.matches) {
        const catalog = await loadTftStaticData(raw.info?.game_version);
        if (active.signal.aborted) return;
        try {
          const match = mapRiotMatchToMatchCard(raw, user.puuid, catalog);
          if (!match.id) throw new Error('경기 ID가 없습니다.');
          mapped.push(match);
        } catch (error) { notices.push(error.message); }
      }
      if (result.matches.length && !mapped.length) throw new Error(notices[0] || '표시 가능한 경기 정보가 없습니다.');
      if (active.signal.aborted) return;
      setAccount(user); setRecords(mapped.map(match => ({ match, replay: getMockReplay() }))); setWarnings(notices);
      try { sessionStorage.setItem(STORAGE, JSON.stringify({ account: user, region: nextRegion, matches: mapped })); } catch { /* UI works without storage. */ }
    } catch (error) { if (!active.signal.aborted) setError(error.message); }
    finally { if (!active.signal.aborted) setLoading(false); }
  }
  function changeMode(value) { controller.current?.abort(); setLoading(false); setError(''); setMode(value); }
  const visible = mode === 'mock' ? getDemoRecords() : records;
  return <MatchContext.Provider value={{ mode, setMode: changeMode, records: visible, getRecord: id => visible.find(record => record.match.id === id), account, region, search, loading, error, warnings, searched, configured }}>{children}</MatchContext.Provider>;
}
export const useTftMatches = () => useContext(MatchContext);
