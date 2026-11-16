/**
 * 촬영 계획 version 9(2026-11-16) — 같은 날 더한 덤벨 벤트오버 로우(scripts/library-add-db-row-2026-11-16.mjs)를 실내 2주차에 넣어 2주차를 다시 짠다(v8 과 같은 규칙).
 * 2주차는 아직 아무것도 안 찍어서(체크 0) 통째로 다시 배치한다 — 체크가 하나라도 있으면 멈춘다. DB 는 읽기만, 계획 파일만 쓴다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v9.mts           # 무엇이 바뀌나만
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v9.mts --write   # 쓰기
 *
 * 2주차 대상은 v6 과 같은 규칙: 숨기지 않았고 우리 영상이 없는 운동 가운데 다른 주(1주차 · 미룬 영상)에 없는 것. 뺀 것: 분류 '나중에 촬영'
 * (김민 2026-11-16 보류) · 계획에서 뺀 토 워크 둘(2026-10-14) · 1주차 드릴과 같은 참고 영상인 파워 복사본(드릴 영상이 같이 붙는다).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { bucketOf, layoutWeek, loadOf, postureOf, shotMinutes, stationOf, type PlanWeek, type Row, type ShootPlan } from '@/lib/shoot/schedule';

const FILE = new URL('../lib/shoot/plan-data.json', import.meta.url);
const write = process.argv.includes('--write');
const plan = JSON.parse(readFileSync(FILE, 'utf8')) as ShootPlan;
if (plan.version >= 9) {
  console.log(`이미 version ${plan.version} — 멈춤`);
  process.exit(0);
}
const items = (w: PlanWeek) => w.stations.flatMap((s) => s.items);
const old2 = plan.weeks.find((w) => w.week === 2 && !w.outdoor && !w.deferred);
if (!old2) throw new Error('실내 2주차가 없다');
const checked = await prisma.shootCheck.count({ where: { exerciseId: { in: items(old2).map((i) => i.exerciseId) } } });
if (checked) throw new Error(`2주차에 체크가 ${checked}개 — 다시 짜면 번호가 바뀐다, 멈춤`);

const others = new Set(plan.weeks.filter((w) => w !== old2).flatMap((w) => items(w).map((i) => i.exerciseId)));
const week1Drills = plan.weeks
  .filter((w) => w.outdoor)
  .flatMap(items)
  .filter((i) => i.kind === 'drill')
  .map((i) => i.exerciseId);
const drillRefs = new Set(
  (await prisma.mechanicsGuide.findMany({ where: { id: { in: week1Drills } }, select: { referenceVideoId: true } }))
    .map((d) => d.referenceVideoId)
    .filter(Boolean)
);
const lib = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null, videoPath: null },
  select: {
    id: true,
    title: true,
    category: true,
    bodyParts: true,
    movementPattern: true,
    intensity: true,
    equipment: true,
    holdSeconds: true,
    perSide: true,
    referenceVideoId: true,
  },
});
await prisma.$disconnect();
const SKIP_TITLES = new Set(['토 워크', '리버스 토 워크']);
const fresh = lib.filter(
  (x) =>
    !others.has(x.id) &&
    x.category !== '나중에 촬영' &&
    !SKIP_TITLES.has(x.title) &&
    !(x.referenceVideoId && drillRefs.has(x.referenceVideoId))
);
const rows: Row[] = fresh.map((x) => ({
  ...x,
  station: stationOf(x),
  bucket: bucketOf(x),
  minutes: shotMinutes(x),
  load: loadOf(x),
  eqKey: [...x.equipment].sort().join('+') || '맨몸',
  posture: postureOf(x.title),
}));
const week2 = layoutWeek(2, rows);
const before = new Set(items(old2).map((i) => i.exerciseId));
const gone = items(old2).filter((i) => !fresh.some((x) => x.id === i.exerciseId));
if (gone.length) throw new Error(`2주차에서 빠지는 운동: ${gone.map((i) => i.title).join(', ')}`);

const next: ShootPlan = {
  ...plan,
  version: 9,
  createdOn: new Date().toISOString().slice(0, 10),
  weeks: plan.weeks.map((w) => (w === old2 ? week2 : w)),
};
console.log(
  `2주차 ${items(old2).length} → ${items(week2).length}개 · 끝 ${week2.end}분 · ` +
    week2.stations.map((s) => `${s.warmup ? '몸풀기' : s.station} ${s.items.length}`).join(' · ')
);
console.log('새로:', items(week2).filter((i) => !before.has(i.exerciseId)).map((i) => i.title).join(' | '));
if (write) {
  writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n');
  console.log('lib/shoot/plan-data.json 씀(version 9)');
} else console.log('--write 로 쓴다.');
