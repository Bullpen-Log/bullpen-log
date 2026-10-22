/**
 * 마커 샘플 ③ · ④ 카메라가 옆 영상과 얼마나 어긋나게 잘렸는지(meta.extraOffsets)를 메모에서 읽어 채운다 — 3D 결과 화면에서 넷 다 3D 를 따라가게
 * (2026-10-22 김민: "애니메이션 밑에 영상 싱크가 옆 · 뒤는 맞는데 대각선 방향은 아예 재생이 안 됨").
 * 10-21 4차 마커는 메모에 '공 놓는 때쯤 ① 3.85초 · ② 3.74초 · ③ 3.07초 · ④ 3.00초'처럼 영상마다 공 놓는 시각이 있다 →
 * cam 몫 = ③(④) − ①. 그 줄이 없는 샘플(10-12 · 10-16 — 같은 순간에서 잘랐다)은 건드리지 않는다(없으면 0 으로 본다).
 * 모든 관리자 폴더 + 내 리포트 전용 복사본(personal)이 든 계정 폴더까지 본다.
 *
 *   node --env-file=.env scripts/pitch-lab/set-extra-offsets.mjs           보기만
 *   node --env-file=.env scripts/pitch-lab/set-extra-offsets.mjs --apply   meta.json 에 extraOffsets 를 쓴다(다른 칸 그대로)
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const apply = process.argv.includes('--apply');
const db = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await db.connect();
/* 실험실 폴더가 있을 수 있는 계정 — 관리자 · 준관리자(복사본을 받은 계정) */
const owners = (await db.query(`select id from "User" where role in ('ADMIN', 'MANAGER')`)).rows.map((r) => r.id);
await db.end();

const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('pitch-videos');

/** '공 놓는 때쯤 ① 3.85초 · ② 3.74초 · ③ 3.07초 · ④ 3.00초' → { 1: 3.85, … } */
const releaseTimes = (memo) => {
  const line = /공 놓는 때쯤([^(]*?)(\(|$)/.exec(memo ?? '')?.[1] ?? '';
  const out = {};
  for (const m of line.matchAll(/([①②③④])\s*([\d.]+)초/g)) out['①②③④'.indexOf(m[1]) + 1] = Number(m[2]);
  return out;
};

let changed = 0;
for (const uid of owners) {
  const { data: dirs, error } = await bucket.list(`${uid}/pitch-lab`, { limit: 200 });
  if (error) throw new Error(error.message);
  for (const d of dirs ?? []) {
    if (d.id != null) continue;
    const path = `${uid}/pitch-lab/${d.name}/meta.json`;
    const { data } = await bucket.download(path);
    if (!data) continue;
    const meta = JSON.parse(await data.text());
    const t = releaseTimes(meta.memo);
    if (t[1] == null || (t[3] == null && t[4] == null)) continue;
    const offs = {};
    if (t[3] != null) offs.cam3 = Math.round((t[3] - t[1]) * 1000) / 1000;
    if (t[4] != null) offs.cam4 = Math.round((t[4] - t[1]) * 1000) / 1000;
    const same = JSON.stringify(meta.extraOffsets ?? null) === JSON.stringify(offs);
    console.log(`${path.slice(0, 60)}…  ${(meta.memo ?? '').slice(0, 24)}  ③ ${offs.cam3 ?? '-'} · ④ ${offs.cam4 ?? '-'}${same ? '  (그대로)' : ''}`);
    if (!apply || same) continue;
    const { error: upErr } = await bucket.upload(path, new Blob([JSON.stringify({ ...meta, extraOffsets: offs })], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json',
    });
    if (upErr) throw new Error(`${path}: ${upErr.message}`);
    changed += 1;
  }
}
console.log(apply ? `\n${changed}개 썼어요.` : '\n보기만 했어요. 쓰려면 --apply');
