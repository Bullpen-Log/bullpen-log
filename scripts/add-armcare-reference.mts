/**
 * 암케어 운동을 참고 영상(공개 유튜브)으로 더한다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/add-armcare-reference.mts
 *     (무엇이 들어가는지 보기만 — 끝에 --yes 를 붙이면 실제로 저장)
 *
 * 값은 scripts/armcare-reference.json 에 있다. 2026-09-25 사용자분이 고른 운동
 * (등척성 밀기 · 리바운드 · 드롭 캐치 · 과부하 내리기 같은 훈련 방식 포함)을,
 * 같은 동작을 보여 주는 공개 유튜브 영상으로 걸었다. 설명은 운동 이름과 일반 지식으로
 * 새로 썼다. 2026-09-26 근육 넷(전면 삼각근·대흉근·상부 승모근·손가락 신전근)을 목록에
 * 더하면서, 전용 운동이 없던 근육에 맞는 넷을 뒤에 더했다(고무줄 손가락 펴기 · 싱글암
 * 덤벨 오버헤드 슈러그 · 푸쉬업 플러스 · 밴드 프론트 레이즈 — 사용자분 요청). 비공개·일부 공개 영상은 쓰지 않는다 — 우리 앱은 누구나 가입하고
 * 저장소도 공개라, 그런 영상을 걸면 볼 수 없어야 할 사람에게 퍼진다.
 *
 * 어깨·팔꿈치·이두·삼두(와 거기 딸린 견갑·전완)만 쓰는 운동만 받는다. 목록의
 * 부위·근육·장비·강도 이름은 앱의 목록 안에 있어야 하고, 하나라도 어긋나면 아무것도
 * 저장하지 않고 멈춘다.
 *
 * 영상마다 비율과 '다른 사이트에서 틀 수 있는가'를 재서 넣는다(youtube-aspect.mjs).
 * 막힌 영상은 넣지 않는다 — 우리 화면에서 안 틀어진다.
 *
 * 이미 같은 이름이 있으면 건너뛴다. 두 번 돌려도 중복이 생기지 않는다.
 * DB 를 바꾸는 작업이니 저장하기 전에 npm run backup 부터 한다. 저장한 뒤 화면에
 * 보이려면 운동 목록 캐시가 비워져야 한다(lib/library-cache.ts).
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';
import {
  DIFFICULTY_LEVELS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
} from '../lib/exercise-meta.ts';
import { ARMCARE_MUSCLE_NAMES } from '../lib/armcare/anatomy.ts';

type Row = {
  title: string;
  videoId: string;
  bodyParts: string[];
  targetMuscles: string[];
  intensity: string;
  difficulty: string;
  equipment: string[];
  sets: number;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number;
  perSide: boolean;
  description: string;
};

/** 이번에 받는 부위 — 어깨·팔꿈치·이두·삼두와 거기 딸린 견갑·전완 */
const ALLOWED_PARTS = ['어깨', '견갑', '이두', '삼두', '팔꿈치', '손목·전완'];
const INTENSITIES: readonly string[] = INTENSITY_LEVELS.map((l) => l.name);
const DIFFICULTIES: readonly string[] = DIFFICULTY_LEVELS.map((l) => l.name);
const EQUIPMENT: readonly string[] = EXERCISE_EQUIPMENT;

const apply = process.argv.includes('--yes');
const rows: Row[] = JSON.parse(
  readFileSync(new URL('./armcare-reference.json', import.meta.url), 'utf8')
);

/* 1) 이름이 앱의 목록 안에 있는가 — 하나라도 어긋나면 멈춘다 */
const problems: string[] = [];
for (const r of rows) {
  const bad = (what: string, v: string) => problems.push(`${r.title}: ${what} '${v}'`);
  if (!/^[A-Za-z0-9_-]{11}$/.test(r.videoId)) bad('영상 ID', r.videoId);
  for (const p of r.bodyParts) if (!ALLOWED_PARTS.includes(p)) bad('부위', p);
  for (const m of r.targetMuscles)
    if (!ARMCARE_MUSCLE_NAMES.includes(m)) bad('근육', m);
  for (const q of r.equipment) if (!EQUIPMENT.includes(q)) bad('장비', q);
  if (!INTENSITIES.includes(r.intensity)) bad('강도', r.intensity);
  if (!DIFFICULTIES.includes(r.difficulty)) bad('난이도', r.difficulty);
  if ((r.reps == null) === (r.holdSeconds == null)) bad('횟수·버티기', '둘 중 하나만');
  if (!r.description.startsWith('■ 어떤 운동인가')) bad('설명', '형식');
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
  await new Promise((res) => setTimeout(res, 250));
}

console.log(`[암케어] 넣을 것 ${todo.length}개 · 이미 있어 건너뜀 ${skipped.length}개`);
if (blocked.length) {
  console.log(`  ⚠ 못 틀거나 막힌 영상이라 뺀 것 ${blocked.length}개:`);
  for (const b of blocked) console.log(`     - ${b}`);
}
for (const t of todo) {
  console.log(
    `  ${t.title} │ ${t.targetMuscles.join('·')} │ ${t.intensity} │ ${t.aspectRatio < 0.95 ? '세로' : '가로'}`
  );
}

if (!apply) {
  console.log('\n미리보기입니다. 저장하려면 --yes 를 붙이세요.');
} else {
  for (const t of todo) {
    await prisma.exerciseVideo.create({
      data: {
        title: t.title,
        category: '암케어',
        description: t.description,
        source: 'REFERENCE',
        referenceVideoId: t.videoId,
        videoPath: null,
        thumbPath: null,
        aspectRatio: t.aspectRatio,
        bodyParts: t.bodyParts,
        targetMuscles: t.targetMuscles,
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
