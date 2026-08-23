/**
 * 아직 촬영하지 못한 운동·드릴을 유튜브 참고 영상으로 미리 등록한다.
 *
 *   node --env-file=.env scripts/seed-reference-exercises.mjs <목록.json> <설명.json> <카테고리> [--drill] [--yes]
 *
 * 예)
 *   … scripts/mobility-list.json scripts/details-01-mobility.json "모빌리티"
 *   … scripts/lists/08.json scripts/details-08-medball.json "메디신볼 드릴" --drill
 *
 * ── 왜 이렇게 하나 ──
 *
 * AI 트레이닝이 제대로 도는지 보려면 운동이 골고루 있어야 한다. 그런데 촬영은
 * 오래 걸리므로, 먼저 이름·설명·강도·부위·도구만 채워 두고 영상 자리에는
 * 참고할 유튜브 영상을 걸어 둔다. 나중에 직접 찍은 영상을 올리면 source 가
 * OWN 으로 바뀌고 나머지 내용은 그대로 남는다.
 *
 * 영상과 미리보기 이미지를 우리 저장소로 가져오지 않는다. 유튜브가 공개한
 * 주소를 가리키기만 한다. (lib/reference-video.ts 참고)
 *
 * 이미 같은 이름이 있으면 건너뛴다. 두 번 돌려도 중복이 생기지 않는다.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const [listPath, detailPath, category] = process.argv.slice(2);
const isDrill = process.argv.includes('--drill');
const apply = process.argv.includes('--yes');

if (!listPath || !detailPath || !category) {
  console.error('사용법: node --env-file=.env scripts/seed-reference-exercises.mjs <목록.json> <설명.json> <카테고리> [--drill] [--yes]');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(listPath, 'utf8'));
const details = JSON.parse(readFileSync(detailPath, 'utf8'));

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const table = isDrill ? prisma.mechanicsGuide : prisma.exerciseVideo;
const existing = new Set(
  (await table.findMany({ select: { title: true } })).map((e) => e.title)
);

const toCreate = [];
const skipped = [];
const missing = [];

for (const r of rows) {
  if (existing.has(r.title)) { skipped.push(r.title); continue; }
  const d = details[r.title];
  if (!d) { missing.push(r.title); continue; }
  if (!r.videoId) { missing.push(`${r.title} (영상 ID 없음)`); continue; }

  const common = {
    title: r.title,
    category,
    description: d.description,
    equipment: d.equipment,
    source: 'REFERENCE',
    referenceVideoId: r.videoId,
    videoPath: null,
    thumbPath: null,
  };

  toCreate.push(
    isDrill
      ? { ...common, focusPoints: d.focusPoints ?? [] }
      : {
          ...common,
          bodyParts: d.bodyParts,
          intensity: d.intensity,
          difficulty: d.difficulty,
          detailsFilledAt: new Date(),
        }
  );
}

console.log(`[${category}] 등록할 것 ${toCreate.length}개`);
if (skipped.length) console.log(`  이미 있어 건너뜀 ${skipped.length}개`);
if (missing.length) {
  console.log(`  ⚠ 설명이 없어 뺀 것 ${missing.length}개:`);
  for (const t of missing) console.log(`     - ${t}`);
}

if (!apply) {
  console.log('  미리보기입니다. 저장하려면 --yes 를 붙이세요.');
  await prisma.$disconnect();
  process.exit(0);
}

let done = 0;
for (const data of toCreate) {
  await table.create({ data });
  done++;
}
console.log(`  ${done}개 등록 완료.`);
await prisma.$disconnect();
