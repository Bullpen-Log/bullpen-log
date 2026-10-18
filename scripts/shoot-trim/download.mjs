/**
 * 촬영 모드로 올린 운동 영상을 내려받는다(영상 다듬기 1단계) — 2026-10-17 사용자: "오늘 찍은 영상의 앞뒤 빈 시간 · 작은 사람을 다듬어 줘".
 * 그날(서울 0시부터) 촬영 계획에서 '찍음'으로 체크한 운동의 영상 · 썸네일을 저장소 밖 작업 폴더로 받고 list.json 을 쓴다.
 *
 *   node --env-file=.env scripts/shoot-trim/download.mjs 2026-10-17 [작업 폴더]
 *
 * 작업 폴더 기본값: ~/bullpen-shoot-trim/<날짜>. 이미 받은 파일은 건너뛴다.
 */
import { mkdirSync, existsSync, writeFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const day = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? '')) throw new Error('날짜(YYYY-MM-DD)를 주세요');
const work = process.argv[3] ?? join(homedir(), 'bullpen-shoot-trim', day);
mkdirSync(join(work, 'orig'), { recursive: true });

const since = new Date(`${day}T00:00:00+09:00`);
const until = new Date(since.getTime() + 24 * 3600 * 1000);
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const checks = await prisma.shootCheck.findMany({
  where: { status: 'done', checkedAt: { gte: since, lt: until } },
  orderBy: { checkedAt: 'asc' },
});
const ex = await prisma.exerciseVideo.findMany({
  where: { id: { in: checks.map((c) => c.exerciseId) } },
  select: { id: true, title: true, videoPath: true, thumbPath: true, aspectRatio: true },
});
await prisma.$disconnect();
const byId = new Map(ex.map((e) => [e.id, e]));
const list = checks
  .map((c) => byId.get(c.exerciseId))
  .filter((e) => e?.videoPath?.startsWith('library/') && e.videoPath.endsWith('.mp4'));

const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('pitch-videos');

async function fetchTo(path, file) {
  if (existsSync(file) && statSync(file).size > 0) return;
  const { data, error } = await bucket.download(path);
  if (error) throw new Error(`${path}: ${error.message}`);
  writeFileSync(file, Buffer.from(await data.arrayBuffer()));
}

let next = 0;
let done = 0;
async function worker() {
  while (next < list.length) {
    const e = list[next++];
    await fetchTo(e.videoPath, join(work, 'orig', `${e.id}.mp4`));
    if (e.thumbPath) await fetchTo(e.thumbPath, join(work, 'orig', `${e.id}.jpg`));
    if (++done % 20 === 0) console.log(`${done}/${list.length}`);
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
writeFileSync(join(work, 'list.json'), JSON.stringify(list, null, 1));
console.log(`받음 ${list.length}개 → ${work}`);
