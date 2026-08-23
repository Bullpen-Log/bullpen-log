/**
 * 종아리·발목 운동의 목표 부위를 바로잡는다.
 *
 *   node --env-file=.env scripts/fix-calf-ankle-parts.mjs        (미리보기)
 *   node --env-file=.env scripts/fix-calf-ankle-parts.mjs --yes  (실제 저장)
 *
 * 부위 목록에 '종아리·발목'이 없던 시절에는 카프 레이즈와 발목 운동을 모두
 * '고관절'로 넣어 두었다. 이제 항목이 생겼으므로 제자리로 옮긴다.
 *
 * 운동마다 성격이 달라 일괄 치환하지 않고 하나씩 적는다. 예를 들어 포고 홉은
 * 발목의 탄성이 주인공이지만 엉덩이도 함께 쓰고, 카프 레이즈는 종아리만 쓴다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { BODY_PARTS } from '../lib/exercise-meta.ts';

const apply = process.argv.includes('--yes');

/** 제목 → 바꿀 목표 부위 */
const PARTS = {
  // 종아리만 쓰는 것
  '양발 카프 레이즈': ['종아리·발목'],
  '싱글렉 카프 레이즈': ['종아리·발목'],
  '덤벨 싱글렉 카프 레이즈': ['종아리·발목'],
  '디피싯 싱글렉 카프 레이즈': ['종아리·발목'],
  '디피싯 덤벨 싱글렉 카프 레이즈': ['종아리·발목'],
  '업2 다운1 카프 레이즈': ['종아리·발목'],

  // 발목 가동성·회복
  '시티드 앵클 CAR': ['종아리·발목'],
  '하프닐링 밴드 발목 디스트랙션': ['종아리·발목'],
  '슬랜트보드 발목 모빌리티': ['종아리·발목'],
  '스쿼트 로커 발목 모빌리티': ['종아리·발목'],
  '누워서 밴드 종아리 오실레이션': ['종아리·발목'],
  '폼롤러 종아리': ['종아리·발목'],
  'LAX 족저근막 롤링': ['종아리·발목'],
  '시티드 발목 내·외번 (메디신볼)': ['종아리·발목'],

  // 발목 안정성 — 균형을 잡느라 엉덩이도 함께 쓴다
  '덤벨 발목 안정성 교대': ['종아리·발목', '고관절'],
  '불안정 발목 안정성 교대': ['종아리·발목', '고관절'],
  '불안정 빠른 발목 안정성 교대': ['종아리·발목', '고관절'],
  '덤벨 발목 안정성 스쿼트': ['종아리·발목', '고관절', '햄스트링·둔근'],
  '불안정 발목 안정성 스쿼트': ['종아리·발목', '고관절', '햄스트링·둔근'],

  // 발목의 탄성이 주인공이지만 하체 전체가 함께 일하는 것
  '로우 포고 홉': ['종아리·발목', '고관절'],
  '싱글렉 로우 포고 홉': ['종아리·발목', '고관절'],
  '밴드 보조 포고': ['종아리·발목', '고관절'],
  '가속 버티기(발목 강성)': ['종아리·발목', '고관절', '햄스트링·둔근'],
  '발목 불안정 스냅다운': ['종아리·발목', '고관절', '햄스트링·둔근', '코어'],
};

// 적어 둔 부위 이름이 실제 목록에 있는지 먼저 확인한다. 오타가 있으면 조용히 어긋난다.
const allowed = new Set(BODY_PARTS);
for (const [title, parts] of Object.entries(PARTS)) {
  const wrong = parts.filter((p) => !allowed.has(p));
  if (wrong.length) {
    console.error(`목록에 없는 부위 이름: ${title} → ${wrong.join(', ')}`);
    process.exit(1);
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const updates = [];
const notFound = [];

for (const [title, parts] of Object.entries(PARTS)) {
  const row = await prisma.exerciseVideo.findFirst({
    where: { title },
    select: { id: true, title: true, bodyParts: true },
  });
  if (!row) { notFound.push(title); continue; }
  const same =
    row.bodyParts.length === parts.length &&
    row.bodyParts.every((p, i) => p === parts[i]);
  if (same) continue;
  updates.push({ id: row.id, title, before: row.bodyParts, after: parts });
}

console.log(`바꿀 것 ${updates.length}개`);
for (const u of updates) {
  console.log(`  ${u.title.padEnd(32)} ${u.before.join(',')} → ${u.after.join(',')}`);
}
if (notFound.length) console.log(`⚠ 못 찾음: ${notFound.join(', ')}`);

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
  await prisma.$disconnect();
  process.exit(0);
}

for (const u of updates) {
  await prisma.exerciseVideo.update({
    where: { id: u.id },
    data: { bodyParts: u.after },
  });
}
console.log(`\n${updates.length}개 저장 완료.`);
await prisma.$disconnect();
