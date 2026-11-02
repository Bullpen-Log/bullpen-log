import assert from 'node:assert/strict';
import { inArea, filterGuide, isPrimary, uniqueExercises } from '~/armcare/guide-model';
import { targetStatus, appendRoutineExercise } from '@/lib/armcare/routine-target';
import { appendToOwnedRoutine } from '@/lib/armcare/routine-add';
import type { ArmcareExerciseView } from '@/app/(app)/training/armcare-media';
import type { PrismaClient } from '@prisma/client';
let n = 0;
const eq = (a: unknown, b: unknown) => { assert.deepEqual(a,b); n++; };
const ex = (id: string, muscles: string[], title = id, equipment: string[] = []): ArmcareExerciseView => ({ id, title, targetMuscles: muscles, equipment, intensity: '저', difficulty: null, prescription: null, thumbUrl: null, videoPath: null, referenceVideoId: null, aspectRatio: null, isReference: false, method: null });
const a = ex('a', ['미등록', '극하근', '하부 승모근'], 'Band 외회전', ['밴드']);
const b = ex('b', ['미등록'], '미분류');
const c = ex('c', ['하부 승모근', '극하근'], '외회전', []);
eq(uniqueExercises([a,b,a,c]).length,3);
eq(inArea([a,b,c], 'shoulder-back').map((e)=>e.id),['a','c']);
eq(isPrimary(a,'shoulder-back'),true);
eq(isPrimary(c,'shoulder-back'),false);
eq(inArea([a,b,c],null).length,3);
eq(filterGuide([a,b,c],'BAND 외회전','밴드').map((e)=>e.id),['a']);
eq(filterGuide([a,b,c],'외회전','맨몸').length,0);
eq(filterGuide([a,b,c],'없는 말',null).length,0);
const items = Array.from({length:15},(_,i)=>({exerciseId:`e${i}`,sets:(i%5)+1}));
eq(targetStatus({id:'r',name:'r',exerciseIds:items.map(x=>x.exerciseId)},'e0'),'inside');
eq(appendRoutineExercise(items,'new',2).kind,'full');
eq(appendRoutineExercise(items,'e0',5).items,items);
eq(appendRoutineExercise(items.slice(0,14),'new',9).items[14].sets,5);
// A deterministic CAS database: yield between read and update to force two calls to read the same version.
let row = { name:'루틴', items:items.slice(0,2), updatedAt:new Date(0) };
let writes=0;
const db = { userArmcareRoutine: {
  findFirst: async ({where}: {where:{userId:string;id:string}}) => { const snap = where.userId === 'owner' && where.id === 'r' ? structuredClone(row) : null; await Promise.resolve(); return snap; },
  updateMany: async ({where,data}: {where:{updatedAt:Date};data:typeof row}) => { await Promise.resolve(); if (where.updatedAt.getTime() !== row.updatedAt.getTime()) return {count:0}; row={...row,...data};writes++;return {count:1}; },
}} as unknown as Pick<PrismaClient,'userArmcareRoutine'>;
const add = (id:string, owner='owner') => appendToOwnedRoutine(db,owner,'r',id,3,()=>new Date(1));
await Promise.all([add('x'),add('y')]);
eq(row.items.map(x=>x.exerciseId),['e0','e1','x','y']);
eq(row.items.slice(0,2),items.slice(0,2));
const before=writes;
await Promise.all([add('same'),add('same')]);
eq(writes-before,1);
eq(row.items.filter(x=>x.exerciseId==='same').length,1);
row={...row,items:items.slice(0,14)};
const results=await Promise.all([add('last-a'),add('last-b')]);
eq(row.items.length,15);
eq(results.filter(x=>'code' in x && x.code==='full').length,1);
eq((await add('other','stranger')),'code' in (await add('other','stranger')) ? {code:'missing',error:'루틴을 찾을 수 없어요.'} : null);
const ack=await add('last-a');
if ('ok' in ack) eq(ack.added,false); // lost acknowledgement, same membership means no second append
console.log(`부위별 보강 · 분류/검색/한도/동시 추가 ${n}개 통과 (격리 CAS 어댑터)`);
