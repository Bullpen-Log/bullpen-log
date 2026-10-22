/**
 * 3D 동작 분석 샘플에 '누구 투구'(meta.json 의 subject)를 단다 — 2026-10-22 김민: "샘플이 너무 많이 나열돼 보기 어렵다 · 사람별로 묶어 줘".
 * 일반 샘플 1~6 기타 인물(빈칸) · 7~12 김민 · 13~15 금윤호(10-22 김민: 13 · 14 도 금윤호), 마커 샘플은 모두 김민.
 * 번호는 마커를 보는 계정(lib/pitch-lab.ts MARKER_VIEWER_ID)이 실험실 목록에서 보는 차례 — 오래된 것이 1.
 *
 *   node --env-file=.env scripts/pitch-lab/set-subjects.mjs           목록만 보인다(바꾸지 않음)
 *   node --env-file=.env scripts/pitch-lab/set-subjects.mjs --apply   meta.json 에 subject 를 쓴다(다른 칸은 그대로)
 */
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';

const VIEWER = 'e0418384-8334-4c4b-85e3-b042cad362c5';
const apply = process.argv.includes('--apply');
const subjectOf = (kind, n) => (kind === 'marker' ? '김민' : n >= 13 ? '금윤호' : n >= 7 ? '김민' : null);

const db = new pg.Client({ connectionString: process.env.DIRECT_URL || process.env.DATABASE_URL });
await db.connect();
const admins = (await db.query(`select id from "User" where role = 'ADMIN'`)).rows.map((r) => r.id);
await db.end();
const owners = [VIEWER, ...admins.filter((x) => x !== VIEWER)];

const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
}).storage.from('pitch-videos');

const rows = [];
for (const uid of owners) {
  const { data: dirs, error } = await bucket.list(`${uid}/pitch-lab`, { limit: 200 });
  if (error) throw new Error(error.message);
  for (const d of dirs ?? []) {
    if (d.id != null) continue;
    const path = `${uid}/pitch-lab/${d.name}/meta.json`;
    const { data } = await bucket.download(path);
    if (!data) continue;
    const meta = JSON.parse(await data.text());
    /* 내 리포트 전용 복사본(copy-to-account.mjs)은 샘플 목록 번호에 안 든다 */
    if (!meta.personal) rows.push({ path, meta, kind: meta.kind === 'marker' ? 'marker' : 'sample' });
  }
}

for (const kind of ['sample', 'marker']) {
  const list = rows.filter((r) => r.kind === kind).sort((a, b) => (a.meta.createdAt ?? '').localeCompare(b.meta.createdAt ?? ''));
  console.log(`\n${kind} ${list.length}개`);
  for (const [i, r] of list.entries()) {
    const n = i + 1;
    const subject = subjectOf(kind, n);
    console.log(`${String(n).padStart(2)}  ${(r.meta.createdAt ?? '').slice(0, 16)}  ${r.meta.memo ?? ''}  → ${subject ?? '(기타)'}  [지금 ${r.meta.subject ?? '-'}]`);
    // 이미 사람이 적힌 샘플은 건드리지 않는다(2026-10-22 정강민 마커 샘플 — 뒤에 올린 것을 김민으로 덮지 않게)
    if (!apply || r.meta.subject != null) continue;
    const next = { ...r.meta };
    if (subject) next.subject = subject;
    else delete next.subject;
    const { error } = await bucket.upload(r.path, new Blob([JSON.stringify(next)], { type: 'application/json' }), {
      upsert: true,
      contentType: 'application/json',
    });
    if (error) throw new Error(`${r.path}: ${error.message}`);
  }
}
console.log(apply ? '\n썼어요.' : '\n목록만 봤어요. 쓰려면 --apply');
