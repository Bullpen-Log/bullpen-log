/**
 * 파워에 메디신볼 없이 하는 회전 파워 셋 · 상체 파워 넷을 더한다(2026-10-26 김민: 라이브러리 검토 뒤 "메디신볼 없이 회전파워에 3번까지 ·
 * 상체 파워는 4번까지 다").
 *
 * 회전 파워는 메디신볼 던지기뿐이라, 메디신볼이 없으면 프로그램 회전 던지기 칸이 천천히 돌리는 코어로 찼다. 상체 파워는 플라이오 푸시업
 * 둘 · 밴드 스피드 벤치 · 스피드 밴드 로우 정도였다. 영상은 유튜브 참고 영상. 같은 이름이 이미 있으면 건너뛴다.
 * --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 하나 올린다.
 *
 *   node --env-file=.env scripts/library-power-adds-2026-10-26.mjs           # 확인만
 *   node --env-file=.env scripts/library-power-adds-2026-10-26.mjs --apply   # 넣기(먼저 npm run backup)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

const ROTATION = {
  movementPattern: '회전',
  bodyParts: ['코어', '고관절', '전신'],
  sets: 3,
  reps: 5,
  restSeconds: 90,
  perSide: true,
};
const UPPER = { movementPattern: '밀기', bodyParts: ['가슴', '삼두', '어깨'], perSide: false };

const NEW = [
  {
    ...ROTATION,
    title: '랜드마인 회전 펀치',
    referenceVideoId: '6BDnA6TN1DI',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['바벨'],
    description: `■ 어떤 운동인가
바벨 한쪽 끝을 바닥 모서리(랜드마인)에 고정하고, 투구하듯 옆으로 선 채 뒷다리로 밀며 엉덩이와 몸통을 돌려 바를 한 손으로 앞으로 밀어내는 운동입니다. 다리에서 만든 힘을 몸통 회전으로 이어 팔 끝까지 보내는 순서를 익힙니다. 메디신볼 없이 할 수 있는 회전 파워 운동입니다.

■ 이렇게 하세요
· 바 끝을 뒷손으로 잡아 뒤쪽 엉덩이 옆에 두고, 두 발을 넓게 벌려 옆으로 서세요.
· 뒷발로 바닥을 밀며 엉덩이를 먼저 돌리고, 몸통이 따라 돈 뒤에 팔로 바를 앞으로 밀어내세요.
· 팔이 다 펴질 때 뒷발 뒤꿈치가 들리며 체중이 앞발로 옮겨 갑니다.
· 한 회마다 처음 자세로 돌아와 다시 빠르게 하세요.
· 팔부터 밀면 팔 운동이 됩니다. 엉덩이가 먼저 돌게 하세요.

■ 투수에게 왜 필요한가
투구 힘은 다리에서 엉덩이, 몸통, 팔 순서로 이어집니다. 이 순서대로 빠르게 힘을 내는 연습이라, 메디신볼을 던질 수 없는 곳에서도 회전 파워를 기를 수 있습니다.`,
  },
  {
    ...ROTATION,
    title: '케이블 스피드 로테이션',
    referenceVideoId: 'Ypv4Olh1Sso',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['케이블'],
    description: `■ 어떤 운동인가
케이블 손잡이를 가슴 높이에서 두 손으로 잡고 옆으로 선 채, 엉덩이부터 빠르게 돌려 케이블을 반대쪽으로 끌어오는 운동입니다. 천천히 버티는 코어 운동이 아니라 한 번에 빠르게 도는 파워 운동입니다.

■ 이렇게 하세요
· 케이블을 가슴 높이에 두고, 케이블 쪽 어깨가 기계를 보게 옆으로 서세요.
· 손잡이를 두 손으로 잡고 팔을 가슴 앞에 편 채 둡니다.
· 뒷발로 밀며 엉덩이를 먼저 돌리고, 몸통과 팔이 따라 돌게 하세요.
· 끝에서 멈추고, 천천히 처음 자세로 돌아와 다시 빠르게 하세요.
· 무게는 빠르게 돌 수 있을 만큼만 고르세요. 느려지면 세트를 끝냅니다.

■ 투수에게 왜 필요한가
투구는 엉덩이가 먼저 돌고 몸통이 따라 도는 동작입니다. 케이블은 무게를 조금씩 올릴 수 있어, 메디신볼 없이도 회전하는 힘을 단계적으로 기를 수 있습니다.`,
  },
  {
    ...ROTATION,
    title: '밴드 스피드 로테이션',
    referenceVideoId: 'iNSlB1wDaaI',
    intensity: '중간',
    difficulty: '초급',
    equipment: ['밴드'],
    reps: 6,
    description: `■ 어떤 운동인가
기둥에 건 밴드를 두 손으로 잡고 투구 자세로 선 채, 엉덩이를 빠르게 돌려 밴드를 끌어오는 운동입니다. 밴드 하나로 어디서든 회전 파워를 연습할 수 있습니다.

■ 이렇게 하세요
· 밴드를 허리 높이 기둥에 걸고, 밴드 쪽으로 옆으로 서서 두 발을 넓게 벌리세요.
· 밴드를 두 손으로 잡고 가슴 앞에 둡니다.
· 뒷발로 바닥을 밀며 엉덩이를 먼저 빠르게 돌리고, 몸통이 따라 돌게 하세요.
· 끝에서 멈춘 뒤 천천히 처음 자세로 돌아오세요.
· 밴드가 너무 세면 엉덩이보다 팔로 당기게 됩니다. 빠르게 돌 수 있는 밴드를 쓰세요.

■ 투수에게 왜 필요한가
엉덩이가 몸통보다 먼저 빠르게 도는 순서를 익힙니다. 장비가 밴드뿐이어도 회전 파워를 기를 수 있습니다.`,
  },
  {
    ...UPPER,
    title: '박수 푸시업',
    referenceVideoId: 'zmQ3D6BKyqE',
    intensity: '높음',
    difficulty: '상급',
    equipment: ['맨몸'],
    sets: 3,
    reps: 5,
    restSeconds: 120,
    description: `■ 어떤 운동인가
바닥에서 세게 밀어 몸을 띄운 뒤 공중에서 손뼉을 한 번 치고 착지하는 푸시업입니다. 플라이오 푸시업보다 더 높이 떠야 해서 더 빠르고 큰 힘이 필요합니다.

■ 이렇게 하세요
· 손을 어깨너비보다 조금 넓게 짚고 몸을 곧게 펴세요.
· 가슴을 바닥 가까이 내렸다가 세게 밀어 몸을 띄우세요.
· 공중에서 가슴 앞으로 손뼉을 한 번 치고, 바로 손을 어깨너비로 되돌리세요.
· 팔꿈치를 부드럽게 굽히며 착지하세요.
· 손뼉 칠 시간이 모자라거나 손목 · 어깨가 아프면 플라이오 푸시업으로 돌아갑니다.

■ 투수에게 왜 필요한가
상체가 짧은 시간에 큰 힘을 내는 능력을 기릅니다. 플라이오 푸시업이 쉬워졌을 때 넘어오는 단계입니다.`,
  },
  {
    ...UPPER,
    title: '드롭 푸시업',
    referenceVideoId: '-yRitniIZ4I',
    intensity: '높음',
    difficulty: '상급',
    equipment: ['원판'],
    sets: 3,
    reps: 5,
    restSeconds: 120,
    description: `■ 어떤 운동인가
원판 두 장 위에 손을 짚고 있다가 손을 바닥으로 떨어뜨리며 몸을 받고, 곧바로 세게 밀어 다시 원판 위로 손을 올리는 푸시업입니다. 떨어지는 몸을 받아 멈추는 힘과, 받자마자 되밀어 올리는 힘을 함께 기릅니다.

■ 이렇게 하세요
· 원판 두 장을 어깨너비보다 조금 넓게 놓고, 그 위에 손을 짚어 몸을 곧게 펴세요.
· 손을 원판 안쪽 바닥으로 떨어뜨리며 팔꿈치를 부드럽게 굽혀 몸을 받으세요.
· 받자마자 바닥을 세게 밀어 손을 띄우고, 다시 원판 위에 짚으세요.
· 허리가 처지거나 엉덩이가 들리면 세트를 끝냅니다.
· 처음에는 얇은 원판으로 시작하세요.

■ 투수에게 왜 필요한가
공을 던진 뒤 팔과 어깨는 빠르게 움직이는 몸을 받아 멈춰야 합니다. 받는 힘과 되밀어 올리는 힘을 함께 기르는 상체 플라이오입니다.`,
  },
  {
    ...UPPER,
    title: '바벨 스피드 벤치 프레스',
    referenceVideoId: 'LUYI-sD7RJo',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['바벨', '벤치'],
    sets: 6,
    reps: 3,
    restSeconds: 60,
    description: `■ 어떤 운동인가
가벼운 무게(최대 무게의 40~60%)로 벤치 프레스를 최대한 빠르게 밀어 올리는 운동입니다. 무거운 무게를 드는 날과 달리, 같은 동작을 빠르게 해서 힘을 내는 속도를 기릅니다.

■ 이렇게 하세요
· 평소 벤치 프레스처럼 누워 어깨뼈를 모으고 발로 바닥을 누르세요.
· 바를 가슴까지 조절하며 내리고, 가슴에 닿자마자 최대한 빠르게 밀어 올리세요.
· 한 세트에 3회만 하고, 마지막 회도 첫 회만큼 빨라야 합니다.
· 느려지면 무게가 무거운 것입니다. 무게를 줄이세요.
· 세트 사이는 짧게(1분 안) 쉬어 여러 세트를 이어갑니다.

■ 투수에게 왜 필요한가
투구는 아주 짧은 시간에 힘을 내는 동작이라, 무겁게만 드는 운동으로는 힘을 내는 속도가 잘 늘지 않습니다. 벤치 프레스를 하는 사람이라면 그 동작 그대로 빠르기를 기를 수 있습니다.`,
  },
  {
    ...UPPER,
    title: '랜드마인 펀치',
    referenceVideoId: 'n-jjDk5N7FI',
    intensity: '높음',
    difficulty: '중급',
    equipment: ['바벨'],
    bodyParts: ['어깨', '삼두', '가슴', '코어'],
    sets: 3,
    reps: 5,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
바벨 한쪽 끝을 바닥 모서리(랜드마인)에 고정하고, 다리를 앞뒤로 벌린 채 반대쪽 끝을 한 손으로 앞과 위로 빠르게 밀어내는 운동입니다. 랜드마인 프레스를 빠르게 하는 파워 운동으로, 뒷다리로 바닥을 미는 힘이 팔까지 이어집니다.

■ 이렇게 하세요
· 바 끝을 어깨 앞에 두고, 바를 든 손의 반대쪽 다리를 앞으로 내딛어 서세요.
· 뒷발로 바닥을 밀며 바를 앞과 위로 최대한 빠르게 밀어내세요.
· 팔이 다 펴지면 어깨뼈를 앞으로 조금 더 내밉니다.
· 조절하며 어깨 앞으로 내리고, 다시 빠르게 밀어내세요.
· 허리를 젖히거나 몸을 비틀어 밀지 마세요.

■ 투수에게 왜 필요한가
머리 위로 빠르게 미는 운동보다 어깨 부담이 적은 각도에서 상체 파워를 기릅니다. 다리로 바닥을 미는 힘을 팔까지 보내는 연습도 됩니다.`,
  },
];

const fresh = [];
for (const n of NEW) {
  const a = await probeAspect(n.referenceVideoId);
  if (!a?.embeddable) throw new Error(`${n.title}: 참고 영상을 못 읽거나 앱에서 못 틂`);
  fresh.push({ ...n, category: '파워', source: 'REFERENCE', aspectRatio: Math.round(a.ratio * 1000) / 1000 });
}
const have = new Set(
  (await prisma.exerciseVideo.findMany({ where: { title: { in: fresh.map((r) => r.title) } }, select: { title: true } })).map((r) => r.title)
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
