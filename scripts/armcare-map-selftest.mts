/**
 * 내 팔 지도 자체 검사 — lib/armcare/coverage.ts.
 *
 *   npm run armcare-map:test
 *
 * 암케어 운동은 공유 DB 에서 읽기만 한다(숨긴 것 빼고). 기록을 꾸며 넣어 점수 · 비어 있는 부위를 보고, 부위 여덟 ×
 * 가진 장비 몇 가지로 빈 곳 루틴을 짜 본다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ARMCARE_AREAS, ARMCARE_CATEGORY, primaryArea } from '@/lib/armcare/anatomy';
import { armcareMinutes } from '@/lib/armcare/routine';
import { filterByEquipment } from '@/lib/report/equipment';
import {
  COVERAGE_FULL,
  GAP_BELOW,
  GAP_PRIORITY,
  armcareCoverage,
  buildFocusRoutine,
  gapAreas,
  parseAreas,
} from '@/lib/armcare/coverage';

let pass = 0;
let fail = 0;
function ok(cond: boolean, name: string, detail = '') {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const rows = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null, category: ARMCARE_CATEGORY },
});
await prisma.$disconnect();
const exercises = rows.map((r) => ({ ...r, targetMuscles: r.targetMuscles ?? [] }));
console.log(`암케어 운동 ${exercises.length}개`);

/* ── 점수 ── */
const tagged = exercises.filter((ex) => ex.targetMuscles.length >= 2);
const one = tagged[0];
{
  const c = armcareCoverage([{ exerciseId: one.id }, { exerciseId: one.id }], exercises);
  ok(c.total === 2, '기록 두 개를 센다');
  ok(c.muscles[one.targetMuscles[0]] === 2, '주 근육은 1씩');
  ok(c.muscles[one.targetMuscles[1]] === 1, '함께 쓴 근육은 0.5씩');
  const area = primaryArea(one.targetMuscles)!.key;
  ok(c.areas[area] >= 2, '부위 점수에 들어간다', String(c.areas[area]));
  ok(c.primary[area] === 2, '주 부위 수', String(c.primary[area]));
  ok(c.heat[one.targetMuscles[0]] === 2 / COVERAGE_FULL, '3D 진하기는 COVERAGE_FULL 기준');
  const many = armcareCoverage(Array.from({ length: 9 }, () => ({ exerciseId: one.id })), exercises);
  ok(many.heat[one.targetMuscles[0]] === 1, '진하기는 1 을 넘지 않는다');
  ok(armcareCoverage([{ exerciseId: 'nope' }], exercises).total === 0, '모르는 운동은 세지 않는다');
}

/* ── 비어 있는 부위 ── */
{
  const empty = armcareCoverage([], exercises);
  ok(gapAreas(empty).join() === GAP_PRIORITY.slice(0, 2).join(), '기록이 없으면 차례의 앞 둘');
  const c = armcareCoverage([{ exerciseId: one.id }], exercises);
  const gaps = gapAreas(c, 8);
  ok(gaps.every((k) => c.primary[k] < GAP_BELOW), '고른 곳은 모두 기준 아래');
  /* 곁다리(함께 쓴 근육 0.5점)만 있는 부위는 아직 빈 곳 */
  const side = tagged.find((ex) => primaryArea(ex.targetMuscles)?.key !== primaryArea([ex.targetMuscles[1]])?.key);
  if (side) {
    const sc = armcareCoverage([{ exerciseId: side.id }], exercises);
    const sideArea = primaryArea([side.targetMuscles[1]])!.key;
    ok(sc.areas[sideArea] > 0 && gapAreas(sc, 8).includes(sideArea), '곁다리만 쓴 부위는 점수는 있어도 빈 곳');
  }
  ok(
    gaps.every((k, i) => i === 0 || GAP_PRIORITY.indexOf(gaps[i - 1]) < GAP_PRIORITY.indexOf(k)),
    '차례대로'
  );
  const full = armcareCoverage(
    ARMCARE_AREAS.flatMap((a) => {
      const ex = exercises.find((e) => primaryArea(e.targetMuscles)?.key === a.key);
      return ex ? [{ exerciseId: ex.id }] : [];
    }),
    exercises
  );
  ok(gapAreas(full).length === 0, '모든 부위를 했으면 빈 곳 없음');
}

/* ── 빈 곳 루틴 ── */
const kits: [string, string[]][] = [
  ['장비 없음', []],
  ['밴드', ['밴드']],
  ['밴드 · 덤벨', ['밴드', '덤벨']],
];
for (const [label, owned] of kits) {
  const pool = filterByEquipment(exercises, owned).pool;
  for (const a of ARMCARE_AREAS) {
    const has = pool.some((ex) => primaryArea(ex.targetMuscles)?.key === a.key);
    const items = buildFocusRoutine({ areas: [a.key], candidates: pool });
    if (!has) {
      ok(items.length === 0, `${label} ${a.label}: 운동이 없으면 비어 있다`);
      continue;
    }
    ok(items.length >= 1 && items.length <= 3, `${label} ${a.label}: 1~3개`, String(items.length));
    ok(items.every((it) => it.area === a.key && it.sets === 2), `${label} ${a.label}: 부위 · 세트`);
  }
  for (let i = 0; i < GAP_PRIORITY.length; i++) {
    const areas = [GAP_PRIORITY[i], GAP_PRIORITY[(i + 1) % GAP_PRIORITY.length]];
    const items = buildFocusRoutine({ areas, candidates: pool });
    const ids = items.map((it) => it.exerciseId);
    ok(new Set(ids).size === ids.length, `${label} ${areas.join('+')}: 겹침 없음`);
    const minutes = items.reduce(
      (sum, it) => sum + armcareMinutes(pool.find((ex) => ex.id === it.exerciseId)!, it.sets),
      0
    );
    const last = items.at(-1);
    const lastMin = last ? armcareMinutes(pool.find((ex) => ex.id === last.exerciseId)!, last.sets) : 0;
    ok(items.length === 0 || minutes - lastMin < 10, `${label} ${areas.join('+')}: 10분을 넘기면 멈춘다`, `${minutes.toFixed(1)}분`);
    /* 부위를 번갈아 담는다 — 둘 다 운동이 있으면 첫 둘이 각 부위 */
    const bothHave = areas.every((k) => pool.some((ex) => primaryArea(ex.targetMuscles)?.key === k));
    if (bothHave && items.length >= 2) {
      ok(items[0].area === areas[0] && items[1].area === areas[1], `${label} ${areas.join('+')}: 번갈아`);
    }
  }
}

/* 오래 안 한 것부터 */
{
  const pool = exercises.filter((ex) => primaryArea(ex.targetMuscles)?.key === 'shoulder-back');
  if (pool.length >= 2) {
    const lastDone = new Map(pool.map((ex, i) => [ex.id, `2026-09-${String(10 + i).padStart(2, '0')}`]));
    const fresh = pool[pool.length - 1];
    lastDone.delete(fresh.id);
    const items = buildFocusRoutine({ areas: ['shoulder-back'], candidates: pool, lastDone });
    ok(items[0]?.exerciseId === fresh.id, '한 번도 안 한 운동이 맨 앞');
  }
}

/* 주소 */
ok(parseAreas('shoulder-back,elbow-inner,x,shoulder-back').join() === 'shoulder-back,elbow-inner', '주소 읽기');
ok(parseAreas(undefined).length === 0, '없는 주소');

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
