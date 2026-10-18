/**
 * 영상 내용 점검 1단계 — 직접 찍은 운동 영상(재생용 720p 판)과 적힌 내용을 내려받는다. DB 는 읽기만.
 *
 *   node --env-file=.env scripts/shoot-trim/content-export.mjs 2026-10-18 [폴더]   # 그날 '찍음'으로 체크한 운동만
 *   node --env-file=.env scripts/shoot-trim/content-export.mjs all [폴더]          # 직접 찍은 영상 전부(숨김 · 나중에 촬영 빼고)
 *
 * 폴더 기본값: ~/bullpen-shoot-trim/content-<날짜|all>. rows.json(운동마다 제목 · 분류 · 설명 · 도구 · 좌우 · 세트 · 횟수 · 버티기 · 부위 ·
 * 영상 경로)과 vid/<id>.mp4 를 쓴다. 영상은 library-720/ 의 줄인 판(없으면 원본). 이미 받은 파일은 건너뛴다.
 * 다음: py -3.12 scripts/shoot-trim/content-sheets.py <폴더> → pages/pNNN.jpg 를 눈으로 본다(docs/shoot/video-trim-and-content-check.md).
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const day = process.argv[2];
if (day !== 'all' && !/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error('날짜(YYYY-MM-DD) 또는 all 을 주세요');
const work = process.argv[3] ?? join(homedir(), 'bullpen-shoot-trim', `content-${day}`);
mkdirSync(join(work, 'vid'), { recursive: true });

const p = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
let ids = null;
if (day !== 'all') {
  const since = new Date(`${day}T00:00:00+09:00`);
  const until = new Date(since.getTime() + 24 * 3600 * 1000);
  const checks = await p.shootCheck.findMany({
    where: { status: 'done', checkedAt: { gte: since, lt: until } },
    select: { exerciseId: true },
  });
  ids = checks.map((c) => c.exerciseId);
}
const rows = await p.exerciseVideo.findMany({
  where: {
    source: 'OWN',
    videoPath: { startsWith: 'library/' },
    hiddenAt: null,
    NOT: { category: '나중에 촬영' },
    ...(ids ? { id: { in: ids } } : {}),
  },
  select: {
    id: true,
    title: true,
    category: true,
    description: true,
    equipment: true,
    bodyParts: true,
    perSide: true,
    sets: true,
    reps: true,
    holdSeconds: true,
    videoPath: true,
    aspectRatio: true,
    movementPattern: true,
    intensity: true,
  },
  orderBy: [{ category: 'asc' }, { title: 'asc' }],
});
await p.$disconnect();
writeFileSync(join(work, 'rows.json'), JSON.stringify(rows, null, 1));

const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('pitch-videos');
let next = 0;
let got = 0;
async function worker() {
  while (next < rows.length) {
    const r = rows[next++];
    const file = join(work, 'vid', `${r.id}.mp4`);
    if (existsSync(file) && statSync(file).size) continue;
    const small = r.videoPath.replace(/^library\/(.+)\.\w+$/, 'library-720/$1.mp4');
    let { data, error } = await bucket.download(small);
    if (error) ({ data, error } = await bucket.download(r.videoPath));
    if (error) {
      console.log('받기 실패', r.title, error.message);
      continue;
    }
    writeFileSync(file, Buffer.from(await data.arrayBuffer()));
    if (++got % 25 === 0) console.log('받음', got);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`운동 ${rows.length}개 · 새로 받음 ${got} → ${work}`);
