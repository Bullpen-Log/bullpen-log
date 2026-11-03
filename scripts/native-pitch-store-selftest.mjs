import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const code=`
export const useCallback=f=>f,useEffect=f=>{if(globalThis.__pitchStoreTest.effects)f()},useReducer=()=>[0,()=>{}],useSyncExternalStore=(s,g)=>g();
export const cacheEpoch=()=>globalThis.__pitchStoreTest.epoch,cacheGet=()=>globalThis.__pitchStoreTest.cache(),cacheSet=async(k,v)=>{globalThis.__pitchStoreTest.writes.push([k,v])},rpc=async()=>({ok:true,days:[],featured:{}});
export const createVideoPlayer=()=>({}),LocalVideo={},isPhoneVideoPath=()=>false,phoneAssetId=x=>x,serverThumbUrls=async()=>({}),serverVideoUrls=async()=>({});
export const loadAll=()=>globalThis.__pitchStoreTest.all(),loadMonth=()=>globalThis.__pitchStoreTest.month();`;
const stub='data:text/javascript,'+encodeURIComponent(code);
const hooks=registerHooks({resolve(name,context,next){
 if(['react','~/lib/store','~/lib/rpc','expo-video'].includes(name)||name.includes('modules/local-video')||(name==='./api'&&context.parentURL?.endsWith('/pitch/store.ts')))return{url:stub,shortCircuit:true};
 if(name.startsWith('@/'))return next(pathToFileURL(path.join(root,name.slice(2)+'.ts')).href,context);
 return next(name,context);
}});
const q=globalThis.__pitchStoreTest={epoch:0,effects:false,all:async()=>[],month:async()=>[],cache:async()=>null,writes:[]};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return{promise,resolve,reject}};
const tick=()=>new Promise(r=>setTimeout(r,0));
let passed=0;const check=(label,v)=>{assert.ok(v,label);passed++};
try{
 const s=await import('../native/src/pitch/store.ts');
 const beginAll=()=>{q.effects=true;s.useAllLogs(true);q.effects=false};
 const all=()=>s.useAllLogs(false),month=()=>s.useMonth('2026-11');
 const setup=()=>{q.effects=false;q.epoch++;q.all=async()=>[];q.month=async()=>[];q.cache=async()=>null;q.writes=[];s.resetPitchStore()};
 for(const source of ['all','month'])for(const outcome of ['success','failure']){
  setup();q[source]=async()=>[{id:'previous'}];if(source==='all'){beginAll();await tick()}else await s.refreshMonth('2026-11');
  const old=deferred();q[source]=()=>old.promise;let p;if(source==='all')beginAll();else p=s.refreshMonth('2026-11');
  q.epoch++;s.resetPitchStore();q[source]=async()=>[{id:'current'}];if(source==='all'){beginAll();await tick()}else await s.refreshMonth('2026-11');
  if(outcome==='success')old.resolve([{id:'late-previous'}]);else old.reject(Error('old offline'));await p;await tick();
  const result=source==='all'?all():month();check(`${source} old-account ${outcome} discarded`,result.logs?.[0].id==='current'&&!result.error&&!result.loading);
 }
 for(const source of ['all','month'])for(const outcome of ['success','failure']){
  setup();const old=deferred();q[source]=()=>old.promise;let p;if(source==='all')beginAll();else p=s.refreshMonth('2026-11');
  q[source]=async()=>[{id:'latest'}];if(source==='all'){beginAll();await tick()}else await s.refreshMonth('2026-11');
  if(outcome==='success')old.resolve([{id:'stale'}]);else old.reject(Error('old failure'));await p;await tick();
  const result=source==='all'?all():month();check(`${source} older same-account ${outcome} discarded`,result.logs?.[0].id==='latest'&&!result.error);
 }
 for(const outcome of ['success','failure']){
  setup();q.month=async()=>[{id:'saved',date:'2026-11-03',createdAt:'2026-11-03',pitchCount:20}];await s.refreshMonth('2026-11');
  const old=deferred();q.month=()=>old.promise;const p=s.refreshMonth('2026-11');s.applySavedLog({id:'saved',date:'2026-11-03',createdAt:'2026-11-03',pitchCount:80},q.epoch);
  if(outcome==='success')old.resolve([{id:'saved',pitchCount:20}]);else old.reject(Error('old failure'));await p;
  check(`saved value survives old ${outcome}`,month().logs[0].pitchCount===80&&!month().loading&&!month().error);
 }
 setup();const beforeReset=deferred();q.all=()=>beforeReset.promise;beginAll();s.resetPitchStore();beforeReset.resolve([{id:'old'}]);await tick();check('reset invalidates even without epoch change',all().logs===null);
 setup();q.month=async()=>[{id:'kept'}];await s.refreshMonth('2026-11');q.month=async()=>{throw Error('offline')};await s.refreshMonth('2026-11');check('current failure retains records and retryable error',month().logs[0].id==='kept'&&month().error==='offline'&&!month().loading);
 setup();const warm=deferred(),network=deferred();q.cache=()=>warm.promise;q.month=()=>network.promise;const pending=s.refreshMonth('2026-11');warm.resolve([{id:'offline-copy'}]);await tick();network.reject(Error('offline'));await pending;check('network failure retains warmed records',month().logs[0].id==='offline-copy');
 setup();q.month=async()=>[{id:'new'}];await s.refreshMonth('2026-11');check('successful query writes current cache',q.writes.some(([k,v])=>k==='pitch:2026-11'&&v[0].id==='new'));
 console.log(`pitch store: ${passed} checks passed (mock dependencies, no database)`);
}finally{delete globalThis.__pitchStoreTest;hooks.deregister()}
