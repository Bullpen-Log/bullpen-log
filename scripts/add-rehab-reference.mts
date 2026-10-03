/**
 * 팔 재활에 필요한데 라이브러리에 없던 운동 · 스트레칭을 참고 영상(공개 유튜브)으로 더한다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/add-rehab-reference.mts
 *     (무엇이 들어가는지 보기만 — 끝에 --yes 를 붙이면 실제로 저장)
 *
 * 값은 scripts/rehab-reference.json 에 있다. 2026-10-03 재활 2편(병명별 단계 재활 — 어깨 충돌증후군 ·
 * 회전근개 건염 · 관절와순(SLAP) · 팔꿈치 UCL · 굴곡-회내근 · 팔꿈치 후방 충돌)을 설계하며, 투수 재활
 * 프로그램(Thrower's Ten · 단계별 재활 · 공 던지기 단계)에 흔히 들어가는데 라이브러리에 없던 것을 찾았다.
 * 사용자분: "참고 영상으로 추가 — 나중에 직접 영상을 찍어 영상만 교체".
 *
 *   암케어(14)   등척성 밀기(어깨 셋 · 팔꿈치 둘) · Thrower's Ten 의 프론 로우 + 외회전 · 시티드 프레스업 ·
 *               벽 슬라이드 · 벽 원 그리기 · 공 던지기 단계(벽 드리블 · 볼 드롭 · 한 팔 던지기 · 두 손 던지기 · 손목 플립)
 *   모빌리티(3)  슬리퍼 · 크로스바디 · 손목 굴곡근 스트레칭
 *
 * 스트레칭은 암케어가 아니라 모빌리티에 둔다 — 암케어는 강화 운동만 담는다는 사용자분 규칙(2026-09-27)이고,
 * 스트레칭은 재활 단계에서만 쓰기로 했다(2026-10-03).
 *
 * 규칙은 scripts/add-armcare-reference.mts 와 같다 — 부위 · 근육 · 장비 · 강도 이름이 앱 목록 밖이면
 * 아무것도 저장하지 않고 멈추고, 다른 사이트에서 못 트는 영상은 빼고, 같은 이름이 있으면 건너뛴다.
 * DB 를 바꾸는 작업이니 저장하기 전에 npm run backup 부터 한다. 저장한 뒤에는 lib/library-cache.ts 의
 * 캐시 이름을 올려야 화면에 보인다.
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
  category: '암케어' | '모빌리티';
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
const CATEGORIES = ['암케어', '모빌리티'];
const INTENSITIES: readonly string[] = INTENSITY_LEVELS.map((l) => l.name);
const DIFFICULTIES: readonly string[] = DIFFICULTY_LEVELS.map((l) => l.name);
const EQUIPMENT: readonly string[] = EXERCISE_EQUIPMENT;

const apply = process.argv.includes('--yes');
const rows: Row[] = JSON.parse(
  readFileSync(new URL('./rehab-reference.json', import.meta.url), 'utf8')
);

/* 1) 이름이 앱의 목록 안에 있는가 — 하나라도 어긋나면 멈춘다 */
const problems: string[] = [];
const titles = new Set<string>();
for (const r of rows) {
  const bad = (what: string, v: string) => problems.push(`${r.title}: ${what} '${v}'`);
  if (titles.has(r.title)) bad('이름', '두 번 적힘');
  titles.add(r.title);
  if (!CATEGORIES.includes(r.category)) bad('카테고리', r.category);
  if (!/^[A-Za-z0-9_-]{11}$/.test(r.videoId)) bad('영상 ID', r.videoId);
  for (const p of r.bodyParts) if (!ALLOWED_PARTS.includes(p)) bad('부위', p);
  /* 근육은 암케어 운동에만 쓴다(prisma/schema.prisma 의 targetMuscles) */
  if (r.category === '암케어' && r.targetMuscles.length === 0) bad('근육', '비어 있음');
  if (r.category !== '암케어' && r.targetMuscles.length > 0) bad('근육', '암케어만');
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

console.log(
  `[재활 참고 영상] 넣을 것 ${todo.length}개 · 이미 있어 건너뜀 ${skipped.length}개`
);
if (blocked.length) {
  console.log(`  ⚠ 못 틀거나 막힌 영상이라 뺀 것 ${blocked.length}개:`);
  for (const b of blocked) console.log(`     - ${b}`);
}
for (const t of todo) {
  console.log(
    `  ${t.category} │ ${t.title} │ ${t.equipment.join('+')} │ ${t.intensity} │ ${t.aspectRatio < 0.95 ? '세로' : '가로'}`
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
