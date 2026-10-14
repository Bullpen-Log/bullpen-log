/**
 * 운동 7개 분류 · 도구 바꾸기(2026-10-14 사용자). 촬영 계획(lib/shoot/plan-data.json)의 이름 · 도구는 같은 커밋이 맞춘다. 백업 db-2026-10-14-13-01.
 *
 * - 분류: 프론트 레이즈 드롭 캐치 → 암케어 · 스피드 밴드 로우 → 파워 · 트랜스버스 런지 → 하체 스트렝스(계열 런지) · 덤벨 해머 컬 → 상체 스트렝스(계열 고립)
 * - 덤벨 → 케이블: 울나 디비에이션 · 래디얼 디비에이션 · 전완 프로네이션·수피네이션(이름 · 도구 · 설명). 유튜브 참고 영상은 그대로(덤벨 영상) — 새로 찍을 때 바뀐다.
 *
 *   node --env-file=.env scripts/library-edit-2026-10-14.mjs          # 확인만
 *   node --env-file=.env scripts/library-edit-2026-10-14.mjs --apply  # 바꾸기
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const EDITS = [
  { id: '23dada11-1e8b-4735-bc02-d45940e8a832', was: '프론트 레이즈 드롭 캐치', data: { category: '암케어' } },
  { id: '709dce07-9632-4fc3-843c-268649f7cfb2', was: '스피드 밴드 로우', data: { category: '파워' } },
  { id: 'dc4c785c-98cc-4b5c-96b4-e12f15c9d743', was: '트랜스버스 런지', data: { category: '하체 스트렝스', movementPattern: '런지' } },
  { id: '5fbf7e4f-28f4-472c-93e7-706377b1e5ca', was: '덤벨 해머 컬', data: { category: '상체 스트렝스', movementPattern: '고립' } },
  {
    id: '7ed34709-2841-430c-89d1-b7f6c676c167',
    was: '덤벨 울나 디비에이션',
    data: {
      title: '케이블 울나 디비에이션',
      equipment: ['케이블'],
      description: `■ 어떤 운동인가
케이블 손잡이를 잡고 손목을 새끼손가락 쪽으로 내리는 운동입니다.

■ 이렇게 하세요
1. 케이블을 높은 자리에 걸고 엄지가 위를 향하게 손잡이를 잡습니다.
2. 아래팔은 고정한 채 손목만 아래로 내립니다.
3. 천천히 돌아옵니다.
4. 무게는 아주 가볍게 시작합니다.`,
    },
  },
  {
    id: 'f70c850d-d583-474d-832d-7667a2efb843',
    was: '덤벨 래디얼 디비에이션',
    data: {
      title: '케이블 래디얼 디비에이션',
      equipment: ['케이블'],
      description: `■ 어떤 운동인가
케이블 손잡이를 잡고 손목을 엄지 쪽으로 들어 올리는 운동입니다.

■ 이렇게 하세요
1. 케이블을 낮은 자리에 걸고 엄지가 위를 향하게 손잡이를 잡습니다.
2. 아래팔은 고정한 채 손목만 위로 들어 올립니다.
3. 어깨가 함께 움직이지 않게 합니다.
4. 천천히 내려옵니다.`,
    },
  },
  {
    id: '9e9805c1-024a-4656-ba69-411d6df282e1',
    was: '덤벨 전완 프로네이션·수피네이션',
    data: {
      title: '케이블 전완 프로네이션·수피네이션',
      equipment: ['케이블'],
      description: `■ 어떤 운동인가
케이블 손잡이를 잡고 아래팔을 좌우로 돌리는 운동입니다. 손바닥이 위를 봤다 아래를 봤다 하는 회전 범위를 씁니다.

■ 이렇게 하세요
1. 케이블을 팔꿈치 높이 옆에 걸고 손잡이를 잡습니다.
2. 팔꿈치를 90도로 굽혀 옆구리에 붙입니다.
3. 손바닥이 위를 향했다가 아래를 향하도록 천천히 돌립니다.
4. 팔꿈치가 흔들리지 않게 합니다.`,
    },
  },
];
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const rows = await prisma.exerciseVideo.findMany({
  where: { id: { in: EDITS.map((e) => e.id) } },
  select: { id: true, title: true },
});
const bad = EDITS.filter((e) => rows.find((r) => r.id === e.id)?.title !== e.was);
if (bad.length) {
  console.log('멈춤 — 이름이 다름:', bad.map((e) => e.was).join(', '));
  process.exit(1);
}
for (const e of EDITS) console.log(`${e.was} → ${JSON.stringify({ ...e.data, description: e.data.description ? '(새 설명)' : undefined })}`);
if (apply) {
  await prisma.$transaction(EDITS.map((e) => prisma.exerciseVideo.update({ where: { id: e.id }, data: e.data })));
  console.log(`\n바꿈 ${EDITS.length}개.`);
} else console.log('\n--apply 로 바꾼다.');
await prisma.$disconnect();
