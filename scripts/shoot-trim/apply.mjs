/**
 * 촬영 영상 다듬기 5단계 — 다듬은 영상(out/)을 새 이름(library/<새 uuid>)으로 올리고 운동의 영상 · 썸네일 경로를 바꾼다.
 *
 *   node --env-file=.env scripts/shoot-trim/apply.mjs <작업 폴더>            # 확인만
 *   node --env-file=.env scripts/shoot-trim/apply.mjs <작업 폴더> --apply    # 올리기 + DB 바꾸기 (npm run backup 먼저)
 *   node --env-file=.env scripts/shoot-trim/apply.mjs <작업 폴더> --revert   # 원래 영상으로 되돌리기
 *
 * 같은 이름에 덮어쓰지 않는 까닭: 옛 영상을 받아 둔 브라우저 · 앱이 새 영상을 못 받고, 되돌릴 원본이 사라진다. 옛 파일은 저장소에
 * 그대로 둔다(지우지 않음). 내려받은 뒤 누가 그 운동 영상을 바꿨으면(list.json 과 DB 가 다르면) 건너뛴다. 한 것은 applied.json 에
 * 하나씩 적어 중간에 멈춰도 이어서 한다. 줄인 판(out/<id>.720.mp4)이 있으면 library-720/<새 uuid>.mp4 로 같이 올린다(재생용).
 * 바꾼 뒤 lib/library-cache.ts 의 캐시 이름을 하나 올린다.
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
if (!work || !existsSync(join(work, 'plan.json'))) throw new Error('작업 폴더(plan.json 이 있는 곳)를 주세요');

const read = (f) => JSON.parse(readFileSync(join(work, f), 'utf8'));
const plan = read('plan.json');
const list = new Map(read('list.json').map((e) => [e.id, e]));
const appliedFile = join(work, 'applied.json');
const applied = existsSync(appliedFile) ? read('applied.json') : {};
const save = () => writeFileSync(appliedFile, JSON.stringify(applied, null, 1));

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('pitch-videos');

async function upload(path, file, contentType) {
  const { error } = await bucket.upload(path, readFileSync(file), { contentType, upsert: false });
  if (error) throw new Error(`${path}: ${error.message}`);
}

if (revert) {
  let n = 0;
  for (const [id, a] of Object.entries(applied)) {
    const row = await prisma.exerciseVideo.findUnique({ where: { id }, select: { videoPath: true } });
    if (row?.videoPath !== a.new.videoPath) {
      console.log(`건너뜀(그새 바뀜) ${a.title}`);
      continue;
    }
    await prisma.exerciseVideo.update({ where: { id }, data: { videoPath: a.old.videoPath, thumbPath: a.old.thumbPath } });
    delete applied[id];
    save();
    n++;
  }
  console.log(`되돌림 ${n}개 — 캐시 이름을 하나 올려야 화면에 보인다`);
} else {
  const todo = Object.keys(plan).filter((id) => !applied[id] && existsSync(join(work, 'out', `${id}.mp4`)));
  const rows = await prisma.exerciseVideo.findMany({
    where: { id: { in: todo } },
    select: { id: true, title: true, videoPath: true, thumbPath: true },
  });
  const now = new Map(rows.map((r) => [r.id, r]));
  const ok = todo.filter((id) => {
    const r = now.get(id);
    const same = r && r.videoPath === list.get(id)?.videoPath && r.thumbPath === list.get(id)?.thumbPath;
    if (!same) console.log(`건너뜀(내려받은 뒤 바뀜) ${list.get(id)?.title ?? id}`);
    return same;
  });
  console.log(`바꿀 것 ${ok.length}개 · 이미 바꾼 것 ${Object.keys(applied).length}개 · 다듬을 계획 ${Object.keys(plan).length}개`);
  if (apply) {
    for (const id of ok) {
      const r = now.get(id);
      const key = randomUUID();
      const next = { videoPath: `library/${key}.mp4`, thumbPath: r.thumbPath ? `library/${key}.jpg` : null };
      await upload(next.videoPath, join(work, 'out', `${id}.mp4`), 'video/mp4');
      if (next.thumbPath) await upload(next.thumbPath, join(work, 'out', `${id}.jpg`), 'image/jpeg');
      const small = join(work, 'out', `${id}.720.mp4`);
      if (existsSync(small)) await upload(`library-720/${key}.mp4`, small, 'video/mp4');
      await prisma.exerciseVideo.update({ where: { id }, data: next });
      applied[id] = { title: r.title, old: { videoPath: r.videoPath, thumbPath: r.thumbPath }, new: next, plan: plan[id] };
      save();
      console.log(`바꿈 ${r.title}`);
    }
  } else console.log('--apply 로 올리고 바꾼다(npm run backup 먼저).');
}
await prisma.$disconnect();
