/**
 * 촬영 계획 version 10(2026-11-16 김민: "둘 다 하고 올려줘") — 라이브러리에서 숨긴 운동 · 드릴을 계획에서 뺀다(숨긴 것은 앱에 안 나와
 * 찍어도 쓸 곳이 없다). 뺀 주는 번호를 1부터 다시 매기고(시각은 그대로 — 빈 몇 분만 남는다), 빈 자리는 지운다. DB 는 읽기만.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v10.mts           # 무엇이 바뀌나만
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan-v10.mts --write   # 쓰기
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import type { PlanWeek, ShootPlan } from '@/lib/shoot/schedule';

const FILE = new URL('../lib/shoot/plan-data.json', import.meta.url);
const write = process.argv.includes('--write');
const plan = JSON.parse(readFileSync(FILE, 'utf8')) as ShootPlan;
if (plan.version >= 10) {
  console.log(`이미 version ${plan.version} — 멈춤`);
  process.exit(0);
}
const ids = plan.weeks.flatMap((w) => w.stations.flatMap((s) => s.items.map((i) => i.exerciseId)));
const hidden = new Set(
  [
    ...(await prisma.exerciseVideo.findMany({ where: { id: { in: ids }, hiddenAt: { not: null } }, select: { id: true } })),
    ...(await prisma.mechanicsGuide.findMany({ where: { id: { in: ids }, hiddenAt: { not: null } }, select: { id: true } })),
  ].map((r) => r.id)
);
await prisma.$disconnect();

const weeks: PlanWeek[] = plan.weeks.map((w) => {
  const gone = w.stations.flatMap((s) => s.items).filter((i) => hidden.has(i.exerciseId));
  if (!gone.length) return w;
  console.log(`${w.deferred ? '미룬 영상' : `${w.week}주차`}: ${gone.map((i) => `${i.no} ${i.title}`).join(' · ')} 뺌`);
  let n = 0;
  return {
    ...w,
    stations: w.stations
      .map((s) => ({
        ...s,
        items: s.items
          .filter((i) => !hidden.has(i.exerciseId))
          .map((i) => ({ ...i, no: `${w.week}-${String(++n).padStart(2, '0')}` })),
      }))
      .filter((s) => s.items.length),
  };
});
const next: ShootPlan = { ...plan, version: 10, createdOn: new Date().toISOString().slice(0, 10), weeks };
if (write) {
  writeFileSync(FILE, JSON.stringify(next, null, 1) + '\n');
  console.log('lib/shoot/plan-data.json 씀(version 10)');
} else console.log('--write 로 쓴다.');
