/**
 * 암케어 운동의 '키우는 근육'을 목록대로 고친다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/retag-armcare-muscles.mts
 *     (무엇이 바뀌는지 보기만 — 끝에 --yes 를 붙이면 실제로 저장)
 *
 * 값은 scripts/armcare-retag-2026-09-26.json 에 있다 — 운동 이름, 옛 근육(from), 새
 * 근육(to). 2026-09-26 사용자분 요청으로 부상 예방 기준을 다시 검토해 근육 여섯을
 * 더했고(lib/armcare/anatomy.ts), 그 근육을 쓰는 운동에 이름을 보탰다. 더하기만 하고,
 * 주 근육(맨 앞)은 데드행만 바뀐다 — 매달리기는 손목이 아니라 손가락으로 쥔다.
 *
 * 지금 DB 값이 from 과 같을 때만 바꾼다. 그 사이 관리자 화면에서 손으로 고친 운동은
 * 덮어쓰지 않고 건너뛴다. 두 번 돌려도 이미 바뀐 것은 건너뛴다.
 *
 * DB 를 바꾸는 작업이니 저장하기 전에 npm run backup 부터 한다. 저장한 뒤 화면에
 * 보이려면 운동 목록 캐시 이름을 바꿔야 한다(lib/library-cache.ts).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { ARMCARE_CATEGORY, ARMCARE_MUSCLE_NAMES } from '../lib/armcare/anatomy.ts';

type Change = { title: string; from: string[]; to: string[] };

const apply = process.argv.includes('--yes');
const changes: Change[] = JSON.parse(
  readFileSync(new URL('./armcare-retag-2026-09-26.json', import.meta.url), 'utf8')
);

const unknown = changes.flatMap((c) =>
  c.to.filter((m) => !ARMCARE_MUSCLE_NAMES.includes(m)).map((m) => `${c.title}: ${m}`)
);
if (unknown.length) {
  console.log('목록에 없는 근육 이름이 있어 멈춥니다 —');
  for (const u of unknown) console.log(`  ${u}`);
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const rows = await prisma.exerciseVideo.findMany({
  where: { category: ARMCARE_CATEGORY, title: { in: changes.map((c) => c.title) } },
  select: { id: true, title: true, targetMuscles: true },
});

const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
const todo: { id: string; change: Change }[] = [];
const done: string[] = [];
const edited: string[] = [];
const missing: string[] = [];
for (const c of changes) {
  const found = rows.filter((r) => r.title === c.title);
  if (found.length !== 1) {
    missing.push(`${c.title} (${found.length}개)`);
    continue;
  }
  const row = found[0];
  if (same(row.targetMuscles, c.to)) done.push(c.title);
  else if (same(row.targetMuscles, c.from)) todo.push({ id: row.id, change: c });
  else edited.push(`${c.title}: 지금 ${row.targetMuscles.join('·')}`);
}

console.log(`[근육 고치기] 바꿀 것 ${todo.length}개 · 이미 바뀐 것 ${done.length}개`);
for (const t of todo) {
  console.log(`  ${t.change.title} │ ${t.change.from.join('·')} → ${t.change.to.join('·')}`);
}
if (edited.length) {
  console.log(`  ⚠ 손으로 고친 것 같아 건너뜀 ${edited.length}개:`);
  for (const e of edited) console.log(`     - ${e}`);
}
if (missing.length) {
  console.log(`  ⚠ 이름으로 하나를 못 찾아 건너뜀 ${missing.length}개:`);
  for (const m of missing) console.log(`     - ${m}`);
}

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
} else {
  for (const t of todo) {
    await prisma.exerciseVideo.update({
      where: { id: t.id },
      data: { targetMuscles: t.change.to },
    });
  }
  console.log(`\n${todo.length}개를 저장했습니다.`);
}

await prisma.$disconnect();
