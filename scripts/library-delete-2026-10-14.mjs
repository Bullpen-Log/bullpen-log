/**
 * 트레이닝 운동 14개 지우기(2026-10-14 사용자: "트레이닝 파트에서 이것들 전부 삭제해줘. 운동영상과 촬영목록에서도").
 *
 * 모두 참고 영상(유튜브)뿐이라 저장소 파일이 없고, 기록 · 즐겨찾기 · 메모 · 루틴 · 세트 · 촬영 체크가 0 이다(지우기 전에 다시 본다 —
 * 하나라도 있으면 아무것도 안 지운다). 촬영 계획(lib/shoot/plan-data.json · refs.json)에서는 같은 커밋이 뺀다. 백업 db-2026-10-14-12-55.
 *
 *   node --env-file=.env scripts/library-delete-2026-10-14.mjs          # 확인만
 *   node --env-file=.env scripts/library-delete-2026-10-14.mjs --apply  # 지우기
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const TARGETS = {
  '74c08d10-2e93-43a5-a3ae-7c5efac87836': '싱글렉 덤벨 데드스톱 RDL (반대손)',
  '507419d4-04f7-4a0e-a022-5f87c23ef466': '슬랜트보드 발목 모빌리티',
  'c03cff8b-18e8-4c99-87ec-99862e5e0aeb': '하프닐링 밴드 발목 디스트랙션',
  '80eaf219-1024-45a8-98db-4a000c3fd187': '원판 고블렛 스쿼트 프라잉',
  'f5d0cb68-ba70-478c-ab25-0caf4c820f72': '수파인 밴드 힙 디스트랙션',
  '8a3701dd-f2ba-4611-9d65-ba7f6755bbe6': '90/90 페일즈·레일즈',
  'a9cf168e-e9ba-43d6-bc0b-6eaadd7961d5': '쿼드 힙 플렉서 스트레치',
  'd8f969a0-0b0c-4e76-ba28-44575f2f0146': '워터백 레터럴 홉 + 사이드 벤드',
  'e4a5f53e-5928-4d61-ab83-b10e65f85c0c': '워터백 레터럴 홉 스틱 랜딩',
  '5c56ea67-b528-428f-9bb0-be3adcb193a0': '사이드라잉 내회전',
  '0971a658-cd8d-4eab-8e0b-75869c1c7359': '덤벨 컬 에센트릭 오버로드',
  'e28e70a7-6c56-4588-b8ed-024efda80343': '튜빙 리스트 익스텐션 (두꺼운 그립)',
  'adc6d6ca-c92d-459d-8edd-cb03b2548052': '튜빙 전완 프로네이션 (두꺼운 그립)',
  '446d336a-9477-490d-abdc-9f9ae1f8a453': '튜빙 전완 수피네이션 (두꺼운 그립)',
};
const ids = Object.keys(TARGETS);
const apply = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const rows = await prisma.exerciseVideo.findMany({
  where: { id: { in: ids } },
  select: {
    id: true,
    title: true,
    videoPath: true,
    thumbPath: true,
    _count: {
      select: { userLogs: true, favorites: true, notes: true, warmupItems: true, workoutSets: true },
    },
  },
});
const checks = await prisma.shootCheck.count({ where: { exerciseId: { in: ids } } });
const problems = [];
for (const id of ids) {
  const r = rows.find((x) => x.id === id);
  if (!r) {
    console.log(`이미 없음 · ${TARGETS[id]}`);
    continue;
  }
  const used = Object.values(r._count).reduce((a, b) => a + b, 0);
  if (r.title !== TARGETS[id]) problems.push(`이름이 다름: ${r.title} ≠ ${TARGETS[id]}`);
  if (used) problems.push(`쓰는 곳 있음: ${r.title} ${JSON.stringify(r._count)}`);
  if (r.videoPath || r.thumbPath) problems.push(`저장소 파일 있음: ${r.title}`);
  console.log(`${used ? '✗' : '✓'} ${r.title}`);
}
if (checks) problems.push(`촬영 체크 ${checks}줄`);
if (problems.length) {
  console.log('\n멈춤 — 아무것도 안 지웠다:\n' + problems.join('\n'));
  process.exit(1);
}
if (!apply) {
  console.log(`\n지울 것 ${rows.length}개. --apply 로 지운다.`);
} else {
  const { count } = await prisma.exerciseVideo.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
  console.log(`\n지움 ${count}개.`);
}
await prisma.$disconnect();
