/**
 * 암케어 운동에 '키우는 근육'을 채운다.
 *
 *   node --env-file=.env scripts/fill-armcare-muscles.mts          (무엇이 채워지는지 보기만)
 *   node --env-file=.env scripts/fill-armcare-muscles.mts --save   (실제로 저장)
 *
 * 값은 scripts/armcare-muscles.json 에 있다. 2026-09-25 에 운동 이름과 설명을 읽고
 * 초안을 만든 뒤(한 번 짓고, 해부학 기준으로 한 번 더 검증), 사용자분이 확인한
 * 것이다. 근육 이름은 lib/armcare/anatomy.ts 의 ARMCARE_MUSCLES 안에서만 쓴다 —
 * 그 목록을 바로 읽어, 없는 이름이 있으면 저장하지 않고 멈춘다.
 *
 * 이미 채워진 것은 건드리지 않는다. 관리자 화면에서 손으로 고친 값을 덮어쓰면
 * 안 된다. (--force 를 주면 덮어쓴다.)
 *
 * DB 를 바꾸는 작업이니 저장하기 전에 npm run backup 부터 한다.
 * 저장한 뒤 화면에 보이려면 라이브러리 캐시가 비워져야 한다 — 관리자 화면에서
 * 운동 하나를 저장하거나, 배포하면 비워진다(lib/library-cache.ts).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ARMCARE_MUSCLE_NAMES } from '../lib/armcare/anatomy.ts';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const save = process.argv.includes('--save');
const force = process.argv.includes('--force');

const rows: { id: string; title: string; muscles: string[] }[] = JSON.parse(
  readFileSync(new URL('./armcare-muscles.json', import.meta.url), 'utf8')
);

const unknown = rows.flatMap((r) =>
  r.muscles
    .filter((m) => !ARMCARE_MUSCLE_NAMES.includes(m))
    .map((m) => `${r.title}: ${m}`)
);
if (unknown.length) {
  console.log('목록에 없는 근육 이름이 있어 멈춥니다 —');
  for (const u of unknown) console.log(`  ${u}`);
  process.exit(1);
}

const current = await prisma.exerciseVideo.findMany({
  where: { id: { in: rows.map((r) => r.id) } },
  select: { id: true, title: true, category: true, targetMuscles: true },
});
const byId = new Map(current.map((ex) => [ex.id, ex]));

const todo: { id: string; title: string; muscles: string[] }[] = [];
const skipped: string[] = [];
const missing: string[] = [];
for (const r of rows) {
  const ex = byId.get(r.id);
  if (!ex || ex.category !== '암케어') {
    missing.push(r.title);
    continue;
  }
  if (ex.targetMuscles.length > 0 && !force) {
    skipped.push(ex.title);
    continue;
  }
  todo.push({ id: ex.id, title: ex.title, muscles: r.muscles });
}

console.log(
  `목록 ${rows.length}개 → 채울 것 ${todo.length}개 · 이미 채운 것 ${skipped.length}개`
);
if (missing.length) {
  console.log(`\n라이브러리에서 못 찾았거나 암케어가 아닌 것 ${missing.length}개 —`);
  for (const t of missing) console.log(`  ${t}`);
}

if (!save) {
  console.log('\n── 채울 내용 ──');
  for (const t of todo) console.log(`  ${t.title} │ ${t.muscles.join(' · ')}`);
  console.log('\n실제로 저장하려면 --save 를 붙이세요.');
} else {
  for (const t of todo) {
    await prisma.exerciseVideo.update({
      where: { id: t.id },
      data: { targetMuscles: t.muscles },
    });
  }
  console.log(`\n${todo.length}개를 저장했습니다.`);
}

await prisma.$disconnect();
