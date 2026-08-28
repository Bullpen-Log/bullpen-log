/**
 * 운동마다 세트·횟수(또는 버티는 시간)·휴식 시간을 채운다.
 *
 *   node --env-file=.env scripts/fill-prescription.mjs        (미리보기)
 *   node --env-file=.env scripts/fill-prescription.mjs --yes  (실제 저장)
 *
 * 정하는 기준은 scripts/prescription-rules.mjs 에 적어 두었다.
 * 이미 값이 들어 있는 운동은 건드리지 않는다(--force 를 주면 덮어쓴다).
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { intensityLevel } from '../lib/exercise-meta.ts';
import { minutesForSets } from '../lib/exercise-meta.ts';
import {
  isHold,
  isPerSide,
  holdSecondsFor,
  restSecondsFor,
  REVIEWED_TITLES,
} from './prescription-rules.mjs';

const apply = process.argv.includes('--yes');
const force = process.argv.includes('--force');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const rows = await prisma.exerciseVideo.findMany({
  select: {
    id: true, title: true, category: true, intensity: true, description: true,
    bodyParts: true,
    sets: true, reps: true, holdSeconds: true, restSeconds: true, perSide: true,
  },
});

/*
 * 규칙 파일에 손으로 적어 둔 운동 이름에 오타가 있으면 그 줄은 아무 일도 하지
 * 않은 채 조용히 넘어간다. 그러면 잘못 채워진 것을 나중에 찾기 어려우니,
 * 시작하기 전에 실제로 있는 이름인지 먼저 확인한다.
 */
const known = new Set(rows.map((r) => r.title));
const typos = REVIEWED_TITLES.filter((t) => !known.has(t));
if (typos.length) {
  console.error('규칙 파일에 적힌 이름 중 실제로 없는 것:');
  for (const t of typos) console.error(`  ${t}`);
  await prisma.$disconnect();
  process.exit(1);
}

const updates = [];
let skipped = 0;

for (const e of rows) {
  if (e.sets != null && !force) { skipped++; continue; }

  const level = intensityLevel(e.intensity);
  const hold = isHold(e.title, e.description, e.category);

  const data = {
    sets: 3,
    reps: hold ? null : e.category === '파워' ? 5 : 10,
    holdSeconds: hold ? holdSecondsFor(e.category, level) : null,
    restSeconds: restSecondsFor(e.category, level, e.bodyParts),
    perSide: isPerSide(e.title, e.description, e.category),
  };

  updates.push({
    ...e,
    data,
    minutes: Math.round((minutesForSets({ ...e, ...data }) ?? 0) * 10) / 10,
  });
}

console.log(`채울 것 ${updates.length}개 / 이미 있어 건너뜀 ${skipped}개\n`);

const byCat = {};
for (const u of updates) {
  (byCat[u.category] ??= { n: 0, hold: 0, side: 0, min: 0 });
  byCat[u.category].n++;
  if (u.data.holdSeconds) byCat[u.category].hold++;
  if (u.data.perSide) byCat[u.category].side++;
  byCat[u.category].min += u.minutes;
}
console.log('카테고리   개수  시간형  좌우형  평균 소요');
for (const [k, v] of Object.entries(byCat).sort()) {
  console.log(
    `  ${k.padEnd(14)} ${String(v.n).padStart(3)}  ${String(v.hold).padStart(4)}  ${String(v.side).padStart(4)}   ${(v.min / v.n).toFixed(1)}분`
  );
}

console.log('\n예시:');
for (const t of ['데드리프트', '박스 점프', '튜빙 외회전 0도', '월 싯', '피전 포즈', '데드버그']) {
  const u = updates.find((x) => x.title === t);
  if (!u) continue;
  const d = u.data;
  const amount = d.reps ? `${d.reps}회` : `${d.holdSeconds}초`;
  console.log(
    `  ${t.padEnd(16)} ${d.sets}세트 × ${amount}${d.perSide ? ' (좌우 각각)' : ''} · 휴식 ${d.restSeconds}초 → 약 ${u.minutes}분`
  );
}

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
  await prisma.$disconnect();
  process.exit(0);
}

for (const u of updates) {
  await prisma.exerciseVideo.update({ where: { id: u.id }, data: u.data });
}
console.log(`\n${updates.length}개 저장 완료.`);
await prisma.$disconnect();
