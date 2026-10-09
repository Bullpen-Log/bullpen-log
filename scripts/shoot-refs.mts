/*
 * 촬영 계획의 유튜브 참고 영상 번호 모으기 — DB 를 읽기만 하고 lib/shoot/refs.json 을 쓴다.
 *
 *   npm run shoot:refs                (미리보기만)
 *   npm run shoot:refs -- --write     (파일에 쓰기)
 *
 * 왜: 촬영 모드에서 우리 영상을 올리면 라이브러리의 유튜브 번호(referenceVideoId)가 지워지고 영상 비율도 우리 영상 것으로
 * 바뀐다(app/actions/shoot.ts attachShootClip — 재생기가 유튜브를 먼저 보기 때문). 그러면 다시 찍을 때 모델이 볼 참고
 * 영상이 사라진다. 그래서 아직 유튜브인 지금 번호 · 비율을 저장소에 남겨 둔다. 이미 적힌 것은 지우지 않고 더하기만 한다
 * (올린 뒤 다시 돌려도 안전). 대상: 운동(ExerciseVideo) · 투구 드릴(MechanicsGuide) 가운데 유튜브 번호가 있는 것 모두.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { prisma } from '@/lib/prisma';

/** 운동 id → 유튜브 번호(yt) · 그 영상의 가로 ÷ 세로(ar, 모르면 없음) */
type Ref = { yt: string; ar?: number };

const write = process.argv.includes('--write');
const file = new URL('../lib/shoot/refs.json', import.meta.url);
const before: Record<string, Ref> = existsSync(file)
  ? JSON.parse(readFileSync(file, 'utf8'))
  : {};

const select = { id: true, referenceVideoId: true, aspectRatio: true } as const;
const [exercises, guides] = await Promise.all([
  prisma.exerciseVideo.findMany({ where: { referenceVideoId: { not: null } }, select }),
  prisma.mechanicsGuide.findMany({ where: { referenceVideoId: { not: null } }, select }),
]);
await prisma.$disconnect();

const YT = /^[\w-]{11}$/;
const next: Record<string, Ref> = { ...before };
let added = 0;
let changed = 0;
for (const row of [...exercises, ...guides]) {
  const yt = row.referenceVideoId ?? '';
  if (!YT.test(yt)) continue;
  const ref: Ref = row.aspectRatio
    ? { yt, ar: Math.round(row.aspectRatio * 1000) / 1000 }
    : { yt };
  if (!(row.id in next)) added++;
  else if (JSON.stringify(next[row.id]) !== JSON.stringify(ref)) changed++;
  next[row.id] = ref;
}
const sorted = Object.fromEntries(
  Object.entries(next).sort(([a], [b]) => a.localeCompare(b))
);
console.log(
  `운동 ${exercises.length} · 드릴 ${guides.length} → 모두 ${Object.keys(sorted).length}개(새로 ${added} · 바뀜 ${changed} · 예전 것 ${Object.keys(before).length})`
);
if (write) {
  writeFileSync(file, JSON.stringify(sorted) + '\n');
  console.log('lib/shoot/refs.json 에 썼다');
}
