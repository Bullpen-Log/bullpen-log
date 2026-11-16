/**
 * 워밍업 루틴 다섯에 2026-11-16 에 더한 워밍업 운동을 넣는다(김민: "그대로 넣고"). 지금 있는 운동은 그대로 두고 새 운동만 더해
 * 이 차례로 맞춘다 — 빠지는 운동이 있으면 멈춘다. 루틴은 DB 에서 바로 읽어(lib/workout/warmup-load.ts) 캐시 이름은 안 올린다.
 *
 *   node --env-file=.env scripts/warmup-routines-2026-11-16.mjs           # 확인만
 *   node --env-file=.env scripts/warmup-routines-2026-11-16.mjs --apply   # 맞추기(먼저 npm run backup)
 *   node --env-file=.env scripts/warmup-routines-2026-11-16.mjs --revert  # 예전 차례로(새로 넣은 것은 뺀다)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

const NEXT = {
  COMMON: ['잭 점프', '하이 니', '버트 킥', '카리오카', '워킹 니 허그', 'A-스킵', '인치웜', '월드 그레이티스트 스트레치'],
  LOWER: ['레그 스윙 앞뒤', '레그 스윙 좌우', '프랑켄슈타인 워크', '90/90 힙 스위치', '양발 글루트 브리지', '로우 포고 홉'],
  UPPER_PUSH: ['암 서클 앞뒤', '크로스 바디 암 스윙', '스탠딩 숄더 CAR', '쿼드러펫 외회전', '다운독 푸시업', '인클라인 플라이오 푸시업'],
  UPPER_PULL: ['밴드 Y · T · W', '밴드 노 머니', '밴드 풀 어파트', '버드독', '스피드 밴드 로우'],
  FULL: ['레그 스윙 앞뒤', '암 서클 앞뒤', '스탠딩 힙 CAR', '스탠딩 숄더 CAR', '다운독 푸시업', '인클라인 플라이오 푸시업'],
};
/* 2026-11-16 바꾸기 전 차례(되돌리기용) */
const PREV = {
  COMMON: ['워킹 니 허그', 'A-스킵', '인치웜', '월드 그레이티스트 스트레치'],
  LOWER: ['90/90 힙 스위치', '양발 글루트 브리지', '로우 포고 홉'],
  UPPER_PUSH: ['스탠딩 숄더 CAR', '쿼드러펫 외회전', '인클라인 플라이오 푸시업'],
  UPPER_PULL: ['밴드 풀 어파트', '버드독', '스피드 밴드 로우'],
  FULL: ['스탠딩 힙 CAR', '스탠딩 숄더 CAR', '인클라인 플라이오 푸시업'],
};
const WANT = revert ? PREV : NEXT;

const titles = [...new Set(Object.values(WANT).flat())];
const rows = await prisma.exerciseVideo.findMany({
  where: { title: { in: titles }, hiddenAt: null },
  select: { id: true, title: true },
});
const idOf = new Map();
for (const t of titles) {
  const hit = rows.filter((r) => r.title === t);
  if (hit.length !== 1) throw new Error(`'${t}' 운동이 ${hit.length}개 — 하나여야 한다`);
  idOf.set(t, hit[0].id);
}

const routines = await prisma.warmupRoutine.findMany({
  include: { items: { orderBy: { sortOrder: 'asc' }, include: { exercise: { select: { title: true } } } } },
});
const ops = [];
for (const [kind, list] of Object.entries(WANT)) {
  const r = routines.find((x) => x.kind === kind);
  if (!r) throw new Error(`루틴 ${kind} 이 없다`);
  const now = r.items.map((i) => i.exercise.title);
  const dropped = now.filter((t) => !list.includes(t));
  if (dropped.length && !revert) throw new Error(`${kind} 에서 빠지는 운동: ${dropped.join(', ')} — 멈춤`);
  console.log(`${kind} ${r.name}\n  지금: ${now.join(' · ')}\n  바꿈: ${list.join(' · ')}`);
  const keep = new Set(list.map((t) => idOf.get(t)));
  for (const i of r.items)
    if (!keep.has(i.exerciseId))
      ops.push(prisma.warmupRoutineItem.delete({ where: { routineId_exerciseId: { routineId: r.id, exerciseId: i.exerciseId } } }));
  list.forEach((t, k) =>
    ops.push(
      prisma.warmupRoutineItem.upsert({
        where: { routineId_exerciseId: { routineId: r.id, exerciseId: idOf.get(t) } },
        update: { sortOrder: k },
        create: { routineId: r.id, exerciseId: idOf.get(t), sortOrder: k },
      })
    )
  );
}
if (!apply && !revert) console.log('확인만 했다. 맞추려면 --apply');
else {
  await prisma.$transaction(ops);
  console.log(`${revert ? '되돌림' : '맞춤'} — 쓰기 ${ops.length}번`);
}
await prisma.$disconnect();
