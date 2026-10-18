/**
 * 2026-10-16 사용자가 고른 운동을 '나중에 촬영' 분류로 옮기고 원래 분류를 lib/shoot/later.json 에 남긴다. 촬영 계획
 * (plan-data.json)에서는 같은 커밋이 그 줄만 뺀다(다른 번호는 그대로). 이미 옮긴 것은 건너뛴다.
 * 불안정 지면 스냅다운(백업 db-2026-10-16-13-46) · 백 페달(백업 db-2026-10-16-14-00). 되돌리기는
 * scripts/library-later-2026-10-14.mjs --restore '이름'.
 *
 *   node --env-file=.env scripts/library-later-snapdown-2026-10-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-later-snapdown-2026-10-16.mjs --apply   # 옮기기 + later.json 쓰기
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LATER = '나중에 촬영';
const FILE = new URL('../lib/shoot/later.json', import.meta.url);
const TARGETS = [
  { id: '6c120966-4c02-44cf-87d8-5af3c8799192', title: '불안정 지면 스냅다운' },
  { id: 'd7acede9-5efa-464b-b1f2-c6d3d89cf455', title: '백 페달' },
];
const apply = process.argv.includes('--apply');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const saved = JSON.parse(readFileSync(FILE, 'utf8'));
for (const t of TARGETS) {
  const row = await prisma.exerciseVideo.findUnique({
    where: { id: t.id },
    select: { id: true, title: true, category: true },
  });
  if (!row || row.title !== t.title) {
    console.log('멈춤 — 운동을 못 찾음:', t.title, row);
    process.exit(1);
  }
  console.log(`${row.title} · 지금 분류 ${row.category}`);
  if (row.category === LATER || !apply) continue;
  await prisma.exerciseVideo.update({ where: { id: t.id }, data: { category: LATER } });
  saved[t.id] = { title: row.title, category: row.category };
  console.log('  → 옮김');
}
if (apply) {
  writeFileSync(FILE, JSON.stringify(saved, null, 1) + '\n');
  console.log('lib/shoot/later.json 씀');
} else console.log('--apply 로 옮긴다.');
await prisma.$disconnect();
