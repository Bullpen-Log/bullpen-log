/**
 * 엔진 개발용 녹화(VelocityRecording) 하나를 작업 폴더로 내려받는다 — 조각 영상 + 공 표시(스피드건 · 손에서 떠난 때). 읽기만 한다.
 *
 *   node --env-file=.env scripts/velocity-lab/download-recording.mjs --id=<녹화 id 앞 8자 이상>
 *
 * 받는 곳: ~/bullpen-velocity-lab/rec-<id 8자>/p<차례>.<확장자> 와 cuts.json(cuts: [{ file, part, gun, eventSec, startSec, endSec, memo }] —
 * 시각은 조각 파일 기준, parts: [{ index, file, offsetSec, durationSec }] — 조각이 녹화의 몇 초부터인지). gun-table.mjs --rec=rec-<id 8자> 가 이것으로 앱과 같은 조건으로 잰다. 영상은 개인 것이라 저장소에 넣지 않는다.
 */
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';
import { LAB, argOf } from './cdp.mjs';

const id = argOf('id', '');
if (id.length < 8) {
  console.error('쓰는 법: download-recording.mjs --id=<녹화 id 앞 8자 이상>');
  process.exit(1);
}
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const rec = await prisma.velocityRecording.findFirst({
  where: { id: { startsWith: id } },
  include: { parts: { orderBy: { index: 'asc' } }, cuts: { orderBy: { createdAt: 'asc' } } },
});
if (!rec) {
  console.error('녹화를 못 찾았어요:', id);
  process.exit(1);
}
const out = join(LAB, `rec-${rec.id.slice(0, 8)}`);
mkdirSync(out, { recursive: true });
const fileOf = (p) => `p${p.index}.${/quicktime/.test(p.mime) ? 'mov' : /webm/.test(p.mime) ? 'webm' : 'mp4'}`;
for (const p of rec.parts) {
  const dst = join(out, fileOf(p));
  if (existsSync(dst) && statSync(dst).size === p.bytes) continue;
  const { data, error } = await supabase.storage.from('pitch-videos').download(p.path);
  if (error) {
    console.error('조각', p.index, '못 받음:', error.message);
    continue;
  }
  writeFileSync(dst, Buffer.from(await data.arrayBuffer()));
  console.log('조각', p.index, (p.bytes / 1e6).toFixed(1) + 'MB');
}
const partOf = new Map(rec.parts.map((p) => [p.id, p]));
const cuts = rec.cuts
  .filter((c) => !c.excluded && partOf.has(c.partId))
  .map((c) => ({
    file: fileOf(partOf.get(c.partId)),
    part: partOf.get(c.partId).index,
    gun: c.gunKmh,
    eventSec: c.eventSec,
    startSec: c.startSec,
    endSec: c.endSec,
    memo: c.memo,
  }));
/* 조각 시각(녹화 시작부터, 초) — 공 길이 조각 끝을 넘으면 다음 조각과 이어 붙일 때 쓴다(scripts/velocity-bench/fetch.mjs) */
const parts = rec.parts.map((p) => ({ index: p.index, file: fileOf(p), offsetSec: p.offsetSec, durationSec: p.durationSec }));
writeFileSync(join(out, 'cuts.json'), JSON.stringify({ id: rec.id, date: rec.date.toISOString().slice(0, 10), meta: rec.meta, memo: rec.memo, parts, cuts }, null, 1));
console.log(`${out} — 조각 ${rec.parts.length} · 공 ${cuts.length}`);
await prisma.$disconnect();
