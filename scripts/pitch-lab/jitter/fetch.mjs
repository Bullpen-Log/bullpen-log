/**
 * 실험실 샘플(마커 샘플 빼고) 영상 · 촬영 정보를 저장소 밖 LAB 폴더로 받는다 — 떨림 검사(score.mjs --fetch)가 부른다. 읽기만.
 *   node --env-file=.env scripts/pitch-lab/jitter/fetch.mjs <LAB 폴더>
 * LAB/videos/<키>_side · _back.mov(pose_modal.py 가 읽는 자리) · LAB/jitter/samples.json(키 → 손 · 키 · 화면 녹화 · 슬로모, 이름은 안 적음).
 * 키는 샘플 번호 앞 8자 — 예전에 받아 둔 LAB/s<N>/meta.json 과 만든 시각이 같으면 그 이름(s<N>)을 그대로 쓴다(2D 를 다시 안 뽑게).
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const LAB = process.argv[2];
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const B = sb.storage.from(process.env.SUPABASE_VIDEO_BUCKET || 'pitch-videos');
const old = Object.fromEntries(
  readdirSync(LAB)
    .filter((d) => /^s\d+$/.test(d) && existsSync(join(LAB, d, 'meta.json')))
    .map((d) => [JSON.parse(readFileSync(join(LAB, d, 'meta.json'), 'utf8')).createdAt, d])
);
const manifestPath = join(LAB, 'jitter', 'samples.json');
const samples = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
mkdirSync(join(LAB, 'videos'), { recursive: true });
const { data: users } = await B.list('', { limit: 1000 });
for (const u of users ?? []) {
  const { data: ids } = await B.list(`${u.name}/pitch-lab`, { limit: 1000 });
  for (const d of ids ?? []) {
    const dir = `${u.name}/pitch-lab/${d.name}`;
    const got = await B.download(`${dir}/meta.json`);
    if (!got.data) continue;
    const meta = JSON.parse(await got.data.text());
    if (meta.kind === 'marker') continue;
    const key = old[meta.createdAt] ?? d.name.slice(0, 8);
    const { data: files } = await B.list(dir, { limit: 100 });
    for (const v of ['side', 'back']) {
      const out = join(LAB, 'videos', `${key}_${v}.mov`);
      const f = files?.find((x) => x.name.startsWith(`${v}.`));
      if (!f || existsSync(out)) continue;
      const r = await B.download(`${dir}/${f.name}`);
      if (!r.data) continue;
      writeFileSync(out, Buffer.from(await r.data.arrayBuffer()));
      console.log('받음', `${key}_${v}`);
    }
    if (!existsSync(join(LAB, 'videos', `${key}_side.mov`)) || !existsSync(join(LAB, 'videos', `${key}_back.mov`))) continue;
    samples[key] = {
      hand: meta.hand === 'L' ? 'L' : 'R',
      heightCm: meta.heightCm ?? null,
      screenRecorded: meta.screenRecorded === true,
      slowmoFps: meta.slowmoFps ?? null,
    };
  }
}
mkdirSync(join(LAB, 'jitter'), { recursive: true });
writeFileSync(manifestPath, JSON.stringify(samples, null, 1) + '\n');
console.log(`샘플 ${Object.keys(samples).length}개: ${Object.keys(samples).join(' ')}`);
