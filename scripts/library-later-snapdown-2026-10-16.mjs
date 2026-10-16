/**
 * '불안정 지면 스냅다운'을 '나중에 촬영' 분류로 옮기고 원래 분류를 lib/shoot/later.json 에 남긴다(2026-10-16 사용자). 촬영 계획
 * (plan-data.json)에서는 같은 커밋이 그 줄만 뺀다(다른 번호는 그대로). 백업 db-2026-10-16-13-46. 되돌리기는
 * scripts/library-later-2026-10-14.mjs --restore '불안정 지면 스냅다운'.
 *
 *   node --env-file=.env scripts/library-later-snapdown-2026-10-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-later-snapdown-2026-10-16.mjs --apply   # 옮기기 + later.json 쓰기
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LATER = '나중에 촬영';
const FILE = new URL('../lib/shoot/later.json', import.meta.url);
const ID = '6c120966-4c02-44cf-87d8-5af3c8799192';
const TITLE = '불안정 지면 스냅다운';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const row = await prisma.exerciseVideo.findUnique({
  where: { id: ID },
  select: { id: true, title: true, category: true },
});
if (!row || row.title !== TITLE) {
  console.log('멈춤 — 운동을 못 찾음:', row);
  process.exit(1);
}
console.log(`${row.title} · 지금 분류 ${row.category}`);
if (row.category === LATER) {
  console.log('이미 나중에 촬영');
} else if (process.argv.includes('--apply')) {
  await prisma.exerciseVideo.update({ where: { id: ID }, data: { category: LATER } });
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  saved[ID] = { title: row.title, category: row.category };
  writeFileSync(FILE, JSON.stringify(saved, null, 1) + '\n');
  console.log('옮김 · lib/shoot/later.json 씀');
} else console.log('--apply 로 옮긴다.');
await prisma.$disconnect();
