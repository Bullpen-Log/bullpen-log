/**
 * 철봉이 있어야 하는 운동의 장비를 바로잡는다.
 *
 *   node --env-file=.env scripts/fix-bar-equipment.mjs        (미리보기)
 *   node --env-file=.env scripts/fix-bar-equipment.mjs --yes  (저장)
 *
 * 장비 목록에 철봉이 없던 시절에 등록된 것들이다. 봉에 매달려야 하는 운동인데
 * '맨몸'으로 붙어 있어서, 철봉이 없는 사람에게도 처방됐다.
 *
 * 덤으로 '행잉밴드 리버스 런지'도 고친다. 설명에 "바벨 양끝에 밴드로 원판을
 * 매답니다"라고 적혀 있는데 장비는 바벨만 붙어 있었다. 밴드와 원판이 없으면
 * 못 하는 운동이다.
 *
 * 제목으로 찾는다. 지금 라이브러리에 있는 네 개를 눈으로 확인하고 적은 것이라,
 * 나중에 비슷한 운동이 늘면 이 목록도 함께 늘려야 한다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--yes');

const FIXES = [
  { title: '데드행', equipment: ['철봉'], why: '봉에 매달려 버티는 운동' },
  { title: '풀업', equipment: ['철봉'], why: '봉에 매달려 몸을 끌어올림' },
  { title: '친업', equipment: ['철봉'], why: '봉에 매달려 몸을 끌어올림' },
  {
    title: '행잉밴드 리버스 런지',
    equipment: ['바벨', '밴드', '원판'],
    why: '바벨 양끝에 밴드로 원판을 매다는 운동',
  },
];

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const changes = [];
const missing = [];

for (const fix of FIXES) {
  const row = await prisma.exerciseVideo.findFirst({
    where: { title: fix.title },
    select: { id: true, title: true, equipment: true },
  });
  if (!row) {
    missing.push(fix.title);
    continue;
  }
  const same =
    row.equipment.length === fix.equipment.length &&
    fix.equipment.every((e) => row.equipment.includes(e));
  if (same) continue;
  changes.push({ ...fix, id: row.id, before: row.equipment });
}

if (missing.length) {
  console.log(`⚠ 라이브러리에 없는 것 ${missing.length}개: ${missing.join(', ')}`);
}
if (changes.length === 0) {
  console.log('고칠 것이 없습니다.');
  await prisma.$disconnect();
  process.exit(0);
}

console.log(`고칠 것 ${changes.length}개`);
for (const c of changes) {
  console.log(
    `  ${c.title.padEnd(22)} [${c.before.join('·')}] → [${c.equipment.join('·')}]   ${c.why}`
  );
}

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
  await prisma.$disconnect();
  process.exit(0);
}

for (const c of changes) {
  await prisma.exerciseVideo.update({
    where: { id: c.id },
    data: { equipment: c.equipment },
  });
}
console.log(`\n${changes.length}개 고쳤습니다.`);
await prisma.$disconnect();
