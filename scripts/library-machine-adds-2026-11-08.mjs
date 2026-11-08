/**
 * 하체 스트렝스에 헬스장 머신 운동 일곱을 더한다(2026-11-08 김민: 라이브러리 검토 뒤 "하체는 시티드 카프 레이즈 빼고 나머지는 넣는데
 * 장비는 그냥 머신으로 통일"). 장비 '머신'은 lib/exercise-meta.ts EXERCISE_EQUIPMENT 에 같은 날 더했다.
 *
 * 영상은 유튜브 참고 영상(나중에 직접 찍어 바꾼다). 같은 이름이 이미 있으면 건너뛴다. 랫 풀다운은 2026-10-26 에 이미 넣었다(케이블).
 * --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 하나 올린다(이 커밋에서 v46).
 *
 *   node --env-file=.env scripts/library-machine-adds-2026-11-08.mjs           # 확인만
 *   node --env-file=.env scripts/library-machine-adds-2026-11-08.mjs --apply   # 넣기(먼저 npm run backup)
 *   node --env-file=.env scripts/library-machine-adds-2026-11-08.mjs --revert  # 이 스크립트로 넣은 일곱을 지우기(기록이 없을 때만)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

const BASE = { category: '하체 스트렝스', equipment: ['머신'], perSide: false, sets: 3, reps: 10 };

const NEW = [
  {
    ...BASE,
    title: '레그 프레스',
    referenceVideoId: 'tRV9hBDT3us',
    movementPattern: '스쿼트',
    bodyParts: ['고관절', '햄스트링·둔근'],
    intensity: '높음',
    difficulty: '초급',
    restSeconds: 150,
    description: `■ 어떤 운동인가
등을 의자에 기댄 채 발판을 두 발로 밀어내는 머신 하체 운동입니다. 허리에 무게를 싣지 않고 다리에 무거운 무게를 실을 수 있습니다.

■ 이렇게 하세요
· 의자에 등과 엉덩이를 붙이고, 발판에 두 발을 어깨너비로 놓으세요.
· 안전 손잡이를 풀고, 무릎이 발끝 방향을 보게 하며 천천히 내리세요.
· 엉덩이가 의자에서 들리기 직전까지만 내립니다.
· 발 전체로 발판을 밀어 올리되, 맨 위에서 무릎을 끝까지 잠그지 마세요.
· 무릎이 안쪽으로 모이면 무게를 줄이세요.

■ 투수에게 왜 필요한가
투구할 때 뒷다리는 마운드를 밀고, 앞다리는 착지한 몸을 버팁니다. 허리가 불편한 날이나 시즌 중에도 다리 근력을 무겁게 유지할 수 있는 운동입니다.`,
  },
  {
    ...BASE,
    title: '핵 스쿼트',
    referenceVideoId: 'hglQExHCM9Q',
    movementPattern: '스쿼트',
    bodyParts: ['고관절', '햄스트링·둔근'],
    intensity: '높음',
    difficulty: '중급',
    sets: 3,
    reps: 8,
    restSeconds: 150,
    description: `■ 어떤 운동인가
어깨를 패드 밑에 넣고 등을 판에 기댄 채, 정해진 길을 따라 내려갔다 올라오는 머신 스쿼트입니다. 몸통이 고정돼 허리 부담이 적고, 허벅지 앞쪽을 많이 씁니다.

■ 이렇게 하세요
· 등과 엉덩이를 판에 붙이고, 어깨를 패드 밑에 넣으세요.
· 발판에 두 발을 어깨너비로 놓고 발끝을 조금 바깥으로 둡니다.
· 안전 걸쇠를 풀고, 무릎이 발끝 방향을 보게 하며 천천히 앉으세요.
· 허벅지가 바닥과 나란해질 만큼 내려간 뒤 발 전체로 밀어 올라오세요.
· 뒤꿈치가 들리면 발을 발판 조금 위쪽에 놓으세요.

■ 투수에게 왜 필요한가
착지한 앞다리는 무릎을 굽힌 채 몸을 받아 버텨야 합니다. 바벨 스쿼트보다 척추에 짐을 덜 싣고 허벅지 앞쪽 힘을 기를 수 있습니다.`,
  },
  {
    ...BASE,
    title: '레그 컬',
    referenceVideoId: 'SbSNUXPRkc8',
    movementPattern: '고립',
    bodyParts: ['햄스트링·둔근'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 12,
    restSeconds: 90,
    description: `■ 어떤 운동인가
엎드리거나 앉은 채 발목 뒤의 패드를 엉덩이 쪽으로 끌어오는 머신 운동입니다. 허벅지 뒤쪽(햄스트링)만 따로 키웁니다. 헬스장에 있는 기계(엎드린 것 · 앉은 것)를 쓰면 됩니다.

■ 이렇게 하세요
· 무릎이 기계의 돌아가는 축과 같은 높이에 오게 자리를 맞추세요.
· 패드는 발목 바로 위, 종아리 끝에 둡니다.
· 엉덩이를 패드에 붙인 채 뒤꿈치를 엉덩이 쪽으로 끌어오세요.
· 끝에서 잠깐 멈추고, 2~3초에 걸쳐 천천히 펴세요.
· 엉덩이가 들리거나 허리가 젖혀지면 무게를 줄이세요.

■ 투수에게 왜 필요한가
공을 놓는 순간 앞다리 햄스트링은 빠르게 앞으로 나가는 몸을 멈춰 세웁니다. 투수에게 흔한 햄스트링 부상을 막는 데 도움이 됩니다.`,
  },
  {
    ...BASE,
    title: '레그 익스텐션',
    referenceVideoId: 'ECt7bZ9zc4c',
    movementPattern: '고립',
    bodyParts: ['고관절'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 12,
    restSeconds: 90,
    description: `■ 어떤 운동인가
의자에 앉아 정강이 앞의 패드를 무릎을 펴며 들어 올리는 머신 운동입니다. 허벅지 앞쪽(대퇴사두)만 따로 키웁니다.

■ 이렇게 하세요
· 무릎 뒤가 의자 끝에 닿게 앉고, 무릎이 기계의 돌아가는 축과 같은 높이에 오게 맞추세요.
· 패드는 발목 바로 위 정강이에 둡니다.
· 손잡이를 잡고 엉덩이를 의자에 붙인 채 무릎을 펴 올리세요.
· 맨 위에서 잠깐 멈추고, 2~3초에 걸쳐 천천히 내리세요.
· 무릎이 아프면 펴는 범위를 줄이거나 무게를 줄이세요.

■ 투수에게 왜 필요한가
착지한 앞다리가 무릎이 무너지지 않게 버티려면 허벅지 앞쪽 힘이 필요합니다. 큰 하체 운동 뒤에 보조로 하기 좋습니다.`,
  },
  {
    ...BASE,
    title: '힙 어덕션',
    referenceVideoId: 'ScqpbvOZWe8',
    movementPattern: '고립',
    bodyParts: ['고관절'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 12,
    restSeconds: 75,
    description: `■ 어떤 운동인가
의자에 앉아 벌린 두 다리를 안쪽으로 모으는 머신 운동입니다. 허벅지 안쪽(내전근)을 키웁니다.

■ 이렇게 하세요
· 의자에 등을 기대고 앉아, 무릎 안쪽을 패드에 대세요.
· 처음 벌리는 폭은 당기는 느낌이 들되 아프지 않을 만큼만 정합니다.
· 두 다리를 안쪽으로 모아 패드끼리 닿게 하세요.
· 끝에서 잠깐 멈추고, 천천히 벌리며 돌아가세요.
· 반동으로 튕기지 말고 같은 빠르기로 하세요.

■ 투수에게 왜 필요한가
투수는 넓게 내딛으며 앞다리로 착지해 사타구니 쪽(내전근)이 크게 늘어납니다. 투수에게 흔한 사타구니 부상을 막는 데 도움이 됩니다.`,
  },
  {
    ...BASE,
    title: '힙 어브덕션',
    referenceVideoId: '5O_Y9l__iao',
    movementPattern: '고립',
    bodyParts: ['고관절', '햄스트링·둔근'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 12,
    restSeconds: 75,
    description: `■ 어떤 운동인가
의자에 앉아 모은 두 다리를 바깥으로 벌리는 머신 운동입니다. 엉덩이 옆쪽(중둔근)을 키웁니다.

■ 이렇게 하세요
· 의자에 등을 기대고 앉아, 무릎 바깥쪽을 패드에 대세요.
· 두 다리를 바깥으로 벌리세요.
· 끝에서 잠깐 멈추고, 천천히 모으며 돌아가세요.
· 상체를 조금 앞으로 숙이면 엉덩이 쪽에 더 힘이 들어갑니다.
· 반동으로 튕기지 마세요.

■ 투수에게 왜 필요한가
한 다리로 서는 다리 들기와 앞다리 착지 때 골반이 옆으로 무너지지 않게 버티는 근육입니다. 투구 자세가 흔들리지 않게 도와줍니다.`,
  },
  {
    ...BASE,
    title: '45° 백 익스텐션',
    referenceVideoId: '7Z-FQ_yA7uM',
    movementPattern: '힌지',
    bodyParts: ['햄스트링·둔근', '코어'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 12,
    restSeconds: 90,
    description: `■ 어떤 운동인가
45도로 기운 기구에 허벅지를 대고 발을 건 채, 엉덩이를 접어 상체를 내렸다가 다시 펴 올리는 운동입니다. 엉덩이 · 허벅지 뒤쪽 · 허리 근육을 함께 씁니다.

■ 이렇게 하세요
· 패드가 허벅지 위쪽, 골반 바로 밑에 오게 높이를 맞추세요.
· 발목을 걸고 몸을 곧게 펴, 팔은 가슴 앞에 모으세요.
· 허리를 곧게 둔 채 엉덩이를 접어 상체를 내리세요.
· 엉덩이에 힘을 주며 다리와 일직선이 될 때까지 올라오세요.
· 맨 위에서 허리를 뒤로 젖히지 마세요. 쉬워지면 원판을 가슴에 안으세요.

■ 투수에게 왜 필요한가
투구할 때 엉덩이와 허리 뒤쪽 근육이 몸통을 받쳐 줍니다. 데드리프트 · RDL 을 보조하고, 허리를 다치지 않게 버티는 힘을 기릅니다.`,
  },
];

const titles = NEW.map((r) => r.title);
if (revert) {
  const rows = await prisma.exerciseVideo.findMany({
    where: { title: { in: titles }, source: 'REFERENCE' },
    select: { id: true, title: true, _count: { select: { userLogs: true, favorites: true, workoutSets: true, warmupItems: true, notes: true } } },
  });
  const used = rows.filter((r) => Object.values(r._count).some((n) => n > 0));
  if (used.length) throw new Error(`기록이 있어 못 지움: ${used.map((r) => r.title).join(', ')}`);
  const r = await prisma.exerciseVideo.deleteMany({ where: { id: { in: rows.map((x) => x.id) } } });
  console.log(`지움 ${r.count}개`);
  await prisma.$disconnect();
  process.exit(0);
}

const fresh = [];
for (const n of NEW) {
  const a = await probeAspect(n.referenceVideoId);
  if (!a?.embeddable) throw new Error(`${n.title}: 참고 영상을 못 읽거나 앱에서 못 틂`);
  fresh.push({ ...n, source: 'REFERENCE', aspectRatio: Math.round(a.ratio * 1000) / 1000 });
}
const have = new Set(
  (await prisma.exerciseVideo.findMany({ where: { title: { in: titles } }, select: { title: true } })).map((r) => r.title)
);
for (const r of fresh)
  console.log(`${have.has(r.title) ? '있음 · 건너뜀' : '새로'} | ${r.title} | ${r.movementPattern} · ${r.intensity} · ${r.difficulty} · ${r.equipment.join('/')} · 비율 ${r.aspectRatio}`);
const todo = fresh.filter((r) => !have.has(r.title));
if (!apply) console.log(`확인만 했다(${todo.length}개 넣을 것). 넣으려면 --apply`);
else {
  const now = new Date();
  const r = await prisma.exerciseVideo.createMany({ data: todo.map((x) => ({ ...x, detailsFilledAt: now })) });
  console.log(`넣음 ${r.count}개 — lib/library-cache.ts 의 library:exercises 이름을 올릴 것`);
}
await prisma.$disconnect();
