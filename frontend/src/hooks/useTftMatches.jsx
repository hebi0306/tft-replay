import { savedOptions } from '../services/captureOptions.js';
import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { localReplay } from '../services/localReplay.js';
import { loadTftStaticData } from '../services/tftStaticData.js';
import { adaptLocalMatch } from '../services/localReplayAdapter.js';
import { useLanguage } from '../i18n/LanguageProvider.jsx';
const MatchContext = createContext(null);
export function TftMatchesProvider({children}) {
 const {t,language}=useLanguage();
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
     finally { if (active) timer = setTimeout(monitor, 1000); }
   }
   monitor();
   return () => { active = false; clearTimeout(timer); };
 }, []);
 const version=saved[0]?.rounds.find(r=>r.analysis?.catalogVersion)?.analysis.catalogVersion;
 useEffect(()=>{let active=true;loadTftStaticData(version, language).then(v=>{if(active)setCatalog(v);});return()=>{active=false;};},[version,language]);
 const records=useMemo(()=>saved.map(r=>adaptLocalMatch(r,catalog,t)),[saved,catalog,t]);
 return <MatchContext.Provider value={{mode:'local',records,loading,error,getRecord:id=>records.find(r=>r.match.id===id)}}>{children}</MatchContext.Provider>;
}
export const useTftMatches=()=>useContext(MatchContext);
