/**
 * 투구 드릴 113개를 6요소 · 3단계로 나누고, 혼자 못 하는 둘 · 상품 이름이 남은 둘을 숨긴다(2026-10-04).
 *
 * 사용자분이 정한 요소: 드리프트 · 드롭 · 상하체 분리 · 브레이크 · 몸통 회전 · 스로잉(lib/exercise-meta.ts FOCUS_POINTS).
 * focusPoints 는 맨 앞이 주 요소, 뒤가 보조(0~2개). 단계는 기초 · 연결 · 통합(DRILL_STAGES). 분류의 근거와 한눈에 보는 표는
 * docs/mechanics/drill-classification.md — 사용자분이 "자세한 수정은 나중에, 초안대로" 하기로 했다.
 *
 * 값은 scripts/mechanics-classify-2026-10-04.json(드릴 id · 제목 · 요소 · 단계 · 숨길 까닭). 여러 번 돌려도 같다 —
 * 이미 같은 값이면 건드리지 않고, 숨긴 시각은 처음 숨긴 때를 지킨다.
 *
 * 쓰는 법: node --env-file=.env scripts/mechanics-classify-2026-10-04.mjs          (바꿀 것만 보여 줌)
 *          node --env-file=.env scripts/mechanics-classify-2026-10-04.mjs --apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const apply = process.argv.includes('--apply');
const rows = JSON.parse(
  readFileSync(new URL('./mechanics-classify-2026-10-04.json', import.meta.url), 'utf8')
);

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
let changed = 0;
let missing = 0;
for (const row of rows) {
  const g = await prisma.mechanicsGuide.findUnique({ where: { id: row.id } });
  if (!g) {
    console.log(`  없음  ${row.title}`);
    missing += 1;
    continue;
  }
  const data = {};
  if (!same(g.focusPoints, row.focusPoints)) data.focusPoints = row.focusPoints;
  if (g.stage !== row.stage) data.stage = row.stage;
  if (row.hide && !g.hiddenAt) data.hiddenAt = new Date();
  if (Object.keys(data).length === 0) continue;
  changed += 1;
  const what = [
    data.focusPoints && `요소 ${g.focusPoints.join(',') || '-'} → ${row.focusPoints.join(',')}`,
    data.stage && `단계 → ${row.stage}`,
    data.hiddenAt && `숨김(${row.hide})`,
  ].filter(Boolean);
  console.log(`  ${g.title} — ${what.join(' · ')}`);
  if (apply) await prisma.mechanicsGuide.update({ where: { id: g.id }, data });
}

console.log(
  `\n${apply ? '바꿈' : '바꿀 것'} ${changed}개 · 없는 드릴 ${missing}개${apply ? '' : ' — --apply 로 적용'}`
);
await prisma.$disconnect();
