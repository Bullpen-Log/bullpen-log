/**
 * 운동 넷을 더하고 분류 · 계열 틀린 것 둘을 바로잡는다(2026-10-26 김민: 라이브러리 검토 뒤 "2번에 코사크 스쿼트, 일반 스플릿 스쿼트 · 3번 상체에
 * 랜드마인 프레스, 랫풀다운 · 분류-계열이 틀린 것에서 앞에 2개만").
 *
 * 1 더함 — 코사크 스쿼트 · 덤벨 스플릿 스쿼트(하체) · 하프닐링 랜드마인 프레스 · 랫 풀다운(상체). 영상은 유튜브 참고 영상.
 *   하체에 옆으로 앉는 근력 운동이 없었고(레터럴 런지뿐), 한 다리 운동은 불가리안부터라 그 앞 단계가 없었다. 상체에는 머리 위 프레스 대신
 *   투수에게 쓰는 랜드마인 프레스가 없었고, 두 손 세로 당기기는 풀업 · 친업뿐이었다(철봉 매달리기가 안 되면 세로 당기기 칸이 비었다).
 * 2 분류 — 동적 워밍업 여섯을 모빌리티 → 워밍업. 모빌리티면 보조 · 회복날 가동성 칸에 뽑혀 회복날에 A-스킵이 나올 수 있었다.
 *   워밍업은 어느 일정에도 안 뽑히고 워밍업 루틴에만 든다(app/actions/warmup.ts 가 이 분류만 담는다).
 * 3 계열 — 오버헤드 메디신볼 슬램(→ 당기기) · 메디신볼 푸시 슬램(→ 밀기)이 '회전'으로 적혀 있었다. 위아래로 던지는 것이라 다른 슬램
 *   (힌지 오버더톱 · 스플릿 스탠스 슬램)과 같게. 그래서 프로그램 메디신볼(던지기) 칸 후보가 된다.
 *
 * 같은 이름이 있으면 건너뛴다. 2 · 3 은 지금 값이 from 일 때만 바꾼다. --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 올린다.
 *
 *   node --env-file=.env scripts/library-adds-2026-10-26.mjs            # 확인만
 *   node --env-file=.env scripts/library-adds-2026-10-26.mjs --apply    # 바꾸기(먼저 npm run backup)
 *   node --env-file=.env scripts/library-adds-2026-10-26.mjs --revert   # 2 · 3 을 되돌린다(더한 운동은 그대로)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

const NEW = [
  {
    title: '코사크 스쿼트',
    category: '하체 스트렝스',
    referenceVideoId: 'iPZNB5GsOnM',
    movementPattern: '런지',
    intensity: '중간',
    difficulty: '중급',
    equipment: ['맨몸'],
    bodyParts: ['고관절', '햄스트링·둔근'],
    sets: 3,
    reps: 6,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
다리를 넓게 벌리고 한쪽 다리로 깊게 앉으며, 반대 다리는 곧게 펴 발끝을 들어 올리는 옆 방향 하체 운동입니다. 앉는 쪽 둔근과 대퇴사두근이 체중을 받고, 편 다리의 내전근은 늘어나며 버팁니다. 레터럴 런지보다 깊게 앉아 근력과 가동성을 함께 씁니다.

■ 이렇게 하세요
· 발을 어깨너비의 두 배쯤 벌리고 서세요.
· 한쪽 무릎을 굽히며 엉덩이를 뒤로 빼고 깊게 앉으세요. 반대 다리는 곧게 펴고 발끝을 위로 듭니다.
· 앉는 쪽 발뒤꿈치는 바닥에 붙이고, 무릎은 발끝 방향과 맞추세요.
· 가슴을 세운 채 앉은 발로 밀어 일어나 반대쪽으로 옮기세요.
· 처음에는 편한 깊이까지만 내려가고, 균형이 어려우면 앞에 무언가를 잡으세요.

■ 투수에게 왜 필요한가
투구는 옆으로 내딛으며 힘을 내는 동작이라, 앞뒤로만 하는 하체 운동으로는 옆 방향 힘이 채워지지 않습니다. 깊게 앉는 동안 내전근이 늘어나며 버티는데, 내전근은 투수가 자주 다치는 근육입니다. 고관절 가동 범위를 넓히는 데도 좋습니다.`,
  },
  {
    title: '덤벨 스플릿 스쿼트',
    category: '하체 스트렝스',
    referenceVideoId: 'Wcmg-3iHwjQ',
    movementPattern: '런지',
    intensity: '중간',
    difficulty: '초급',
    equipment: ['덤벨'],
    bodyParts: ['고관절', '햄스트링·둔근'],
    sets: 3,
    reps: 8,
    restSeconds: 120,
    perSide: true,
    description: `■ 어떤 운동인가
양손에 덤벨을 들고 다리를 앞뒤로 벌린 채 제자리에서 앉았다 일어나는 한 다리 하체 운동입니다. 앞다리의 둔근과 대퇴사두근이 주로 힘을 내고, 뒷다리는 바닥을 짚어 균형을 돕습니다. 뒷발을 벤치에 올리는 불가리안 스플릿 스쿼트보다 균형 잡기가 쉬워 한 다리 운동을 처음 배우기 좋습니다.

■ 이렇게 하세요
· 한 발을 크게 뒤로 빼고 뒤꿈치를 드세요. 두 발은 골반 너비로 둡니다.
· 상체를 세운 채 뒤 무릎이 바닥에 닿기 직전까지 곧게 내려가세요.
· 앞발 전체로 밀어 일어나되, 발은 옮기지 말고 제자리에서 반복하세요.
· 앞 무릎이 안쪽으로 무너지지 않게 발끝 방향과 맞추세요.
· 한쪽을 다 하고 반대쪽을 같은 횟수로 하세요.

■ 투수에게 왜 필요한가
투구는 한 다리씩 힘을 내고 받는 동작이라 두 발 스쿼트만으로는 좌우 다리를 따로 기를 수 없습니다. 발을 옮기지 않아 런지보다 무게를 안정적으로 올릴 수 있고, 익숙해지면 불가리안 스플릿 스쿼트로 넘어갑니다.`,
  },
  {
    title: '하프닐링 랜드마인 프레스',
    category: '상체 스트렝스',
    referenceVideoId: 'fx6lSVNvu-4',
    movementPattern: '밀기',
    intensity: '중간',
    difficulty: '초급',
    equipment: ['바벨'],
    bodyParts: ['어깨', '견갑', '삼두', '코어'],
    sets: 3,
    reps: 8,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
바벨 한쪽 끝을 바닥 모서리(랜드마인)에 고정하고, 한쪽 무릎을 꿇은 채 반대쪽 끝을 한 손으로 비스듬히 위로 밀어 올리는 운동입니다. 삼각근과 대흉근 윗부분, 삼두근이 밀고, 전거근이 어깨뼈를 갈비뼈 위로 돌려 올립니다. 머리 위 프레스와 벤치 프레스 사이의 각도라 어깨 부담이 적습니다.

■ 이렇게 하세요
· 바를 드는 손과 같은 쪽 무릎을 바닥에 대고, 반대쪽 발은 앞에 두세요.
· 바 끝을 어깨 앞에 두고, 배와 엉덩이에 힘을 줘 몸통을 곧게 세우세요.
· 바를 앞과 위로 비스듬히 밀어 팔을 끝까지 펴고, 끝에서 어깨뼈를 앞으로 조금 더 내미세요.
· 허리를 젖히거나 몸을 비틀어 밀지 마세요.
· 천천히 어깨 앞으로 내리고, 좌우를 같은 횟수로 하세요.

■ 투수에게 왜 필요한가
투수에게 머리 위로 미는 운동은 부담이 큰 편이라, 각도를 낮춘 이 운동이 대신 쓰입니다. 미는 동안 어깨뼈가 자유롭게 위로 돌아가 전거근을 함께 기르고, 무릎을 꿇은 자세라 허리를 젖혀 밀어 올리는 것을 막아 줍니다.`,
  },
  {
    title: '랫 풀다운',
    category: '상체 스트렝스',
    referenceVideoId: '7JnP8dFbS14',
    movementPattern: '당기기',
    intensity: '중간',
    difficulty: '초급',
    equipment: ['케이블'],
    bodyParts: ['등', '견갑', '이두'],
    sets: 3,
    reps: 10,
    restSeconds: 120,
    perSide: false,
    description: `■ 어떤 운동인가
케이블 머신에 앉아 넓은 바를 두 손으로 잡고 가슴 위쪽으로 당겨 내리는 등 운동입니다. 광배근이 팔을 끌어내리고, 하부 승모근과 능형근이 어깨뼈를 아래로 모읍니다. 풀업이 아직 어려운 사람도 무게를 골라 세로 당기기를 할 수 있습니다.

■ 이렇게 하세요
· 허벅지를 패드에 고정하고, 바를 어깨너비보다 조금 넓게 잡으세요.
· 상체를 조금만 뒤로 기울이고 가슴을 세우세요.
· 어깨뼈를 먼저 아래로 내린 뒤, 팔꿈치를 옆구리 쪽으로 끌어 바를 쇄골 아래까지 당기세요.
· 반동을 쓰거나 몸을 크게 젖히지 마세요.
· 팔이 다 펴질 때까지 천천히 올리세요.

■ 투수에게 왜 필요한가
광배근은 팔을 앞으로 휘두르는 가속 구간에 크게 쓰이는 근육이라, 로우와 함께 세로로 당기는 운동이 필요합니다. 두 손으로 해 싱글암 케이블 풀다운보다 무게를 더 올릴 수 있습니다.`,
  },
];

/* [이름, 바꿀 칸, 지금 값, 새 값] */
const FIXES = [
  ...['A-스킵', '워킹 런지', '워킹 쿼드 풀', '토 워크', '리버스 토 워크', '워킹 니 허그'].map((t) => [t, 'category', '모빌리티', '워밍업']),
  ['오버헤드 메디신볼 슬램', 'movementPattern', '회전', '당기기'],
  ['메디신볼 푸시 슬램', 'movementPattern', '회전', '밀기'],
];

const fresh = [];
if (!revert) {
  for (const n of NEW) {
    const a = await probeAspect(n.referenceVideoId);
    if (!a?.embeddable) throw new Error(`${n.title}: 참고 영상을 못 읽거나 앱에서 못 틂`);
    fresh.push({ ...n, source: 'REFERENCE', aspectRatio: Math.round(a.ratio * 1000) / 1000 });
  }
}
const have = new Set(
  (await prisma.exerciseVideo.findMany({ where: { title: { in: fresh.map((r) => r.title) } }, select: { title: true } })).map((r) => r.title)
);
for (const r of fresh)
  console.log(`${have.has(r.title) ? '있음 · 건너뜀' : '새로'} | ${r.title} | ${r.category} · ${r.movementPattern} · ${r.intensity} · ${r.equipment.join('/')} · 비율 ${r.aspectRatio}`);
const todo = fresh.filter((r) => !have.has(r.title));

const fixes = [];
for (const [title, field, from0, to0] of FIXES) {
  const [from, to] = revert ? [to0, from0] : [from0, to0];
  const rows = await prisma.exerciseVideo.findMany({ where: { title }, select: { id: true, [field]: true } });
  if (rows.length !== 1) throw new Error(`${title}: ${rows.length}개 — 하나여야 함`);
  const now = rows[0][field];
  console.log(`${now === from ? '바꿈' : now === to ? '이미 됨' : `건너뜀(지금 ${now})`} | ${title} | ${field} ${from} → ${to}`);
  if (now === from) fixes.push({ id: rows[0].id, data: { [field]: to } });
}

if (!apply && !revert) console.log(`확인만 했다(더함 ${todo.length} · 바꿈 ${fixes.length}). 바꾸려면 --apply`);
else {
  const now = new Date();
  await prisma.$transaction([
    ...(todo.length ? [prisma.exerciseVideo.createMany({ data: todo.map((x) => ({ ...x, detailsFilledAt: now })) })] : []),
    ...fixes.map((f) => prisma.exerciseVideo.update({ where: { id: f.id }, data: f.data })),
  ]);
  console.log(`더함 ${todo.length} · 바꿈 ${fixes.length} — lib/library-cache.ts 의 library:exercises 이름을 올릴 것`);
}
await prisma.$disconnect();
