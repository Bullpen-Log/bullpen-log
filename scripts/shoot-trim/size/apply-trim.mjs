/**
 * 앞뒤 빈 시간을 자른 영상(out-trim/)을 새 이름으로 올리고 경로를 바꾼다. 화면을 키운 영상(applied.json)은 그 판 위에 한 겹 더.
 *   node --env-file=.env apply-trim.mjs <작업 폴더> [--apply | --revert]
 * 되돌리기는 applied-trim.json 의 old(자르기 전 경로)로. 크기 판까지 되돌리려면 이것 먼저, 그다음 apply.mjs --revert.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';

const work = process.argv[2];
const apply = process.argv.includes('--apply');
const revert = process.argv.includes('--revert');
const read = (f) => JSON.parse(readFileSync(join(work, f), 'utf8'));
const trims = read('trims.json');
const list = new Map(read('list.json').map((e) => [e.id, e]));
const crop = existsSync(join(work, 'applied.json')) ? read('applied.json') : {};
const file = join(work, 'applied-trim.json');
const done = existsSync(file) ? read('applied-trim.json') : {};
const save = () => writeFileSync(file, JSON.stringify(done, null, 1));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from('pitch-videos');
const table = (id) => (list.get(id).table === 'drill' ? prisma.mechanicsGuide : prisma.exerciseVideo);
async function upload(path, f, contentType) {
  const { error } = await bucket.upload(path, readFileSync(f), { contentType, upsert: false });
  if (error) throw new Error(`${path}: ${error.message}`);
}
if (revert) {
  let n = 0;
  for (const [id, a] of Object.entries(done)) {
    const r = await table(id).findUnique({ where: { id }, select: { videoPath: true } });
    if (r?.videoPath !== a.new.videoPath) { console.log(`건너뜀(그새 바뀜) ${a.title}`); continue; }
    await table(id).update({ where: { id }, data: { videoPath: a.old.videoPath, thumbPath: a.old.thumbPath } });
    delete done[id]; save(); n++;
  }
  console.log(`되돌림 ${n}개`);
} else {
  const ok = [];
  for (const id of Object.keys(trims)) {
    if (done[id] || !existsSync(join(work, 'out-trim', `${id}.mp4`)) || !existsSync(join(work, 'out-trim', `${id}.720.mp4`))) continue;
    const want = crop[id] ? crop[id].new : { videoPath: list.get(id).videoPath, thumbPath: list.get(id).thumbPath };
    const r = await table(id).findUnique({ where: { id }, select: { title: true, videoPath: true, thumbPath: true } });
    if (!r || r.videoPath !== want.videoPath || r.thumbPath !== want.thumbPath) { console.log(`건너뜀(예상과 다름) ${list.get(id).title}`); continue; }
    ok.push([id, r]);
  }
  console.log(`바꿀 것 ${ok.length}개 · 이미 바꾼 것 ${Object.keys(done).length}개`);
  if (apply) {
    for (const [id, r] of ok) {
      const key = randomUUID();
      const jpg = join(work, 'out-trim', `${id}.jpg`);
      const next = { videoPath: `library/${key}.mp4`, thumbPath: existsSync(jpg) && r.thumbPath ? `library/${key}.jpg` : r.thumbPath };
      await upload(next.videoPath, join(work, 'out-trim', `${id}.mp4`), 'video/mp4');
      if (next.thumbPath !== r.thumbPath) await upload(next.thumbPath, jpg, 'image/jpeg');
      await upload(`library-720/${key}.mp4`, join(work, 'out-trim', `${id}.720.mp4`), 'video/mp4');
      await table(id).update({ where: { id }, data: next });
      done[id] = { title: r.title, table: list.get(id).table, old: { videoPath: r.videoPath, thumbPath: r.thumbPath }, new: next, trim: trims[id] };
      save();
      console.log(`바꿈 ${r.title}`);
    }
  } else console.log('--apply 로 올린다(npm run backup 먼저).');
}
await prisma.$disconnect();
