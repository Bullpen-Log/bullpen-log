/**
 * 사람 크기 다듬기 1단계 — 직접 찍은 영상(운동 · 드릴의 library/ 영상, 숨긴 것 빼고) 목록과 원본 · 썸네일을 작업 폴더로(읽기만).
 *   node --env-file=.env scripts/shoot-trim/size/list.mjs <작업 폴더>
 * ~/bullpen-library-bundle/src 에 같은 파일이 있으면 링크만 건다(다시 받지 않음). 작업 폴더는 저장소 밖(외장 디스크 권장, 원본 3GB 남짓).
 */
import { existsSync, mkdirSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { homedir } from 'node:os';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const work = process.argv[2];
if (!work) throw new Error('작업 폴더를 주세요');
mkdirSync(join(work, 'orig'), { recursive: true });
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const sel = { id: true, title: true, category: true, videoPath: true, thumbPath: true, aspectRatio: true, hiddenAt: true };
const where = { videoPath: { startsWith: 'library/' }, hiddenAt: null };
const [ex, gd] = await Promise.all([prisma.exerciseVideo.findMany({ where, select: sel }), prisma.mechanicsGuide.findMany({ where, select: sel })]);
await prisma.$disconnect();
const all = [...ex.map((e) => ({ ...e, table: 'exercise' })), ...gd.map((e) => ({ ...e, table: 'drill' }))].map((e) => ({ ...e, ext: extname(e.videoPath) }));
const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from('pitch-videos');
const srcDir = join(homedir(), 'bullpen-library-bundle/src');
async function fetchTo(path, file) {
  if (existsSync(file) && statSync(file).size > 0) return;
  const { data, error } = await bucket.download(path);
  if (error) throw new Error(`${path}: ${error.message}`);
  writeFileSync(file, Buffer.from(await data.arrayBuffer()));
}
let i = 0;
async function worker() {
  while (i < all.length) {
    const e = all[i++];
    const dst = join(work, 'orig', `${e.id}${e.ext}`);
    const b = join(srcDir, basename(e.videoPath));
    if (!existsSync(dst)) existsSync(b) && statSync(b).size > 0 ? symlinkSync(b, dst) : await fetchTo(e.videoPath, dst);
    if (e.thumbPath) await fetchTo(e.thumbPath, join(work, 'orig', `${e.id}.jpg`));
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(join(work, 'list.json'), JSON.stringify(all, null, 1));
console.log(`영상 ${all.length}개 → ${work}`);
