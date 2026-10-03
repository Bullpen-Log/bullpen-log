/**
 * 암케어 운동 검토 — 2026-10-04 김민(사용자) 결정.
 *
 * 재활 2편 설계에서 암케어 141개 · 팔 모빌리티 28개를 영상(썸네일)까지 다시 봤다. 사용자분: "톨닐링 오버헤드 던지기는
 * 암케어라 볼 수 없다 — 상체 파워에 가깝다", "고무줄 손가락 굽히기는 특수 고무줄이 있어야 한다", "목적에 맞는지 검토".
 *
 * 1. 숨기기 2 — 손가락용 고무줄이 있어야 하는 것(우리 장비의 '밴드'는 운동용 밴드). 같은 근육은 덤벨 핑거 컬 ·
 *    원판 핀치 잡기 · 데드행으로 한다. 지우지 않고 숨긴다(hiddenAt — 되돌리려면 비운다).
 * 2. 상체 스트렝스로 20 — 투수 팔 보호(회전근개 · 날개뼈 · 팔꿈치 안쪽)보다 상체 보조에 가까운 고립 운동.
 *    맞춤 암케어가 이것들을 골라 팔 보호 운동 자리를 차지했다. 숨기지 않고 옮겨 웨이트 보조로 계속 쓴다.
 *    계열은 '고립'(lib/exercise-meta.ts) — 상체날의 밀기 · 당기기 자리를 차지하지 않고 하루에 하나로 걸린다.
 *    쉬는 시간은 상체 스트렝스 작은 근육 기준 60초. 근육(targetMuscles)은 그대로 둔다(다시 옮길 때 쓰게).
 *    투수 팔꿈치에 필요한 셋(밴드 하이 이두컬 · 덤벨 해머컬 · 밴드 트라이셉스 푸쉬다운)과 버티며 내리기 · 드롭 캐치
 *    컬(팔꿈치 감속)은 암케어에 남긴다.
 * 3. 재활 참고 영상 다섯을 scripts/rehab-reference.json 에 맞춘다 — 공 운동 넷은 플라이오볼(새 장비)로 이름 · 장비 ·
 *    설명을 바꾸고 벽 드리블 · 손목 플립은 동작만 나오는 짧은 영상으로, 톨 닐링 오버헤드 던지기는 파워로.
 *
 * 쓰는 법: node --env-file=.env scripts/library-armcare-review-2026-10-04.mjs          (바꿀 것만 보여 줌)
 *          node --env-file=.env scripts/library-armcare-review-2026-10-04.mjs --apply
 * 여러 번 돌려도 같다(이미 바뀐 것은 건너뛴다). 바꾼 뒤에는 lib/library-cache.ts 의 캐시 이름을 올린다.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const HIDE = ['고무줄 손가락 굽히기', '고무줄 손가락 펴기'];

const TO_UPPER = [
  // 레이즈
  '6방향 덤벨 레터럴 레이즈',
  '교대 싱글암 덤벨 레터럴 레이즈',
  '밴드 덤벨 레터럴 레이즈',
  '하프닐링 레터럴 레이즈',
  '레터럴 레이즈 리바운드',
  '프론트 레이즈 리바운드',
  '프론트 레이즈 드롭 캐치',
  '밴드 프론트 레이즈',
  // 삼두
  '덤벨 라잉 트라이셉스 익스텐션',
  '덤벨 트라이셉스 킥백',
  '시티드 덤벨 오버헤드 익스텐션',
  '케이블 트라이셉스 오버헤드 익스텐션',
  '케이블 트라이셉스 푸쉬다운',
  '밴드 오버헤드 익스텐션',
  // 컬
  '덤벨컬',
  '인클라인 덤벨컬',
  '크로스바디 해머컬',
  '조트만 컬',
  '밴드 비하인드 이두컬',
  // 그 밖
  '덤벨 어라운드 더 월드',
];
const UPPER_REST_SECONDS = 60;

/** [옛 이름, 새 이름] — 새 값은 rehab-reference.json 에서 읽는다 */
const SYNC = [
  ['90/90 메디신볼 벽 드리블', '90/90 플라이오볼 벽 드리블'],
  ['프론 90/90 메디신볼 드롭', '프론 90/90 플라이오볼 드롭'],
  ['한 팔 90/90 메디신볼 벽 던지기', '한 팔 90/90 플라이오볼 벽 던지기'],
  ['메디신볼 손목 플립', '플라이오볼 손목 플립'],
  ['톨 닐링 메디신볼 오버헤드 던지기', '톨 닐링 메디신볼 오버헤드 던지기'],
];
const reference = JSON.parse(
  readFileSync(new URL('./rehab-reference.json', import.meta.url), 'utf8')
);

const rows = await prisma.exerciseVideo.findMany({
  select: {
    id: true,
    title: true,
    category: true,
    hiddenAt: true,
    equipment: true,
    movementPattern: true,
    restSeconds: true,
    referenceVideoId: true,
    description: true,
    bodyParts: true,
    targetMuscles: true,
    sets: true,
    reps: true,
  },
});
const byTitle = new Map(rows.map((r) => [r.title, r]));
const ops = [];
const missing = [];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('1) 숨기기');
for (const t of HIDE) {
  const r = byTitle.get(t);
  if (!r) missing.push(t);
  else if (r.hiddenAt) console.log(`  (이미) ${t}`);
  else {
    console.log(`  ${t}`);
    ops.push(
      prisma.exerciseVideo.update({
        where: { id: r.id },
        data: { hiddenAt: new Date() },
      })
    );
  }
}

console.log('2) 암케어 → 상체 스트렝스(계열 고립)');
for (const t of TO_UPPER) {
  const r = byTitle.get(t);
  if (!r) {
    missing.push(t);
    continue;
  }
  if (r.category === '상체 스트렝스' && r.movementPattern === '고립') {
    console.log(`  (이미) ${t}`);
    continue;
  }
  console.log(
    `  ${t}  (${r.category} → 상체 스트렝스, 쉬기 ${r.restSeconds} → ${UPPER_REST_SECONDS}초)`
  );
  ops.push(
    prisma.exerciseVideo.update({
      where: { id: r.id },
      data: {
        category: '상체 스트렝스',
        movementPattern: '고립',
        restSeconds: UPPER_REST_SECONDS,
      },
    })
  );
}

console.log('3) 재활 참고 영상을 rehab-reference.json 에 맞춤');
for (const [from, to] of SYNC) {
  const r = byTitle.get(to) ?? byTitle.get(from);
  const ref = reference.find((x) => x.title === to);
  if (!r || !ref) {
    missing.push(`${from} → ${to}`);
    continue;
  }
  const data = {};
  if (r.title !== ref.title) data.title = ref.title;
  if (r.category !== ref.category) data.category = ref.category;
  if ((r.movementPattern ?? null) !== (ref.movementPattern ?? null))
    data.movementPattern = ref.movementPattern ?? null;
  if (!same(r.equipment, ref.equipment)) data.equipment = ref.equipment;
  if (!same(r.bodyParts, ref.bodyParts)) data.bodyParts = ref.bodyParts;
  if (!same(r.targetMuscles, ref.targetMuscles)) data.targetMuscles = ref.targetMuscles;
  if (r.description !== ref.description) data.description = ref.description;
  if (r.sets !== ref.sets) data.sets = ref.sets;
  if ((r.reps ?? null) !== (ref.reps ?? null)) data.reps = ref.reps;
  if (r.restSeconds !== ref.restSeconds) data.restSeconds = ref.restSeconds;
  if (r.referenceVideoId !== ref.videoId) {
    const got = await probeAspect(ref.videoId);
    if (!got || !got.embeddable) {
      console.log(
        `  ⚠ ${ref.title}: 새 영상 ${ref.videoId} 을 다른 사이트에서 못 틀어 영상은 그대로`
      );
    } else {
      data.referenceVideoId = ref.videoId;
      data.aspectRatio = got.ratio;
      data.thumbPath = null;
      data.videoPath = null;
    }
  }
  const keys = Object.keys(data);
  if (keys.length === 0) {
    console.log(`  (이미) ${ref.title}`);
    continue;
  }
  console.log(
    `  ${r.title}${data.title ? ` → ${data.title}` : ''}  [${keys.join(', ')}]`
  );
  ops.push(prisma.exerciseVideo.update({ where: { id: r.id }, data }));
}

if (missing.length) {
  console.log(`\n⚠ 못 찾은 이름 ${missing.length}개 — 아무것도 바꾸지 않고 멈춥니다:`);
  for (const m of missing) console.log(`  - ${m}`);
  await prisma.$disconnect();
  process.exit(1);
}

console.log(`\n바꿀 줄 ${ops.length}개`);
if (APPLY && ops.length > 0) {
  await prisma.$transaction(ops);
  console.log('적용했습니다.');
} else if (!APPLY) {
  console.log('(미리 보기 — 적용하려면 --apply)');
}
await prisma.$disconnect();
