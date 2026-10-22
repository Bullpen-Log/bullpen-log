/**
 * 3D 동작 분석 샘플 하나를 다른 사람 계정의 실험실로 복사한다 — 2026-10-22 김민: "마커 샘플 42 하나만 정강식 계정에 넣어 줘"(찍힌 본인이 자기 화면에서 보게).
 * 원본은 그대로 두고 폴더째(영상 · cam3/4 · meta.json · job.json · 결과 파일) 새 번호로 복사한다(관리자 목록에서 원본과 번호가 겹치지 않게).
 * job.json 은 끝난 작업만, 요청한 사람을 받는 사람으로 바꿔 넣는다.
 * 받는 계정은 마커 샘플을 못 보므로(lib/pitch-lab.ts seesMarkers) 복사본의 meta.kind 는 'sample', subject 는 받는 사람 이름,
 * personal 을 달아 관리자 샘플 목록에서 빼고 그 사람의 '내 리포트'(앱 /lab)에만 보이게 한다(2026-10-22 김민).
 * 번호는 마커를 보는 계정(MARKER_VIEWER_ID)이 실험실 목록에서 보는 차례(오래된 것이 1 — set-subjects.mjs 와 같다).
 *
 *   node --env-file=.env scripts/pitch-lab/copy-to-account.mjs --marker=42 --to=정강식            무엇을 복사할지 보기만
 *   node --env-file=.env scripts/pitch-lab/copy-to-account.mjs --marker=42 --to=정강식 --apply    복사
 *   (--sample=N 이면 일반 샘플 N번 · --to 는 닉네임이나 이메일)
 *   node --env-file=.env scripts/pitch-lab/copy-to-account.mjs --to=정강식 --remove=<샘플 번호(uuid)> [--apply]   받는 계정에서 그 샘플 폴더를 지운다
 */
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const VIEWER = 'e0418384-8334-4c4b-85e3-b042cad362c5';
const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const kind = arg('marker') ? 'marker' : 'sample';
const n = Number(arg('marker') ?? arg('sample'));
const to = arg('to');
const apply = process.argv.includes('--apply');
const removeId = arg('remove');
if (!to || (!n && !removeId)) throw new Error('--to=닉네임|이메일 과 --marker=N · --sample=N · --remove=<id> 중 하나가 필요해요');

const db = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await db.connect();
const admins = (await db.query(`select id from "User" where role = 'ADMIN'`)).rows.map((r) => r.id);
const target = (await db.query(`select id, nickname from "User" where nickname = $1 or lower(email) = lower($1)`, [to])).rows;
await db.end();
if (target.length !== 1) throw new Error(`'${to}' 계정이 ${target.length}개예요(하나여야 해요)`);
const toId = target[0].id;
const toName = target[0].nickname;

const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('pitch-videos');

if (removeId) {
  const dir = `${toId}/pitch-lab/${removeId}`;
  const { data: files, error } = await bucket.list(dir, { limit: 100 });
  if (error) throw new Error(error.message);
  const paths = (files ?? []).filter((f) => f.id != null).map((f) => `${dir}/${f.name}`);
  console.log(`${toName} 계정에서 지울 것 ${paths.length}개\n${paths.map((p) => `  ${p}`).join('\n')}`);
  if (!apply) {
    console.log('\n보기만 했어요. 지우려면 --apply');
    process.exit(0);
  }
  if (paths.length) {
    const { error: rmErr } = await bucket.remove(paths);
    if (rmErr) throw new Error(rmErr.message);
  }
  console.log('\n지웠어요.');
  process.exit(0);
}

const rows = [];
for (const uid of [VIEWER, ...admins.filter((x) => x !== VIEWER)]) {
  const { data: dirs, error } = await bucket.list(`${uid}/pitch-lab`, { limit: 200 });
  if (error) throw new Error(error.message);
  for (const d of dirs ?? []) {
    if (d.id != null) continue;
    const { data } = await bucket.download(`${uid}/pitch-lab/${d.name}/meta.json`);
    if (!data) continue;
    const meta = JSON.parse(await data.text());
    /* 내 리포트 전용 복사본(personal)은 번호에서 뺀다 — 샘플 목록에 안 보이므로 */
    if (!meta.personal && (meta.kind === 'marker' ? 'marker' : 'sample') === kind) rows.push({ uid, id: d.name, meta });
  }
}
rows.sort((a, b) => (a.meta.createdAt ?? '').localeCompare(b.meta.createdAt ?? ''));
const src = rows[n - 1];
if (!src) throw new Error(`${kind} ${n}번이 없어요(${rows.length}개)`);
const from = `${src.uid}/pitch-lab/${src.id}`;
const newId = randomUUID();
const dest = `${toId}/pitch-lab/${newId}`;
const { data: files, error: listErr } = await bucket.list(from, { limit: 100 });
if (listErr) throw new Error(listErr.message);
console.log(`${kind} ${n}번 · ${src.meta.createdAt} · ${(src.meta.memo ?? '').slice(0, 60)}`);
console.log(`${from} → ${dest}(${toName})`);
console.log(files.map((f) => `  ${f.name}`).join('\n'));
if (!apply) {
  console.log('\n보기만 했어요. 복사하려면 --apply');
  process.exit(0);
}
for (const f of files) {
  if (f.id == null) continue;
  if (f.name === 'meta.json') {
    const meta = { ...src.meta, kind: 'sample', subject: toName, personal: true };
    const { error } = await bucket.upload(`${dest}/meta.json`, new Blob([JSON.stringify(meta)], { type: 'application/json' }), {
      upsert: false,
      contentType: 'application/json',
    });
    if (error) throw new Error(`meta.json: ${error.message}`);
  } else if (f.name === 'job.json') {
    /* 작업 기록은 끝난 것만, 요청한 사람을 받는 사람으로(원본 관리자 번호가 보이고, 도는 중이면 받는 사람의 상태 묻기가 원본 작업을 실패로 셌다) */
    const { data } = await bucket.download(`${from}/job.json`);
    const job = data ? JSON.parse(await data.text()) : null;
    if (job?.status !== 'done') {
      console.log('  job.json — 끝나지 않은 작업이라 옮기지 않아요(받는 사람이 다시 분석)');
      continue;
    }
    const { error } = await bucket.upload(
      `${dest}/job.json`,
      new Blob([JSON.stringify({ ...job, requestedBy: toId, gpuCallId: null })], { type: 'application/json' }),
      { upsert: false, contentType: 'application/json' }
    );
    if (error) throw new Error(`job.json: ${error.message}`);
  } else {
    const { error } = await bucket.copy(`${from}/${f.name}`, `${dest}/${f.name}`);
    if (error) throw new Error(`${f.name}: ${error.message}`);
  }
}
console.log('\n복사했어요.');
