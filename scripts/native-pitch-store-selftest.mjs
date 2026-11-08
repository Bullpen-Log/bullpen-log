import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const code=`
export const useCallback=f=>f,useEffect=f=>{if(globalThis.__pitchStoreTest.effects)f()},useReducer=()=>[0,()=>{}],useSyncExternalStore=(s,g)=>g();
export const cacheEpoch=()=>globalThis.__pitchStoreTest.epoch,cacheGet=()=>globalThis.__pitchStoreTest.cache(),cacheSet=async(k,v)=>{globalThis.__pitchStoreTest.writes.push([k,v])},rpc=(...args)=>globalThis.__pitchStoreTest.rpc(...args);
export const createVideoPlayer=()=>({}),LocalVideo={},isPhoneVideoPath=()=>false,phoneAssetId=x=>x,serverThumbUrls=async()=>({}),serverVideoUrls=async()=>({});
export const loadAll=()=>globalThis.__pitchStoreTest.all(),loadMonth=()=>globalThis.__pitchStoreTest.month();`;
const stub='data:text/javascript,'+encodeURIComponent(code);
const hooks=registerHooks({resolve(name,context,next){
 if(['react','~/lib/store','~/lib/rpc','expo-video'].includes(name)||name.includes('modules/local-video')||(name==='./api'&&context.parentURL?.endsWith('/pitch/store.ts')))return{url:stub,shortCircuit:true};
 if(name.startsWith('@/'))return next(pathToFileURL(path.join(root,name.slice(2)+'.ts')).href,context);
 return next(name,context);
}});
const q=globalThis.__pitchStoreTest={epoch:0,effects:false,all:async()=>[],month:async()=>[],cache:async()=>null,writes:[],rpc:async()=>({ok:true,days:[],featured:{}})};
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

 // 대표 선택 쓰기: 실제 store/RPC 경계만 대체. 조회는 서버에 확인된 값만 돌려준다.
 let server={};
 const snapshot=()=>s.useFeatured();
 const fresh=async(seed={'2026-11-03':'initial'})=>{
  setup();server={...seed};q.rpc=async(action)=>{assert.equal(action,'app.loadAppFeatured');return{ok:true,featured:{...server}}};await s.reloadFeatured();
 };
 for(const result of ['success','failure']){
  await fresh({'2026-11-03':'account-A'});const old=deferred();q.rpc=()=>old.promise;const pending=s.setFeatured('2026-11-03','A-choice');await tick();
  q.epoch++;s.resetPitchStore();server={'2026-11-03':'account-B'};q.rpc=async()=>({ok:true,featured:{...server}});await s.reloadFeatured();
  if(result==='success')old.resolve({videoPath:'A-choice'});else old.reject(Error('old failure'));await pending;await tick();
  check(`featured previous account ${result} ignored`,snapshot()['2026-11-03']==='account-B');
 }
 for(const firstResult of ['success','failure'])for(const secondResult of ['success','failure']){
  await fresh();const first=deferred(),second=deferred();const sent=[];let reads=0;
  q.rpc=(action,date,value)=>{if(action==='app.loadAppFeatured'){reads++;return Promise.resolve({ok:true,featured:{...server}})}sent.push(value);return sent.length===1?first.promise:second.promise};
  const a=s.setFeatured('2026-11-03','first'),b=s.setFeatured('2026-11-03','second');await tick();
  check('same date writes serialized '+firstResult+secondResult,sent.join(',')==='first'&&snapshot()['2026-11-03']==='second');
  await s.reloadFeatured();check('pending read cannot replace latest selection '+firstResult+secondResult,reads===0&&snapshot()['2026-11-03']==='second');
  if(firstResult==='success'){server['2026-11-03']='first';first.resolve({videoPath:'first'})}else first.reject(Error('first failed'));await a;await tick();
  check('queued latest write sent after earlier settlement '+firstResult+secondResult,sent.join(',')==='first,second'&&snapshot()['2026-11-03']==='second');
  if(secondResult==='success'){server['2026-11-03']='second';second.resolve({videoPath:'second'})}else second.reject(Error('second failed'));await b;await tick();
  const expected=secondResult==='success'?'second':firstResult==='success'?'first':'initial';
  check('rollback uses confirmed value '+firstResult+secondResult,snapshot()['2026-11-03']===expected);
 }
 await fresh({'2026-11-03':'day-A','2026-11-04':'day-B'});const dayA=deferred(),dayB=deferred();let sends=0;
 q.rpc=(action,date)=>{if(action==='app.loadAppFeatured')return Promise.resolve({ok:true,featured:{...server}});sends++;return date==='2026-11-03'?dayA.promise:dayB.promise};
 const pa=s.setFeatured('2026-11-03','new-A'),pb=s.setFeatured('2026-11-04','new-B');await tick();check('different dates can save independently',sends===2);
 dayA.reject(Error('failed A'));await pa;check('date failure preserves other pending date',snapshot()['2026-11-03']==='day-A'&&snapshot()['2026-11-04']==='new-B');
 server['2026-11-04']='new-B';dayB.resolve({videoPath:'new-B'});await pb;await tick();check('date failure does not undo other success',snapshot()['2026-11-03']==='day-A'&&snapshot()['2026-11-04']==='new-B');
 await fresh();const reading=deferred(),writing=deferred();let loads=0;
 q.rpc=(action)=>action==='app.loadAppFeatured'?(++loads===1?reading.promise:Promise.resolve({ok:true,featured:{...server}})):writing.promise;
 const read=s.reloadFeatured(),write=s.setFeatured('2026-11-03','chosen');await tick();reading.resolve({ok:true,featured:{'2026-11-03':'stale'}});await read;
 check('read begun before selection cannot overwrite it',snapshot()['2026-11-03']==='chosen');server['2026-11-03']='chosen';writing.resolve({videoPath:'chosen'});await write;await tick();check('confirmation refresh retains successful choice',snapshot()['2026-11-03']==='chosen');
 await fresh();const lost=deferred();q.rpc=action=>action==='app.loadAppFeatured'?Promise.resolve({ok:true,featured:{...server}}):lost.promise;
 const unknown=s.setFeatured('2026-11-03','committed');await tick();server['2026-11-03']='committed';lost.reject(Error('response lost'));await unknown;await tick();check('lost response checks server without resending mutation',snapshot()['2026-11-03']==='committed');
 await fresh();let oldSends=0;q.rpc=async()=>{oldSends++;return{videoPath:'old'}};const skipped=s.setFeatured('2026-11-03','old');s.resetPitchStore();await skipped;check('reset before dispatch prevents queued old write',oldSends===0&&Object.keys(snapshot()).length===0);
 await fresh();const oldRead=deferred(),newRead=deferred();q.rpc=()=>oldRead.promise;const oldLoad=s.reloadFeatured();s.resetPitchStore();q.rpc=()=>newRead.promise;const newLoad=s.reloadFeatured();oldRead.resolve({ok:true,featured:{'2026-11-03':'old'}});await oldLoad;
 check('old read cleanup preserves new in-flight request',s.reloadFeatured()===newLoad);newRead.resolve({ok:true,featured:{'2026-11-03':'new'}});await newLoad;check('reset protects featured reads without epoch change',snapshot()['2026-11-03']==='new');
 console.log(`pitch store: ${passed} checks passed (mock dependencies, no database)`);
}finally{delete globalThis.__pitchStoreTest;hooks.deregister()}
