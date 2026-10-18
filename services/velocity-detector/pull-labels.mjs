/**
 * 공 감지 학습 자료 2판 — 사람이 찍은 공 자리(VelocityBallLabel, 관리자 '공 자리 찍기')를 서버에서 내려받아 장면 JPEG(긴 변 960) · labels.json 으로.
 * 모양은 build-dataset.mjs(1판)와 같아 train.py 가 그대로 읽는다: modal run services/velocity-detector/train.py --dataset detector-v2
 *
 *   node --env-file=.env services/velocity-detector/pull-labels.mjs [--out=~/bullpen-velocity-lab/detector-v2] [--long=960]
 *
 * - 영상(녹화 조각 · 측정 클립)은 <out>/videos/ 에 받아 두고(있으면 건너뜀) 디코더(mediabunny)로 장면을 정확한 시각에 꺼낸다.
 *   찍은 장면은 브라우저가 보인 장면의 시각(mediaTime)이라 디코더 장면과 반 장면 안에서 맞춘다.
 * - 모델 입력이 연속 세 장면(t−2 · t−1 · t)이라 장면이 이어져야 한다: 찍은 장면 사이의 안 찍은 장면이 3장 안이고 양쪽이 공이면 선으로 이어 채우고,
 *   그보다 길거나 '없음' 옆이면 거기서 클립을 가른다(-2 · -3 …). 클립마다 맨 앞에 안 찍은 두 장면(ball null)을 둔다 — train.py 가 i ≥ 2 만 표본으로 쓴다.
 * - 영상은 개인 것이라 깃에 올리지 않는다(저장소 밖).
 */
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

const REPO = resolve(import.meta.dirname, '../..');
const { open, argOf } = await import(
  pathToFileURL(join(REPO, 'scripts/velocity-lab/cdp.mjs')).href
);
const OUT = resolve(
  argOf('out', join(homedir(), 'bullpen-velocity-lab', 'detector-v2'))
);
const LONG = Number(argOf('long', 960));
/** 이어 채울 수 있는 빈틈(장면) */
const MAX_GAP = 3;
mkdirSync(join(OUT, 'images'), { recursive: true });
mkdirSync(join(OUT, 'videos'), { recursive: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);
const dateOf = (d) => d.toISOString().slice(0, 10);
const extOf = (mime, path) =>
  /quicktime/.test(mime ?? '') || /\.mov$/i.test(path ?? '')
    ? 'mov'
    : /webm/.test(mime ?? '')
      ? 'webm'
      : 'mp4';

/* ── 서버의 찍은 것 → 영상 · 날짜 · 스피드건 ── */
const labelRows = await prisma.velocityBallLabel.findMany({ orderBy: { createdAt: 'asc' } });
const cutIds = labelRows.filter((l) => l.target.startsWith('cut:')).map((l) => l.target.slice(4));
const pitchIds = labelRows
  .filter((l) => l.target.startsWith('pitch:'))
  .map((l) => l.target.slice(6));
const [cuts, pitches] = await Promise.all([
  prisma.velocityRecordingCut.findMany({
    where: { id: { in: cutIds } },
    include: { part: true, recording: { select: { id: true, date: true } } },
  }),
  prisma.velocityPitch.findMany({
    where: { id: { in: pitchIds }, clipPath: { not: null } },
    select: {
      id: true,
      sessionId: true,
      clipPath: true,
      clipBytes: true,
      clipMime: true,
      gunKmh: true,
      kmh: true,
      manual: true,
      session: { select: { date: true } },
    },
  }),
]);
const cutOf = new Map(cuts.map((c) => [c.id, c]));
const pitchOf = new Map(pitches.map((p) => [p.id, p]));

const items = [];
for (const l of labelRows) {
  const frames = Array.isArray(l.frames) ? l.frames : [];
  if (frames.length === 0) continue;
  const base = { label: l, frames, sourceW: l.sourceW, sourceH: l.sourceH };
  if (l.target.startsWith('cut:')) {
    const c = cutOf.get(l.target.slice(4));
    if (!c) {
      console.log('컷이 없어 뺌', l.target);
      continue;
    }
    items.push({
      ...base,
      id: `${dateOf(c.recording.date)}_rec-${c.recording.id.slice(0, 8)}-${c.id.slice(0, 8)}`,
      date: dateOf(c.recording.date),
      session: `rec-${c.recording.id}`,
      gun: c.gunKmh,
      kmh: c.rawKmh,
      path: c.part.path,
      bytes: c.part.bytes,
      file: `part-${c.part.id.slice(0, 8)}.${extOf(c.part.mime, c.part.path)}`,
    });
  } else {
    const p = pitchOf.get(l.target.slice(6));
    if (!p) {
      console.log('클립이 없어 뺌', l.target);
      continue;
    }
    items.push({
      ...base,
      id: `${dateOf(p.session.date)}_pitch-${p.id.slice(0, 8)}`,
      date: dateOf(p.session.date),
      session: p.sessionId,
      gun: p.gunKmh,
      kmh: p.manual ? null : p.kmh,
      path: p.clipPath,
      bytes: p.clipBytes,
      file: `pitch-${p.id.slice(0, 8)}.${extOf(p.clipMime, p.clipPath)}`,
    });
  }
}
await prisma.$disconnect();
console.log('찍은 것', labelRows.length, '→ 쓸 것', items.length);

/* ── 영상 받기 ── */
for (const it of items) {
  const dst = join(OUT, 'videos', it.file);
  it.video = dst;
  if (existsSync(dst) && (it.bytes == null || statSync(dst).size === it.bytes)) continue;
  const { data, error } = await supabase.storage.from('pitch-videos').download(it.path);
  if (error) {
    console.log('못 받음', it.file, error.message);
    it.video = null;
    continue;
  }
  writeFileSync(dst, Buffer.from(await data.arrayBuffer()));
  console.log('받음', it.file, `${(statSync(dst).size / 1e6).toFixed(1)}MB`);
}

/* ── 장면 꺼내기(헤드리스 크롬 + mediabunny — build-dataset.mjs 와 같은 길) ── */
const c = await open({ port: 9551 });
const mb = readFileSync(
  join(REPO, 'node_modules/mediabunny/dist/bundles/mediabunny.mjs'),
  'utf8'
);
await c.evaluate(
  `globalThis.__MB_URL = URL.createObjectURL(new Blob([${JSON.stringify(mb)}], { type: 'text/javascript' })); 1`
);

const clips = [];
for (const it of items) {
  if (!it.video) continue;
  const ts = it.frames.map((f) => f.t);
  const lo = Math.max(0, Math.min(...ts) - 0.12);
  const hi = Math.max(...ts) + 0.002;
  await c.setFile(it.video);
  const r = await c.evaluate(`(async () => {
    const MB = await import(globalThis.__MB_URL);
    const file = document.querySelector('input[type=file]').files[0];
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const [W, H] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
    const s = ${LONG} / Math.max(W, H);
    const w = Math.round(W * s), h = Math.round(H * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const sink = new MB.VideoSampleSink(track);
    const frames = [];
    for await (const sm of sink.samples(${lo}, ${hi})) {
      if (sm.timestamp < ${lo} || sm.timestamp > ${hi}) { sm.close(); continue; }
      sm.draw(g, 0, 0, w, h);
      frames.push({ t: sm.timestamp, jpg: cv.toDataURL('image/jpeg', 0.9).slice(23) });
      sm.close();
    }
    input.dispose();
    return { w, h, W, H, frames };
  })()`);
  if (r.frames.length < 3) {
    console.log(it.id.padEnd(40), '장면이 모자라 뺌', r.frames.length);
    continue;
  }
  /* fps 는 디코더 장면 간격의 가운데 값으로 */
  const gaps = r.frames.slice(1).map((f, i) => f.t - r.frames[i].t).sort((a, b) => a - b);
  const dt = gaps[Math.floor(gaps.length / 2)] || 1 / 60;
  const fps = 1 / dt;
  /* 찍은 좌표(원본 px) → 그림 px */
  const kx = r.w / it.sourceW;
  const ky = r.h / it.sourceH;
  const toImg = (b) => [+(b[0] * kx).toFixed(1), +(b[1] * ky).toFixed(1), +(b[2] * kx).toFixed(1)];
  /* 찍은 것마다 가장 가까운 디코더 장면에(0.75 장면 안 — 브라우저의 장면 시각이 디코더와 몇 ms 어긋난다). 한 장면에 둘이면 더 가까운 것 */
  const marks = r.frames.map(() => ({ known: false, ball: null, err: Infinity }));
  let matched = 0;
  for (const l of it.frames) {
    let k = -1;
    for (let i = 0; i < r.frames.length; i++)
      if (k < 0 || Math.abs(r.frames[i].t - l.t) < Math.abs(r.frames[k].t - l.t)) k = i;
    const err = k < 0 ? Infinity : Math.abs(r.frames[k].t - l.t);
    if (err > 0.75 * dt || err >= marks[k].err) continue;
    marks[k] = { known: true, ball: l.ball ? toImg(l.ball) : null, err };
    matched++;
  }
  if (matched < it.frames.length)
    console.log(it.id.padEnd(40), `찍은 ${it.frames.length} 중 ${matched} 만 장면에 맞음`);

  /* 이어진 구간으로 가르기 — 빈틈은 양쪽이 공이고 MAX_GAP 안이면 선으로 채움 */
  const segments = [];
  let cur = null;
  const first = marks.findIndex((m) => m.known);
  const last = marks.length - 1 - [...marks].reverse().findIndex((m) => m.known);
  const startSeg = (k) => {
    cur = { start: k, frames: [] };
    for (const j of [k - 2, k - 1]) if (j >= 0) cur.frames.push({ k: j, ball: null });
    segments.push(cur);
  };
  for (let k = first; k <= last; k++) {
    const m = marks[k];
    if (m.known) {
      if (!cur) startSeg(k);
      cur.frames.push({ k, ball: m.ball });
      continue;
    }
    let j = k + 1;
    while (j <= last && !marks[j].known) j++;
    const prev = cur?.frames[cur.frames.length - 1];
    const gap = j - k;
    if (cur && prev?.ball && marks[j].ball && gap <= MAX_GAP) {
      const a = prev.ball;
      const b = marks[j].ball;
      for (let q = k; q < j; q++) {
        const u = (q - (k - 1)) / (gap + 1);
        cur.frames.push({ k: q, ball: a.map((v, i) => +(v + (b[i] - v) * u).toFixed(1)) });
      }
    } else cur = null;
    k = j - 1;
  }

  const base = join(OUT, 'images');
  segments.forEach((seg, n) => {
    const id = segments.length > 1 ? `${it.id}-${n + 1}` : it.id;
    const dir = join(base, id);
    mkdirSync(dir, { recursive: true });
    const frames = seg.frames.map((f, i) => {
      const file = `${String(i).padStart(3, '0')}.jpg`;
      writeFileSync(join(dir, file), Buffer.from(r.frames[f.k].jpg, 'base64'));
      return { i, t: +r.frames[f.k].t.toFixed(4), file, ball: f.ball };
    });
    clips.push({
      id,
      date: it.date,
      session: it.session,
      gun: it.gun ?? null,
      kmh: it.kmh ?? null,
      conf: null,
      fps,
      w: r.w,
      h: r.h,
      sourceW: r.W,
      sourceH: r.H,
      te: null,
      frames,
    });
    console.log(
      id.padEnd(40),
      `장면 ${frames.length} 공 ${frames.filter((f) => f.ball).length}`,
      `${Math.round(fps)}fps`
    );
  });
}
writeFileSync(
  join(OUT, 'labels.json'),
  JSON.stringify({ engine: 'human', long: LONG, clips }, null, 1)
);
console.log(
  '저장',
  OUT,
  '클립',
  clips.length,
  '장면',
  clips.reduce((a, c) => a + c.frames.length, 0),
  '공 장면',
  clips.reduce((a, c) => a + c.frames.filter((f) => f.ball).length, 0)
);
await c.close();
