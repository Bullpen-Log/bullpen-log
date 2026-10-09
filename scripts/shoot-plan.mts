/*
 * 트레이닝 영상 촬영 계획 뽑기 — DB 를 읽기만 하고 lib/shoot/plan-data.json 을 쓴다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan.mts            (미리보기만)
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/shoot-plan.mts --write    (파일에 쓰기)
 *
 * 대상: 앱에 보이는(숨기지 않은) 운동 가운데 아직 유튜브 참고 영상(REFERENCE)인 것. 계획은 한 번 뽑아 고정한다 —
 * 촬영 중에 다시 뽑으면 번호(1-07 …)와 주차가 바뀌어 찍던 카드가 어긋난다. 다시 뽑을 때는 version 을 올린다.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';
import { buildPlan, SESSION_MINUTES, WRAP_MINUTES } from '../lib/shoot/schedule.ts';

const write = process.argv.includes('--write');
const rows = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null, source: 'REFERENCE' },
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
  },
});
await prisma.$disconnect();

const today = new Date().toISOString().slice(0, 10);
const plan = buildPlan(rows, today);
for (const w of plan.weeks) {
  const n = w.stations.reduce((a, s) => a + s.items.length, 0);
  const lower = [
    '하체 파워',
    '하체 앞(무릎)',
    '하체 뒤(힌지)',
    '고관절 · 발목 보강',
    '유산소',
  ] as const;
  const leg = lower.reduce((a, b) => a + (w.load[b] ?? 0), 0);
  console.log(
    `${w.week}주차 ${n}개 · 끝 ${Math.floor(w.end / 60)}:${String(Math.round(w.end % 60)).padStart(2, '0')} · 여유 ${Math.round(SESSION_MINUTES - WRAP_MINUTES - w.end)}분 · 자리 ${w.stations.length}곳 · 하체 ${leg.toFixed(1)}`
  );
}
console.log(`합계 ${rows.length}개`);
if (write) {
  writeFileSync(
    new URL('../lib/shoot/plan-data.json', import.meta.url),
    JSON.stringify(plan, null, 1) + '\n'
  );
  console.log('lib/shoot/plan-data.json 에 썼다');
}
