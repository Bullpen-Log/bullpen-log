/**
 * 2026-11-16 암케어 '팔꿈치 후방'이 밴드 트라이셉스 푸시다운 하나뿐이라 넷을 더한다(1 → 5, 팔꿈치 전방과 같은 수).
 *
 *   · '나중에 촬영'의 둘을 참고 영상 그대로 암케어로 — 밴드 오버헤드 익스텐션(원래 상체 스트렝스 고립 → 암케어,
 *     밴드 푸시다운과 같은 자리) · 밴드 킥백 + 프로네이션. lib/shoot/later.json 에서 뺀다.
 *   · 전방 세트의 짝 둘을 참고 영상(공개 유튜브)으로 새로 — 엘보 익스텐션 아이소메트릭 프레스(맨몸) ·
 *     에센트릭 밴드 트라이셉스 푸시다운(밴드). 영상은 제목 · 재생 가능만 확인했다(내용은 사람이 한 번 볼 것).
 *
 * 삼두가 주 근육이라 오늘의 암케어 자동 루틴에는 안 들어간다(routine.ts ARM_STRENGTH_MUSCLES) — 부위별 보강 · 내 루틴용.
 * 백업 db-2026-11-16-07-22. 같은 커밋이 캐시 이름을 올린다. 두 번 돌려도 같은 결과.
 *
 *   node --env-file=.env scripts/library-elbow-back-2026-11-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-elbow-back-2026-11-16.mjs --apply
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const LATER = '나중에 촬영';
const FILE = new URL('../lib/shoot/later.json', import.meta.url);
const BACK = [
  { id: 'fe1a4c31-541d-4355-84c4-b099000a48f0', title: '밴드 오버헤드 익스텐션' },
  { id: 'e9124066-f9a5-4154-831a-8cd229551cf7', title: '밴드 킥백 + 프로네이션' },
];
const NEW = [
  {
    title: '엘보 익스텐션 아이소메트릭 프레스',
    videoId: 'C4sHLwb6mtw',
    bodyParts: ['삼두', '팔꿈치'],
    targetMuscles: ['삼두근', '주근'],
    intensity: '매우 낮음',
    difficulty: '초급',
    equipment: ['맨몸'],
    sets: 3,
    reps: null,
    holdSeconds: 20,
    restSeconds: 45,
    perSide: true,
    description:
      '■ 어떤 운동인가\n반대 손으로 아래에서 받쳐 막은 채 팔꿈치를 펴려는(내리누르려는) 힘만 주고 실제로는 움직이지 않는 운동입니다. 팔꿈치를 펴는 근육(삼두근·주근)에 관절을 움직이지 않고 힘을 줄 수 있습니다.\n\n■ 이렇게 하세요\n· 앉거나 서서 팔꿈치를 90도로 굽히고, 반대 손을 아래팔 밑에 받쳐 막습니다(책상 윗면을 눌러도 됩니다).\n· 받친 손을 내리누른다는 느낌으로 팔꿈치를 펴는 힘을 주며, 아프지 않은 만큼만 힘을 줍니다.\n· 그 힘을 20초 버티고 천천히 풉니다. 숨은 참지 말고 계속 쉽니다.\n· 팔꿈치가 아프면 힘을 줄이고, 줄여도 아프면 멈춥니다.\n\n■ 투수에게 왜 필요한가\n관절을 움직이지 않고 팔꿈치 폄근에 힘을 겁니다. 팔꿈치 주변 근육을 고루 키우면 투구의 부담을 나눠 받고, 버티기 운동은 힘줄을 두껍게 만듭니다.',
  },
  {
    title: '에센트릭 밴드 트라이셉스 푸시다운',
    videoId: '2-o7pdzcU5w',
    bodyParts: ['삼두', '팔꿈치'],
    targetMuscles: ['삼두근', '주근'],
    intensity: '중간',
    difficulty: '중급',
    equipment: ['밴드'],
    sets: 2,
    reps: 10,
    holdSeconds: null,
    restSeconds: 45,
    perSide: false,
    description:
      '■ 어떤 운동인가\n밴드를 눌러 팔꿈치를 편 뒤 돌아올 때 천천히 버티는 운동입니다. 근육이 늘어나며 버티는 구간에 집중합니다.\n\n■ 이렇게 하세요\n· 밴드를 문틀 위나 철봉처럼 머리보다 높은 곳에 겁니다.\n· 팔꿈치를 옆구리에 붙인 채 아래팔만 눌러 폅니다.\n· 돌아올 때 서넛을 세며 아주 천천히 버팁니다.\n· 팔꿈치가 앞뒤로 흔들리지 않게 하고, 끝까지 탁 펴지 않습니다.\n\n■ 투수에게 왜 필요한가\n삼두가 늘어나며 버티는 힘을 키웁니다. 팔꿈치 주변 근육을 고루 키우면 투구의 부담을 나눠 받습니다. 밴드는 팔꿈치가 다 펴진 자리에 무게가 몰리지 않습니다.',
  },
];
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const saved = JSON.parse(readFileSync(FILE, 'utf8'));

for (const t of BACK) {
  const row = await prisma.exerciseVideo.findUnique({ where: { id: t.id }, select: { title: true, category: true } });
  if (!row || row.title !== t.title) {
    console.log('멈춤 — 운동을 못 찾음:', t.title, row);
    process.exit(1);
  }
  console.log(`${row.title} · 지금 분류 ${row.category}`);
  if (!apply) continue;
  if (row.category === LATER) {
    await prisma.exerciseVideo.update({ where: { id: t.id }, data: { category: '암케어', movementPattern: null } });
    console.log('  → 암케어로');
  }
  delete saved[t.id];
}
for (const n of NEW) {
  if (await prisma.exerciseVideo.findFirst({ where: { title: n.title }, select: { id: true } })) {
    console.log(`${n.title} · 이미 있음`);
    continue;
  }
  const got = await probeAspect(n.videoId);
  if (!got || !got.embeddable) {
    console.log('멈춤 — 못 트는 영상:', n.title, n.videoId);
    process.exit(1);
  }
  console.log(`${n.title} · 새로(${n.videoId})`);
  if (!apply) continue;
  const { videoId, ...rest } = n;
  await prisma.exerciseVideo.create({
    data: { ...rest, category: '암케어', source: 'REFERENCE', referenceVideoId: videoId, aspectRatio: got.ratio, detailsFilledAt: new Date() },
  });
}
if (apply) {
  writeFileSync(FILE, JSON.stringify(saved, null, 1) + '\n');
  console.log('lib/shoot/later.json 씀');
} else console.log('--apply 로 저장한다.');
await prisma.$disconnect();
