/** Review target resolution + AST consumer inventory + actual LibraryVideo adapter callbacks.
 * The adapter test uses mocked React/network only. Native inventory is source evidence, not device validation.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- Explicitly mocked JSX/React boundaries and TypeScript AST tool API. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { selectReviewVideo, reviewVideoHref, reviewVideoTarget } from '../lib/exercise-video-review.ts';
import * as playback from '../lib/exercise-video-state.ts';
import * as reference from '../lib/reference-video.ts';
const require = createRequire(import.meta.url);
const ts = require('typescript');
let count = 0;
function check(value: unknown, name: string) { assert.ok(value, name); count++; }
const items = [{id:'exercise-a',videoPath:'library/asset-a.mp4'},{id:'guide-b',videoPath:null},{id:'asset-a',videoPath:null}];
const before = JSON.stringify(items);
check(selectReviewVideo(items,undefined).status === 'none', 'ordinary catalog unchanged');
check(selectReviewVideo(items,'exercise-a').item === items[0], 'exact authorized exercise ID');
check(selectReviewVideo(items,'asset-a').item === items[2], 'exact item ID wins over file ID');
check(selectReviewVideo(items.slice(0,2),'asset-a').item === items[0], 'known mechanics file ID resolves within authorized list');
check(selectReviewVideo(items,'missing').status === 'missing', 'missing target does not pick next');
check(selectReviewVideo([...items.slice(0,1),{id:'other',videoPath:'library/asset-a.mov'}],'asset-a').status === 'ambiguous', 'duplicate asset cannot silently choose a drill');
for (const v of ['', ['exercise-a'], 'https://site.test/a?token=secret','../private','library/asset-a.mp4','x'.repeat(129)]) check(selectReviewVideo(items,v).status === 'invalid','unsafe/ambiguous query rejected');
check(JSON.stringify(items) === before, 'selection changes no item/order/content');
check(reviewVideoHref('exercise','exercise-a') === '/library/training?review=exercise-a','exercise library deep link');
check(reviewVideoHref('mechanics','asset-a') === '/library/mechanics?review=asset-a','mechanics registered-file deep link');
check(reviewVideoHref('exercise','https://site.test/a') === null,'no media URL or credential in review URL');

const web = [
  'app/(app)/library/training/training-client.tsx','app/(app)/library/mechanics/mechanics-client.tsx',
  'app/(app)/training/exercise-list.tsx','app/(app)/training/mechanics-drill.tsx','app/(app)/training/armcare-media.tsx','app/(app)/training/program-card.tsx',
  'app/(session)/workout/run/session-client.tsx','app/(session)/workout/warmup/warmup-client.tsx','app/(session)/armcare/play/[id]/armcare-player.tsx','app/(session)/mechanics/play/mechanics-player.tsx','components/shoot/exercise-detail.tsx',
];
const native = ['native/src/app/workout.tsx','native/src/app/warmup.tsx','native/src/app/armcare/[id].tsx','native/src/app/mechanics.tsx'];
function tags(path: string) {
  const file = ts.createSourceFile(path,readFileSync(path,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  const out = new Set<string>();
  function visit(node: any) { if(ts.isJsxSelfClosingElement(node)||ts.isJsxOpeningElement(node))out.add(node.tagName.getText(file));ts.forEachChild(node,visit); }
  visit(file); return out;
}
for (const path of web) { const used=tags(path); check(used.has('LibraryVideo')&&!used.has('video')&&!used.has('iframe'),`web shared consumer: ${path}`); }
for (const path of native) { const used=tags(path);check(used.has('ExerciseMedia')&&!used.has('VideoView'),`native workout shared consumer: ${path}`); }
check(tags('native/src/armcare/parts.tsx').has('ExerciseVideo'),'native workout wrapper reaches default player');
for(const path of ['native/src/library/detail.tsx','native/src/library/drill-detail.tsx'])check(tags(path).has(path.endsWith('/detail.tsx')?'ExerciseVideo':'DetailMedia'),`native detail chain: ${path}`);

const source=readFileSync('components/library-video.tsx','utf8');
const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText;
async function adapter(props: Record<string,unknown>, activate=false) {
  const slots: any[]=[];let index=0;let requests=0;
  const react={useState(initial: any){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return[slots[i],(v:any)=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(initial:any){const i=index++;return slots[i]??=( {current:initial} );},useEffect(){index++;}};
  const mocks:Record<string,unknown>={react,'react/jsx-runtime':{jsx:(type:any,props:any)=>({type,props}),jsxs:(type:any,props:any)=>({type,props})},'@/components/icon':{Play:'Play',Loader2:'Loader2'},'@/components/exercise-video/owned-player':{OwnedExercisePlayer:'OwnedPlayer'},'@/components/exercise-video/youtube-player':{YouTubeExercisePlayer:'YouTubePlayer'},'@/lib/exercise-video-state':playback,'@/lib/reference-video':reference,'@/lib/local-video':{libraryVideoFromPhone:async()=>undefined}};
  const mod={exports:{} as Record<string,any>};
  const fetchMock=async(url:string,options:any)=>{requests++;check(url==='/api/library/video-url'&&options.method==='POST','owned adapter uses existing authenticated URL API');check(JSON.parse(options.body).paths[0]===props.path,'owned adapter requests exact selected path');return{json:async()=>({urls:{[String(props.path)]:'blob:synthetic-owned-test'}})};};
  new Function('require','module','exports','fetch','window',js)((id:string)=>{if(id in mocks)return mocks[id];throw new Error(id);},mod,mod.exports,fetchMock,{setTimeout,clearTimeout});
  const boundary=mod.exports.LibraryVideo(props);
  const render=()=>{index=0;return boundary.type(boundary.props);};
  function clickable(node:any):any { if(node?.props?.onClick)return node;for(const c of [node?.props?.children].flat(Infinity)){const found=clickable(c);if(found)return found;}return null; }
  let out=render(); if(activate){await clickable(out).props.onClick();await new Promise<void>((done)=>setImmediate(done));out=render();}
  return {out,requests};
}
check((await adapter({title:'Owned',path:'library/owned.mp4'},true)).out.type==='OwnedPlayer','owned exercise mounts actual shared owned adapter');
const yt=await adapter({title:'Reference',referenceVideoId:'M7lc1UVf-VE'},true);
check(yt.out.type==='YouTubePlayer'&&yt.requests===0,'reference remains official provider; no owned substitution');
const both=await adapter({title:'Both',path:'library/owned.mp4',referenceVideoId:'M7lc1UVf-VE'},true);
check(both.out.type==='YouTubePlayer'&&both.requests===0,'web reference-first policy unchanged');
check((await adapter({title:'Missing'})).out.props.role==='status','missing media is explicit, never a dead play button');

// Execute the actual review-only server reader against a read-only fake Prisma boundary.
// Changing these in-memory rows is a cache/freshness model, never a live DB mutation test.
let exerciseRows: any[]=[];let guideRows: any[]=[];let reads=0;
const queries: any[]=[];
function readRows(rows:any[],query:any) {
  reads++;queries.push(query);
  check(Array.isArray(query.where.id.in),'fresh read remains within the previously authorized list');
  return rows.filter(row=>query.where.id.in.includes(row.id)
    && (!('hiddenAt' in query.where)||row.hiddenAt===query.where.hiddenAt)
    && query.where.OR.some((clause:any)=>clause.id===row.id||clause.videoPath&&row.videoPath?.startsWith(clause.videoPath.startsWith)));
}
const freshSource=readFileSync('lib/exercise-video-review-server.ts','utf8');
const freshJs=ts.transpileModule(freshSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const freshModule={exports:{} as Record<string,any>};
const freshMocks:Record<string,unknown>={
  'server-only':{},'@/lib/prisma':{prisma:{exerciseVideo:{findMany:async(q:any)=>readRows(exerciseRows,q)},mechanicsGuide:{findMany:async(q:any)=>readRows(guideRows,q)}}},
  '@/lib/shoot/plan':{OLD_OWN_VIDEOS:new Set()},'@/lib/storage':{createPlaybackUrls:async()=>({})},'@/lib/reference-video':reference,
  '@/lib/exercise-video-review':{reviewVideoTarget,selectReviewVideo},
};
new Function('require','module','exports',freshJs)((id:string)=>{if(id in freshMocks)return freshMocks[id];throw new Error(`Unexpected/cache/write dependency: ${id}`);},freshModule,freshModule.exports);
const {freshExerciseReview,freshGuideReview}=freshModule.exports;
const stale=[{id:'exercise-a',title:'OLD',description:'CACHED',videoPath:'library/asset-a.mp4',favorite:true,note:'keep-note',usedCount:3}];
const immutable=JSON.stringify(stale);
const row={...stale[0],title:'NEW',description:'FRESH',hiddenAt:null,source:'OWN',referenceVideoId:null,thumbPath:null,category:'NEW CATEGORY',restSeconds:180};
exerciseRows=[row];
let fresh=await freshExerciseReview(stale,'exercise-a',false);
check(fresh.status==='selected'&&fresh.description==='FRESH'&&fresh.item.title==='NEW'&&fresh.item.restSeconds===180,'review reads current metadata and description instead of stale catalog');
check(fresh.item.favorite&&fresh.item.note==='keep-note'&&fresh.item.usedCount===3,'review preserves user-only presentation fields');
check(queries.at(-1).where.hiddenAt===null,'ordinary account rechecks current visibility');
exerciseRows=[{...row,description:'FRESH AGAIN'}];
check((await freshExerciseReview(stale,'exercise-a',false)).description==='FRESH AGAIN','subsequent review reads current backing rows without library cache');
const beforeInvalid=reads;
check((await freshExerciseReview(stale,['exercise-a'],false)).status==='invalid','duplicate query array stops before direct read');
check((await freshExerciseReview(stale,undefined,false)).status==='none'&&reads===beforeInvalid,'ordinary browse/invalid target has no new read');
exerciseRows=[{...row,hiddenAt:new Date('2026-11-13T00:00:00Z')}];
check((await freshExerciseReview(stale,'exercise-a',false)).status==='missing','recently hidden exercise cannot leak via stale visible catalog');
check((await freshExerciseReview(stale,'exercise-a',true)).item.hiddenAt==='2026-11-13T00:00:00.000Z','admin retains existing access to hidden exercises');
exerciseRows=[{...row,videoPath:'library/replaced.mp4'}];
check((await freshExerciseReview(stale,'asset-a',true)).status==='missing','old asset ID cannot open a replaced source');
exerciseRows=[row,{...row,id:'other'}];
check((await freshExerciseReview([...stale,{...stale[0],id:'other'}],'asset-a',false)).status==='ambiguous','fresh duplicate assets do not silently choose an item');
check((await freshExerciseReview(stale,'other',true)).status==='missing','fresh lookup cannot expand cached authorization boundary');
exerciseRows=[{...row,referenceVideoId:'M7lc1UVf-VE',videoPath:null,source:'REFERENCE'}];
fresh=await freshExerciseReview(stale,'exercise-a',false);
check(fresh.item.videoPath===null&&fresh.item.referenceVideoId==='M7lc1UVf-VE'&&fresh.item.thumbUrl===reference.referenceThumbUrl('M7lc1UVf-VE'),'fresh source fields and reference thumbnail move together');
guideRows=[{...row,id:'guide-b',description:'NEW GUIDE',sortOrder:7}];
const oldGuides=[{id:'guide-b',description:'OLD GUIDE',videoPath:'library/asset-a.mp4',favorite:true}];
check((await freshGuideReview(oldGuides,'guide-b')).item.description==='NEW GUIDE','guide review bypasses stale description cache');
check(queries.at(-1).where.hiddenAt===null,'guides always preserve hidden-row exclusion');
guideRows=[{...guideRows[0],hiddenAt:new Date()}];
check((await freshGuideReview(oldGuides,'guide-b')).status==='missing','newly hidden guide stays inaccessible');
check(JSON.stringify(stale)===immutable,'freshness reads never mutate cached list/content');
console.log(`rollout: ${count} pass, 0 fail (native source inventory + mocked web adapter/fresh read; real runtime evidence separate)`);
