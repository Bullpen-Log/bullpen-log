import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
let passed=0;const check=(label,value)=>{assert.ok(value,label);passed++;};
// 서버 의존성만 로컬 대체. 실제 DB·환경변수·네트워크는 사용하지 않는다.
const stubs={
 'server-only':'',
 '@/lib/prisma':`export const prisma={pitchLog:{findMany:async q=>{globalThis.__analysis.calls.push(q);return select(q)},findFirst:async q=>{globalThis.__analysis.calls.push(q);const rows=select(q);if(q.where.maxVelocity){const r=rows.filter(r=>r.maxVelocity!=null).sort((a,b)=>b.maxVelocity-a.maxVelocity)[0];return r??null;}return rows[0]??null;}}};function select(q){return globalThis.__analysis.rows.filter(r=>r.userId===q.where.userId&&(!q.where.date.gte||r.date>=q.where.date.gte)&&(!q.where.date.lte||r.date<=q.where.date.lte));}`,
 '@/lib/report/training-acwr':`export const trainingLoad=async()=>({ratio:null,zone:null,historyDays:0,daysNeeded:28,estimated:false,realWeight:1,acute:0,chronic:0,trend:[]});`,
 '@/lib/report/training-review':`export const trainingReview=async()=>null;export const armCareMissingOf=()=>false;`,
 '@/lib/report/good-days-load':`export const loadGoodDays=async()=>null;`,
 '@/lib/report/highlights-load':`export const loadHighlights=async()=>({items:[]});`,
 '@/lib/report/today-data':`export const loadTodayCore=async()=>({facts:{}});`,
 '@/lib/report/training-history':`export const trainingSummaries=async()=>({'2026-01-03':{count:2},'2026-01-05':{count:9}});`,
};
const hooks=registerHooks({resolve(specifier,context,nextResolve){
 if(Object.hasOwn(stubs,specifier))return{url:'data:text/javascript,'+encodeURIComponent(stubs[specifier]),shortCircuit:true};
 return nextResolve(specifier,context);
}});
try{
 const {loadAppAnalysisData}=await import('../lib/report/analysis-data.ts');
 const row=(userId,date,count,speed=null)=>({id:userId+date,userId,date:new Date(date+'T00:00:00Z'),sessionType:'bullpen',pitchCount:count,intensity:7,effortPct:70,maxVelocity:speed,avgVelocity:null});
 globalThis.__analysis={calls:[],rows:[row('a','2026-01-03',20,128),row('a','2026-01-05',90,150),row('b','2026-01-03',999,180),row('old','2024-01-01',30)]};
 const user=id=>({id,nickname:'test',birthDate:null,heightCm:null,targetVelocity:null,baselineFreq:null,baselineVolume:null,baselineIntensity:null});
 const data=await loadAppAnalysisData(user('a'),'pitch','2026-01-04','2026-11-03');
 check('historical series ends on requested date',data.date==='2026-01-04'&&Object.keys(data.series.values.pitches).every(d=>d<=data.date));
 check('historical recorded day included',data.series.values.pitches['2026-01-03']===20);
 check('future record excluded',!Object.hasOwn(data.series.values.pitches,'2026-01-05'));
 check('other owner excluded',data.series.values.velocity['2026-01-03']===128);
 check('overview and graph use same cutoff',data.overview.best.value===128&&data.overview.week.total===20);
 check('every pitch query owns user',globalThis.__analysis.calls.every(q=>q.where.userId==='a'));
 check('series query has upper bound',globalThis.__analysis.calls.some(q=>q.select?.pitchCount&&q.where.date.lte?.toISOString().startsWith('2026-01-04')));
 const old=await loadAppAnalysisData(user('old'),'pitch','2026-01-04','2026-11-03');
 check('older records are not called first use',old.overview.pitching.hasRecords===true);
 const empty=await loadAppAnalysisData(user('empty'),'pitch','2026-01-04','2026-11-03');
 check('empty owner remains empty',empty.overview.pitching.hasRecords===false&&Object.keys(empty.series.values.pitches).length===0);
 const training=await loadAppAnalysisData(user('a'),'training','2026-01-04','2026-11-03');
 check('training historical series uses same window',training.series.values.training['2026-01-03']===2&&!Object.hasOwn(training.series.values.training,'2026-01-05'));
 console.log('analysis data: '+passed+' checks passed (mock dependencies, no database)');
}finally{delete globalThis.__analysis;hooks.deregister();}
