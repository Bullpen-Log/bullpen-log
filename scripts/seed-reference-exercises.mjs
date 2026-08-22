/**
 * 아직 촬영하지 못한 운동을 유튜브 참고 영상으로 미리 등록한다.
 *
 *   node --env-file=.env scripts/seed-reference-exercises.mjs <목록.json>        (미리보기)
 *   node --env-file=.env scripts/seed-reference-exercises.mjs <목록.json> --yes  (실제 저장)
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
 * 이미 같은 이름의 운동이 있으면 건너뛴다. 두 번 돌려도 중복이 생기지 않는다.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const listPath = process.argv[2];
const apply = process.argv.includes('--yes');

if (!listPath) {
  console.error('사용법: node --env-file=.env scripts/seed-reference-exercises.mjs <목록.json> [--yes]');
  process.exit(1);
}

/** 촬영 리스트의 도구 표기 → 사이트에서 쓰는 도구 이름 */
const TOOL_MAP = {
  맨몸: ['맨몸'],
  밴드: ['밴드'],
  폼롤러: ['폼롤러'],
  TRX: ['TRX'],
  원판: ['원판'],
  막대: ['맨몸'], // 막대(다웰)는 목록에 없어 맨몸으로 두고 설명에 적는다
  '막대+벤치': ['벤치'],
  스트랩: ['밴드'],
  경사판: ['맨몸'],
};

function toEquipment(tool) {
  return TOOL_MAP[tool] ?? ['맨몸'];
}

const rows = JSON.parse(readFileSync(listPath, 'utf8'));
const details = JSON.parse(
  readFileSync(new URL('./reference-details.json', import.meta.url), 'utf8')
);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const existing = new Set(
  (await prisma.exerciseVideo.findMany({ select: { title: true } })).map((e) => e.title)
);

const toCreate = [];
const skipped = [];
const missingDetail = [];

for (const r of rows) {
  if (existing.has(r.title)) {
    skipped.push(r.title);
    continue;
  }
  const d = details[r.title];
  if (!d) {
    missingDetail.push(r.title);
    continue;
  }
  if (!r.videoId) {
    missingDetail.push(`${r.title} (영상 ID 없음)`);
    continue;
  }
  toCreate.push({
    title: r.title,
    category: '모빌리티',
    description: d.description,
    bodyParts: d.bodyParts,
    intensity: d.intensity,
    difficulty: d.difficulty,
    equipment: d.equipment ?? toEquipment(r.tool),
    source: 'REFERENCE',
    referenceVideoId: r.videoId,
    videoPath: null,
    thumbPath: null,
    detailsFilledAt: new Date(),
  });
}

console.log(`등록할 것 ${toCreate.length}개`);
if (skipped.length) console.log(`이미 있어 건너뜀 ${skipped.length}개: ${skipped.join(', ')}`);
if (missingDetail.length) {
  console.log(`\n⚠ 설명이 준비되지 않아 뺀 것 ${missingDetail.length}개:`);
  for (const t of missingDetail) console.log(`   - ${t}`);
}

if (!apply) {
  console.log('\n미리보기입니다. 실제로 저장하려면 --yes 를 붙여 다시 실행하세요.');
  await prisma.$disconnect();
  process.exit(0);
}

let done = 0;
for (const data of toCreate) {
  await prisma.exerciseVideo.create({ data });
  done++;
}
console.log(`\n${done}개 등록 완료.`);
await prisma.$disconnect();
