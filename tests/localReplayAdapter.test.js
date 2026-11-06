import test from 'node:test';
import assert from 'node:assert/strict';
import { adaptLocalRound } from '../frontend/src/services/localReplayAdapter.js';
const t = key => key;
test('local replay preserves zero and unknowns without demo values', () => {
 const r = adaptLocalRound({stage:'1-2',gold:0,health:null}, null,t);
 assert.equal(r.stage,1); assert.equal(r.round,2); assert.equal(r.gold,0); assert.equal(r.hp,null); assert.equal(r.result,null); assert.deepEqual(r.board,[]); assert.equal(r.analyzed,false);
});
test('unresolved and duplicate positions are retained outside the board', () => {
 const r=adaptLocalRound({stage:'3-3',analysis:{board:[{row:0,col:0},{row:0,col:0},{row:8,col:1}],unassignedUnits:[{star:3}],bench:[{slot:2,occupancy:'unit'},{slot:4,occupancy:'unknown'}]}},null,t);
 assert.equal(r.board.length,1); assert.equal(r.unresolved.length,3); assert.equal(r.bench.length,1); assert.equal(r.bench[0].benchPosition,2); assert.equal(r.board[0].star,null); assert.equal(r.board[0].items.length,3);
});
test('real metadata resolves and linked HUD observations are not duplicated', () => {
 const r=adaptLocalRound({stage:'2-1',analysis:{board:[{row:1,col:2,championId:'RealID',star:2,items:['item']}],hudObservations:[{unitIndex:0},{unitRef:{collection:'board',index:0}},{unitIndex:null,star:3}]}},{champion:{realid:{name:'Real',image:'real.png'}},item:{item:{name:'Item',image:'item.png'}}},t);
 assert.equal(r.board[0].name,'Real'); assert.equal(r.board[0].position,9); assert.equal(r.board[0].items[0].name,'Item'); assert.equal(r.observations.length,1);
});
import { adaptLocalMatch } from '../frontend/src/services/localReplayAdapter.js';
test('recorded match cards and replay share only real saved rounds',()=>{
 const saved={id:'local-1',started_at:'2026-11-05T00:00:00Z',ended_at:'2026-11-05T00:02:05Z',rounds:[{stage:'1-3',gold:0,health:98,level:3,analysis:{board:[{row:1,col:1,star:2}],bench:[],traits:[]}}]};
 const snapshot=JSON.stringify(saved),r=adaptLocalMatch(saved,null,t);
 assert.equal(r.match.source,'local');assert.equal(r.match.placement,null);assert.equal(r.match.duration,'2:05');assert.equal(r.match.finalStage,'1-3');assert.equal(r.match.goldLeft,0);assert.equal(r.replay.rounds.length,1);assert.equal(r.replay.rounds[0].hp,98);assert.equal(r.match.finalComposition[0].position,8);assert.equal(JSON.stringify(saved),snapshot);
});
