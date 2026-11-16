/**
 * 워밍업 · 하체 · 상체 · 모빌리티에 빠진 운동 29개를 더한다(2026-11-16 김민: 네 분류를 검토해 빠진 운동을 골고루 →
 * 목록을 보고 "어시스트 풀업만 빼고 넣어줘").
 *
 * - 워밍업 12: 2026-10-09 에 고른 '이름만 있는 워밍업 24개'(lib/shoot/warmups.ts) 가운데 라이브러리에 같은 동작이 없는 것.
 *   운동 번호는 그때 정해 둔 것(ROW_IDS)을 그대로 쓴다 — 촬영 기록이 이름이 아니라 그 번호로 잇는다.
 *   워밍업은 매일 일정에 뽑히지 않는다 — 루틴(WarmupRoutine)에 넣어야 보인다(루틴은 따로 정한다).
 * - 하체 10 · 상체 5 · 모빌리티 2.
 * 영상은 유튜브 참고 영상(나중에 직접 찍는다). 같은 이름이 이미 있으면 건너뛴다.
 * --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 하나 올린다(이 커밋에서 v49).
 *
 *   node --env-file=.env scripts/library-adds-2026-11-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-adds-2026-11-16.mjs --apply   # 넣기(먼저 npm run backup)
 *   node --env-file=.env scripts/library-adds-2026-11-16.mjs --revert  # 이 스크립트로 넣은 것 지우기(기록이 없을 때만)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');

const WARM = { category: '워밍업', movementPattern: null, difficulty: '초급', restSeconds: 20, sets: 2, reps: 10, perSide: false };

const NEW = [
  /* ───────────── 워밍업(id 는 lib/shoot/warmups.ts ROW_IDS) ───────────── */
  {
    ...WARM,
    id: '73e64d42-d40f-438d-bbd7-034b10cb3c9a',
    title: '잭 점프',
    referenceVideoId: '7L-5wpilwv4',
    bodyParts: ['전신', '종아리·발목'],
    equipment: ['맨몸'],
    intensity: '낮음',
    reps: null,
    holdSeconds: 20,
    description: `■ 어떤 운동인가
제자리에서 두 발을 벌렸다 모으며 팔을 머리 위로 올렸다 내리는 가벼운 점프입니다. 심박수와 몸 온도를 올리는 워밍업 첫 동작입니다.

■ 이렇게 하세요
· 두 발을 모으고 팔을 몸 옆에 둔 채 섭니다.
· 가볍게 뛰며 두 발을 어깨너비보다 넓게 벌리고, 동시에 팔을 옆으로 크게 돌려 머리 위에서 모읍니다.
· 다시 뛰며 발을 모으고 팔을 내립니다.
· 발 앞쪽으로 가볍게 착지하고 무릎을 살짝 굽혀 충격을 받습니다.

■ 투수에게 왜 필요한가
몸이 차가운 채로 강한 운동을 하면 다치기 쉽습니다. 짧은 시간에 몸 전체를 데우고 발목의 탄성을 깨워 다음 워밍업 동작을 준비합니다.`,
  },
  {
    ...WARM,
    id: '4eb42b69-a230-44b3-ac06-66b9aae7d25f',
    title: '하이 니',
    referenceVideoId: '4OdXdJxcG2s',
    bodyParts: ['고관절', '종아리·발목'],
    equipment: ['맨몸'],
    intensity: '낮음',
    reps: null,
    holdSeconds: 15,
    description: `■ 어떤 운동인가
제자리에서 빠르게 달리듯 무릎을 허리 높이까지 번갈아 올리는 워밍업 동작입니다. 고관절을 굽히는 근육과 발목을 빠르게 깨웁니다.

■ 이렇게 하세요
· 상체를 세우고 두 발을 엉덩이 너비로 섭니다.
· 한쪽 무릎을 허리 높이까지 올리며 반대 팔을 앞으로 흔듭니다.
· 발 앞쪽으로 바닥을 짧게 치고 바로 반대쪽 무릎을 올립니다.
· 처음에는 천천히, 몸이 데워지면 빠르게 합니다.

■ 투수에게 왜 필요한가
다리를 들어 올리는 동작은 투구의 시작입니다. 고관절을 굽히는 근육을 빠르게 쓰게 해 다리 들기와 내딛기를 준비합니다.`,
  },
  {
    ...WARM,
    id: '322817c1-52ce-41a1-a392-4a31f1df1b83',
    title: '버트 킥',
    referenceVideoId: 'RSY2mAxUPqQ',
    bodyParts: ['햄스트링·둔근', '고관절'],
    equipment: ['맨몸'],
    intensity: '낮음',
    reps: null,
    holdSeconds: 15,
    description: `■ 어떤 운동인가
제자리에서 가볍게 뛰며 뒤꿈치를 엉덩이 쪽으로 차올리는 워밍업 동작입니다. 허벅지 앞쪽을 늘이고 햄스트링을 빠르게 씁니다.

■ 이렇게 하세요
· 상체를 세우고 가볍게 제자리 뛰기를 합니다.
· 뒤꿈치를 엉덩이 쪽으로 번갈아 차올립니다.
· 무릎은 아래를 향하게 두고 앞으로 들지 않습니다.
· 발 앞쪽으로 가볍게 착지합니다.

■ 투수에게 왜 필요한가
허벅지 앞쪽이 굳어 있으면 내딛는 다리가 충분히 뻗지 못합니다. 무릎을 굽히는 햄스트링도 함께 데워 달리기와 투구 전에 다리를 준비합니다.`,
  },
  {
    ...WARM,
    id: 'fde1663c-0ba2-4c3a-8307-c127c82e5f1e',
    title: '카리오카',
    referenceVideoId: 'jU2K0TE5D7s',
    bodyParts: ['고관절', '코어'],
    equipment: ['맨몸'],
    intensity: '낮음',
    perSide: true,
    description: `■ 어떤 운동인가
옆으로 이동하면서 뒷다리를 앞뒤로 번갈아 교차하는 워밍업 동작입니다. 골반은 돌고 상체는 앞을 보며, 하체와 상체를 따로 움직이게 합니다.

■ 이렇게 하세요
· 가는 방향과 옆으로 서서 무릎을 살짝 굽힙니다.
· 뒤쪽 발을 앞쪽 발 앞으로 교차해 옆으로 한 걸음 갑니다.
· 앞쪽 발을 옆으로 빼 다리를 풀고, 이번에는 뒤쪽 발을 뒤로 교차합니다.
· 상체와 어깨는 정면을 보고 골반만 돌게 합니다. 10m쯤 간 뒤 반대 방향으로 돌아옵니다.

■ 투수에게 왜 필요한가
투구는 하체가 먼저 돌고 상체가 따라가는 동작입니다. 골반과 상체를 따로 움직이는 감각을 깨우고, 옆으로 움직이는 고관절을 데웁니다.`,
  },
  {
    ...WARM,
    id: '97cb28a9-79b1-44a3-a80d-934d643663a0',
    title: '레그 스윙 앞뒤',
    referenceVideoId: '0XvKtEZ4i38',
    bodyParts: ['고관절', '햄스트링·둔근'],
    equipment: ['맨몸'],
    intensity: '매우 낮음',
    perSide: true,
    description: `■ 어떤 운동인가
벽이나 기둥을 짚고 한 다리를 앞뒤로 흔드는 동적 스트레칭입니다. 고관절을 굽히고 펴는 범위를 넓힙니다.

■ 이렇게 하세요
· 벽을 옆에 두고 한 손으로 짚고 섭니다.
· 바깥쪽 다리를 앞으로 차올렸다가 뒤로 흔들어 보냅니다.
· 처음에는 작게, 점점 크게 흔듭니다.
· 상체는 세우고, 허리가 젖혀지거나 굽지 않게 배에 힘을 줍니다.

■ 투수에게 왜 필요한가
다리를 높이 드는 동작과 뒷다리로 끝까지 미는 동작 모두 고관절 앞뒤 범위가 필요합니다. 하체 운동이나 투구 전에 그 범위를 미리 열어 둡니다.`,
  },
  {
    ...WARM,
    id: '92e76d49-d807-4f68-99e7-c6167dadb755',
    title: '레그 스윙 좌우',
    referenceVideoId: 'U3Px6O-4M1E',
    bodyParts: ['고관절'],
    equipment: ['맨몸'],
    intensity: '매우 낮음',
    perSide: true,
    description: `■ 어떤 운동인가
벽을 마주 보고 짚은 채 한 다리를 몸 앞에서 좌우로 흔드는 동적 스트레칭입니다. 허벅지 안쪽과 엉덩이 옆 근육의 범위를 넓힙니다.

■ 이렇게 하세요
· 벽을 마주 보고 두 손으로 짚습니다.
· 한 다리를 몸 앞을 가로질러 반대쪽으로 보냈다가 바깥으로 흔들어 벌립니다.
· 점점 크게 흔들되 골반과 상체는 정면을 봅니다.
· 서 있는 다리의 무릎은 살짝 굽힙니다.

■ 투수에게 왜 필요한가
투수는 옆으로 넓게 내딛으며 앞다리로 착지합니다. 사타구니(내전근)와 엉덩이 옆을 미리 풀어 내딛는 다리의 범위를 준비합니다.`,
  },
  {
    ...WARM,
    id: 'd51aa4fd-9880-45cc-9c2c-1d850098d81b',
    title: '프랑켄슈타인 워크',
    referenceVideoId: 'qvn_HvrSOmY',
    bodyParts: ['햄스트링·둔근', '고관절'],
    equipment: ['맨몸'],
    intensity: '낮음',
    perSide: true,
    description: `■ 어떤 운동인가
걸어가면서 무릎을 편 다리를 앞으로 차올리고, 반대 손을 발끝 쪽으로 뻗는 동적 스트레칭입니다. 햄스트링을 움직이며 늘입니다.

■ 이렇게 하세요
· 상체를 세우고 한 걸음 나가며 반대쪽 다리를 무릎을 편 채 앞으로 차올립니다.
· 반대 손을 발끝 쪽으로 뻗어 터치합니다.
· 다리를 내리며 앞으로 걷고 반대쪽을 합니다.
· 허리를 둥글게 말아 손을 맞추지 말고, 다리가 올라가는 만큼만 올립니다.

■ 투수에게 왜 필요한가
공을 놓는 순간 앞다리 햄스트링은 앞으로 나가는 몸을 버텨 줍니다. 강한 운동이나 전력 투구 전에 햄스트링을 움직이며 데웁니다.`,
  },
  {
    ...WARM,
    id: '11688c75-8edd-4431-b081-1c4e03d1f24e',
    title: '암 서클 앞뒤',
    referenceVideoId: 'tYo5ghpLksg',
    bodyParts: ['어깨', '견갑'],
    equipment: ['맨몸'],
    intensity: '매우 낮음',
    description: `■ 어떤 운동인가
팔을 옆으로 뻗고 작은 원부터 큰 원까지 앞뒤로 돌리는 어깨 워밍업입니다.

■ 이렇게 하세요
· 두 팔을 어깨 높이로 옆으로 뻗습니다.
· 작은 원을 그리며 앞으로 돌리고, 점점 원을 키웁니다.
· 같은 횟수로 뒤로 돌립니다.
· 어깨를 귀 쪽으로 으쓱하지 말고, 팔을 길게 뻗은 채 돌립니다.

■ 투수에게 왜 필요한가
던지기 전과 상체 운동 전에 어깨 관절과 주변 근육을 천천히 데웁니다. 아프지 않은 범위에서 점점 크게 돌려 어깨가 움직이는 범위를 확인합니다.`,
  },
  {
    ...WARM,
    id: '8e01b87a-c198-46d9-9b75-687cfd310ff0',
    title: '크로스 바디 암 스윙',
    referenceVideoId: 'AsMMF3YWIIM',
    bodyParts: ['가슴', '어깨', '등'],
    equipment: ['맨몸'],
    intensity: '매우 낮음',
    description: `■ 어떤 운동인가
두 팔을 옆으로 크게 벌렸다가 가슴 앞에서 교차하며 감싸 안듯 흔드는 동적 스트레칭입니다. 가슴과 등 위쪽을 번갈아 늘입니다.

■ 이렇게 하세요
· 두 발을 어깨너비로 서서 팔을 옆으로 벌립니다.
· 두 팔을 가슴 앞으로 흔들어 교차하며 몸을 감싸 안습니다.
· 다시 크게 벌리며 가슴을 엽니다. 교차할 때 위로 가는 팔을 번갈아 바꿉니다.
· 힘을 빼고 리듬 있게 흔듭니다.

■ 투수에게 왜 필요한가
공을 던지려면 팔을 뒤로 크게 젖혀 가슴이 열리는 범위가 필요합니다. 가슴 근육과 날개뼈 주변을 데워 던지기 전 어깨 범위를 준비합니다.`,
  },
  {
    ...WARM,
    id: 'd0d64b03-4802-43db-ba34-0ad9378888f1',
    title: '다운독 푸시업',
    referenceVideoId: '-SvL90YGHYc',
    bodyParts: ['어깨', '가슴', '견갑'],
    equipment: ['맨몸'],
    intensity: '낮음',
    reps: 5,
    description: `■ 어떤 운동인가
푸시업을 한 번 한 뒤 엉덩이를 높이 들어 몸을 ㅅ자로 접는 다운독 자세로 가는 동작입니다. 미는 힘과 어깨 · 등 · 햄스트링의 범위를 한 번에 깨웁니다.

■ 이렇게 하세요
· 손을 어깨너비로 짚고 몸을 일직선으로 펴 푸시업 자세를 만듭니다.
· 푸시업을 한 번 합니다. 힘들면 무릎을 대고 합니다.
· 팔을 편 채 엉덩이를 천장 쪽으로 밀어 올려 귀가 두 팔 사이에 오게 합니다.
· 뒤꿈치를 바닥 쪽으로 누르며 1~2초 머문 뒤 푸시업 자세로 돌아옵니다.

■ 투수에게 왜 필요한가
미는 운동 전에 가슴 · 어깨 앞을 쓰고, 다운독 자세에서 팔을 머리 위로 뻗어 어깨와 광배가 늘어나는 범위를 만듭니다. 짧은 시간에 상체 전체를 데울 수 있습니다.`,
  },
  {
    ...WARM,
    id: '47a4ee57-1b67-4ad0-b846-98a474ce40d8',
    title: '밴드 Y · T · W',
    referenceVideoId: 'DHlNk1zl3HM',
    bodyParts: ['견갑', '어깨', '등'],
    equipment: ['밴드'],
    intensity: '낮음',
    reps: 6,
    description: `■ 어떤 운동인가
밴드를 두 손으로 잡고 팔로 Y · T · W 모양을 차례로 만들며 밴드를 벌리는 어깨 워밍업입니다. 날개뼈를 모으고 내리는 등 위쪽 근육과 어깨 뒤쪽을 깨웁니다.

■ 이렇게 하세요
· 가벼운 밴드를 두 손으로 어깨너비보다 넓게 잡습니다.
· Y: 팔을 머리 위 대각선으로 들고 밴드를 벌립니다.
· T: 팔을 어깨 높이에서 옆으로 벌려 밴드를 가슴 쪽으로 당깁니다.
· W: 팔꿈치를 굽혀 옆구리 쪽으로 당기며 날개뼈를 모읍니다.
· 자세마다 1초 멈추고, 어깨가 귀 쪽으로 올라가지 않게 합니다.

■ 투수에게 왜 필요한가
공을 놓은 뒤 팔을 멈추는 일은 어깨 뒤쪽과 날개뼈 주변 근육이 맡습니다. 던지거나 당기는 운동 전에 이 근육들을 미리 깨웁니다.`,
  },
  {
    ...WARM,
    id: 'ef791731-cfc1-4d4f-8c16-962436dc03cd',
    title: '밴드 노 머니',
    referenceVideoId: 'qBAInpqGdNQ',
    bodyParts: ['어깨', '견갑'],
    equipment: ['밴드'],
    intensity: '낮음',
    description: `■ 어떤 운동인가
팔꿈치를 옆구리에 붙이고 손바닥을 위로 한 채 밴드를 바깥으로 벌리는 동작입니다. 어깨를 바깥으로 돌리는 근육(회전근개)과 날개뼈를 모으는 근육을 함께 씁니다.

■ 이렇게 하세요
· 가벼운 밴드를 두 손으로 잡고 팔꿈치를 90도로 굽혀 옆구리에 붙입니다. 손바닥은 위를 봅니다.
· 팔꿈치를 붙인 채 두 손을 바깥으로 벌려 밴드를 늘립니다.
· 끝에서 날개뼈를 살짝 모으고 1초 멈춘 뒤 천천히 돌아옵니다.
· 팔꿈치가 옆구리에서 떨어지거나 허리가 젖혀지지 않게 합니다.

■ 투수에게 왜 필요한가
던지는 어깨는 바깥으로 돌리는 힘이 약해지기 쉽습니다. 던지기 전에 어깨를 바깥으로 돌리는 근육을 가볍게 깨워 어깨를 준비합니다.`,
  },

  /* ───────────── 하체 스트렝스 ───────────── */
  {
    title: '트랩바 데드리프트',
    referenceVideoId: 'WzvsIU9FW60',
    category: '하체 스트렝스',
    movementPattern: '힌지',
    bodyParts: ['햄스트링·둔근', '고관절', '등', '손목·전완'],
    equipment: ['바벨'],
    intensity: '높음',
    difficulty: '중급',
    sets: 3,
    reps: 5,
    restSeconds: 180,
    perSide: false,
    description: `■ 어떤 운동인가
육각형 모양의 트랩바 안에 서서 양옆 손잡이를 잡고 들어 올리는 데드리프트입니다. 무게가 몸 옆에 있어 상체를 덜 숙이고, 일반 데드리프트보다 허리 부담이 적습니다.

■ 이렇게 하세요
· 트랩바 가운데에 서서 두 발을 엉덩이 너비로 둡니다. 손잡이 가운데가 발 중간과 같은 선에 오게 합니다.
· 엉덩이를 뒤로 보내고 무릎을 굽혀 손잡이를 잡습니다. 손바닥은 서로 마주 봅니다.
· 가슴을 펴고 배에 힘을 준 뒤, 바닥을 밀며 엉덩이와 무릎을 함께 펴 일어섭니다.
· 맨 위에서 엉덩이를 조이되 허리를 뒤로 젖히지 않습니다.
· 내릴 때는 엉덩이를 먼저 뒤로 보내며 같은 길로 내립니다. 등이 둥글게 말리면 무게를 줄입니다.

■ 투수에게 왜 필요한가
다리로 바닥을 미는 힘은 구속의 바탕입니다. 허리 부담을 줄이면서 하체와 엉덩이 전체를 무겁게 쓸 수 있어 투수에게 많이 쓰는 큰 힌지 운동입니다. 트랩바가 없으면 데드리프트나 RDL로 대신합니다.`,
  },
  {
    title: '짐볼 햄스트링 컬',
    referenceVideoId: 'Lr-P-k_53o0',
    category: '하체 스트렝스',
    movementPattern: '고립',
    bodyParts: ['햄스트링·둔근'],
    equipment: ['짐볼'],
    intensity: '중간',
    difficulty: '중급',
    sets: 3,
    reps: 10,
    restSeconds: 90,
    perSide: false,
    description: `■ 어떤 운동인가
바닥에 누워 짐볼 위에 뒤꿈치를 올리고, 엉덩이를 든 채 무릎을 굽혀 공을 엉덩이 쪽으로 끌어오는 운동입니다. 기구 없이 햄스트링을 키웁니다.

■ 이렇게 하세요
· 바닥에 누워 두 뒤꿈치를 짐볼 위에 올리고 팔은 몸 옆 바닥에 둡니다.
· 엉덩이를 들어 어깨부터 발까지 일직선을 만듭니다.
· 엉덩이를 든 채 무릎을 굽혀 공을 엉덩이 쪽으로 끌어옵니다.
· 천천히 다리를 펴며 공을 밀어냅니다. 끝까지 엉덩이가 내려가지 않게 합니다.
· 쉬워지면 한 다리로 합니다.

■ 투수에게 왜 필요한가
공을 놓는 순간 앞다리 햄스트링은 빠르게 나가는 몸을 버텨 멈춥니다. 머신이 없어도 햄스트링 힘을 길러 햄스트링 부상을 막는 데 도움이 됩니다.`,
  },
  {
    title: '덤벨 래터럴 스텝업',
    referenceVideoId: 'z6WChpJB08Q',
    category: '하체 스트렝스',
    movementPattern: '런지',
    bodyParts: ['고관절', '햄스트링·둔근'],
    equipment: ['덤벨', '박스'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 8,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
덤벨을 들고 박스 옆에 서서, 박스 쪽 다리로 옆으로 올라서는 운동입니다. 앞으로 올라서는 스텝업과 달리 엉덩이 옆과 허벅지 안쪽까지 씁니다.

■ 이렇게 하세요
· 두 손에 덤벨을 들고 박스를 몸 옆에 둔 채 섭니다.
· 박스 쪽 발을 박스 위에 발 전체로 올립니다.
· 올린 발로 박스를 밀어 일어서고, 반대 발은 박스 위에 살짝 대거나 공중에 둡니다.
· 천천히 내려와 바닥 발을 가볍게 딛습니다. 아래 발로 바닥을 차서 올라가지 않습니다.
· 무릎이 안쪽으로 모이지 않고 발끝 방향을 보게 합니다.

■ 투수에게 왜 필요한가
투구는 옆으로 내딛는 동작입니다. 옆 방향으로 한 다리 힘을 기르고, 무릎과 골반이 흔들리지 않게 버티는 힘을 함께 기릅니다.`,
  },
  {
    title: '킥스탠드 RDL',
    referenceVideoId: 'WOal21Uk6CU',
    category: '하체 스트렝스',
    movementPattern: '힌지',
    bodyParts: ['햄스트링·둔근', '고관절'],
    equipment: ['덤벨'],
    intensity: '중간',
    difficulty: '중급',
    sets: 3,
    reps: 8,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
한 발은 앞에, 다른 발은 뒤에 발끝만 살짝 대고(킥스탠드) 하는 RDL입니다. 체중은 앞다리에 70~80%를 싣고, 뒷발은 균형만 잡습니다. 두 다리 RDL과 한 다리 RDL 사이 단계입니다.

■ 이렇게 하세요
· 덤벨을 들고 한 발을 반 걸음 뒤로 빼 발끝만 바닥에 댑니다. 뒷발 발끝은 앞발 뒤꿈치 옆쯤에 둡니다.
· 앞다리 무릎을 살짝 굽히고 엉덩이를 뒤로 보내며 상체를 숙입니다.
· 덤벨은 다리 앞을 따라 내려가고, 앞다리 햄스트링이 당기면 멈춥니다.
· 앞다리 엉덩이로 밀어 일어섭니다. 허리는 곧게 둡니다.
· 양쪽을 같은 횟수로 합니다.

■ 투수에게 왜 필요한가
한 다리로 버티는 힘은 착지와 공 놓기에 필요하지만, 한 다리 RDL은 균형 때문에 무게를 많이 못 듭니다. 뒷발이 균형을 도와 앞다리 엉덩이와 햄스트링에 무게를 더 실을 수 있습니다.`,
  },
  {
    title: '래터럴 스텝다운',
    referenceVideoId: 'TYt9_FmGbqM',
    category: '하체 스트렝스',
    movementPattern: '런지',
    bodyParts: ['고관절', '햄스트링·둔근'],
    equipment: ['박스'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 8,
    restSeconds: 60,
    perSide: true,
    description: `■ 어떤 운동인가
박스 위에 한 발로 서서, 반대 발을 박스 옆으로 천천히 내려 뒤꿈치를 바닥에 살짝 대고 다시 올라오는 운동입니다. 내려가는 동안 무릎과 골반이 흔들리지 않게 버티는 힘을 기릅니다.

■ 이렇게 하세요
· 낮은 박스(15~20cm) 위에 한 발로 서고, 반대 발은 박스 옆 공중에 둡니다.
· 서 있는 다리의 무릎을 굽히고 엉덩이를 살짝 뒤로 보내며 3초에 걸쳐 내려갑니다.
· 공중 발의 뒤꿈치가 바닥에 살짝 닿으면 서 있는 다리로 밀어 올라옵니다. 바닥 발에 체중을 싣지 않습니다.
· 무릎이 안쪽으로 모이지 않고 둘째 발가락 방향을 보게 합니다.
· 쉬워지면 박스를 높이거나 덤벨을 듭니다.

■ 투수에게 왜 필요한가
앞다리로 착지할 때 무릎이 안으로 무너지면 힘이 새고 무릎에 부담이 갑니다. 천천히 내려가며 무릎과 골반을 제자리에 두는 힘을 길러 투구 착지와 점프 착지를 준비합니다.`,
  },
  {
    title: '케이블 풀 스루',
    referenceVideoId: 'VRDxdi2d-2c',
    category: '하체 스트렝스',
    movementPattern: '힌지',
    bodyParts: ['햄스트링·둔근', '고관절'],
    equipment: ['케이블'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 12,
    restSeconds: 90,
    perSide: false,
    description: `■ 어떤 운동인가
낮은 케이블을 등지고 서서 다리 사이로 로프를 잡고, 엉덩이를 뒤로 접었다가 앞으로 밀어 일어서는 운동입니다. 엉덩이를 접는 힌지 동작을 배우기 좋고 엉덩이 근육을 크게 씁니다.

■ 이렇게 하세요
· 케이블을 가장 낮게 두고 로프를 끼웁니다. 케이블을 등지고 서서 다리 사이로 로프를 잡고 두세 걸음 앞으로 나갑니다.
· 발은 어깨너비보다 조금 넓게 섭니다.
· 무릎을 살짝 굽힌 채 엉덩이를 뒤로 보내며 상체를 숙여, 로프가 다리 사이로 지나가게 합니다.
· 엉덩이를 앞으로 밀며 일어서고, 맨 위에서 엉덩이를 조입니다.
· 팔로 당기지 않고, 맨 위에서 허리를 뒤로 젖히지 않습니다.

■ 투수에게 왜 필요한가
엉덩이를 펴는 힘은 뒷다리로 마운드를 밀 때 씁니다. 허리 부담이 적어 데드리프트를 배우기 전이나 가벼운 날의 힌지 운동으로 좋습니다.`,
  },
  {
    title: '덤벨 워킹 런지',
    referenceVideoId: '_qSuiZ62vqI',
    category: '하체 스트렝스',
    movementPattern: '런지',
    bodyParts: ['고관절', '햄스트링·둔근'],
    equipment: ['덤벨'],
    intensity: '중간',
    difficulty: '중급',
    sets: 3,
    reps: 8,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
덤벨을 들고 앞으로 걸어가며 한 걸음마다 런지를 하는 운동입니다. 제자리 런지보다 균형과 다리를 바꾸는 힘이 더 필요합니다.

■ 이렇게 하세요
· 두 손에 덤벨을 들어 몸 옆에 둔 채 섭니다.
· 한 발을 크게 앞으로 내딛고, 뒷무릎이 바닥에 닿기 직전까지 내려갑니다.
· 앞발로 바닥을 밀어 일어서며 뒷발을 앞으로 가져와 다음 걸음을 내딛습니다.
· 상체를 세우고, 앞무릎이 안쪽으로 모이지 않게 합니다.
· 자리가 좁으면 제자리 리버스 런지로 대신합니다.

■ 투수에게 왜 필요한가
한 다리씩 체중을 받아 내는 힘은 내딛는 다리의 착지와 같습니다. 걸어가며 다리를 바꾸는 동안 골반과 몸통이 흔들리지 않게 버티는 힘도 기릅니다.`,
  },
  {
    title: '스케이터 스쿼트',
    referenceVideoId: '1poLHq0Zfxo',
    category: '하체 스트렝스',
    movementPattern: '런지',
    bodyParts: ['고관절', '햄스트링·둔근'],
    equipment: ['맨몸'],
    intensity: '중간',
    difficulty: '중급',
    sets: 3,
    reps: 6,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
한 다리로 서서 반대 다리를 뒤로 굽혀 든 채, 뒷무릎이 바닥에 닿을 만큼 앉았다 일어서는 한 다리 스쿼트입니다. 기구 없이 하는 한 다리 근력 운동입니다.

■ 이렇게 하세요
· 한 다리로 서서 반대 다리 무릎을 굽혀 발을 뒤로 듭니다. 균형을 위해 팔을 앞으로 뻗습니다.
· 서 있는 다리 무릎을 굽히고 엉덩이를 뒤로 보내며 천천히 내려갑니다.
· 뒷무릎이 바닥에 살짝 닿으면 서 있는 다리로 밀어 일어섭니다. 어려우면 무릎 아래에 쿠션을 높게 둡니다.
· 무릎이 안쪽으로 모이지 않게 합니다.
· 쉬워지면 두 손에 가벼운 덤벨을 듭니다.

■ 투수에게 왜 필요한가
투구와 착지는 결국 한 다리로 몸을 받는 일입니다. 기구가 없는 곳에서도 한 다리 힘과 균형을 함께 기를 수 있습니다.`,
  },
  {
    title: '글루트 햄 레이즈',
    referenceVideoId: 'Uojxz9W6khI',
    category: '하체 스트렝스',
    movementPattern: '고립',
    bodyParts: ['햄스트링·둔근'],
    equipment: ['머신'],
    intensity: '높음',
    difficulty: '상급',
    sets: 3,
    reps: 6,
    restSeconds: 120,
    perSide: false,
    description: `■ 어떤 운동인가
글루트 햄 기구(GHD)에 발목을 걸고 무릎 꿇은 자세에서, 무릎을 펴며 상체를 앞으로 내렸다가 햄스트링으로 끌어올리는 운동입니다. 노르딕 햄스트링 컬처럼 무릎을 굽히는 햄스트링 힘을 크게 씁니다.

■ 이렇게 하세요
· 패드가 허벅지 아래쪽(무릎 바로 위)에 오게 기구를 맞추고 발목을 겁니다.
· 무릎부터 머리까지 몸을 일직선으로 세우고 팔은 가슴 앞에 모읍니다.
· 엉덩이를 굽히지 않고 무릎을 펴며 상체를 천천히 앞으로 내립니다.
· 햄스트링과 엉덩이에 힘을 줘 무릎을 굽히며 처음 자세로 올라옵니다.
· 올라오기 힘들면 손으로 바닥을 밀어 돕고, 내려가는 동작만 천천히 합니다.

■ 투수에게 왜 필요한가
앞다리 햄스트링은 공을 놓는 순간 큰 힘으로 몸을 멈춥니다. 무릎을 굽히는 햄스트링 힘을 길러 햄스트링 부상을 막는 데 도움이 됩니다. 기구가 없으면 노르딕 햄스트링 컬이나 짐볼 햄스트링 컬로 대신합니다.`,
  },
  {
    title: '고블렛 박스 스쿼트',
    referenceVideoId: '1naZfu0lCiw',
    category: '하체 스트렝스',
    movementPattern: '스쿼트',
    bodyParts: ['고관절', '햄스트링·둔근', '코어'],
    equipment: ['덤벨', '박스'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 10,
    restSeconds: 90,
    perSide: false,
    description: `■ 어떤 운동인가
덤벨을 가슴 앞에 세워 들고, 뒤에 둔 박스에 앉았다 일어서는 스쿼트입니다. 박스가 깊이를 알려 줘 스쿼트를 처음 배우거나 깊이를 일정하게 익히기 좋습니다.

■ 이렇게 하세요
· 박스나 벤치를 뒤에 두고 서서, 덤벨을 세로로 들어 가슴 앞에 붙입니다. 발은 어깨너비로 섭니다.
· 가슴을 펴고 엉덩이를 뒤로 보내며 무릎을 굽혀 앉습니다.
· 엉덩이가 박스에 가볍게 닿으면 힘을 풀지 말고 바로 일어섭니다. 털썩 앉거나 반동을 쓰지 않습니다.
· 무릎은 발끝 방향을 보고, 팔꿈치는 아래를 향하게 합니다.
· 익숙해지면 박스를 낮춥니다.

■ 투수에게 왜 필요한가
다리로 바닥을 미는 힘의 바탕인 스쿼트를 안전하게 익힙니다. 성장기 선수나 웨이트를 처음 하는 선수가 깊이와 자세를 일정하게 지키며 힘을 기를 수 있습니다.`,
  },

  /* ───────────── 상체 스트렝스 ───────────── */
  {
    title: '인버티드 로우',
    referenceVideoId: '-Ew6qBgRik4',
    category: '상체 스트렝스',
    movementPattern: '당기기',
    bodyParts: ['등', '견갑', '이두', '코어'],
    equipment: ['바벨'],
    intensity: '중간',
    difficulty: '초급',
    sets: 3,
    reps: 10,
    restSeconds: 90,
    perSide: false,
    description: `■ 어떤 운동인가
랙에 건 바벨 아래에 누워 바를 잡고, 몸을 일직선으로 유지한 채 가슴을 바 쪽으로 당기는 맨몸 로우입니다. 발 위치로 난이도를 조절할 수 있어 풀업을 아직 못 하는 사람도 할 수 있습니다.

■ 이렇게 하세요
· 바벨을 허리 높이쯤 랙에 걸고, 그 아래에 누워 어깨너비보다 조금 넓게 잡습니다.
· 뒤꿈치를 바닥에 대고 머리부터 발까지 일직선을 만듭니다.
· 날개뼈를 모으고 내리며 가슴을 바 쪽으로 당깁니다. 팔꿈치는 몸에 가깝게 둡니다.
· 천천히 팔을 펴며 내려갑니다. 엉덩이가 처지지 않게 합니다.
· 쉬우면 바를 낮추거나 발을 높이고, 어려우면 바를 높이거나 무릎을 굽힙니다. 낮은 철봉에서도 할 수 있습니다.

■ 투수에게 왜 필요한가
투수는 미는 운동보다 당기는 운동을 더 해야 어깨 앞뒤 힘이 맞습니다. 날개뼈를 모으고 내리는 등 위쪽 근육을 몸무게로 기르는 기본 당기기입니다.`,
  },
  {
    title: '뉴트럴 그립 풀업',
    referenceVideoId: 'hDNy0jFYZvY',
    category: '상체 스트렝스',
    movementPattern: '당기기',
    bodyParts: ['등', '견갑', '이두', '손목·전완'],
    equipment: ['철봉'],
    intensity: '높음',
    difficulty: '중급',
    sets: 3,
    reps: 6,
    restSeconds: 120,
    perSide: false,
    description: `■ 어떤 운동인가
손바닥이 서로 마주 보게 평행 손잡이를 잡고 하는 풀업입니다. 손바닥이 앞을 보게 잡는 풀업보다 팔꿈치와 어깨가 편한 각도라 투수에게 많이 권합니다.

■ 이렇게 하세요
· 평행 손잡이를 손바닥이 마주 보게 잡고, 팔을 편 채 매달립니다.
· 먼저 날개뼈를 아래로 내려 몸을 살짝 끌어올린 뒤, 팔꿈치를 옆구리 쪽으로 당기며 턱이 손잡이 위로 갈 때까지 올라갑니다.
· 천천히 팔을 끝까지 펴며 내려옵니다.
· 몸을 흔들거나 다리를 차서 올라가지 않습니다.
· 어려우면 밴드를 걸어 도움을 받거나, 내려가는 동작만 천천히 합니다.

■ 투수에게 왜 필요한가
몸을 끌어올리는 등 근육(광배근)은 투구 마지막에 팔을 끌어내리는 데 쓰입니다. 팔꿈치와 어깨에 편한 손 방향으로 세로 당기기 힘을 기릅니다.`,
  },
  {
    title: '랜드마인 싱글암 로우',
    referenceVideoId: 'GP3EJLg89Bo',
    category: '상체 스트렝스',
    movementPattern: '당기기',
    bodyParts: ['등', '견갑', '이두', '코어'],
    equipment: ['바벨'],
    intensity: '중간',
    difficulty: '중급',
    sets: 3,
    reps: 8,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
바벨 한쪽 끝을 바닥 모서리(랜드마인)에 고정하고, 옆에 서서 반대쪽 끝을 한 손으로 당기는 로우입니다. 무겁게 당기면서 몸통이 돌아가지 않게 버팁니다.

■ 이렇게 하세요
· 바벨 끝을 몸 옆에 두고 서서, 바와 가까운 쪽 다리를 뒤로 빼 엇갈려 섭니다.
· 엉덩이를 뒤로 보내 상체를 숙이고, 반대쪽 팔꿈치를 앞 허벅지에 올려 몸을 받칩니다.
· 바 끝(또는 손잡이)을 잡고 팔꿈치를 엉덩이 쪽으로 당깁니다.
· 천천히 팔을 펴며 내립니다.
· 당길 때 상체가 돌아가거나 들리지 않게 합니다.

■ 투수에게 왜 필요한가
등 위쪽과 날개뼈 주변을 무겁게 쓰면서 몸통이 돌아가지 않게 버티는 힘을 함께 기릅니다. 한 팔씩 해서 양쪽 힘 차이도 맞출 수 있습니다.`,
  },
  {
    title: '바텀업 케틀벨 프레스',
    referenceVideoId: 'HK3L7lMUAwc',
    category: '상체 스트렝스',
    movementPattern: '밀기',
    bodyParts: ['어깨', '견갑', '손목·전완', '코어'],
    equipment: ['케틀벨'],
    intensity: '중간',
    difficulty: '중급',
    sets: 3,
    reps: 6,
    restSeconds: 90,
    perSide: true,
    description: `■ 어떤 운동인가
케틀벨을 거꾸로(바닥이 위로) 들고 머리 위로 미는 운동입니다. 케틀벨이 흔들리지 않게 손목과 어깨를 꼭 잡아야 해서, 미는 힘과 어깨 안정을 함께 기릅니다.

■ 이렇게 하세요
· 가벼운 케틀벨을 손잡이로 잡고, 바닥이 천장을 보게 거꾸로 세워 어깨 앞에 둡니다. 손목은 곧게, 팔꿈치는 몸 앞 아래를 봅니다.
· 손잡이를 세게 쥐고 배와 엉덩이에 힘을 줍니다.
· 케틀벨이 기울지 않게 천천히 머리 위로 밀어 팔을 폅니다.
· 같은 길로 천천히 내립니다.
· 흔들려 넘어가면 무게를 줄입니다. 한쪽 무릎을 꿇고 하면 허리가 덜 젖혀집니다.

■ 투수에게 왜 필요한가
던지는 어깨는 큰 힘을 내면서도 어깨 관절을 제자리에 붙잡고 있어야 합니다. 어깨를 감싸는 근육을 함께 쓰며 머리 위로 미는 힘을 안전하게 기릅니다.`,
  },
  {
    title: '클로즈그립 벤치 프레스',
    referenceVideoId: 'DzA2xZhDGeo',
    category: '상체 스트렝스',
    movementPattern: '밀기',
    bodyParts: ['삼두', '가슴', '어깨'],
    equipment: ['바벨', '벤치'],
    intensity: '높음',
    difficulty: '중급',
    sets: 3,
    reps: 8,
    restSeconds: 120,
    perSide: false,
    description: `■ 어떤 운동인가
벤치 프레스보다 손을 좁게(어깨너비 안쪽) 잡고 하는 프레스입니다. 팔꿈치를 펴는 삼두근을 많이 씁니다.

■ 이렇게 하세요
· 벤치에 누워 발을 바닥에 대고 날개뼈를 모아 내립니다.
· 바벨을 어깨너비보다 조금 좁게 잡습니다. 너무 좁게 잡으면 손목이 아픕니다.
· 팔꿈치를 옆구리 쪽으로 붙이며 바를 가슴 아래쪽으로 천천히 내립니다.
· 가슴에 닿으면 바를 밀어 올립니다.
· 엉덩이가 벤치에서 뜨지 않게 합니다.

■ 투수에게 왜 필요한가
공을 놓기 직전 팔꿈치는 아주 빠르게 펴집니다. 팔꿈치를 펴는 삼두 힘을 무게로 기르는 큰 운동입니다.`,
  },

  /* ───────────── 모빌리티 ───────────── */
  {
    title: '손목 신근 스트레치',
    referenceVideoId: '_uINTR_7X-g',
    category: '모빌리티',
    movementPattern: null,
    bodyParts: ['손목·전완', '팔꿈치'],
    equipment: ['맨몸'],
    intensity: '매우 낮음',
    difficulty: '초급',
    sets: 2,
    reps: null,
    holdSeconds: 30,
    restSeconds: 20,
    perSide: true,
    description: `■ 어떤 운동인가
팔을 앞으로 뻗고 손목을 아래로 굽혀, 손목과 손가락을 펴는 전완 바깥쪽 근육을 늘이는 스트레칭입니다.

■ 이렇게 하세요
1. 팔을 어깨 높이로 뻗고 팔꿈치를 폅니다. 손바닥은 아래를 봅니다.
2. 손목을 아래로 굽히고, 반대 손으로 손등을 몸 쪽으로 천천히 누릅니다.
3. 전완 바깥쪽이 당기는 지점에서 30초 유지합니다.
4. 주먹을 가볍게 쥐고 하면 더 늘어납니다. 팔꿈치 바깥이 찌르듯 아프거나 손이 저리면 멈춥니다.

■ 투수에게 왜 필요한가
공을 잡고 던지는 동안 손목과 손가락을 펴는 근육도 계속 일합니다. 손목 굴곡근 스트레치와 함께 해 전완 양쪽을 고르게 풉니다.`,
  },
  {
    title: '내전근 록백',
    referenceVideoId: 'uZyLZDxcD38',
    category: '모빌리티',
    movementPattern: null,
    bodyParts: ['고관절', '햄스트링·둔근'],
    equipment: ['맨몸'],
    intensity: '매우 낮음',
    difficulty: '초급',
    sets: 2,
    reps: 8,
    restSeconds: 20,
    perSide: true,
    description: `■ 어떤 운동인가
네발 자세에서 한 다리를 옆으로 곧게 뻗고, 엉덩이를 뒤꿈치 쪽으로 보냈다 돌아오는 동작입니다. 허벅지 안쪽(내전근)을 움직이며 늘입니다.

■ 이렇게 하세요
1. 네발로 엎드려 손은 어깨 아래, 무릎은 엉덩이 아래에 둡니다.
2. 한 다리를 옆으로 곧게 뻗어 발 안쪽을 바닥에 댑니다.
3. 허리를 곧게 둔 채 엉덩이를 뒤로 보내, 허벅지 안쪽이 당기는 지점까지 갑니다.
4. 1~2초 머문 뒤 처음 자세로 돌아옵니다. 허리가 둥글게 말리기 전까지만 갑니다.

■ 투수에게 왜 필요한가
투수는 넓게 내딛으며 앞다리로 착지해 허벅지 안쪽이 크게 늘어납니다. 사타구니 부상이 잦은 자리라, 내딛는 다리의 범위를 움직이며 풀어 둡니다.`,
  },
];

const titles = NEW.map((r) => r.title);
if (revert) {
  const rows = await prisma.exerciseVideo.findMany({
    where: { title: { in: titles }, source: 'REFERENCE' },
    select: {
      id: true,
      title: true,
      _count: { select: { userLogs: true, favorites: true, workoutSets: true, warmupItems: true, notes: true } },
    },
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
  fresh.push({ holdSeconds: null, ...n, source: 'REFERENCE', aspectRatio: Math.round(a.ratio * 1000) / 1000 });
}
const have = new Set(
  (await prisma.exerciseVideo.findMany({ where: { title: { in: titles } }, select: { title: true } })).map((r) => r.title)
);
const takenIds = new Set(
  (
    await prisma.exerciseVideo.findMany({
      where: { id: { in: fresh.filter((r) => r.id).map((r) => r.id) } },
      select: { id: true },
    })
  ).map((r) => r.id)
);
if (takenIds.size) throw new Error(`이미 쓰인 운동 번호: ${[...takenIds].join(', ')}`);
for (const r of fresh)
  console.log(
    `${have.has(r.title) ? '있음 · 건너뜀' : '새로'} | ${r.category} | ${r.title} | ${r.movementPattern ?? '-'} · ${r.intensity} · ${r.difficulty} · ${r.equipment.join('/')} · ${r.holdSeconds ? `${r.sets}×${r.holdSeconds}초` : `${r.sets}×${r.reps}`}${r.perSide ? ' · 한쪽' : ''} · 비율 ${r.aspectRatio}`
  );
const todo = fresh.filter((r) => !have.has(r.title));
if (!apply) console.log(`확인만 했다(${todo.length}개 넣을 것). 넣으려면 --apply`);
else {
  const now = new Date();
  const r = await prisma.exerciseVideo.createMany({ data: todo.map((x) => ({ ...x, detailsFilledAt: now })) });
  console.log(`넣음 ${r.count}개 — lib/library-cache.ts 의 library:exercises 이름을 올릴 것`);
}
await prisma.$disconnect();
