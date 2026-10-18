/**
 * 운동 라이브러리 파워에 큰 메디신볼 던지기 셋을 더한다(2026-10-16 김민: "투구 드릴에 메디신볼 드릴 많으니까 큰 메디신볼 쓰는 걸로 몇 개 넣어").
 *
 * 트레이닝 50명 시뮬(docs/qa/2026-10-16-training-50.md)에서 근력 프로그램의 메디신볼 칸이 운동 둘(톨닐링 체스트 패스 · 오버헤드 스로우)만
 * 번갈아 나왔다. 그 칸은 앞 · 위로 던지기만 받는다(돌려 던지기는 회전 던지기 칸 몫). 그래서 보이는 큰 공 드릴 가운데 앞 · 위로 던지는 셋만 옮긴다 —
 * 헤비 메디신볼 힌지 토스(엉덩이를 펴며 앞으로) · 힌지 오버더톱 슬램 · 스플릿 스탠스 슬램(머리 위에서 앞 바닥으로). 나머지 큰 공 드릴은 골반 · 몸통을
 * 돌려 던져 회전 던지기 칸(이미 열 개)으로 간다.
 *
 * 같은 참고 영상 · 설명(2026-10-15 회전 던지기 여섯과 같은 방식). 드릴 이름의 'P2 ' 같은 단계 번호는 뗀다. 드릴 쪽 영상을 직접 찍어 올려도
 * 이 복사본은 따라가지 않는다 — 같이 바꿔야 한다. 같은 이름이 이미 있으면 건너뛴다. --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 올린다.
 *
 *   node --env-file=.env scripts/library-medball-big-2026-10-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-medball-big-2026-10-16.mjs --apply   # 넣기(먼저 npm run backup)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

const STAGE = {
  기초: { difficulty: '초급', intensity: '중간' },
  연결: { difficulty: '중급', intensity: '높음' },
  통합: { difficulty: '상급', intensity: '높음' },
};

/* 드릴 id 앞 8자리 → 운동으로 옮길 때의 동작 · 부위 · 한쪽씩 */
const DRILLS = {
  '0dbd7386': { movementPattern: '힌지', bodyParts: ['고관절', '햄스트링·둔근', '코어'], perSide: false },
  e7566ad4: { movementPattern: '당기기', bodyParts: ['고관절', '코어', '등'], perSide: false },
  '24650c35': { movementPattern: '당기기', bodyParts: ['코어', '등', '어깨'], perSide: true },
};

const guides = await prisma.mechanicsGuide.findMany({
  where: { OR: Object.keys(DRILLS).map((p) => ({ id: { startsWith: p } })), hiddenAt: null },
});
if (guides.length !== Object.keys(DRILLS).length)
  throw new Error(`드릴 ${guides.length}/${Object.keys(DRILLS).length}개만 찾음`);

const rows = guides.map((g) => {
  const meta = DRILLS[g.id.slice(0, 8)];
  if (!STAGE[g.stage]) throw new Error(`${g.title}: 단계가 없음`);
  return {
    title: g.title.replace(/^P\d\s+/, ''),
    category: '파워',
    description: g.description.replace('■ 왜 하나요', '■ 투수에게 왜 필요한가'),
    source: g.source,
    videoPath: g.videoPath,
    thumbPath: g.thumbPath,
    referenceVideoId: g.referenceVideoId,
    aspectRatio: g.aspectRatio,
    ...STAGE[g.stage],
    equipment: ['메디신볼'],
    sets: 3,
    reps: 5,
    restSeconds: 90,
    ...meta,
  };
});

const have = new Set(
  (await prisma.exerciseVideo.findMany({ where: { title: { in: rows.map((r) => r.title) } }, select: { title: true } })).map(
    (r) => r.title
  )
);
for (const r of rows)
  console.log(
    `${have.has(r.title) ? '있음 · 건너뜀' : '새로'} | ${r.title} | ${r.movementPattern} · ${r.intensity} · ${r.difficulty} · ${r.equipment.join('/')} · 한쪽씩 ${r.perSide} · 영상 ${r.referenceVideoId ?? r.videoPath}`
  );
const todo = rows.filter((r) => !have.has(r.title));
if (apply && todo.length > 0) {
  const now = new Date();
  const r = await prisma.exerciseVideo.createMany({ data: todo.map((x) => ({ ...x, detailsFilledAt: now })) });
  console.log(`넣음 ${r.count}개 — lib/library-cache.ts 의 library:exercises 이름을 올릴 것`);
} else if (!apply) console.log(`확인만 — 넣으려면 --apply (${todo.length}개)`);
await prisma.$disconnect();
