/**
 * 운동을 참고 영상(공개 유튜브)으로 더한다 — 트레이닝의 어느 카테고리든.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/add-reference-exercises.mts scripts/exercises-2026-09-27.json
 *     (무엇이 들어가는지 보기만 — 끝에 --yes 를 붙이면 실제로 저장)
 *
 * scripts/add-armcare-reference.mts 와 같은 방식이다. 그쪽은 암케어만 받아서, 유산소처럼
 * 다른 카테고리를 넣을 수 있게 넓혔다. 값은 인자로 준 JSON 에 있다(줄마다 category 가 있다).
 *
 * 2026-09-27 — 운동 빈칸 점검에서 사용자분이 고른 둘: 유산소(0개였다 — 회복날 · 컨디셔닝
 * 날의 유산소 칸이 비어서 나왔다)와 손가락 굽힘 암케어(얕은 · 깊은 손가락 굴곡근이 주 근육인
 * 운동이 하나뿐이었다). 설명은 운동 이름과 일반 지식, 조사한 연구로 새로 썼다.
 *
 * 지키는 것(암케어 스크립트와 같다):
 * - 목록의 카테고리 · 부위 · 근육 · 장비 · 강도 · 난이도 이름은 앱의 목록 안에 있어야 한다.
 *   하나라도 어긋나면 아무것도 저장하지 않고 멈춘다.
 * - 설명은 '■ 어떤 운동인가'로 시작하고 '■ 이렇게 하세요'가 있어야 한다. 부상을 막는다고
 *   약속하는 말은 받지 않는다.
 * - 비공개 · 일부 공개 영상, 다른 사이트에서 틀 수 없는 영상은 넣지 않는다.
 * - 이미 같은 이름이 있으면 건너뛴다 — 두 번 돌려도 중복이 생기지 않는다.
 *
 * DB 를 바꾸는 작업이니 저장하기 전에 npm run backup 부터 한다. 저장한 뒤 화면에
 * 보이려면 운동 목록 캐시 이름을 바꾼다(lib/library-cache.ts).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';
import {
  BODY_PARTS,
  DIFFICULTY_LEVELS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
  MOVEMENT_PATTERNS,
} from '../lib/exercise-meta.ts';
import { ARMCARE_CATEGORY, ARMCARE_MUSCLE_NAMES } from '../lib/armcare/anatomy.ts';
import { TRAINING_CATEGORY_NAMES } from '../lib/categories.ts';

type Row = {
  title: string;
  category: string;
  videoId: string;
  bodyParts: string[];
  /** 암케어만 — 맨 앞이 가장 크게 쓰는 근육 */
  targetMuscles?: string[];
  movementPattern?: string | null;
  intensity: string;
  difficulty: string;
  equipment: string[];
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  perSide: boolean;
  description: string;
};

const INTENSITIES: readonly string[] = INTENSITY_LEVELS.map((l) => l.name);
const DIFFICULTIES: readonly string[] = DIFFICULTY_LEVELS.map((l) => l.name);
const PATTERNS: readonly string[] = MOVEMENT_PATTERNS.map((p) => p.name);
const PARTS: readonly string[] = BODY_PARTS;
const EQUIPMENT: readonly string[] = EXERCISE_EQUIPMENT;
/* 부상을 막는다고 약속하지 않는다 — 자체 시험이 자세히 보기 글에 거는 것과 같은 규칙 */
const PROMISE = /(부상|손상|통증)을 (막|예방)|예방합니다|예방해 줍니다|예방할 수 있/;

const file = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!file) {
  console.log('넣을 JSON 경로를 주세요 — 예: scripts/exercises-2026-09-27.json');
  process.exit(1);
}
const apply = process.argv.includes('--yes');
const rows: Row[] = JSON.parse(readFileSync(resolve(file), 'utf8'));

/* 1) 이름이 앱의 목록 안에 있는가 — 하나라도 어긋나면 멈춘다 */
const problems: string[] = [];
for (const r of rows) {
  const bad = (what: string, v: unknown) => problems.push(`${r.title}: ${what} '${v}'`);
  if (!TRAINING_CATEGORY_NAMES.includes(r.category) || r.category === '워밍업')
    bad('카테고리', r.category);
  if (!/^[A-Za-z0-9_-]{11}$/.test(r.videoId)) bad('영상 ID', r.videoId);
  if (r.bodyParts.length === 0) bad('부위', '비어 있음');
  for (const p of r.bodyParts) if (!PARTS.includes(p)) bad('부위', p);
  const muscles = r.targetMuscles ?? [];
  if (r.category === ARMCARE_CATEGORY) {
    if (muscles.length === 0) bad('근육', '암케어는 근육이 있어야 함');
    for (const m of muscles) if (!ARMCARE_MUSCLE_NAMES.includes(m)) bad('근육', m);
  } else if (muscles.length > 0) {
    bad('근육', '암케어가 아니면 비워 둠');
  }
  if (r.movementPattern != null && !PATTERNS.includes(r.movementPattern))
    bad('동작 패턴', r.movementPattern);
  for (const q of r.equipment) if (!EQUIPMENT.includes(q)) bad('장비', q);
  if (r.equipment.length === 0) bad('장비', '비어 있음');
  if (!INTENSITIES.includes(r.intensity)) bad('강도', r.intensity);
  if (!DIFFICULTIES.includes(r.difficulty)) bad('난이도', r.difficulty);
  if ((r.reps == null) === (r.holdSeconds == null)) bad('횟수·버티기', '둘 중 하나만');
  /* 유산소는 시간으로 적는다 — '1세트 × 600초'가 화면에 '10분'으로 나간다 */
  if (r.category === '유산소' && (r.holdSeconds == null || r.holdSeconds < 60))
    bad('유산소 시간', r.holdSeconds);
  if (!r.description.startsWith('■ 어떤 운동인가') || !r.description.includes('■ 이렇게 하세요'))
    bad('설명', '형식');
  if (PROMISE.test(r.description)) bad('설명', '부상을 막는다는 약속');
}
if (problems.length) {
  console.log('목록에 없는 값이 있어 멈춥니다 —');
  for (const p of problems) console.log(`  ${p}`);
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const existing = new Set(
  (await prisma.exerciseVideo.findMany({ select: { title: true } })).map((e) => e.title)
);

/* 2) 이미 있는 이름은 건너뛰고, 영상은 비율과 재생 가능 여부를 잰다 */
const todo: (Row & { aspectRatio: number })[] = [];
const skipped: string[] = [];
const blocked: string[] = [];
for (const r of rows) {
  if (existing.has(r.title)) {
    skipped.push(r.title);
    continue;
  }
  const got = await probeAspect(r.videoId);
  if (!got || !got.embeddable) {
    blocked.push(`${r.title} (${r.videoId})`);
    continue;
  }
  todo.push({ ...r, aspectRatio: got.ratio });
  await new Promise((res) => setTimeout(res, 300));
}

console.log(`넣을 것 ${todo.length}개 · 이미 있어 건너뜀 ${skipped.length}개`);
if (blocked.length) {
  console.log(`  ⚠ 못 틀거나 막힌 영상이라 뺀 것 ${blocked.length}개:`);
  for (const b of blocked) console.log(`     - ${b}`);
}
for (const t of todo) {
  const what = t.targetMuscles?.length ? t.targetMuscles.join('·') : t.bodyParts.join('·');
  console.log(
    `  [${t.category}] ${t.title} │ ${what} │ ${t.intensity} │ ${t.equipment.join('·')} │ ${t.aspectRatio < 0.95 ? '세로' : '가로'}`
  );
}

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
} else {
  for (const t of todo) {
    await prisma.exerciseVideo.create({
      data: {
        title: t.title,
        category: t.category,
        description: t.description,
        source: 'REFERENCE',
        referenceVideoId: t.videoId,
        videoPath: null,
        thumbPath: null,
        aspectRatio: t.aspectRatio,
        bodyParts: t.bodyParts,
        targetMuscles: t.targetMuscles ?? [],
        movementPattern: t.movementPattern ?? null,
        intensity: t.intensity,
        difficulty: t.difficulty,
        equipment: t.equipment,
        sets: t.sets,
        reps: t.reps,
        holdSeconds: t.holdSeconds,
        restSeconds: t.restSeconds,
        perSide: t.perSide,
        detailsFilledAt: new Date(),
      },
    });
  }
  console.log(`\n${todo.length}개를 저장했습니다.`);
}

await prisma.$disconnect();
