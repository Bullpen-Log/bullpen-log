/**
 * 파워 카테고리 운동에 '최대한 빠르게'라는 속도 지시를 덧붙인다.
 *
 *   node --env-file=.env scripts/add-speed-cues.mjs        (미리보기)
 *   node --env-file=.env scripts/add-speed-cues.mjs --yes  (실제 저장)
 *
 * 파워 훈련은 같은 동작이라도 얼마나 빠르게 힘을 내느냐가 목적이다. 그런데
 * 근력 운동과 이름이 같으면 천천히 무겁게 하는 것으로 읽히기 쉬워, 속도를
 * 분명히 적어 둔다.
 *
 * 이미 쓰여 있는 설명은 고치지 않고, '이렇게 하세요' 목록에 줄만 더한다.
 * 같은 줄이 이미 있으면 건너뛴다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const apply = process.argv.includes('--yes');

/** 제목 → 덧붙일 줄 */
const CUES = {
  '핀 스플릿 스쿼트': [
    '· 무게보다 속도가 목적입니다. 내려올 때는 천천히, 올라올 때는 최대한 빠르게 밀어 올리세요.',
    '· 올라오는 속도가 눈에 띄게 느려지면 그 세트를 끝내세요.',
  ],
  '펜들레이 로우': [
    '· 바닥에서 당길 때 최대한 빠르게 끌어 올리세요. 파워 운동이라 무게보다 속도가 목적입니다.',
    '· 당기는 속도가 눈에 띄게 느려지면 그 세트를 끝내세요.',
  ],
  '밴드 저항 데드리프트': [
    '· 올라오는 속도가 눈에 띄게 느려지면 그 세트를 끝내세요.',
  ],
};

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const MARK = '■ 투수에게 왜 필요한가';
const updates = [];

for (const [title, lines] of Object.entries(CUES)) {
  const row = await prisma.exerciseVideo.findFirst({
    where: { title },
    select: { id: true, title: true, description: true },
  });
  if (!row) {
    console.log(`⚠ 못 찾음: ${title}`);
    continue;
  }

  const toAdd = lines.filter((l) => !row.description.includes(l.replace(/^· /, '')));
  if (toAdd.length === 0) {
    console.log(`이미 들어 있어 건너뜀: ${title}`);
    continue;
  }

  /*
   * '이렇게 하세요' 목록의 맨 끝에 넣는다. 뒤에 '투수에게 왜 필요한가'가
   * 있으면 그 앞에, 없으면 글 맨 끝에 붙인다.
   */
  const at = row.description.indexOf(MARK);
  const next =
    at === -1
      ? `${row.description.trimEnd()}\n${toAdd.join('\n')}`
      : `${row.description.slice(0, at).trimEnd()}\n${toAdd.join('\n')}\n\n${row.description.slice(at)}`;

  updates.push({ id: row.id, title: row.title, next, added: toAdd });
}

for (const u of updates) {
  console.log(`\n[${u.title}] 덧붙일 줄 ${u.added.length}개`);
  for (const l of u.added) console.log(`   ${l}`);
}

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
  await prisma.$disconnect();
  process.exit(0);
}

for (const u of updates) {
  await prisma.exerciseVideo.update({
    where: { id: u.id },
    data: { description: u.next },
  });
}
console.log(`\n${updates.length}개 저장 완료.`);
await prisma.$disconnect();
