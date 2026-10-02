/**
 * 운동 라이브러리 고침 — 2026-10-02 김민(사용자) 결정. 2026-10-01 검토(442개 영상 · 설명 · 장비 대조)에서 나온 것.
 *
 * 1. 랙 — 바벨을 어깨 · 등에 얹거나 누워서 미는 운동은 랙이 있어야 시작할 수 있다. 장비 목록에는 랙이 없고,
 *    사용자 결정은 "바벨이 있으면 랙도 있다"로 보고 설명에 한 줄만 넣는 것이다(장비 표시는 그대로).
 *    핀 스플릿 스쿼트는 이미 랙 안전바를 말해서 그대로 둔다.
 * 2. 설명을 영상에 맞게 — 검토에서 설명이 영상과 다른 동작을 말한 운동들(제목만 보고 쓴 설명이 많았다).
 *    고친 값은 같은 이름의 .json 에 있다: 운동마다 새 설명 · 바뀌는 칸만, 그리고 고치기 전 설명의 지문(beforeHash).
 *    지금 설명이 그 지문과 다르면(누가 그사이 고쳤으면) 덮어쓰지 않고 멈춘다.
 *    사용자 결정: 철봉 · 박스 · 벤치 표시는 붙이지도 빼지도 않는다 — 밴드를 높이 걸어야 하면 설명에 '철봉 · 문 위 고정 고리 등'.
 *
 * 쓰는 법: node --env-file=.env scripts/library-fixes-2026-10-02.mjs        (바꿀 것만 보여 줌)
 *          node --env-file=.env scripts/library-fixes-2026-10-02.mjs --apply
 * 여러 번 돌려도 같다(이미 바뀐 것은 건너뛴다). 바꾼 뒤에는 lib/library-cache.ts 의 캐시 이름을 올린다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** [운동 이름, 옛 글, 새 글] — 옛 글을 새 글로 한 번 바꾼다 */
const DESCRIPTION = [
  [
    '벤치프레스',
    '■ 이렇게 하세요\n· 어깨뼈를',
    '■ 이렇게 하세요\n· 바를 걸어 두는 랙이 있는 벤치에서 하세요. 랙에서 바를 꺼내 시작하고, 세트가 끝나면 다시 거세요.\n· 어깨뼈를',
  ],
  [
    '인클라인 벤치프레스',
    '■ 이렇게 하세요\n· 어깨뼈를',
    '■ 이렇게 하세요\n· 바를 걸어 두는 랙이 있는 경사 벤치에서 하세요. 랙에서 바를 꺼내 시작하고, 세트가 끝나면 다시 거세요.\n· 어깨뼈를',
  ],
  [
    '밀리터리 프레스',
    '■ 이렇게 하세요\n· 어깨가',
    '■ 이렇게 하세요\n· 랙에 바를 어깨 높이로 걸어 두고, 거기서 꺼내 시작하세요.\n· 어깨가',
  ],
  [
    '바벨 스쿼트',
    '■ 이렇게 하세요\n· 발은',
    '■ 이렇게 하세요\n· 랙에 바를 어깨 높이로 걸고, 바 아래로 들어가 등 위쪽에 얹은 뒤 한두 걸음 물러나 시작하세요. 세트가 끝나면 랙에 다시 거세요.\n· 발은',
  ],
  [
    '바벨 프론트 스쿼트',
    '1. 바벨을 어깨 앞 쇄골 위에 얹고 팔꿈치를 높이 듭니다.',
    '1. 랙에 어깨 높이로 걸어 둔 바벨을 어깨 앞 쇄골 위에 얹고 팔꿈치를 높이 듭니다. 한두 걸음 물러나 시작하고, 세트가 끝나면 랙에 다시 겁니다.',
  ],
  [
    '박스 스쿼트',
    '■ 이렇게 하세요\n· 박스에',
    '■ 이렇게 하세요\n· 랙에 어깨 높이로 걸어 둔 바벨을 등 위쪽에 얹고, 뒤에 박스를 둔 채 시작하세요.\n· 박스에',
  ],
];

/** 영상에 맞춘 설명 — 같은 이름의 .json. 칸이 있으면 그 값으로 바꾼다(movementPattern 은 null 도 뜻이 있다). */
const REWRITE = JSON.parse(
  readFileSync(new URL('./library-fixes-2026-10-02.json', import.meta.url), 'utf8')
);
const FIELDS = [
  'description',
  'equipment',
  'perSide',
  'sets',
  'reps',
  'holdSeconds',
  'restSeconds',
  'category',
  'movementPattern',
  'bodyParts',
  'targetMuscles',
];
const hash = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);

const rows = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  select: { id: true, title: true, description: true },
});
const byTitle = (title) => {
  const found = rows.filter((r) => r.title === title);
  if (found.length > 1) throw new Error(`같은 이름이 둘 이상: ${title}`);
  return found[0] ?? null;
};

const ops = [];
const log = [];

for (const [title, before, after] of DESCRIPTION) {
  const r = byTitle(title);
  if (!r) throw new Error(`없는 운동: ${title}`);
  if (r.description.includes(after)) continue;
  if (!r.description.includes(before))
    throw new Error(`설명에 고칠 글이 없음: ${title} — ${before}`);
  log.push(`설명  ${title}: ${after.split('\n').find((l) => l.includes('랙'))}`);
  ops.push(
    prisma.exerciseVideo.update({
      where: { id: r.id },
      data: { description: r.description.replace(before, after) },
    })
  );
}

for (const fix of REWRITE) {
  const r = rows.find((x) => x.id === fix.id);
  if (!r) throw new Error(`없는 운동: ${fix.title}`);
  const done =
    r.description === fix.description && r.title === (fix.newTitle ?? fix.title);
  if (done) continue;
  if (r.title !== fix.title || hash(r.description) !== fix.beforeHash)
    throw new Error(`그사이 바뀐 운동이라 건너뛰지 않고 멈춤: ${fix.title}`);
  const data = {};
  for (const k of FIELDS) if (k in fix) data[k] = fix[k];
  if (fix.newTitle) {
    if (rows.some((x) => x.title === fix.newTitle))
      throw new Error(`같은 이름이 이미 있음: ${fix.newTitle}`);
    data.title = fix.newTitle;
  }
  const extra = Object.keys(data).filter((k) => k !== 'description');
  log.push(`영상  ${fix.title}${extra.length ? ` (+ ${extra.join(', ')})` : ''}`);
  ops.push(prisma.exerciseVideo.update({ where: { id: r.id }, data }));
}

console.log(log.length ? log.join('\n') : '바꿀 것 없음');
if (APPLY && ops.length) {
  await prisma.$transaction(ops);
  console.log(`\n${ops.length}건 적용`);
} else if (ops.length) {
  console.log(`\n(미리 보기 — 적용하려면 --apply)`);
}
await prisma.$disconnect();
