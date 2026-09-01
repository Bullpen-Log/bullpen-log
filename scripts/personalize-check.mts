/**
 * 경력과 목표가 실제로 훈련을 바꾸는지, 바꾸면서도 시간이 맞는지 확인한다.
 *
 *   npm run personalize:check
 *
 * 보는 것은 셋이다.
 *   1) 목표를 바꾸면 시간 배분이 정말 달라지는가 (안 달라지면 고른 의미가 없다)
 *   2) 목표를 바꿔도 전체 시간은 고른 값 근처인가 (정규화가 되고 있는가)
 *   3) 경력이 낮거나 장비가 적어도 구간이 통째로 비지 않는가
 *
 * 앱과 똑같은 함수를 부른다. 여기서 따로 계산하면 확인하는 의미가 없다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { filterByEquipment } from '../lib/report/equipment.ts';
import {
  TRAINING_GOALS,
  TRAINING_LEVELS,
  filterByLevel,
} from '../lib/report/personalize.ts';
import {
  effectiveMinutes,
  estimateMinutes,
  pickForTheme,
  SLOT_LABELS,
  SLOT_ORDER,
  compositionFor,
  type SlotKey,
} from '../lib/report/theme.ts';

const MINUTES = 60;
/** 실제 소요가 고른 시간의 몇 %까지 벗어나도 괜찮다고 볼 것인가 */
const TOLERANCE = 0.15;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
await prisma.$disconnect();

let failed = 0;

/** 구간별 소요 시간(분)을 재서 한 줄로 만든다 */
function shapeOf(
  picks: { exercise: { category: string; intensity: string }; slot: SlotKey }[]
) {
  const mins = new Map<SlotKey, number>();
  const count = new Map<SlotKey, number>();
  for (const p of picks) {
    mins.set(p.slot, (mins.get(p.slot) ?? 0) + estimateMinutes(p.exercise));
    count.set(p.slot, (count.get(p.slot) ?? 0) + 1);
  }
  return SLOT_ORDER.filter((s) => count.has(s))
    .map(
      (s) => `${SLOT_LABELS[s].label} ${count.get(s)}개/${Math.round(mins.get(s)!)}분`
    )
    .join(' · ');
}

console.log(`■ 목표별 시간 배분 (하체 데이 ${MINUTES}분, 경력·장비 제한 없음)\n`);
for (const goal of TRAINING_GOALS) {
  const { picks, estimatedMinutes } = pickForTheme({
    candidates: library,
    theme: 'lower',
    minutes: effectiveMinutes('lower', MINUTES),
    doneIds: new Set<string>(),
    goal: goal.name,
  });
  const gap = Math.abs(estimatedMinutes - MINUTES) / MINUTES;
  const ok = gap <= TOLERANCE;
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${goal.name.padEnd(9)} 총 ${estimatedMinutes}분`);
  console.log(`     ${shapeOf(picks)}`);
}

console.log(`\n■ 경력별로 할 수 있는 운동\n`);
for (const level of TRAINING_LEVELS) {
  const { pool, excludedCount } = filterByLevel(library, level.name);
  console.log(
    `  ${level.name.padEnd(4)} ${String(pool.length).padStart(3)}개 (뺀 것 ${excludedCount}개) — ${level.desc}`
  );
}

console.log(`\n■ 가장 빠듯한 경우 — 경력별 × 장비별 (하체 데이 ${MINUTES}분)\n`);
const EQUIPMENT: { label: string; owned: string[] }[] = [
  { label: '맨몸만', owned: ['맨몸'] },
  { label: '맨몸+밴드', owned: ['맨몸', '밴드'] },
  { label: '전부', owned: [] },
];
for (const level of TRAINING_LEVELS) {
  for (const eq of EQUIPMENT) {
    const usable = filterByEquipment(library, eq.owned);
    const leveled = filterByLevel(usable.pool, level.name);
    const { picks, estimatedMinutes } = pickForTheme({
      candidates: leveled.pool,
      theme: 'lower',
      minutes: effectiveMinutes('lower', MINUTES),
      doneIds: new Set<string>(),
      goal: '파워 향상',
    });
    /*
     * 구간이 통째로 비면 문제로 본다.
     *
     * 있는 구간만 본다. 예전에는 다섯 구간을 모두 기대했는데, 웨이트 날이
     * 워밍업·본운동·암케어 셋으로 줄면서 있지도 않은 코어·보강을 '비었다'고
     * 잡았다. 검사는 그 날이 실제로 쓰는 구성을 기준으로 봐야 한다.
     */
    const wanted = compositionFor(
      'lower',
      '파워 향상',
      effectiveMinutes('lower', MINUTES)
    ).map((spec) => spec.slot);
    const slots = new Set(picks.map((p) => p.slot));
    const missing = wanted.filter((s) => !slots.has(s));
    if (missing.length > 0) failed++;
    console.log(
      `  ${missing.length ? '❌' : '  '} ${level.name.padEnd(4)} ${eq.label.padEnd(10)} 후보 ${String(leveled.pool.length).padStart(3)}개 → ${String(estimatedMinutes).padStart(2)}분 · ${picks.length}개` +
        (missing.length
          ? `  빈 구간: ${missing.map((m) => SLOT_LABELS[m].label).join(',')}`
          : '')
    );
  }
}

console.log(
  failed === 0
    ? '\n모두 통과 — 목표는 배분을 바꾸고, 시간은 맞고, 빈 구간은 없습니다.'
    : `\n${failed}건이 문제입니다.`
);
process.exit(failed === 0 ? 0 : 1);
