/**
 * "45분을 골랐는데 정말 45분치가 나오는가" 를 확인한다.
 *
 *   npm run theme:check
 *
 * 실제 등록된 운동으로, 테마 4가지 × 시간 4가지를 모두 만들어 보고
 * 고른 시간과 실제 소요 시간이 얼마나 차이 나는지 본다.
 *
 * 앱과 똑같은 함수를 부른다(pickForTheme). 여기서 따로 계산하면 확인하는
 * 의미가 없다 — 앱은 앱대로, 확인은 확인대로 맞다고 나올 수 있어서다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  WORKOUT_MINUTES_CHOICES,
  effectiveMinutes,
  estimateMinutes,
  pickForTheme,
  SLOT_LABELS,
  type ThemeKey,
} from '../lib/report/theme.ts';

const THEMES: ThemeKey[] = ['lower', 'upper', 'assist', 'recovery'];

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

const missing = library.filter((ex) => ex.sets == null);
if (missing.length) {
  console.log(`⚠ 세트·횟수가 비어 있는 운동 ${missing.length}개 — 그것들은 종류로 어림합니다.\n`);
}

let failed = 0;

for (const theme of THEMES) {
  console.log(`\n■ ${theme}`);
  for (const requested of WORKOUT_MINUTES_CHOICES) {
    const minutes = effectiveMinutes(theme, requested);
    const { picks, estimatedMinutes, notes } = pickForTheme({
      candidates: library,
      theme,
      minutes,
      doneIds: new Set<string>(),
    });

    const gap = Math.abs(estimatedMinutes - minutes) / minutes;
    const ok = gap <= TOLERANCE;
    if (!ok) failed++;

    const bySlot = new Map<string, number>();
    for (const p of picks) bySlot.set(p.slot, (bySlot.get(p.slot) ?? 0) + 1);
    const shape = [...bySlot]
      .map(([slot, n]) => `${SLOT_LABELS[slot as keyof typeof SLOT_LABELS].label} ${n}`)
      .join(' · ');

    const cap = requested !== minutes ? ` (회복이라 ${minutes}분으로 줄임)` : '';
    console.log(
      `  ${ok ? '✅' : '❌'} ${String(requested).padStart(2)}분 요청${cap} → 실제 ${estimatedMinutes}분` +
        `, 운동 ${picks.length}개  [${shape}]`
    );
    for (const n of notes) console.log(`     · ${n}`);
  }
}

// 가장 긴 운동과 가장 짧은 운동이 실제로 얼마나 차이 나는지 — 고정값을 쓰면 안 되는 이유다.
const sorted = [...library].sort((a, b) => estimateMinutes(a) - estimateMinutes(b));
const show = (ex: (typeof library)[number]) =>
  `${ex.title} (${ex.category}) ${estimateMinutes(ex).toFixed(1)}분`;
console.log(`\n가장 짧은 운동: ${show(sorted[0])}`);
console.log(`가장 긴 운동:   ${show(sorted[sorted.length - 1])}`);

console.log(
  failed === 0
    ? `\n모두 통과 — 고른 시간의 ±${TOLERANCE * 100}% 안에 들어옵니다.`
    : `\n${failed}개가 ±${TOLERANCE * 100}% 를 벗어났습니다.`
);
process.exit(failed === 0 ? 0 : 1);
