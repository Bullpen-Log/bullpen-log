/**
 * 크기 다듬은 영상(out/)을 새 이름(library/<새 uuid>.mp4 · .jpg, library-720/<새 uuid>.mp4)으로 올리고 운동 · 드릴의 경로만 바꾼다.
 * 옛 파일은 저장소에 그대로 둔다(되돌리기용). 내려받은 뒤 누가 경로를 바꿨으면 건너뛴다. 한 것은 applied.json 에 하나씩.
 *   node --env-file=.env scripts/shoot-trim/size/apply.mjs <작업 폴더> [--apply | --revert]
 * 따라가기 판(follow/<id>.json)으로 만든 영상도 같이 올린다. 되돌리기는 작업 폴더의 applied.json 이 있어야 한다
 * (2026-11-16 판은 scripts/shoot-trim/size/applied-2026-11-16.json 을 작업 폴더에 applied.json 으로 두면 어느 컴퓨터에서든 된다).
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
const plan = read('plan.json');
const list = new Map(read('list.json').map((e) => [e.id, e]));
const appliedFile = join(work, 'applied.json');
const applied = existsSync(appliedFile) ? read('applied.json') : {};
const save = () => writeFileSync(appliedFile, JSON.stringify(applied, null, 1));
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from('pitch-videos');
const table = (id) => (list.get(id).table === 'drill' ? prisma.mechanicsGuide : prisma.exerciseVideo);

async function upload(path, file, contentType) {
  const { error } = await bucket.upload(path, readFileSync(file), { contentType, upsert: false });
  if (error) throw new Error(`${path}: ${error.message}`);
}

if (revert) {
  let n = 0;
  for (const [id, a] of Object.entries(applied)) {
    const row = await table(id).findUnique({ where: { id }, select: { videoPath: true } });
    if (row?.videoPath !== a.new.videoPath) { console.log(`건너뜀(그새 바뀜) ${a.title}`); continue; }
    await table(id).update({ where: { id }, data: { videoPath: a.old.videoPath, thumbPath: a.old.thumbPath } });
    delete applied[id]; save(); n++;
  }
  console.log(`되돌림 ${n}개 — 캐시 이름을 올려야 화면에 보인다`);
} else {
  const isFollow = (id) => existsSync(join(work, 'follow', `${id}.json`));
  const todo = Object.keys(plan).filter((id) => (plan[id].crop || isFollow(id)) && !applied[id] && existsSync(join(work, 'out', `${id}.mp4`)) && existsSync(join(work, 'out', `${id}.720.mp4`)));
  const ok = [];
  for (const id of todo) {
    const r = await table(id).findUnique({ where: { id }, select: { title: true, videoPath: true, thumbPath: true } });
    const was = list.get(id);
    if (!r || r.videoPath !== was.videoPath || r.thumbPath !== was.thumbPath) { console.log(`건너뜀(내려받은 뒤 바뀜) ${was.title}`); continue; }
    ok.push([id, r]);
  }
  console.log(`바꿀 것 ${ok.length}개 · 이미 바꾼 것 ${Object.keys(applied).length}개`);
  if (apply) {
    for (const [id, r] of ok) {
      const key = randomUUID();
      const thumb = r.thumbPath && existsSync(join(work, 'out', `${id}.jpg`));
      const next = { videoPath: `library/${key}.mp4`, thumbPath: thumb ? `library/${key}.jpg` : r.thumbPath };
      await upload(next.videoPath, join(work, 'out', `${id}.mp4`), 'video/mp4');
      if (thumb) await upload(next.thumbPath, join(work, 'out', `${id}.jpg`), 'image/jpeg');
      await upload(`library-720/${key}.mp4`, join(work, 'out', `${id}.720.mp4`), 'video/mp4');
      await table(id).update({ where: { id }, data: next });
      applied[id] = { title: r.title, table: list.get(id).table, old: { videoPath: r.videoPath, thumbPath: r.thumbPath }, new: next, crop: isFollow(id) ? 'follow' : plan[id].crop };
      save();
      console.log(`바꿈 ${r.title}`);
    }
  } else console.log('--apply 로 올리고 바꾼다(npm run backup 먼저).');
}
await prisma.$disconnect();
