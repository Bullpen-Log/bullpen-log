/**
 * 장비를 적게 가진 사람에게도 훈련이 제대로 짜이는지 확인한다.
 *
 *   npm run equipment:check
 *
 * 맨몸만 가진 사람은 암케어 운동이 6개뿐이다. 그런 경우에도 구간이 통째로
 * 비지 않는지, 시간이 얼마나 짧아지는지, 무엇 하나만 사면 가장 크게 늘어나는지를
 * 실제 등록된 운동으로 확인한다.
 *
 * 앱과 똑같은 함수를 부른다. 여기서 따로 계산하면 확인하는 의미가 없다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { filterByEquipment } from '../lib/report/equipment.ts';
import {
  effectiveMinutes,
  pickForTheme,
  SLOT_LABELS,
  type SlotKey,
  type ThemeKey,
} from '../lib/report/theme.ts';

/** 흔할 만한 장비 조합 */
const PROFILES: { label: string; owned: string[] }[] = [
  { label: '안 고름(전부 허용)', owned: [] },
  { label: '맨몸만', owned: ['맨몸'] },
  { label: '맨몸+밴드', owned: ['맨몸', '밴드'] },
  {
    label: '집 (밴드·덤벨·폼롤러)',
    owned: ['맨몸', '밴드', '덤벨', '폼롤러', '마사지볼'],
  },
  {
    label: '헬스장',
    owned: [
      '맨몸',
      '밴드',
      '덤벨',
      '바벨',
      '원판',
      '케틀벨',
      '벤치',
      '박스',
      '케이블',
      '머신',
      '짐볼',
      '메디신볼',
      '폼롤러',
      '마사지볼',
      'TRX',
    ],
  },
];

const THEMES: ThemeKey[] = ['lower', 'upper', 'assist', 'recovery'];
const MINUTES = 60;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
await prisma.$disconnect();

let failed = 0;

for (const { label, owned } of PROFILES) {
  const { pool, excludedCount, bestAddition } = filterByEquipment(library, owned);
  console.log(
    `\n■ ${label} — 할 수 있는 운동 ${pool.length}개 (뺀 것 ${excludedCount}개)`
  );
  if (bestAddition) {
    console.log(`   → ${bestAddition.name} 하나면 ${bestAddition.unlocks}개 더`);
  }

  for (const theme of THEMES) {
    const minutes = effectiveMinutes(theme, MINUTES);
    const { picks, estimatedMinutes, notes } = pickForTheme({
      candidates: pool,
      theme,
      minutes,
      doneIds: new Set<string>(),
    });

    const bySlot = new Map<SlotKey, number>();
    for (const p of picks) bySlot.set(p.slot, (bySlot.get(p.slot) ?? 0) + 1);
    const shape = [...bySlot]
      .map(([slot, n]) => `${SLOT_LABELS[slot].label} ${n}`)
      .join(' · ');

    /*
     * 통째로 비는 구간이 있으면 문제로 본다. 암케어가 하나도 없는 훈련은
     * 투수에게 특히 곤란하다 — 어깨 관리를 빼먹은 날이 된다.
     */
    const empty = picks.length === 0;
    if (empty) failed++;
    console.log(
      `  ${empty ? '❌' : '  '} ${theme.padEnd(9)} ${String(estimatedMinutes).padStart(2)}분 · ${picks.length}개  [${shape || '없음'}]`
    );
    for (const n of notes) console.log(`       · ${n}`);
  }
}

console.log(
  failed === 0
    ? '\n장비가 적어도 훈련이 통째로 비는 경우는 없습니다.'
    : `\n${failed}개 조합에서 훈련이 통째로 비었습니다.`
);
process.exit(failed === 0 ? 0 : 1);
