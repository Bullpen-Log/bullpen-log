/**
 * 워터백을 쓰는 운동 · 투구 드릴을 모두 '나중에 촬영' 분류로 옮긴다(2026-10-15 사용자: "영상촬영이나 운동목록에서 워터백 나중에 촬영으로
 * 전부 이동해줘. 지금 워터백이 없어. 워터볼은 넣어도 괜찮아"). 원래 분류는 운동은 lib/shoot/later.json, 드릴은
 * lib/shoot/later-drills.json 에 더한다(10-14 의 운동 63 · 드릴 37 과 같은 방식 — 찍으면 --restore 로 되돌린다).
 *
 * 고르는 법: 도구(equipment)에 '워터백'이 있거나 이름에 '워터백'이 든 것. 워터볼만 쓰는 것은 그대로 둔다.
 * 촬영 계획(plan-data.json)에는 10-14 정리 뒤로 워터백 운동이 남아 있지 않다 — 그래도 계획에 든 것이 나오면 멈추고 알린다
 * (계획에서 빼는 일은 코드 커밋이라 여기서 하지 않는다).
 *
 * DB 를 바꾸므로 먼저 `npm run backup`. --apply 는 옮긴 뒤 캐시 이름(lib/library-cache.ts 의 library:exercises · library:guides)도
 * 하나씩 올린다 — 미리 올려 두면 옮기기 전 내용이 새 이름에 담길 수 있다(10-14 드릴 v10 → v11 때 겪음).
 * 그 뒤 later.json · later-drills.json · library-cache.ts 를 한 커밋으로 올린다.
 *
 *   node --env-file=.env scripts/library-waterbag-later-2026-10-15.mjs            # 확인만(무엇을 옮길지 목록)
 *   node --env-file=.env scripts/library-waterbag-later-2026-10-15.mjs --apply    # 옮기기 + json 쓰기
 *   되돌리기: scripts/library-later-2026-10-14.mjs --restore 이름… · scripts/drills-later-2026-10-14.mjs --restore 이름…
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LATER = '나중에 촬영';
const BAG = '워터백';
const EX_FILE = new URL('../lib/shoot/later.json', import.meta.url);
const DRILL_FILE = new URL('../lib/shoot/later-drills.json', import.meta.url);
const PLAN = JSON.parse(readFileSync(new URL('../lib/shoot/plan-data.json', import.meta.url), 'utf8'));
const planned = new Set(PLAN.weeks.flatMap((w) => w.stations.flatMap((s) => s.items.map((i) => i.exerciseId))));

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

const where = { OR: [{ equipment: { has: BAG } }, { title: { contains: BAG } }], NOT: { category: LATER } };
const select = { id: true, title: true, category: true, equipment: true, hiddenAt: true };
const [exercises, drills] = await Promise.all([
  prisma.exerciseVideo.findMany({ where, select, orderBy: { title: 'asc' } }),
  prisma.mechanicsGuide.findMany({ where, select, orderBy: { title: 'asc' } }),
]);

const show = (kind, rows) => {
  console.log(`${kind} ${rows.length}개`);
  for (const r of rows)
    console.log(`  ${r.title} · ${r.category} · [${r.equipment.join(', ')}]${r.hiddenAt ? ' · 숨김' : ''}`);
};
show('운동', exercises);
show('드릴', drills);

const inPlan = [...exercises, ...drills].filter((r) => planned.has(r.id));
if (inPlan.length) {
  console.log('멈춤 — 촬영 계획에 든 것:', inPlan.map((r) => r.title), '(plan-data.json 에서 먼저 빼야 한다)');
  process.exit(1);
}

if (!apply) {
  console.log('확인만 했다. 옮기려면 --apply (먼저 npm run backup)');
} else {
  await prisma.$transaction([
    prisma.exerciseVideo.updateMany({ where: { id: { in: exercises.map((r) => r.id) } }, data: { category: LATER } }),
    prisma.mechanicsGuide.updateMany({ where: { id: { in: drills.map((r) => r.id) } }, data: { category: LATER } }),
  ]);
  const remember = (file, rows) => {
    const old = JSON.parse(readFileSync(file, 'utf8'));
    for (const r of rows) old[r.id] = { title: r.title, category: r.category };
    writeFileSync(file, JSON.stringify(old, null, 1) + '\n');
  };
  remember(EX_FILE, exercises);
  remember(DRILL_FILE, drills);
  /* 캐시 이름 올리기 — 옮긴 쪽만 */
  const CACHE_FILE = new URL('../lib/library-cache.ts', import.meta.url);
  let cache = readFileSync(CACHE_FILE, 'utf8');
  const bump = (name) => {
    cache = cache.replace(new RegExp(`'library:${name}:v(\\d+)'`), (_, v) => `'library:${name}:v${Number(v) + 1}'`);
  };
  if (exercises.length) bump('exercises');
  if (drills.length) bump('guides');
  writeFileSync(CACHE_FILE, cache);
  console.log(`옮김 — 운동 ${exercises.length} · 드릴 ${drills.length} → '${LATER}'. later.json · later-drills.json · lib/library-cache.ts 를 커밋해 주세요.`);
}
await prisma.$disconnect();
