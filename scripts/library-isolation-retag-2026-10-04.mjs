/**
 * 한 근육만 쓰는 운동 셋을 계열 '고립'으로 — 2026-10-04 김민(사용자) 결정.
 *
 * 트레이닝 일정의 하는 차례(lib/report/exercise-order.ts)를 검토하다 찾았다. 셋은 큰 운동 계열(힌지 · 밀기)로 적혀 있어
 * (노르딕 둘은 scripts/fill-movement-pattern.mjs 의 '햄스트링|노르딕' → 힌지 규칙, 사이드 레터럴 레이즈는 따로 적힌 값),
 * 하체 · 상체 날에 스쿼트 · 런지보다 앞에 오는 날이 있었다(실제 일정 360일 중 27일 — 고블렛 스쿼트 → 리버스 노르딕 →
 * 덤벨 스텝업). '고립'이면 큰 운동을 다 한 뒤에 오고, 하루에 하나로 걸린다(lib/report/theme.ts 의 ONCE_PER_DAY_PATTERNS).
 *
 *   노르딕 햄스트링      무릎 굽힘 — 햄스트링만
 *   리버스 노르딕        무릎 폄 — 넙다리 앞쪽만
 *   사이드 레터럴 레이즈  어깨 벌림 — 삼각근만
 *
 * 쓰는 법: node --env-file=.env scripts/library-isolation-retag-2026-10-04.mjs          (바꿀 것만 보여 줌)
 *          node --env-file=.env scripts/library-isolation-retag-2026-10-04.mjs --apply
 * 여러 번 돌려도 같다(이미 '고립'이면 건너뛴다). 바꾼 뒤에는 lib/library-cache.ts 의 캐시 이름을 올린다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const TITLES = ['노르딕 햄스트링', '리버스 노르딕', '사이드 레터럴 레이즈'];

const rows = await prisma.exerciseVideo.findMany({
  where: { title: { in: TITLES }, hiddenAt: null },
  select: { id: true, title: true, category: true, movementPattern: true },
});

const missing = TITLES.filter((t) => !rows.some((r) => r.title === t));
if (missing.length > 0) {
  console.error(`못 찾음: ${missing.join(', ')} — 이름이 바뀌었는지 보고 다시 돌린다`);
  process.exit(1);
}
if (rows.length !== TITLES.length) {
  console.error(
    `같은 이름이 둘 이상: ${rows.map((r) => r.title).join(', ')} — 손으로 본다`
  );
  process.exit(1);
}

let changed = 0;
for (const r of rows) {
  if (r.movementPattern === '고립') {
    console.log(`  그대로  ${r.title} (이미 고립)`);
    continue;
  }
  console.log(
    `  ${APPLY ? '바꿈' : '바꿀 것'}  ${r.title} (${r.category}) — ${r.movementPattern ?? '없음'} → 고립`
  );
  if (APPLY) {
    await prisma.exerciseVideo.update({
      where: { id: r.id },
      data: { movementPattern: '고립' },
    });
  }
  changed++;
}

console.log(`\n${changed}개 ${APPLY ? '바꿨다' : '바꿀 것'}`);
if (!APPLY && changed > 0) console.log('(미리 보기 — 적용하려면 --apply)');
await prisma.$disconnect();
