/**
 * 운동 라이브러리 파워에 회전 메디신볼 던지기 · 한 발 점프 · 상체 플라이오를 더한다(2026-10-15 김민: "회전 던지기는 투구 드릴에 이미 있으니
 * 두 군데에 중복으로 · 한 발 플라이오 2개 · 상체 플라이오 추천대로").
 *
 * 1 투구 드릴의 회전 메디신볼 던지기 6개를 운동(파워 · 회전 · 메디신볼)으로 복사한다 — 같은 참고 영상 · 설명. 그때까지 라이브러리에 회전 던지기가
 *   없어 프로그램의 회전 던지기 칸을 슬램 · 러시안 트위스트가 채웠다. 드릴 이름의 'P1 ' 같은 단계 번호는 뗀다(드릴 화면도 떼고 보인다).
 *   드릴 쪽 영상을 직접 찍어 올려도 이 복사본은 따라가지 않는다 — 같이 바꿔야 한다.
 * 2 한 발 점프 둘(싱글렉 브로드 점프 · 싱글렉 박스 점프), 상체 플라이오 둘(인클라인 플라이오 푸시업 · 플라이오 푸시업). 메디신볼 드롭 푸시업은
 *   뺐다 — 도구가 메디신볼이면 프로그램의 메디신볼(던지기) 칸에 들어간다.
 *
 * 같은 이름이 이미 있으면 건너뛴다. --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 하나 올려 커밋한다.
 *
 *   node --env-file=.env scripts/library-power-plyo-2026-10-15.mjs           # 확인만
 *   node --env-file=.env scripts/library-power-plyo-2026-10-15.mjs --apply   # 넣기(먼저 npm run backup)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

/* 드릴 id 앞 8자리 → 운동으로 옮길 회전 던지기 */
const DRILLS = ['60f5eaa8', '05c7ab7b', '6e935572', '365824c6', 'eaab7204', '4536a33e'];
const STAGE = {
  기초: { difficulty: '초급', intensity: '중간' },
  연결: { difficulty: '중급', intensity: '높음' },
  통합: { difficulty: '상급', intensity: '높음' },
};

const NEW = [
  {
    title: '싱글렉 브로드 점프',
    referenceVideoId: 'IQU7gWOUREM',
    movementPattern: '런지',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['맨몸'],
    bodyParts: ['고관절', '햄스트링·둔근', '종아리·발목'],
    sets: 3,
    reps: 3,
    restSeconds: 120,
    perSide: true,
    description: `■ 어떤 운동인가
한 발로 앞으로 멀리 뛰어 같은 발로 착지해 멈추는 운동입니다. 한 다리로 앞으로 힘을 내고, 착지에서 그 힘을 받아 멈추는 능력을 기릅니다.

■ 이렇게 하세요
1. 한 발로 서서 반쯤 앉으며 팔을 뒤로 젖힙니다.
2. 팔을 앞으로 휘두르며 앞으로 멀리 뜁니다.
3. 같은 발로 착지하며 무릎과 엉덩이를 굽혀 2초 멈춥니다.
4. 무릎이 안으로 모이지 않게 발끝 방향으로 둡니다.
5. 처음에는 멀리보다 흔들림 없이 멈추는 데 집중합니다.

■ 투수에게 왜 필요한가
투구는 뒷다리 한 발로 밀어 앞으로 나가는 동작입니다. 두 발 점프로는 한 다리가 앞으로 힘을 내는 능력을 따로 기를 수 없습니다.`,
  },
  {
    title: '싱글렉 박스 점프',
    referenceVideoId: 'w5PUa6QYpe0',
    movementPattern: '런지',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['박스'],
    bodyParts: ['고관절', '햄스트링·둔근', '종아리·발목'],
    sets: 3,
    reps: 3,
    restSeconds: 120,
    perSide: true,
    description: `■ 어떤 운동인가
한 발로 박스 위로 뛰어오르는 운동입니다. 한 다리로 위로 힘을 내는 능력을 기르고, 박스 위에 내려앉아 착지 충격은 적습니다.

■ 이렇게 하세요
1. 무릎 높이보다 낮은 박스 앞에 한 발로 섭니다.
2. 반쯤 앉으며 팔을 뒤로 젖혔다가 휘두르며 뛰어오릅니다.
3. 박스 위에 두 발로 부드럽게 착지합니다.
4. 뛰어내리지 말고 걸어서 내려옵니다.
5. 무릎이 안으로 모이면 박스를 낮춥니다.

■ 투수에게 왜 필요한가
한 다리로 큰 힘을 빠르게 내는 능력을 기릅니다. 박스에 내려앉아 내려오는 충격 없이 뛰는 힘만 연습할 수 있습니다.`,
  },
  {
    title: '인클라인 플라이오 푸시업',
    referenceVideoId: 'INfoyOtxiBU',
    movementPattern: '밀기',
    intensity: '중간',
    difficulty: '초급',
    equipment: ['박스'],
    bodyParts: ['가슴', '삼두', '어깨'],
    sets: 3,
    reps: 5,
    restSeconds: 90,
    perSide: false,
    description: `■ 어떤 운동인가
손을 박스나 벤치에 올려 몸을 비스듬히 세운 채 폭발적으로 밀어 손이 떨어지는 푸시업입니다. 몸이 기울어 바닥에서 하는 것보다 가벼워, 상체 플라이오를 처음 배우기 좋습니다.

■ 이렇게 하세요
1. 박스 가장자리에 손을 어깨너비로 올리고 몸을 곧게 폅니다.
2. 가슴을 박스 가까이 내렸다가 세게 밀어 손을 띄웁니다.
3. 팔꿈치를 부드럽게 굽히며 착지하고 바로 다음 회로 이어갑니다.
4. 허리가 처지거나 엉덩이가 들리면 세트를 끝냅니다.
5. 익숙해지면 박스를 낮춥니다.

■ 투수에게 왜 필요한가
상체가 힘을 빨리 내는 능력을 기릅니다. 손목과 어깨에 오는 충격이 작아 바닥 플라이오 푸시업 전에 거치는 단계입니다.`,
  },
  {
    title: '플라이오 푸시업',
    referenceVideoId: 'GR0ZL7f7u18',
    movementPattern: '밀기',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['맨몸'],
    bodyParts: ['가슴', '삼두', '어깨'],
    sets: 3,
    reps: 5,
    restSeconds: 120,
    perSide: false,
    description: `■ 어떤 운동인가
바닥에서 폭발적으로 밀어 손이 바닥에서 떨어지는 푸시업입니다. 가슴과 삼두가 짧은 시간에 큰 힘을 내고, 착지할 때 같은 근육이 늘어나며 충격을 받습니다.

■ 이렇게 하세요
1. 손을 어깨너비보다 조금 넓게 짚고 몸을 곧게 폅니다.
2. 가슴을 바닥 가까이 내렸다가 세게 밀어 손을 띄웁니다.
3. 팔꿈치를 부드럽게 굽히며 착지하고 바로 다음 회로 이어갑니다.
4. 손목과 어깨가 아프지 않을 때만 합니다.
5. 뜨는 높이가 낮아지면 세트를 끝냅니다.

■ 투수에게 왜 필요한가
상체가 힘을 빨리 내고 받는 능력을 기릅니다. 인클라인 플라이오 푸시업이 쉬워지면 넘어오는 단계입니다.`,
  },
];

const guides = await prisma.mechanicsGuide.findMany({
  where: { OR: DRILLS.map((p) => ({ id: { startsWith: p } })) },
});
if (guides.length !== DRILLS.length) throw new Error(`드릴 ${guides.length}/${DRILLS.length}개만 찾음`);

const fromDrills = guides.map((g) => ({
  title: g.title.replace(/^P\d\s+/, ''),
  category: '파워',
  description: g.description.replace('■ 왜 하나요', '■ 투수에게 왜 필요한가'),
  source: g.source,
  videoPath: g.videoPath,
  thumbPath: g.thumbPath,
  referenceVideoId: g.referenceVideoId,
  aspectRatio: g.aspectRatio,
  movementPattern: '회전',
  ...STAGE[g.stage],
  equipment: ['메디신볼'],
  bodyParts: ['코어', '고관절', '전신'],
  sets: 3,
  reps: 5,
  restSeconds: 90,
  perSide: false,
}));

const fresh = [];
for (const n of NEW) {
  const a = await probeAspect(n.referenceVideoId);
  if (!a?.embeddable) throw new Error(`${n.title}: 참고 영상을 못 읽거나 앱에서 못 틂`);
  fresh.push({ ...n, category: '파워', source: 'REFERENCE', aspectRatio: Math.round(a.ratio * 1000) / 1000 });
}

const rows = [...fromDrills, ...fresh];
const have = new Set(
  (await prisma.exerciseVideo.findMany({ where: { title: { in: rows.map((r) => r.title) } }, select: { title: true } })).map((r) => r.title)
);
for (const r of rows)
  console.log(`${have.has(r.title) ? '있음 · 건너뜀' : '새로'} | ${r.title} | ${r.movementPattern} · ${r.intensity} · ${r.difficulty} · ${r.equipment.join('/')} · 비율 ${r.aspectRatio}`);

const todo = rows.filter((r) => !have.has(r.title));
if (!apply) console.log(`확인만 했다(${todo.length}개 넣을 것). 넣으려면 --apply`);
else {
  const now = new Date();
  const r = await prisma.exerciseVideo.createMany({ data: todo.map((x) => ({ ...x, detailsFilledAt: now })) });
  console.log(`넣음 ${r.count}개 — lib/library-cache.ts 의 library:exercises 이름을 올릴 것`);
}
await prisma.$disconnect();
