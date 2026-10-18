/**
 * 영상 내용 점검 4단계 — fix-plan.json(content-plan.py)대로 운동 내용을 고친다. 운영 DB 를 바꾸니 먼저 `npm run backup`.
 *
 *   node --env-file=.env scripts/shoot-trim/content-fix.mjs <폴더>/fix-plan.json            # 고치기
 *   node --env-file=.env scripts/shoot-trim/content-fix.mjs <폴더>/fix-plan.json --revert   # 되돌리기
 *
 * 지금 DB 값이 점검 때(before)와 같을 때만 바꾼다(그새 누가 고쳤으면 건너뜀). 고친 뒤 lib/library-cache.ts 의 캐시 이름을 하나 올린다.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const plan = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const revert = process.argv.includes('--revert');
const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let n = 0;
for (const x of plan) {
  const want = revert ? { ...x.before, ...x.data } : x.before;
  const row = await p.exerciseVideo.findUnique({
    where: { id: x.id },
    select: { title: true, description: true, equipment: true, perSide: true, reps: true, holdSeconds: true },
  });
  const same = row && Object.keys(x.data).every((k) => JSON.stringify(row[k]) === JSON.stringify(want[k]));
  if (!same) {
    console.log('건너뜀(그새 바뀜)', x.title);
    continue;
  }
  const data = revert ? Object.fromEntries(Object.keys(x.data).map((k) => [k, x.before[k]])) : x.data;
  await p.exerciseVideo.update({ where: { id: x.id }, data });
  n++;
}
console.log(revert ? '되돌림' : '고침', n, '/', plan.length);
await p.$disconnect();
