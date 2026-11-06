const list = value => Array.isArray(value) ? value.filter(v => v && typeof v === 'object') : [];
const number = value => Number.isFinite(value) ? value : null;
export function adaptLocalRound(record, catalog, t) {
 const a=record.analysis || {};
 const asset=(kind,id)=>{const v=id && catalog?.[kind]?.[String(id).toLowerCase()];return {name:v?.name || t('unknown'),image:v?.image || null,apiId:id || null,unknown:!v?.name};};
 const unit=(v,id)=>({...asset('champion',v.championId),id,star:[1,2,3].includes(v.star)?v.star:null,items:Array.from({length:3},(_,i)=>asset('item',v.items?.[i]))});
 const board=[],unresolved=[],used=new Set(),slots=new Set();
 list(a.board).forEach((v,i)=>{const u=unit(v,`board-${i}`),p=v.row*7+v.col;const valid=Number.isInteger(v.row)&&v.row>=0&&v.row<4&&Number.isInteger(v.col)&&v.col>=0&&v.col<7;if(valid&&!used.has(p)){board.push({...u,position:p});used.add(p);}else unresolved.push(u);});
 const bench=list(a.bench).filter(v=>v.occupancy==='unit').flatMap((v,i)=>{const u=unit(v,`bench-${i}`);if(!Number.isInteger(v.slot)||v.slot<0||v.slot>8||slots.has(v.slot)){unresolved.push(u);return [];}slots.add(v.slot);return [{...u,benchPosition:v.slot}];});
 list(a.unassignedUnits).forEach((v,i)=>unresolved.push(unit(v,`unassigned-${i}`)));
 const observations=list(a.hudObservations).filter(v=>v.unitRef==null&&v.unitIndex==null).map((v,i)=>unit(v,`observation-${i}`));
 const [stage,round]=String(record.stage).split('-').map(Number);
 return {stage,round,source:'local',result:null,level:number(record.level),hp:number(record.health),gold:number(record.gold),board,bench,unresolved,observations,analyzed:Boolean(record.analysis),traits:list(a.traits).map(v=>({...asset('trait',v.traitId),id:v.traitId,count:number(v.count),active:v.active??null,tier:v.tier})),traitsComplete:a.traitsComplete===true};
}
export function adaptLocalMatch(record,catalog,t){
 const rounds=(record.rounds||[]).map(r=>({...adaptLocalRound(r,catalog,t),capturedAt:r.captured_at,analysis:r.analysis})),last=rounds.at(-1);
 const elapsed=(Date.parse(record.ended_at)-Date.parse(record.started_at))/1000;
 const duration=Number.isFinite(elapsed)&&elapsed>=0?`${Math.floor(elapsed/60)}:${String(Math.floor(elapsed%60)).padStart(2,'0')}`:'—';
 return {match:{id:record.id,source:'local',timestamp:Date.parse(record.started_at),mode:t('captureLocal'),theme:t('lastRecordedBoard'),placement:Number.isInteger(record.placement) && record.placement >= 1 && record.placement <= 8 ? record.placement : null,duration,level:last?.level??null,goldLeft:last?.gold??null,finalStage:record.rounds?.at(-1)?.stage,finalComposition:last?.board||[],traits:last?.traits||[],roundCount:rounds.length},replay:{rounds}};
}
