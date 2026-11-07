import { savedOptions } from '../services/captureOptions.js';
import { getAccountByRiotId, getRecentTftMatches } from '../services/riotApi.js';
import { mapRiotMatchToMatchCard } from '../data/riotMatchMapper.js';
import { linkRiotRecordings } from '../services/linkRiotRecordings.js';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { localReplay } from '../services/localReplay.js';
import { loadTftStaticData } from '../services/tftStaticData.js';
import { adaptLocalMatch } from '../services/localReplayAdapter.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
const MatchContext = createContext(null);
async function mapRiotMatches(matches, puuid, language) {
  return Promise.all(matches.map(async raw => {
    const catalog = await loadTftStaticData(raw?.info?.game_version, language);
    return mapRiotMatchToMatchCard(raw, puuid, catalog);
  }));
}

export function TftMatchesProvider({children}) {
 const {t,language}=useLanguage();
 const [riotSearch,setRiotSearch]=useState({ matches:null, loading:false });
 const [saved,setSaved]=useState([]),[catalog,setCatalog]=useState(null);
 const [loading,setLoading]=useState(true),[error,setError]=useState('');
 useEffect(()=>{
  let active=true,timer;const cache=new Map();
  async function refresh(){
   try{
    const rows=await localReplay('list');
    const records=await Promise.all(rows.filter(r=>r.ended_at&&r.round_count>0).map(async r=>{const key=`${r.id}:${r.ended_at}:${r.round_count}`;if(!cache.has(key))cache.set(key,await localReplay('match',{id:r.id}));return cache.get(key);}));
    if(active){setSaved(records);setError('');}
   }catch(e){if(active)setError(e.message);}
   finally{if(active){setLoading(false);timer=setTimeout(refresh,2500);}}
  }
  refresh();return()=>{active=false;clearTimeout(timer);};
 },[]);
 useEffect(() => {
   if (!window.localReplay) return;
   let active = true, timer;
   async function monitor() {
     try { await localReplay('auto_tick', savedOptions()); }
     catch { /* Manual controls show setup and capture errors. */ }
     finally { if (active) timer = setTimeout(monitor, 2500); }
   }
   monitor();
   return () => { active = false; clearTimeout(timer); };
 }, []);
 const version=saved[0]?.rounds.find(r=>r.analysis?.catalogVersion)?.analysis.catalogVersion;
 useEffect(()=>{let active=true;loadTftStaticData(version, language).then(v=>{if(active)setCatalog(v);});return()=>{active=false;};},[version,language]);
 const records=useMemo(()=>saved.map(r=>adaptLocalMatch(r,catalog,t)),[saved,catalog,t]);
 const riotMatches = useMemo(() => riotSearch.matches && linkRiotRecordings(riotSearch.matches, saved), [riotSearch.matches, saved]);
 const riotRequestInFlight = useRef(false);
 const nextRiotRefresh = useRef(0);
 const searchRiot = useCallback(async (name, tag, region) => {
   if (riotRequestInFlight.current) return;
   riotRequestInFlight.current = true;
   nextRiotRefresh.current = Date.now() + 60000;
   name = name.trim();
   tag = tag.trim();
   setRiotSearch(previous => ({ ...(previous.name === name && previous.tag === tag && previous.region === region ? previous : {}), name, tag, region, loading:true, error:null, warnings:[] }));
   try {
     const account = await getAccountByRiotId(name, tag, { region, language });
     if (!account?.puuid) {
       setRiotSearch({ name, tag, region, matches:null, loading:false, error:{ key:'missingPuuid' } });
       return;
     }
     const result = await getRecentTftMatches(account.puuid, { region, language });
     const matches = await mapRiotMatches(result.matches, account.puuid, language);
     setRiotSearch({ name, tag, region, matches, rawMatches:result.matches, puuid:account.puuid,
       language, warnings:result.warnings, loading:false });
   } catch (error) {
     nextRiotRefresh.current = Date.now() + Math.max(60000, (error.retryAfter || 0) * 1000);
     setRiotSearch(previous => ({ ...previous, name, tag, region, loading:false, error:{ key:error.key || 'requestError', retryAfter:error.retryAfter } }));
   } finally {
     riotRequestInFlight.current = false;
   }
 }, [language]);
 useEffect(() => {
   if (riotSearch.loading || !riotSearch.rawMatches || riotSearch.language === language) return;
   let active = true;
   mapRiotMatches(riotSearch.rawMatches, riotSearch.puuid, language).then(matches => {
     if (active) setRiotSearch(current => current === riotSearch ? { ...current, matches, language } : current);
   }).catch(() => { /* Keep the already loaded match results. */ });
   return () => { active = false; };
 }, [language, riotSearch]);

 const region = 'asia';
  const client = window.riotClientAccount;
  const [detected, setDetected] = useState(null);
  useEffect(() => {
    if (!client) return;
    let active = true;
    let timer;
    async function checkAccount() {
      try {
        const account = await client.detect();
        if (active) setDetected(account);
      } catch {
        if (active) setDetected(null);
      } finally {
        if (active) timer = setTimeout(checkAccount, 15000);
      }
    }
    checkAccount();
    return () => { active = false; clearTimeout(timer); };
  }, [client]);

  const { name: searchedName, tag: searchedTag, region: searchedRegion, loading: riotLoading } = riotSearch;
  useEffect(() => {
    if (!detected || riotLoading) return;
    const { gameName, tagLine } = detected;
    // Account checks also refresh results, with a cooldown for API rate limits.
    if (gameName === searchedName && tagLine === searchedTag && region === searchedRegion && Date.now() < nextRiotRefresh.current) return;
    void searchRiot(gameName, tagLine, region);
  }, [detected, riotLoading, region, searchedName, searchedTag, searchedRegion, searchRiot]);

 return <MatchContext.Provider value={{mode:'local',records,loading,error,riotSearch,riotMatches,getRecord:id=>records.find(r=>r.match.id===id)}}>{children}</MatchContext.Provider>;
}
export const useTftMatches=()=>useContext(MatchContext);
