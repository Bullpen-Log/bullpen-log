/**
 * 공 감지 학습 자료 만들기(엔진 2.7 계획 5단계 1판) — 스피드건 짝 클립을 지금 엔진으로 재서 '엔진이 믿은 공 자리'를 라벨로 삼고,
 * 그 장면들(앞 0.6초 · 뒤 0.4초의 공 없는 장면까지)을 디코더로 정확한 시각에 꺼내 JPEG 로 둔다. 2배 줌 날짜만(사용자 규칙).
 *
 *   node services/velocity-detector/build-dataset.mjs [--out=~/bullpen-velocity-lab/detector-v1] [--dates=...] [--long=960]
 *
 * 결과: <out>/images/<clip>/<i>.jpg · <out>/labels.json — clips[].frames[].ball = [x, y, 지름](그림 px) 또는 null.
 * 라벨은 엔진 결과라 완벽하지 않다(중심 ±0.5px · 지름은 덩어리라 실제보다 1.16배쯤). 실패 클립(엔진이 못 잰 것)은 라벨 없이 뺀다 — 2판에서 사람이.
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const REPO = resolve(import.meta.dirname, '../..');
const { open, LAB, argOf } = await import(
  pathToFileURL(join(REPO, 'scripts/velocity-lab/cdp.mjs')).href
);
const OUT = resolve(
  argOf('out', join(homedir(), 'bullpen-velocity-lab', 'detector-v1'))
);
const DATES = argOf(
  'dates',
  '2026-10-03,2026-10-06,2026-10-07,2026-10-09,2026-10-16'
).split(',');
const LONG = Number(argOf('long', 960));
const BEFORE = 0.6;
const AFTER = 0.4;
mkdirSync(join(OUT, 'images'), { recursive: true });

const c = await open({ port: 9531 });
const mb = readFileSync(
  join(REPO, 'node_modules/mediabunny/dist/bundles/mediabunny.mjs'),
  'utf8'
);
await c.evaluate(
  `globalThis.__MB_URL = URL.createObjectURL(new Blob([${JSON.stringify(mb)}], { type: 'text/javascript' })); 1`
);
console.log('엔진', c.version);

/* 클립 목록 — run-table.mjs 와 같은 조건 */
const items = [];
for (const date of DATES) {
  const dir = join(LAB, date);
  if (!existsSync(dir)) continue;
  const manifest = existsSync(join(dir, 'manifest.json'))
    ? JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
    : [];
  const live = existsSync(join(dir, 'live'));
  for (const m of manifest) {
    const path = join(dir, live ? 'live' : 'clips', m.file);
    if (!existsSync(path)) continue;
    const an = live ? JSON.parse(readFileSync(`${path}.analysis.json`, 'utf8')) : null;
    const ev = live ? m.clipEventSec : null;
    items.push({
      id: `${date}_${m.file.replace(/\.[^.]+$/, '')}`,
      date,
      session: m.sessionId,
      gun: m.gun ?? null,
      path,
      opts: live
        ? {
            fps: an?.fps ?? 60,
            startSec: ev != null ? Math.max(0, ev - 0.25) : undefined,
            endSec: ev != null ? ev + 1.45 : undefined,
            seedT: ev,
            focalPerLongSide:
              an?.focalPx && an?.sourceSize
                ? an.focalPx / Math.max(an.sourceSize.width, an.sourceSize.height)
                : null,
            fovKnown: true,
            tiltRad: an?.distance?.tiltRad ?? 0,
          }
        : { fovDeg: 32.1 },
    });
  }
  const recDir = join(dir, 'rec');
  if (existsSync(recDir))
    for (const id of readdirSync(recDir)) {
      const rec = JSON.parse(readFileSync(join(recDir, id, 'rec.json'), 'utf8'));
      for (const cut of rec.cuts) {
        if (cut.excluded) continue;
        const part = rec.parts.find((p) => p.id === cut.partId);
        if (!part || !existsSync(part.file)) continue;
        items.push({
          id: `${date}_rec-${id}-${cut.memo ?? cut.id.slice(0, 6)}`,
          date,
          session: `rec-${id}`,
          gun: cut.gun ?? null,
          path: part.file,
          opts: {
            fps: rec.meta?.camera?.frameRate ?? 60,
            startSec: cut.startSec,
            endSec: cut.endSec,
            fovDeg: rec.meta?.fovDeg ?? 32.1,
          },
        });
      }
    }
}
console.log('클립', items.length);

const clips = [];
for (const it of items) {
  await c.setFile(it.path);
  const r = await c.evaluate(`(async () => {
    const AV = window.__m['analyze-video'];
    const file = document.querySelector('input[type=file]').files[0];
    const o = ${JSON.stringify(it.opts)};
    const res = await AV.analyzeVideo({ file, ...o, fovDeg: o.fovDeg ?? 69, approach: 'receding', distanceM: 20 });
    const m = res.measure, d = res.distance ?? null;
    const info = { ok: m.ok, code: m.ok ? null : m.code, kmh: m.ok ? m.kmh : null, conf: m.ok ? m.confidence : null,
      slope: d?.sizeSlope ?? null, shaky: !!d?.shaky, te: d?.te ?? null, extended: d?.extended ?? null, impact: d?.impact ?? null,
      fps: res.fps, analyzeSize: res.analyzeSize, sourceSize: res.sourceSize,
      track: res.track.map((p) => [p.t, p.x, p.y, p.diameterPx]) };
    const eligible = info.ok && info.slope != null && Math.abs(info.slope + 1) <= 0.4 && !info.shaky && info.track.length >= 8;
    if (!eligible) return { info, eligible: false };
    /* 장면 꺼내기 — 공 첫 장면 0.6초 앞부터 끝(te) 0.4초 뒤까지 모두 */
    const MB = await import(globalThis.__MB_URL);
    const input = new MB.Input({ source: new MB.BlobSource(file), formats: MB.ALL_FORMATS });
    const track = await input.getPrimaryVideoTrack();
    const [W, H] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
    const s = ${LONG} / Math.max(W, H);
    const w = Math.round(W * s), h = Math.round(H * s);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const g = cv.getContext('2d');
    const t0 = info.track[0][0], t1 = info.te ?? info.track[info.track.length - 1][0];
    const lo = Math.max(o.startSec ?? 0, t0 - ${BEFORE}), hi = Math.min(o.endSec ?? 1e9, t1 + ${AFTER});
    const sink = new MB.VideoSampleSink(track);
    const frames = [];
    for await (const sm of sink.samples(lo, hi)) {
      if (sm.timestamp < lo || sm.timestamp > hi) { sm.close(); continue; }
      sm.draw(g, 0, 0, w, h);
      frames.push({ t: sm.timestamp, jpg: cv.toDataURL('image/jpeg', 0.9).slice(23) });
      sm.close();
    }
    input.dispose();
    return { info, eligible: true, w, h, s, W, H, frames };
  })()`);
  const inf = r.info;
  if (!r.eligible) {
    console.log(
      it.id.padEnd(36),
      '뺌',
      inf.ok
        ? `${inf.kmh} ${inf.conf} 기울기 ${inf.slope} 흔들림 ${inf.shaky}`
        : `못 잼 ${inf.code}`
    );
    continue;
  }
  const dir = join(OUT, 'images', it.id);
  mkdirSync(dir, { recursive: true });
  const dt = 1 / (inf.fps || 60);
  /* 분석 px → 그림 px */
  const k =
    r.s *
    (Math.max(inf.sourceSize.width, inf.sourceSize.height) /
      Math.max(inf.analyzeSize.width, inf.analyzeSize.height));
  const frames = r.frames.map((f, i) => {
    const file = `${String(i).padStart(3, '0')}.jpg`;
    writeFileSync(join(dir, file), Buffer.from(f.jpg, 'base64'));
    let best = null;
    for (const p of inf.track)
      if (
        Math.abs(p[0] - f.t) < 0.6 * dt &&
        (!best || Math.abs(p[0] - f.t) < Math.abs(best[0] - f.t))
      )
        best = p;
    return {
      i,
      t: +f.t.toFixed(4),
      file,
      ball: best
        ? [
            +(best[1] * k).toFixed(1),
            +(best[2] * k).toFixed(1),
            +(best[3] * k).toFixed(1),
          ]
        : null,
    };
  });
  const pos = frames.filter((f) => f.ball).length;
  clips.push({
    id: it.id,
    date: it.date,
    session: it.session,
    gun: it.gun,
    kmh: inf.kmh,
    conf: inf.conf,
    fps: inf.fps,
    w: r.w,
    h: r.h,
    sourceW: r.W,
    sourceH: r.H,
    te: inf.te,
    frames,
  });
  console.log(
    it.id.padEnd(36),
    `장면 ${frames.length} 공 ${pos}/${inf.track.length}`,
    `${inf.kmh} ${inf.conf}`
  );
}
writeFileSync(
  join(OUT, 'labels.json'),
  JSON.stringify({ engine: c.version, long: LONG, clips }, null, 1)
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
