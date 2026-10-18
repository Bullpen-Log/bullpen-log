/**
 * 워밍업 루틴 다섯을 채운다(2026-10-16 김민: "8~10분 · 동적 위주 · 하체 · 상체 밀기 · 상체 당기기에 전신도 · 메디신볼 · 던지기 말고").
 *
 * 공통(①몸 데우기 · ②동적 가동, 날마다 같음) + 그날 넷(③깨우기 · ④터뜨리기). 운동은 모두 라이브러리에 이미 있는 것 — 분류는 그대로 두고
 * 루틴에 담기만 한다(WarmupRoutineItem). 처방은 루틴 안내(note)로. 공통 루틴 이름은 '전신 워밍업' → '공통 워밍업'(전신은 새 루틴 FULL).
 * 2026-10-16 김민 "너무 많아" — 워킹 쿼드 풀 · 흉추 3방향 · 더블렉 스냅다운(하체 · 전신)을 뺐다.
 * 다시 돌리면 같은 내용으로 맞춘다(루틴의 담긴 운동을 지우고 다시 담음).
 *
 *   node --env-file=.env scripts/warmup-routines-2026-10-16.mjs           # 확인만
 *   node --env-file=.env scripts/warmup-routines-2026-10-16.mjs --apply   # 넣기(먼저 npm run backup)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

/** kind → [이름, 한 줄 설명, 차례, [운동 이름, 처방]…] */
const ROUTINES = {
  COMMON: ['공통 워밍업', '몸 데우기 · 동적 가동 — 날마다 같아요', 0, [
    ['워킹 니 허그', '10m'],
    ['A-스킵', '10m × 2'],
    ['인치웜', '5회'],
    ['월드 그레이티스트 스트레치', '한쪽 3회'],
  ]],
  LOWER: ['하체 워밍업', '엉덩이 깨우기 · 가볍게 뛰기', 1, [
    ['90/90 힙 스위치', '5회'],
    ['양발 글루트 브리지', '10회'],
    ['로우 포고 홉', '10회'],
  ]],
  UPPER_PUSH: ['상체 밀기 워밍업', '어깨 깨우기 · 빠르게 밀기', 2, [
    ['스탠딩 숄더 CAR', '한쪽 3회'],
    ['쿼드러펫 외회전', '한쪽 5회'],
    ['인클라인 플라이오 푸시업', '5회'],
  ]],
  UPPER_PULL: ['상체 당기기 워밍업', '등 · 견갑 깨우기 · 빠르게 당기기', 3, [
    ['밴드 풀 어파트', '10회'],
    ['버드독', '한쪽 5회'],
    ['스피드 밴드 로우', '8회'],
  ]],
  FULL: ['전신 워밍업', '엉덩이 · 어깨 깨우기 · 빠르게 밀기', 4, [
    ['스탠딩 힙 CAR', '한쪽 3회'],
    ['스탠딩 숄더 CAR', '한쪽 3회'],
    ['인클라인 플라이오 푸시업', '5회'],
  ]],
};

const titles = [...new Set(Object.values(ROUTINES).flatMap(([, , , items]) => items.map(([t]) => t)))];
const found = await prisma.exerciseVideo.findMany({ where: { title: { in: titles }, hiddenAt: null }, select: { id: true, title: true } });
const idOf = new Map(found.map((e) => [e.title, e.id]));
const missing = titles.filter((t) => !idOf.has(t));
if (missing.length) throw new Error(`라이브러리에 없음: ${missing.join(', ')}`);

for (const [kind, [name, , , items]] of Object.entries(ROUTINES))
  console.log(`${kind} ${name}: ${items.map(([t, n]) => `${t}(${n})`).join(' · ')}`);
if (!apply) {
  console.log('확인만 했다. 넣으려면 --apply');
} else {
  await prisma.$transaction(async (tx) => {
    for (const [kind, [name, description, sortOrder, items]] of Object.entries(ROUTINES)) {
      const r = await tx.warmupRoutine.upsert({
        where: { kind },
        update: { name, description, sortOrder, hiddenAt: null },
        create: { kind, name, description, sortOrder },
      });
      await tx.warmupRoutineItem.deleteMany({ where: { routineId: r.id } });
      await tx.warmupRoutineItem.createMany({
        data: items.map(([t, note], i) => ({ routineId: r.id, exerciseId: idOf.get(t), sortOrder: i, note })),
      });
    }
  });
  console.log('넣음');
}
await prisma.$disconnect();
