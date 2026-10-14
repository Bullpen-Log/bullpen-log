/**
 * 나중에 촬영할 투구 드릴 37개를 '나중에 촬영' 분류로 옮긴다(2026-10-14 사용자: "운동영상 및 트레이닝에서 모두 나중에 촬영으로 보내고
 * 운동영상 촬영일정에서도 제거해줘"). 운동 63개(scripts/library-later-2026-10-14.mjs)와 같은 방식이다.
 *
 * 원래 분류는 lib/shoot/later-drills.json 에 이미 적혀 있다(촬영 계획의 bucket = 드릴 분류) — 이 스크립트는 그 파일대로 DB 만 바꾼다.
 * 촬영 계획(plan-data.json · refs.json)에서는 같은 커밋이 뺐다. 먼저 `npm run backup`.
 *
 *   node --env-file=.env scripts/drills-later-2026-10-14.mjs                 # 확인만
 *   node --env-file=.env scripts/drills-later-2026-10-14.mjs --apply         # 옮기기
 *   node --env-file=.env scripts/drills-later-2026-10-14.mjs --restore 이름…  # 찍은 드릴을 원래 분류로(이름 없으면 전부) · later-drills.json 에서 뺌
 *
 * 바꾼 뒤에는 lib/library-cache.ts 의 드릴 캐시 이름(library:guides:vN)이 바뀌어 있어야 화면에 든다 — --apply 는 v10 이 든 커밋과 함께.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LATER = '나중에 촬영';
const FILE = new URL('../lib/shoot/later-drills.json', import.meta.url);
const saved = JSON.parse(readFileSync(FILE, 'utf8'));

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const args = process.argv.slice(2);

if (args[0] === '--restore') {
  const want = args.slice(1);
  const pick = Object.entries(saved).filter(([, v]) => !want.length || want.includes(v.title));
  for (const [id, v] of pick) {
    await prisma.mechanicsGuide.update({ where: { id }, data: { category: v.category } });
    delete saved[id];
    console.log(`되돌림 ${v.title} → ${v.category}`);
  }
  writeFileSync(FILE, JSON.stringify(saved, null, 1) + '\n');
  console.log('드릴 캐시(lib/library-cache.ts 의 library:guides:vN)를 하나 올리고, 촬영 계획에 다시 넣을지 정한다.');
} else {
  const ids = Object.keys(saved);
  const rows = await prisma.mechanicsGuide.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, category: true, hiddenAt: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const problems = [];
  for (const [id, v] of Object.entries(saved)) {
    const r = byId.get(id);
    if (!r) problems.push(`없음 ${v.title} (${id})`);
    else if (r.title !== v.title) problems.push(`이름 다름 ${v.title} ↔ DB ${r.title}`);
    else if (r.category !== v.category && r.category !== LATER)
      problems.push(`분류 다름 ${v.title}: 기록 ${v.category} ↔ DB ${r.category}`);
  }
  const todo = rows.filter((r) => r.category !== LATER);
  console.log(`드릴 ${ids.length}개 · DB 에서 찾음 ${rows.length} · 옮길 것 ${todo.length} · 이미 옮김 ${rows.length - todo.length}`);
  for (const p of problems) console.log(`  ! ${p}`);
  if (args[0] !== '--apply') {
    console.log('확인만 했다. 옮기려면 --apply');
  } else if (problems.length) {
    console.log('위 문제가 있어 옮기지 않았다.');
    process.exitCode = 1;
  } else {
    const res = await prisma.mechanicsGuide.updateMany({
      where: { id: { in: todo.map((r) => r.id) } },
      data: { category: LATER },
    });
    console.log(`옮김 ${res.count}개 → '${LATER}'`);
  }
}
await prisma.$disconnect();
